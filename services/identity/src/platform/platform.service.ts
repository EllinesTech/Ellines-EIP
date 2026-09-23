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

  async listOrganizations(excludeOrgId?: string) {
    const orgs = await this.prisma.organization.findMany({
      where: excludeOrgId ? { id: { not: excludeOrgId } } : undefined,
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

  // ── Platform metrics ────────────────────────────────────────────────────

  async getPlatformMetrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [orgs, activeUsers, auditEvents, rateLimitHits, connectors, failedConnectors] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.count({ where: { action: { startsWith: 'rate_limit' }, createdAt: { gte: since } } }),
      this.prisma.connectorInstallation.count().catch(() => 0),
      this.prisma.connectorInstallation.count({ where: { status: 'error' } }).catch(() => 0),
    ]);
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      window: { since: since.toISOString(), durationHours: 24 },
      platform: {
        businesses: orgs,
        activeUsers,
        auditEvents24h: auditEvents,
        apiRequests24h: 0, // not tracked at request level yet
        rateLimitViolations24h: rateLimitHits,
      },
      businessServices: {
        connectorInstallations: connectors,
        failedConnectorInstallations: failedConnectors,
      },
    };
  }

  // ── Platform health summary ──────────────────────────────────────────────

  async getPlatformHealthSummary() {
    const checkedAt = new Date().toISOString();
    let dbStatus: 'up' | 'down' = 'up';
    let dbLatency: number | null = null;
    try {
      const t0 = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - t0;
    } catch {
      dbStatus = 'down';
    }
    const overallStatus = dbStatus === 'down' ? 'degraded' : 'ok';
    return {
      status: overallStatus,
      checkedAt,
      dependencies: [
        { name: 'database', status: dbStatus, latencyMs: dbLatency },
      ],
    };
  }

  // ── Per-org stats ────────────────────────────────────────────────────────

  async getOrgStats(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const [totalUsers, activeUsers, roleRows, totalConnectors, syncedConnectors,
      totalApprovals, pendingApprovals, totalEvents, lastEvent] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: orgId } }),
      this.prisma.user.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.user.groupBy({ by: ['role'], where: { organizationId: orgId }, _count: true }),
      this.prisma.connectorInstallation.count({ where: { organizationId: orgId } }).catch(() => 0),
      this.prisma.connectorInstallation.count({ where: { organizationId: orgId, status: 'synced' } }).catch(() => 0),
      this.prisma.approvalRequest.count({ where: { organizationId: orgId } }).catch(() => 0),
      this.prisma.approvalRequest.count({ where: { organizationId: orgId, status: 'pending' } }).catch(() => 0),
      this.prisma.auditLog.count({ where: { organizationId: orgId } }),
      this.prisma.auditLog.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    const roleBreakdown: Record<string, number> = {};
    for (const r of roleRows) roleBreakdown[r.role] = r._count;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      lastActivityAt: lastEvent?.createdAt.toISOString() ?? null,
      lastSyncedAt: null,
      stats: { totalUsers, activeUsers, roleBreakdown, totalConnectors, syncedConnectors, totalApprovals, pendingApprovals, totalEvents },
    };
  }

  // ── Service packages (rate_limit_tiers) ─────────────────────────────────

  async listPackages() {
    const tiers = await this.prisma.rateLimitTier.findMany({ orderBy: { priority: 'asc' } });
    return tiers.map(this.mapPackage);
  }

  private mapPackage(t: {
    id: string; name: string; displayName: string;
    requestsPerDay: number; requestsPerHour: number; requestsPerMinute: number;
    burstLimit: number; maxConnectors: number | null; maxUsers: number | null;
    maxDataExportPerDay: number | null; enableWebhooks: boolean; enableSso: boolean;
    enableCustomRoles: boolean; enableAgents: boolean; enableAdvancedBI: boolean;
    priority: number; monthlyPrice: number;
  }) {
    return {
      id: t.id,
      name: t.name,
      display_name: t.displayName,
      requests_per_day: t.requestsPerDay,
      requests_per_hour: t.requestsPerHour,
      requests_per_minute: t.requestsPerMinute,
      burst_limit: t.burstLimit,
      max_connectors: t.maxConnectors,
      max_users: t.maxUsers,
      max_data_export_per_day: t.maxDataExportPerDay,
      enable_webhooks: t.enableWebhooks,
      enable_sso: t.enableSso,
      enable_custom_roles: t.enableCustomRoles,
      enable_agents: t.enableAgents,
      enable_advanced_bi: t.enableAdvancedBI,
      priority: t.priority,
      monthly_price: t.monthlyPrice,
    };
  }

  async createPackage(dto: {
    name: string; displayName: string; maxUsers?: number | null; maxConnectors?: number | null;
    requestsPerDay?: number; monthlyPrice?: number;
    enableSso?: boolean; enableCustomRoles?: boolean; enableAgents?: boolean;
    enableAdvancedBi?: boolean; enableWebhooks?: boolean;
    actorUserId: string; actorEmail: string; reason?: string;
  }) {
    const rpd = dto.requestsPerDay ?? 10000;
    const pkg = await this.prisma.rateLimitTier.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        requestsPerDay: rpd,
        requestsPerHour: Math.ceil(rpd / 24),
        requestsPerMinute: Math.ceil(rpd / 1440),
        burstLimit: 100,
        maxConnectors: dto.maxConnectors ?? null,
        maxUsers: dto.maxUsers ?? null,
        monthlyPrice: dto.monthlyPrice ?? 0,
        enableSso: dto.enableSso ?? false,
        enableCustomRoles: dto.enableCustomRoles ?? false,
        enableAgents: dto.enableAgents ?? false,
        enableAdvancedBI: dto.enableAdvancedBi ?? false,
        enableWebhooks: dto.enableWebhooks ?? false,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: (await this.prisma.organization.findFirst())!.id,
        userId: dto.actorUserId,
        action: 'platform.package.create',
        resource: 'rate_limit_tier',
        metadata: { packageId: pkg.id, name: pkg.name, reason: dto.reason, createdBy: dto.actorEmail },
      },
    });
    return this.mapPackage(pkg);
  }

  async updatePackage(id: string, dto: {
    displayName?: string; maxUsers?: number; maxConnectors?: number;
    requestsPerDay?: number; monthlyPrice?: number;
    actorUserId: string; actorEmail: string; reason?: string;
  }) {
    const data: Prisma.RateLimitTierUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.maxUsers !== undefined) data.maxUsers = dto.maxUsers;
    if (dto.maxConnectors !== undefined) data.maxConnectors = dto.maxConnectors;
    if (dto.requestsPerDay !== undefined) {
      data.requestsPerDay = dto.requestsPerDay;
      data.requestsPerHour = Math.ceil(dto.requestsPerDay / 24);
      data.requestsPerMinute = Math.ceil(dto.requestsPerDay / 1440);
    }
    if (dto.monthlyPrice !== undefined) data.monthlyPrice = dto.monthlyPrice;
    const pkg = await this.prisma.rateLimitTier.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: {
        organizationId: (await this.prisma.organization.findFirst())!.id,
        userId: dto.actorUserId,
        action: 'platform.package.update',
        resource: 'rate_limit_tier',
        metadata: { packageId: id, changes: Object.keys(data), reason: dto.reason, updatedBy: dto.actorEmail },
      },
    });
    return this.mapPackage(pkg);
  }

  async deletePackage(id: string, actorUserId: string, actorEmail: string, reason?: string) {
    await this.prisma.rateLimitTier.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        organizationId: (await this.prisma.organization.findFirst())!.id,
        userId: actorUserId,
        action: 'platform.package.delete',
        resource: 'rate_limit_tier',
        metadata: { packageId: id, reason, deletedBy: actorEmail },
      },
    });
    return { ok: true };
  }

  // ── Org package (tier) assignment ────────────────────────────────────────

  async getOrgPackage(orgId: string) {
    const row = await this.prisma.organizationTier.findFirst({
      where: { organizationId: orgId },
      include: { tier: true },
    });
    if (!row) return null;
    return { ...row, rate_limit_tiers: row.tier };
  }

  async assignOrgPackage(orgId: string, tierId: string, actorUserId: string, actorEmail: string) {
    const result = await this.prisma.organizationTier.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, tierId },
      update: { tierId },
      include: { tier: true },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: actorUserId,
        action: 'platform.org.assign_package',
        resource: 'organization_tier',
        metadata: { tierId, assignedBy: actorEmail },
      },
    });
    return { ...result, rate_limit_tiers: result.tier };
  }

  // ── Feature flag update ──────────────────────────────────────────────────

  updateFeatureFlag(key: string, enabled: boolean) {
    // Flags are in-memory until a DB config store is built.
    // Return the updated list so the UI can reflect the change.
    const flags = this.listFeatureFlags().map((f) =>
      f.key === key ? { ...f, enabled } : f,
    );
    return { statusCode: 200, data: flags };
  }

  // ── Cross-org Work Console resources (platform-admin god-mode reads) ────────

  async listOrgConnectors(orgId: string) {
    const rows = await this.prisma.connectorInstallation.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      catalogId: r.catalogId,
      displayName: r.displayName,
      status: r.status,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
      lastMessage: r.lastMessage ?? null,
      lastError: r.lastError ?? null,
      errorCount: r.errorCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async listOrgApprovals(orgId: string) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      requester: r.requester,
      status: r.status,
      templateId: r.templateId,
      source: r.source,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decidedBy: r.decidedBy ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listOrgRules(orgId: string) {
    const rows = await this.prisma.businessRule.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      when: r.when,
      threshold: r.threshold,
      then: r.then,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listOrgReports(orgId: string) {
    const rows = await this.prisma.scheduledReport.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      cadence: r.cadence,
      enabled: r.enabled,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listOrgAgents(orgId: string) {
    const rows = await this.prisma.ellineaAgent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      trigger: r.trigger,
      isActive: r.isActive,
      isPaused: r.isPaused,
      executionCount: r.executionCount,
      successCount: r.successCount,
      lastExecutedAt: r.lastExecutedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getOrgSnapshot(orgId: string) {
    const snap = await this.prisma.enterpriseSnapshot.findUnique({
      where: { organizationId: orgId },
    });
    if (!snap) return null;
    return {
      organizationId: snap.organizationId,
      connectorId: snap.connectorId,
      connectorName: snap.connectorName,
      healthScore: snap.healthScore,
      connectedSystems: snap.connectedSystems,
      openAlerts: snap.openAlerts,
      openDecisions: snap.openDecisions,
      briefHighlight: snap.briefHighlight,
      timeline: snap.timeline,
      syncedAt: snap.syncedAt.toISOString(),
    };
  }

  // ── Encryption migration ─────────────────────────────────────────────────

  async migrateEncryption(dryRun: boolean, organizationId?: string) {    // Scans connector installations that may have legacy credentials.
    // In production this would re-encrypt with the current master key.
    const where = organizationId ? { organizationId } : {};
    const scanned = await this.prisma.connectorInstallation.count({ where }).catch(() => 0);
    return { scanned, migrated: dryRun ? 0 : 0, alreadyCurrent: scanned, failed: 0, dryRun };
  }

  private slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
}
