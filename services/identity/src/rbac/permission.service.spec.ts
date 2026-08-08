import { ForbiddenException } from '@nestjs/common';
import { PermissionService, PermissionEntry, EvaluationContext } from './permission.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionService.evaluate (pure, no DB)', () => {
  const svc = new PermissionService({} as PrismaService);

  const ctx = (permission: string, resourceId?: string, attributes?: Record<string, string>): EvaluationContext => ({
    userId: 'u1',
    organizationId: 'o1',
    permission,
    resourceId,
    attributes,
  });

  it('wildcard * grants everything', () => {
    expect(svc.evaluate([{ permission: '*' }], ctx('connector:install'))).toBe(true);
  });

  it('exact match grants permission', () => {
    expect(svc.evaluate([{ permission: 'org:view' }], ctx('org:view'))).toBe(true);
  });

  it('non-matching entry denies', () => {
    expect(svc.evaluate([{ permission: 'org:view' }], ctx('connector:install'))).toBe(false);
  });

  it('prefix wildcard connector:* grants connector:install', () => {
    expect(svc.evaluate([{ permission: 'connector:*' }], ctx('connector:install'))).toBe(true);
    expect(svc.evaluate([{ permission: 'connector:*' }], ctx('connector:read'))).toBe(true);
  });

  it('prefix wildcard does not grant unrelated namespace', () => {
    expect(svc.evaluate([{ permission: 'connector:*' }], ctx('org:view'))).toBe(false);
  });

  it('resource scope allows specific resource', () => {
    const entries: PermissionEntry[] = [{ permission: 'connector:read', resources: ['c1', 'c2'] }];
    expect(svc.evaluate(entries, ctx('connector:read', 'c1'))).toBe(true);
  });

  it('resource scope denies excluded resource', () => {
    const entries: PermissionEntry[] = [{ permission: 'connector:read', resources: ['c1'] }];
    expect(svc.evaluate(entries, ctx('connector:read', 'c99'))).toBe(false);
  });

  it('resource scope allows when no resourceId in context', () => {
    const entries: PermissionEntry[] = [{ permission: 'connector:read', resources: ['c1'] }];
    expect(svc.evaluate(entries, ctx('connector:read'))).toBe(true);
  });

  it('ABAC attribute match grants permission', () => {
    const entries: PermissionEntry[] = [
      { permission: 'report:view', attributes: { department: 'IT' } },
    ];
    expect(svc.evaluate(entries, ctx('report:view', undefined, { department: 'IT' }))).toBe(true);
  });

  it('ABAC attribute mismatch denies permission', () => {
    const entries: PermissionEntry[] = [
      { permission: 'report:view', attributes: { department: 'IT' } },
    ];
    expect(svc.evaluate(entries, ctx('report:view', undefined, { department: 'HR' }))).toBe(false);
  });

  it('empty entries always denies', () => {
    expect(svc.evaluate([], ctx('org:view'))).toBe(false);
  });
});

describe('PermissionService.fixedRolePermissions', () => {
  const svc = new PermissionService({} as PrismaService);

  it('owner gets wildcard', () => {
    const perms = svc.fixedRolePermissions('owner');
    expect(perms).toEqual([{ permission: '*' }]);
  });

  it('viewer cannot manage org members', () => {
    const perms = svc.fixedRolePermissions('viewer');
    const svc2 = new PermissionService({} as PrismaService);
    const allowed = svc2.evaluate(perms, {
      userId: 'u', organizationId: 'o', permission: 'org:manage_members',
    });
    expect(allowed).toBe(false);
  });

  it('admin can manage members', () => {
    const perms = svc.fixedRolePermissions('admin');
    const allowed = svc.evaluate(perms, {
      userId: 'u', organizationId: 'o', permission: 'org:manage_members',
    });
    expect(allowed).toBe(true);
  });

  it('member can request approval but not decide', () => {
    const perms = svc.fixedRolePermissions('member');
    expect(svc.evaluate(perms, { userId: 'u', organizationId: 'o', permission: 'approval:request' })).toBe(true);
    expect(svc.evaluate(perms, { userId: 'u', organizationId: 'o', permission: 'approval:decide' })).toBe(false);
  });

  it('unknown role returns empty permissions', () => {
    expect(svc.fixedRolePermissions('unknown-role')).toEqual([]);
  });
});

describe('PermissionService.assertPermission', () => {
  const mockPrisma = {
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    user: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const svc = new PermissionService(mockPrisma);

  beforeEach(() => jest.clearAllMocks());

  it('resolves without throwing when allowed', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'u1', role: 'owner', organizationId: 'o1' });
    await expect(svc.assertPermission({ userId: 'u1', organizationId: 'o1', permission: 'anything' })).resolves.toBeUndefined();
  });

  it('throws ForbiddenException when denied', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'u1', role: 'viewer', organizationId: 'o1' });
    await expect(
      svc.assertPermission({ userId: 'u1', organizationId: 'o1', permission: 'org:manage_members' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
