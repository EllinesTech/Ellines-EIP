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

  // ── Ellinea Learning ─────────────────────────────────────────────────────

  private normalizeLearning(raw: unknown, organizationId: string) {
    const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw : {}) as Record<string, unknown>;
    const feedbackRaw = (obj.feedback && typeof obj.feedback === 'object' && !Array.isArray(obj.feedback)
      ? obj.feedback : {}) as Record<string, { helpful?: number; dismiss?: number }>;
    const feedback: Record<string, { helpful: number; dismiss: number }> = {};
    for (const [k, v] of Object.entries(feedbackRaw)) {
      if (!v || typeof v !== 'object') continue;
      feedback[k] = { helpful: Math.max(0, Number(v.helpful) || 0), dismiss: Math.max(0, Number(v.dismiss) || 0) };
    }
    let dna: { organizationId: string; updatedAt: string; traits: { id: string; label: string; detail: string; source: string }[]; summary: string } | null = null;
    if (obj.dna && typeof obj.dna === 'object' && !Array.isArray(obj.dna)) {
      const d = obj.dna as Record<string, unknown>;
      const traits: { id: string; label: string; detail: string; source: string }[] = [];
      if (Array.isArray(d.traits)) {
        for (const t of d.traits as Record<string, unknown>[]) {
          const id = typeof t.id === 'string' ? t.id : '';
          const label = typeof t.label === 'string' ? t.label : '';
          if (!id || !label) continue;
          traits.push({ id, label, detail: typeof t.detail === 'string' ? t.detail : '', source: typeof t.source === 'string' ? t.source : 'memory' });
        }
      }
      dna = { organizationId, updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(), summary: typeof d.summary === 'string' ? d.summary : '', traits: traits.slice(0, 20) };
    }
    return { feedback, dna };
  }

  async getEllineaLearning(organizationId: string) {
    const settings = await this.readSettingsRaw(organizationId);
    const obj = (settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings : {}) as Record<string, unknown>;
    return this.normalizeLearning(obj.ellineaLearning, organizationId);
  }

  async saveEllineaLearning(organizationId: string, body: unknown) {
    const learning = this.normalizeLearning(body, organizationId);
    if (learning.dna) learning.dna.organizationId = organizationId;
    const existing = await this.readSettingsRaw(organizationId);
    const next = mergeOrganizationSettings(existing, { ellineaLearning: learning });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as Prisma.InputJsonValue, updatedAt: new Date() },
    });
    return learning;
  }

  // ── Org Status ────────────────────────────────────────────────────────────

  async getOrgStatus(organizationId: string) {
    const [installations, members, snapshot] = await Promise.all([
      this.prisma.connectorInstallation.findMany({
        where: { organizationId },
        select: { id: true, status: true, lastSyncedAt: true },
      }),
      this.prisma.user.findMany({
        where: { organizationId, isActive: true },
        select: { id: true },
      }),
      this.prisma.enterpriseSnapshot.findFirst({
        where: { organizationId },
        orderBy: { syncedAt: 'desc' },
        select: { healthScore: true, syncedAt: true },
      }),
    ]);
    const active = installations.filter((i) => i.status === 'active' || i.status === 'synced');
    const syncTimes = installations.map((i) => i.lastSyncedAt?.toISOString() ?? '').filter(Boolean).sort().reverse();
    const lastSyncedAt = syncTimes[0] ?? snapshot?.syncedAt?.toISOString() ?? null;
    return {
      connectorCount: installations.length,
      activeConnectorCount: active.length,
      lastSyncedAt,
      memberCount: members.length,
      pendingInviteCount: 0,
      hasSync: Boolean(lastSyncedAt),
      healthScore: snapshot?.healthScore ?? null,
    };
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  private normalizeDocs(raw: unknown): Array<{ id: string; name: string; mimeType: string; sizeBytes: number; tags: string[]; branch?: string; department?: string; summary?: string; uploadedBy: string; uploadedAt: string; content?: string }> {
    if (!Array.isArray(raw)) return [];
    return (raw as Array<unknown>).filter((x): x is { id: string; name: string; mimeType: string; sizeBytes: number; tags: string[]; uploadedBy: string; uploadedAt: string } =>
      typeof (x as { id?: unknown }).id === 'string').slice(0, 50) as ReturnType<OrgsService['normalizeDocs']>;
  }

  async listDocuments(organizationId: string) {
    const settings = await this.readSettingsRaw(organizationId);
    const obj = (settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings : {}) as Record<string, unknown>;
    return this.normalizeDocs(obj.documents).map(({ content: _c, ...rest }) => rest);
  }

  async uploadDocument(organizationId: string, userId: string, userEmail: string, body: {
    name?: string; mimeType?: string; content?: string; tags?: string[];
    branch?: string; department?: string; summary?: string;
  }) {
    const name = (body.name || '').trim();
    if (!name) throw new BadRequestException('name is required');
    if (!body.content) throw new BadRequestException('content (base64) is required');
    const sizeBytes = Math.round((body.content.length * 3) / 4);
    if (sizeBytes > 500 * 1024) throw new BadRequestException(`Document exceeds 500KB limit`);
    const existing = await this.readSettingsRaw(organizationId);
    const obj = (existing && typeof existing === 'object' && !Array.isArray(existing)
      ? existing : {}) as Record<string, unknown>;
    const docs = this.normalizeDocs(obj.documents);
    if (docs.length >= 50) throw new BadRequestException('Document limit (50) reached');
    const now = new Date().toISOString();
    const newDoc = { id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, name, mimeType: body.mimeType || 'application/octet-stream', sizeBytes, tags: Array.isArray(body.tags) ? body.tags.slice(0, 10).map(String) : [], branch: body.branch, department: body.department, summary: body.summary?.slice(0, 500), uploadedBy: userEmail, uploadedAt: now, content: body.content };
    const next = mergeOrganizationSettings(existing, { documents: [newDoc, ...docs].slice(0, 50) });
    await this.prisma.organization.update({ where: { id: organizationId }, data: { settings: next as Prisma.InputJsonValue, updatedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { organizationId, userId, action: 'documents.upload', resource: 'document', metadata: { id: newDoc.id, name, sizeBytes } as Prisma.InputJsonValue } });
    const { content: _c, ...safe } = newDoc;
    return safe;
  }

  async deleteDocument(organizationId: string, userId: string, userEmail: string, userRole: string, docId: string) {
    if (!docId) throw new BadRequestException('id is required');
    const existing = await this.readSettingsRaw(organizationId);
    const obj = (existing && typeof existing === 'object' && !Array.isArray(existing)
      ? existing : {}) as Record<string, unknown>;
    const docs = this.normalizeDocs(obj.documents);
    const target = docs.find((d) => d.id === docId);
    if (!target) throw new NotFoundException('Document not found');
    if (target.uploadedBy !== userEmail && !['owner', 'admin'].includes(userRole)) {
      throw new ForbiddenException('Only the uploader or an admin can delete this document');
    }
    const next = mergeOrganizationSettings(existing, { documents: docs.filter((d) => d.id !== docId) });
    await this.prisma.organization.update({ where: { id: organizationId }, data: { settings: next as Prisma.InputJsonValue, updatedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { organizationId, userId, action: 'documents.delete', resource: 'document', metadata: { id: docId, name: target.name } as Prisma.InputJsonValue } });
    return { ok: true };
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

  // ── Audit Logs ────────────────────────────────────────────────────────────

  async listAuditLogs(organizationId: string, limit: number) {
    const take = Math.min(200, Math.max(10, limit));
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { email: true, fullName: true } } },
    });
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      resource: l.resource,
      metadata: l.metadata ?? null,
      createdAt: l.createdAt.toISOString(),
      actorUserId: l.userId ?? null,
      actorName: (l.user as { fullName?: string } | null)?.fullName ?? null,
      actorEmail: (l.user as { email?: string } | null)?.email ?? null,
    }));
  }

  // ── Webhook Secret ────────────────────────────────────────────────────────

  private maskSecret(s: string): string {
    if (s.length <= 10) return '••••••••';
    return `${s.slice(0, 8)}…${s.slice(-4)}`;
  }

  async getWebhookSecret(organizationId: string) {
    const settings = await this.readSettingsRaw(organizationId);
    const obj = (settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings : {}) as Record<string, unknown>;
    const secret = typeof obj.webhookSecret === 'string' ? obj.webhookSecret.trim() : '';
    return {
      configured: Boolean(secret),
      secretPreview: secret ? this.maskSecret(secret) : null,
      organizationId,
      endpoint: '/api/v1/webhooks/enterprise',
      headers: {
        'X-EIP-Organization-Id': organizationId,
        'X-EIP-Webhook-Secret': '(your secret)',
      },
    };
  }

  async rotateWebhookSecret(organizationId: string, userId: string) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const secret = `eipwh_${hex}`;
    const existing = await this.readSettingsRaw(organizationId);
    const next = mergeOrganizationSettings(existing, {
      webhookSecret: secret,
      webhookSecretRotatedAt: new Date().toISOString(),
    });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as Prisma.InputJsonValue, updatedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'webhook.secret.rotate', resource: 'organization' },
    });
    return {
      configured: true,
      secret,
      secretPreview: this.maskSecret(secret),
      organizationId,
      endpoint: '/api/v1/webhooks/enterprise',
      message: 'Webhook secret rotated. Copy it now — full value is shown only once.',
    };
  }

  // ── Notify Delivery Policy ─────────────────────────────────────────────────

  private normalizePolicy(raw: unknown) {
    const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw : {}) as Record<string, unknown>;
    const cadence =
      obj.digestCadence === 'daily' || obj.digestCadence === 'weekly' || obj.digestCadence === 'off'
        ? obj.digestCadence : 'off';
    return {
      emailDigest: obj.emailDigest === true,
      emailAlerts: obj.emailAlerts === true,
      pushEnabled: obj.pushEnabled === true,
      digestCadence: cadence as 'daily' | 'weekly' | 'off',
    };
  }

  async getNotifyPolicy(organizationId: string) {
    const settings = await this.readSettingsRaw(organizationId);
    const obj = (settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings : {}) as Record<string, unknown>;
    return this.normalizePolicy(obj.notifyDelivery);
  }

  async saveNotifyPolicy(organizationId: string, userId: string, body: unknown) {
    const policy = this.normalizePolicy(body);
    const existing = await this.readSettingsRaw(organizationId);
    const next = mergeOrganizationSettings(existing, { notifyDelivery: policy });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as Prisma.InputJsonValue, updatedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'notify.policy_updated', resource: 'notify_delivery',
        metadata: policy as Prisma.InputJsonValue },
    });
    return policy;
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  private async readApiKeys(organizationId: string): Promise<Array<{
    id: string; name: string; keyHash: string; keyPreview: string;
    createdAt: string; createdBy: string; lastUsedAt: string | null; expiresAt: string | null;
  }>> {
    const settings = await this.readSettingsRaw(organizationId);
    const obj = (settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings : {}) as Record<string, unknown>;
    const raw = obj.apiKeys;
    if (!Array.isArray(raw)) return [];
    return (raw as Array<unknown>).filter(
      (x): x is { id: string; name: string; keyHash: string; keyPreview: string;
        createdAt: string; createdBy: string; lastUsedAt: string | null; expiresAt: string | null } =>
        typeof (x as { id?: unknown }).id === 'string',
    );
  }

  private async writeApiKeys(organizationId: string, keys: unknown[]) {
    const existing = await this.readSettingsRaw(organizationId);
    const next = mergeOrganizationSettings(existing, { apiKeys: keys.slice(0, 20) });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as Prisma.InputJsonValue, updatedAt: new Date() },
    });
  }

  async listApiKeys(organizationId: string) {
    const keys = await this.readApiKeys(organizationId);
    return keys.map(({ keyHash: _h, ...rest }) => rest);
  }

  async createApiKey(organizationId: string, userId: string, userEmail: string, name: string, expiresInDays?: number) {
    if (!name || name.trim().length < 2) throw new BadRequestException('name must be at least 2 characters');
    const rawKey = `eip_${this.randomHex(28)}`;
    const keyHash = await this.sha256(rawKey);
    const keyPreview = `eip_…${rawKey.slice(-6)}`;
    const now = new Date().toISOString();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null;
    const newKey = { id: crypto.randomUUID(), name: name.trim(), keyHash, keyPreview,
      createdAt: now, createdBy: userEmail, lastUsedAt: null, expiresAt };
    const keys = await this.readApiKeys(organizationId);
    await this.writeApiKeys(organizationId, [newKey, ...keys]);
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'org.api_key_created', resource: 'api_key',
        metadata: { name: newKey.name, keyPreview } as Prisma.InputJsonValue },
    });
    const { keyHash: _h, ...safeKey } = newKey;
    return { ...safeKey, key: rawKey };
  }

  async revokeApiKey(organizationId: string, userId: string, id: string) {
    const keys = await this.readApiKeys(organizationId);
    const found = keys.find((k) => k.id === id);
    if (!found) throw new NotFoundException('API key not found');
    await this.writeApiKeys(organizationId, keys.filter((k) => k.id !== id));
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'org.api_key_revoked', resource: 'api_key',
        metadata: { name: found.name, keyPreview: found.keyPreview } as Prisma.InputJsonValue },
    });
    return { ok: true };
  }

  private randomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async sha256(input: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
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
