import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  assertCanAssignRole,
  assertCanManageOrgUser,
  mergeOrganizationSettings,
  normalizeEllineaMemoryNotes,
  normalizeOrgDateTimeSettings,
  type EllineaMemoryNoteDto,
  type OrgDateTimeSettings,
  type UserRole,
} from '@ellines-eip/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrganization(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: { select: { users: true, branches: true, departments: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      counts: org._count,
    };
  }

  private async readSettingsRaw(organizationId: string): Promise<unknown> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org.settings;
  }

  async getSettings(organizationId: string): Promise<OrgDateTimeSettings> {
    return normalizeOrgDateTimeSettings(await this.readSettingsRaw(organizationId));
  }

  async updateSettings(
    organizationId: string,
    patch: Partial<OrgDateTimeSettings>,
  ): Promise<OrgDateTimeSettings> {
    const existing = await this.readSettingsRaw(organizationId);
    const nextPrefs = normalizeOrgDateTimeSettings({
      ...normalizeOrgDateTimeSettings(existing),
      ...patch,
    });
    const next = mergeOrganizationSettings(existing, {
      ...nextPrefs,
    });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as Prisma.InputJsonValue },
    });
    return nextPrefs;
  }

  async getEllineaMemory(organizationId: string): Promise<EllineaMemoryNoteDto[]> {
    const settings = await this.readSettingsRaw(organizationId);
    const obj =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : {};
    return normalizeEllineaMemoryNotes(obj.ellineaMemory);
  }

  async putEllineaMemory(
    organizationId: string,
    notes: unknown,
  ): Promise<EllineaMemoryNoteDto[]> {
    const normalized = normalizeEllineaMemoryNotes(notes);
    const existing = await this.readSettingsRaw(organizationId);
    const next = mergeOrganizationSettings(existing, { ellineaMemory: normalized });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as Prisma.InputJsonValue },
    });
    return normalized;
  }

  async listUsers(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async inviteUser(organizationId: string, actorRole: string, dto: InviteUserDto) {
    if (!['owner', 'admin'].includes(actorRole)) {
      throw new ForbiddenException('Only owners and admins can invite users');
    }

    const nextRole = (dto.role || 'member') as UserRole;
    const assignErr = assertCanAssignRole(actorRole, nextRole);
    if (assignErr) throw new ForbiddenException(assignErr);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ForbiddenException('Email already registered');
    }

    const tempPassword = dto.temporaryPassword || `Temp-${Math.random().toString(36).slice(2, 10)}!`;
    const passwordHash = await bcrypt.hash(tempPassword, 8);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        passwordHash,
        organizationId,
        role: nextRole,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: user.id,
        action: 'org.invite_user',
        resource: 'user',
        metadata: { email: user.email, role: user.role },
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      temporaryPassword: tempPassword,
    };
  }

  async updateUser(
    organizationId: string,
    actor: { id: string; role: string },
    userId: string,
    dto: UpdateUserDto,
  ) {
    if (!['owner', 'admin'].includes(actor.role)) {
      throw new ForbiddenException('Only owners and admins can update users');
    }
    if (dto.role === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Provide role and/or isActive');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!target) throw new NotFoundException('User not found');

    const manageErr = assertCanManageOrgUser(actor.role, target.role);
    if (manageErr) throw new ForbiddenException(manageErr);

    if (dto.role !== undefined) {
      const assignErr = assertCanAssignRole(actor.role, dto.role as UserRole);
      if (assignErr) throw new ForbiddenException(assignErr);
      if (target.role === 'owner' && dto.role !== 'owner') {
        await this.assertNotLastOwner(organizationId, target.id);
      }
    }

    if (dto.isActive === false) {
      if (target.id === actor.id) {
        throw new ForbiddenException('You cannot deactivate your own account');
      }
      if (target.role === 'owner') {
        await this.assertNotLastOwner(organizationId, target.id);
      }
    }

    const user = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: actor.id,
        action: 'org.update_user',
        resource: 'user',
        metadata: {
          targetUserId: user.id,
          role: user.role,
          isActive: user.isActive,
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async assertNotLastOwner(organizationId: string, excludeUserId: string) {
    const owners = await this.prisma.user.count({
      where: {
        organizationId,
        role: 'owner',
        isActive: true,
        id: { not: excludeUserId },
      },
    });
    if (owners < 1) {
      throw new ForbiddenException('Cannot remove or demote the last active owner');
    }
  }

  async listBranches(organizationId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createBranch(organizationId: string, dto: CreateBranchDto) {
    const branch = await this.prisma.branch.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: 'org.create_branch',
        resource: 'branch',
        metadata: { branchId: branch.id, name: branch.name },
      },
    });
    return branch;
  }

  async listDepartments(organizationId: string) {
    return this.prisma.department.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(organizationId: string, dto: CreateDepartmentDto) {
    const dept = await this.prisma.department.create({
      data: {
        organizationId,
        name: dto.name,
        branchId: dto.branchId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: 'org.create_department',
        resource: 'department',
        metadata: { departmentId: dept.id, name: dept.name },
      },
    });
    return dept;
  }

  // ── Alert Correlation Engine (A.3.1) ──────────────────────────────────────

  async getAlertCorrelations(organizationId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const events = await this.prisma.enterpriseEvent.findMany({
      where: { organizationId, at: { gte: since } },
      orderBy: { at: 'desc' },
      take: 500,
    });

    const rows = events.map((e) => ({
      id: e.id,
      type: e.type,
      payload: (e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)
        ? e.payload
        : {}) as Record<string, unknown>,
      created_at: e.at.toISOString(),
    }));

    const groups = this.correlate(rows);

    return {
      windowHours: 24,
      totalEvents: rows.length,
      correlationGroups: groups,
      correlatedEvents: groups.reduce((s: number, g: { count: number }) => s + g.count, 0),
      computedAt: new Date().toISOString(),
    };
  }

  private categorise(eventType: string): string {
    if (eventType.includes('alert')) return 'alert_threshold';
    if (eventType.includes('sync')) return 'sync_event';
    if (eventType.includes('fail') || eventType.includes('error')) return 'connector_error';
    if (eventType.includes('approval') || eventType.includes('approve')) return 'approval_pressure';
    return 'general';
  }

  private correlationSeverity(count: number, category: string): string {
    if (category === 'connector_error') return count >= 3 ? 'critical' : count >= 2 ? 'high' : 'medium';
    if (category === 'alert_threshold') return count >= 5 ? 'critical' : count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low';
    if (category === 'approval_pressure') return count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';
    return count >= 5 ? 'high' : count >= 3 ? 'medium' : 'low';
  }

  private correlate(events: { id: string; type: string; payload: Record<string, unknown>; created_at: string }[]) {
    if (!events.length) return [];
    const sorted = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const buckets = new Map<string, typeof sorted>();

    for (const ev of sorted) {
      const cat = this.categorise(ev.type);
      const windowKey = Math.floor(new Date(ev.created_at).getTime() / (15 * 60 * 1000));
      const key = `${cat}::${windowKey}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(ev);
    }

    const groups: unknown[] = [];
    let gIdx = 0;

    for (const [key, evs] of buckets) {
      if (evs.length < 2) continue;
      const [cat] = key.split('::');
      const sources = [...new Set(evs.map((e) => String(e.payload?.['source'] || e.payload?.['connectorName'] || '')).filter(Boolean))];
      groups.push({
        id: `corr_${++gIdx}_${cat}`,
        category: cat,
        severity: this.correlationSeverity(evs.length, cat),
        count: evs.length,
        firstSeenAt: evs[0].created_at,
        lastSeenAt: evs[evs.length - 1].created_at,
        events: evs.map((e) => e.id),
        sources,
        rootCauseHint: `Cluster of ${evs.length} ${cat.replace(/_/g, ' ')} events — investigate with Ellinea Ask.`,
        suggestedActions: ['Review timeline', 'Ask Ellinea for brief'],
      });
    }

    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (groups as { severity: string; count: number }[]).sort(
      (a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4) || b.count - a.count,
    );
  }
}
