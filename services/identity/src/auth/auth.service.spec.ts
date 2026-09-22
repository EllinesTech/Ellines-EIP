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
  const config = { get: jest.fn() } as unknown as ConfigService;
  const auth = new AuthService(prisma, jwt, config);

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

describe('AuthService login lockout & session registry (24.4.1 / 24.2.3)', () => {
  const PASSWORD = 'Password123!';
  let passwordHash: string;
  let prisma: {
    user: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
    session: { create: jest.Mock; updateMany: jest.Mock };
  };
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };
  let auth: AuthService;

  beforeAll(async () => {
    const bcrypt = await import('bcryptjs');
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      session: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };
    config = { get: jest.fn().mockReturnValue('') };
    // Fresh instance per test — lockout state is per-service-instance.
    auth = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  function knownUser() {
    return {
      id: 'u1',
      email: 'real@example.com',
      passwordHash,
      fullName: 'Real User',
      organizationId: 'o1',
      role: 'owner',
      isActive: true,
      title: null,
      bio: null,
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      organization: { id: 'o1', name: 'Org', slug: 'org', settings: {} },
    };
  }

  async function statusOf(promise: Promise<unknown>): Promise<number> {
    try {
      await promise;
      return 200;
    } catch (err) {
      return (err as { getStatus: () => number }).getStatus();
    }
  }

  async function responseOf(promise: Promise<unknown>): Promise<{ status: number; body: unknown }> {
    try {
      await promise;
      return { status: 200, body: null };
    } catch (err) {
      const e = err as { getStatus: () => number; getResponse: () => unknown };
      return { status: e.getStatus(), body: e.getResponse() };
    }
  }

  it('locks after 5 failed attempts with a generic 429 (unknown email path)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    for (let i = 0; i < 5; i += 1) {
      expect(await statusOf(auth.login({ email: 'ghost@example.com', password: PASSWORD }))).toBe(401);
    }
    expect(await statusOf(auth.login({ email: 'ghost@example.com', password: PASSWORD }))).toBe(429);
  });

  it('blocks authentication while locked even with the correct password (known account)', async () => {
    prisma.user.findUnique.mockResolvedValue(knownUser());

    for (let i = 0; i < 5; i += 1) {
      expect(await statusOf(auth.login({ email: 'real@example.com', password: 'WrongPass1!' }))).toBe(401);
    }
    // Sixth attempt carries the CORRECT password but must still be rejected.
    expect(await statusOf(auth.login({ email: 'real@example.com', password: PASSWORD }))).toBe(429);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('produces identical locked responses for known and unknown accounts (anti-enumeration)', async () => {
    prisma.user.findUnique.mockResolvedValue(knownUser());
    for (let i = 0; i < 5; i += 1) {
      await statusOf(auth.login({ email: 'real@example.com', password: 'WrongPass1!' }));
    }
    const knownResponse = await responseOf(auth.login({ email: 'real@example.com', password: PASSWORD }));
    expect(knownResponse.status).toBe(429);

    // Fresh service instance (fresh lockout state), address that does not exist.
    const auth2 = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
    prisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i += 1) {
      await responseOf(auth2.login({ email: 'ghost@example.com', password: PASSWORD }));
    }
    const unknownResponse = await responseOf(auth2.login({ email: 'ghost@example.com', password: PASSWORD }));
    expect(unknownResponse.status).toBe(429);

    expect(knownResponse).toEqual(unknownResponse); // identical status + body
  });
  it('clears failure state after successful authentication (24.4.1 reset)', async () => {
    prisma.user.findUnique.mockResolvedValue(knownUser());
    for (let i = 0; i < 4; i += 1) {
      expect(await statusOf(auth.login({ email: 'real@example.com', password: 'WrongPass1!' }))).toBe(401);
    }
    await expect(auth.login({ email: 'real@example.com', password: PASSWORD })).resolves.toHaveProperty(
      'accessToken',
      'signed-access-token',
    );

    // Counter restarted: 4 pre-success + 3 post-success failures would lock (≥5)
    // if the pre-success count had persisted.
    expect(await statusOf(auth.login({ email: 'real@example.com', password: 'WrongPass1!' }))).toBe(401);
    expect(await statusOf(auth.login({ email: 'real@example.com', password: 'WrongPass1!' }))).toBe(401);
    expect(await statusOf(auth.login({ email: 'real@example.com', password: 'WrongPass1!' }))).toBe(401);
    await expect(auth.login({ email: 'real@example.com', password: PASSWORD })).resolves.toHaveProperty(
      'accessToken',
      'signed-access-token',
    );
  });

  it('creates a session row hashed from the issued access token (24.2.3)', async () => {
    prisma.user.findUnique.mockResolvedValue(knownUser());
    const result = await auth.login({ email: 'real@example.com', password: PASSWORD });

    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const data = (prisma.session.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'u1',
      organizationId: 'o1',
      tokenHash: auth.hashToken(result.accessToken),
    });
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('login survives session-registry write failures (migration 0003 not yet applied)', async () => {
    prisma.user.findUnique.mockResolvedValue(knownUser());
    prisma.session.create.mockRejectedValue(new Error('relation "sessions" does not exist'));

    await expect(auth.login({ email: 'real@example.com', password: PASSWORD })).resolves.toHaveProperty(
      'accessToken',
      'signed-access-token',
    );
  });

  it('revocation primitives update the registry by token hash / user id', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });

    await expect(auth.revokeSessionByToken('raw.jwt')).resolves.toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: auth.hashToken('raw.jwt'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    await expect(auth.revokeUserSessions('u1')).resolves.toBe(1);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revocation primitives degrade gracefully while the registry is unavailable', async () => {
    prisma.session.updateMany.mockRejectedValue(new Error('relation "sessions" does not exist'));
    await expect(auth.revokeSessionByToken('raw.jwt')).resolves.toBe(false);
    await expect(auth.revokeUserSessions('u1')).resolves.toBe(0);
  });
});
