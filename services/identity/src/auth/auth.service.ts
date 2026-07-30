import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SsoRequestDto } from './dto/sso-request.dto';
import { SsoVerifyDto } from './dto/sso-verify.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const SSO_TOKEN_TTL = '15m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const slug = this.slugify(dto.organizationName);
    const slugTaken = await this.prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) {
      throw new ConflictException('Organization name already taken — try a different name');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          fullName: dto.fullName,
          organizationId: org.id,
          role: 'owner',
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: 'auth.register',
          resource: 'organization',
          metadata: { organizationName: org.name, email: user.email },
        },
      });

      return { org, user };
    });

    const tokens = this.signTokens(result.user.id, result.user.email, result.org.id, result.user.role);

    return {
      user: this.sanitizeUser(result.user),
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.login',
        resource: 'user',
      },
    });

    const tokens = this.signTokens(user.id, user.email, user.organizationId, user.role);

    return {
      user: this.sanitizeUser(user),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      ...tokens,
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      user: this.sanitizeUser(user),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
    };
  }

  /**
   * Issues a one-time reset token. Always returns a generic message.
   * Until notification service exists, `resetToken` is included when a user matched
   * so clients/admins can complete the flow (same MVP pattern as invite temp passwords).
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    const base = {
      message: 'If that email is registered, a password reset token has been issued.',
    };

    if (!user || !user.isActive) {
      return base;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash,
        expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.forgot_password',
        resource: 'user',
      },
    });

    return {
      ...base,
      resetToken: rawToken,
      expiresIn: '1h',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!record.user.isActive) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      // Invalidate any other outstanding tokens for this user
      await tx.passwordResetToken.updateMany({
        where: {
          userId: record.userId,
          usedAt: null,
          id: { not: record.id },
        },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: record.organizationId ?? record.user.organizationId,
          userId: record.userId,
          action: 'auth.reset_password',
          resource: 'user',
        },
      });
    });

    return { message: 'Password updated. You can sign in with your new password.' };
  }

  /**
   * Passwordless work-email SSO. Until notification service exists, `ssoToken`
   * is returned when a user matched so the client can complete verify.
   */
  async ssoRequest(dto: SsoRequestDto) {
    const email = dto.email.toLowerCase();
    const provider = (dto.provider || 'email').toLowerCase();
    const base = {
      message:
        'If that work email is registered, a one-time SSO sign-in link has been issued.',
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return base;
    }

    const ssoToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
        purpose: 'sso',
      },
      { expiresIn: SSO_TOKEN_TTL },
    );

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.sso_request',
        resource: 'user',
        metadata: { provider },
      },
    });

    return {
      ...base,
      ssoToken,
      expiresIn: SSO_TOKEN_TTL,
    };
  }

  async ssoVerify(dto: SsoVerifyDto) {
    let payload: {
      sub?: string;
      email?: string;
      organizationId?: string;
      role?: string;
      purpose?: string;
    };
    try {
      payload = this.jwt.verify(dto.token);
    } catch {
      throw new UnauthorizedException('Invalid or expired SSO token');
    }

    if (
      payload.purpose !== 'sso' ||
      !payload.sub ||
      !payload.email ||
      !payload.organizationId ||
      !payload.role
    ) {
      throw new UnauthorizedException('Invalid or expired SSO token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true },
    });

    if (!user || !user.isActive || user.email.toLowerCase() !== payload.email.toLowerCase()) {
      throw new UnauthorizedException('Invalid or expired SSO token');
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.sso_login',
        resource: 'user',
      },
    });

    const tokens = this.signTokens(user.id, user.email, user.organizationId, user.role);
    return {
      user: this.sanitizeUser(user),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      ...tokens,
    };
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private signTokens(userId: string, email: string, organizationId: string, role: string) {
    const payload = { sub: userId, email, organizationId, role };
    return {
      accessToken: this.jwt.sign(payload),
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    };
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    fullName: string;
    organizationId: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: user.organizationId,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) {
      throw new BadRequestException('Organization name is invalid');
    }
    return slug;
  }
}
