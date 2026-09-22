import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  mergeOrganizationSettings,
  readPlatformOrgStatus,
  type PlatformOrgStatus,
} from '@ellines-eip/shared';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { users: true } },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt.toISOString(),
      userCount: o._count.users,
      status: readPlatformOrgStatus(o.settings),
    }));
  }

  async updateOrganizationStatus(
    orgId: string,
    status: PlatformOrgStatus,
    actorUserId: string,
    actorEmail: string,
  ) {
    if (status !== 'active' && status !== 'suspended') {
      throw new BadRequestException('status must be active or suspended');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const nextSettings = mergeOrganizationSettings(org.settings, {
      platformStatus: status,
    });
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { settings: nextSettings as Prisma.InputJsonValue },
      include: { _count: { select: { users: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: actorUserId,
        action: status === 'suspended' ? 'platform.org.suspend' : 'platform.org.resume',
        resource: 'organization',
        metadata: { actorEmail, status, slug: org.slug },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt.toISOString(),
      userCount: updated._count.users,
      status: readPlatformOrgStatus(updated.settings),
    };
  }

  /** Placeholder flags until a dedicated config store exists. */
  listFeatureFlags() {
    return [
      {
        key: 'ellinea_chat',
        label: 'Ellinea chat',
        enabled: false,
        note: 'Unlocks Ask Ellinea production chat',
      },
      {
        key: 'live_connectors',
        label: 'Live connectors',
        enabled: false,
        note: 'Integration Hub sync to Command Center',
      },
      {
        key: 'ceo_daily_brief',
        label: 'CEO Daily Brief',
        enabled: false,
        note: 'Automated morning summary delivery',
      },
    ];
  }

  // ── God-mode org creation ───────────────────────────────────────────────

  async createOrganization(dto: {
    name: string;
    slug?: string;
    ownerEmail?: string;
    ownerFullName?: string;
    ownerPassword?: string;
    actorUserId: string;
    actorEmail: string;
  }) {
    const slug = (dto.slug || this.slugify(dto.name));
    if (!slug) throw new BadRequestException('Could not derive a valid slug');

    const slugTaken = await this.prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) throw new ConflictException(`Slug "${slug}" is already taken`);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.name, slug },
      });

      let owner: { id: string; email: string; fullName: string; role: string } | null = null;

      if (dto.ownerEmail) {
        const email = dto.ownerEmail.toLowerCase();
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) throw new ConflictException(`Email "${email}" is already registered`);

        if (!dto.ownerPassword || dto.ownerPassword.length < 8) {
          throw new BadRequestException('ownerPassword must be at least 8 characters');
        }

        const passwordHash = await bcrypt.hash(dto.ownerPassword, 8);
        const user = await tx.user.create({
          data: {
            email,
            fullName: dto.ownerFullName || 'Org Owner',
            passwordHash,
            organizationId: org.id,
            role: 'owner' as UserRole,
            isActive: true,
          },
        });
        owner = { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
      }

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: dto.actorUserId,
          action: 'platform.org.create',
          resource: 'organization',
          metadata: { name: org.name, slug: org.slug, ownerEmail: owner?.email ?? null, createdBy: dto.actorEmail },
        },
      });

      return { org, owner };
    });

    return {
      id: result.org.id,
      name: result.org.name,
      slug: result.org.slug,
      createdAt: result.org.createdAt.toISOString(),
      userCount: result.owner ? 1 : 0,
      status: 'active' as const,
      owner: result.owner,
    };
  }

  // ── God-mode user management ────────────────────────────────────────────

  async listOrgUsers(orgId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));
  }

  async createOrgUser(
    orgId: string,
    dto: { email: string; fullName: string; password: string; role?: string; actorUserId: string; actorEmail: string },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const VALID_ROLES: UserRole[] = ['owner', 'admin', 'executive', 'manager', 'member', 'viewer'];
    const role = (dto.role || 'member') as UserRole;
    if (!VALID_ROLES.includes(role)) throw new BadRequestException('Invalid role');

    const passwordHash = await bcrypt.hash(dto.password, 8);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, fullName: dto.fullName, passwordHash, organizationId: orgId, role, isActive: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: dto.actorUserId,
          action: 'platform.user.create',
          resource: 'user',
          metadata: { targetEmail: email, role, createdBy: dto.actorEmail },
        },
      });
      return u;
    });

    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, isActive: user.isActive, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
  }

  async updateOrgUser(
    orgId: string,
    userId: string,
    dto: { fullName?: string; role?: string; isActive?: boolean; password?: string; actorUserId: string; actorEmail: string },
  ) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.role !== undefined) data.role = dto.role as UserRole;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) {
      if (dto.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
      data.passwordHash = await bcrypt.hash(dto.password, 8);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId, organizationId: orgId } as Prisma.UserWhereUniqueInput, data });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: dto.actorUserId,
          action: 'platform.user.update',
          resource: 'user',
          metadata: { targetUserId: userId, changes: Object.keys(dto).filter(k => !['actorUserId','actorEmail'].includes(k)), updatedBy: dto.actorEmail },
        },
      });
      return u;
    });

    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, isActive: user.isActive, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
  }

  async deactivateOrgUser(orgId: string, userId: string, actorUserId: string, actorEmail: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId } as Prisma.UserWhereUniqueInput, data: { isActive: false } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: actorUserId,
          action: 'platform.user.deactivate',
          resource: 'user',
          metadata: { targetEmail: u.email, deactivatedBy: actorEmail },
        },
      });
      return u;
    });
    return { ok: true, message: `User ${user.email} deactivated.` };
  }

  // ── Cross-org audit log viewer ──────────────────────────────────────────

  async listAuditLogs(params: {
    orgId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.orgId) where.organizationId = params.orgId;
    if (params.action) where.action = { startsWith: params.action };
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(params.from);
      if (params.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(params.to);
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.offset,
        take: params.limit,
        include: {
          organization: { select: { name: true, slug: true } },
          user: { select: { email: true, fullName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      total,
      offset: params.offset,
      limit: params.limit,
      rows: rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        organizationName: r.organization?.name ?? null,
        organizationSlug: r.organization?.slug ?? null,
        userId: r.userId,
        userEmail: r.user?.email ?? null,
        userFullName: r.user?.fullName ?? null,
        action: r.action,
        resource: r.resource,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
}
