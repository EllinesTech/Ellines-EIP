import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mock factory ────────────────────────────────────────────────────────────
function makePrisma(overrides: Record<string, any> = {}) {
  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org', slug: 'test-org', settings: null, createdAt: new Date(), updatedAt: new Date() }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'u2', email: 'new@test.com', fullName: 'New User', role: 'member' }),
      update: jest.fn().mockResolvedValue({ id: 'u1', email: 'user@test.com', fullName: 'User', role: 'admin', isActive: true, createdAt: new Date() }),
      count: jest.fn().mockResolvedValue(2),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    branch: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'b1', organizationId: 'org-1', name: 'HQ', code: 'HQ' }),
    },
    department: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'd1', organizationId: 'org-1', name: 'IT' }),
    },
    connectorInstallation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    enterpriseSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    enterpriseEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as PrismaService;
}

// ─── getOrganization ──────────────────────────────────────────────────────────
describe('OrgsService.getOrganization', () => {
  it('returns org when found', async () => {
    const svc = new OrgsService(makePrisma());
    const result = await svc.getOrganization('org-1');
    expect(result).toBeDefined();
    expect(result?.id).toBe('org-1');
  });

  it('throws NotFoundException when org not found', async () => {
    const prisma = makePrisma({ organization: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } });
    const svc = new OrgsService(prisma);
    await expect(svc.getOrganization('org-missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── listUsers ────────────────────────────────────────────────────────────────
describe('OrgsService.listUsers', () => {
  it('returns empty array when no users', async () => {
    const svc = new OrgsService(makePrisma());
    const result = await svc.listUsers('org-1');
    expect(result).toEqual([]);
  });

  it('maps users to safe DTOs', async () => {
    const user = { id: 'u1', email: 'a@b.com', fullName: 'Alice', role: 'owner', isActive: true, createdAt: new Date() };
    const prisma = makePrisma({ user: { ...makePrisma().user, findMany: jest.fn().mockResolvedValue([user]) } });
    const svc = new OrgsService(prisma);
    const result = await svc.listUsers('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('a@b.com');
    expect(result[0]).not.toHaveProperty('passwordHash');
  });
});

// ─── inviteUser ───────────────────────────────────────────────────────────────
describe('OrgsService.inviteUser', () => {
  it('throws ForbiddenException for non-admin actor', async () => {
    const svc = new OrgsService(makePrisma());
    await expect(
      svc.inviteUser('org-1', 'member', { email: 'new@test.com', fullName: 'New', role: 'member' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when email already registered', async () => {
    const prisma = makePrisma({
      user: { ...makePrisma().user, findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
    });
    const svc = new OrgsService(prisma);
    await expect(
      svc.inviteUser('org-1', 'owner', { email: 'existing@test.com', fullName: 'Existing', role: 'member' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates user and logs audit for valid invite', async () => {
    const prisma = makePrisma();
    const svc = new OrgsService(prisma);
    const result = await svc.inviteUser('org-1', 'owner', {
      email: 'new@test.com', fullName: 'New User', role: 'member',
    } as any);
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(result.user.email).toBe('new@test.com');
    expect(result).toHaveProperty('temporaryPassword');
  });
});

// ─── updateUser ──────────────────────────────────────────────────────────────
describe('OrgsService.updateUser', () => {
  it('throws ForbiddenException for non-admin actor', async () => {
    const svc = new OrgsService(makePrisma());
    await expect(
      svc.updateUser('org-1', { id: 'actor', role: 'member' }, 'u1', { role: 'admin' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequestException when no fields to update', async () => {
    const svc = new OrgsService(makePrisma());
    await expect(
      svc.updateUser('org-1', { id: 'actor', role: 'owner' }, 'u1', {} as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException for unknown user', async () => {
    const svc = new OrgsService(makePrisma());
    await expect(
      svc.updateUser('org-1', { id: 'actor', role: 'owner' }, 'u-missing', { isActive: false } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates user role and logs audit', async () => {
    const target = { id: 'u1', email: 'user@test.com', role: 'member', isActive: true, organizationId: 'org-1' };
    const prisma = makePrisma({
      user: { ...makePrisma().user, findFirst: jest.fn().mockResolvedValue(target) },
    });
    const svc = new OrgsService(prisma);
    await svc.updateUser('org-1', { id: 'actor', role: 'owner' }, 'u1', { role: 'admin' } as any);
    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

// ─── listBranches / createBranch ─────────────────────────────────────────────
describe('OrgsService branches', () => {
  it('listBranches returns empty array', async () => {
    const svc = new OrgsService(makePrisma());
    const result = await svc.listBranches('org-1');
    expect(result).toEqual([]);
  });

  it('createBranch creates and logs audit', async () => {
    const prisma = makePrisma();
    const svc = new OrgsService(prisma);
    const result = await svc.createBranch('org-1', { name: 'HQ', code: 'HQ' } as any);
    expect(prisma.branch.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(result.name).toBe('HQ');
  });
});

// ─── listDepartments / createDepartment ──────────────────────────────────────
describe('OrgsService departments', () => {
  it('listDepartments returns empty array', async () => {
    const svc = new OrgsService(makePrisma());
    expect(await svc.listDepartments('org-1')).toEqual([]);
  });

  it('createDepartment creates and logs audit', async () => {
    const prisma = makePrisma();
    const svc = new OrgsService(prisma);
    await svc.createDepartment('org-1', { name: 'Engineering', branchId: 'b1' } as any);
    expect(prisma.department.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

// ─── getOrgStatus ─────────────────────────────────────────────────────────────
describe('OrgsService.getOrgStatus', () => {
  it('returns zeroed status when nothing connected', async () => {
    const svc = new OrgsService(makePrisma());
    const status = await svc.getOrgStatus('org-1');
    expect(status.connectorCount).toBe(0);
    expect(status.memberCount).toBe(0);
    expect(status.hasSync).toBe(false);
    expect(status.healthScore).toBeNull();
  });

  it('counts active connectors correctly', async () => {
    const installs = [
      { id: 'i1', status: 'active', lastSyncedAt: new Date() },
      { id: 'i2', status: 'synced', lastSyncedAt: new Date() },
      { id: 'i3', status: 'error', lastSyncedAt: null },
    ];
    const prisma = makePrisma({
      connectorInstallation: { findMany: jest.fn().mockResolvedValue(installs) },
      user: { ...makePrisma().user, findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]) },
    });
    const svc = new OrgsService(prisma);
    const status = await svc.getOrgStatus('org-1');
    expect(status.connectorCount).toBe(3);
    expect(status.activeConnectorCount).toBe(2);
    expect(status.memberCount).toBe(2);
    expect(status.hasSync).toBe(true);
  });
});

// ─── getAlertCorrelations ─────────────────────────────────────────────────────
describe('OrgsService.getAlertCorrelations', () => {
  it('returns empty correlations when no events', async () => {
    const svc = new OrgsService(makePrisma());
    const result = await svc.getAlertCorrelations('org-1');
    expect(result.totalEvents).toBe(0);
    expect(result.correlationGroups).toHaveLength(0);
    expect(result.windowHours).toBe(24);
  });

  it('correlates repeated event types into groups', async () => {
    const events = [
      { id: 'e1', type: 'connector.error', payload: {}, at: new Date() },
      { id: 'e2', type: 'connector.error', payload: {}, at: new Date() },
      { id: 'e3', type: 'connector.error', payload: {}, at: new Date() },
      { id: 'e4', type: 'approval.created', payload: {}, at: new Date() },
    ];
    const prisma = makePrisma({
      enterpriseEvent: { findMany: jest.fn().mockResolvedValue(events) },
    });
    const svc = new OrgsService(prisma);
    const result = await svc.getAlertCorrelations('org-1');
    expect(result.totalEvents).toBe(4);
    expect(result.correlationGroups.length).toBeGreaterThan(0);
    const errGroup = result.correlationGroups.find((g: any) => g.category === 'connector_error');
    expect(errGroup?.count).toBe(3);
  });
});

// ─── listAuditLogs ─────────────────────────────────────────────────────────────
describe('OrgsService.listAuditLogs', () => {
  it('returns empty array when no logs', async () => {
    const svc = new OrgsService(makePrisma());
    const logs = await svc.listAuditLogs('org-1', 50);
    expect(logs).toEqual([]);
  });
});
