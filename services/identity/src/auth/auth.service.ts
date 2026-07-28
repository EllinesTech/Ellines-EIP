import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
