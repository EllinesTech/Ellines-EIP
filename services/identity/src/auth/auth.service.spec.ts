import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService password reset', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  } as unknown as PrismaService;

  const jwt = { sign: jest.fn().mockReturnValue('token') } as unknown as JwtService;
  const config = {
    get: jest.fn().mockReturnValue(''),
  } as unknown as ConfigService;
  const auth = new AuthService(prisma, jwt, config);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
  });

  it('returns generic message without token when email is unknown', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await auth.forgotPassword({ email: 'missing@example.com' });
    expect(result.message).toMatch(/password reset/i);
    expect(result).not.toHaveProperty('resetToken');
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('issues a reset token for an active user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'owner@example.com',
      organizationId: 'o1',
      isActive: true,
    });
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await auth.forgotPassword({ email: 'Owner@Example.com' });
    expect('resetToken' in result && result.resetToken).toBeTruthy();
    const resetToken = (result as { resetToken: string }).resetToken;
    expect(resetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          organizationId: 'o1',
          tokenHash: auth.hashToken(resetToken),
        }),
      }),
    );
  });

  it('rejects invalid reset tokens', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      auth.resetPassword({ token: 'a'.repeat(64), newPassword: 'NewPass123!' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates password and marks token used', async () => {
    const raw = 'b'.repeat(64);
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      organizationId: 'o1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { isActive: true, organizationId: 'o1' },
    });
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.update as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await auth.resetPassword({ token: raw, newPassword: 'NewPass123!' });
    expect(result.message).toMatch(/Password updated/i);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } }),
    );
  });
});

describe('AuthService SSO', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;

  const jwt = {
    sign: jest.fn().mockReturnValue('sso.jwt.token'),
    verify: jest.fn(),
  } as unknown as JwtService;
  const auth = new AuthService(prisma, jwt);

  beforeEach(() => {
    jest.clearAllMocks();
    (jwt.sign as jest.Mock).mockReturnValue('sso.jwt.token');
  });

  it('returns generic message without token when email is unknown', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await auth.ssoRequest({ email: 'missing@example.com' });
    expect(result.message).toMatch(/SSO/i);
    expect(result).not.toHaveProperty('ssoToken');
  });

  it('issues an SSO token for an active user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'owner@example.com',
      organizationId: 'o1',
      role: 'owner',
      isActive: true,
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await auth.ssoRequest({ email: 'owner@example.com', provider: 'google' });
    expect('ssoToken' in result && result.ssoToken).toBe('sso.jwt.token');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'sso', sub: 'u1' }),
      expect.objectContaining({ expiresIn: '15m' }),
    );
  });

  it('verifies SSO token and returns a session', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({
      purpose: 'sso',
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: 'o1',
      role: 'owner',
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'o1',
      role: 'owner',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: { id: 'o1', name: 'Org', slug: 'org' },
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (jwt.sign as jest.Mock).mockReturnValue('access.token');

    const result = await auth.ssoVerify({ token: 'sso.jwt.token' });
    expect(result.accessToken).toBe('access.token');
    expect(result.user.email).toBe('owner@example.com');
  });
});
