import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionService } from './permission.service';
import { PrismaService } from '../prisma/prisma.service';

const mockRole = {
  id: 'r1', organizationId: 'org-1', name: 'IT Admin', description: '',
  color: '#6F2D8D', baseRole: 'admin', permissions: [], isSystem: false, isActive: true,
  createdAt: new Date(), updatedAt: new Date(), _count: { memberships: 0 },
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    customRole: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockRole),
      update: jest.fn().mockResolvedValue({ ...mockRole, name: 'Updated' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    organizationMembership: {
      upsert: jest.fn().mockResolvedValue({ id: 'm1', userId: 'u1', organizationId: 'org-1' }),
    },
    roleAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function makePermissions() {
  return { can: jest.fn().mockResolvedValue(true) } as unknown as PermissionService;
}

// ─── listRoles ────────────────────────────────────────────────────────────────
describe('RbacService.listRoles', () => {
  it('returns empty array when no roles', async () => {
    const svc = new RbacService(makePrisma(), makePermissions());
    expect(await svc.listRoles('org-1')).toEqual([]);
  });
});

// ─── getRole ─────────────────────────────────────────────────────────────────
describe('RbacService.getRole', () => {
  it('throws NotFoundException when role missing', async () => {
    const svc = new RbacService(makePrisma(), makePermissions());
    await expect(svc.getRole('org-1', 'r-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns role when found', async () => {
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(mockRole) } });
    const svc = new RbacService(prisma, makePermissions());
    const result = await svc.getRole('org-1', 'r1');
    expect(result.id).toBe('r1');
  });
});

// ─── createRole ──────────────────────────────────────────────────────────────
describe('RbacService.createRole', () => {
  it('creates role with given properties', async () => {
    const prisma = makePrisma();
    const svc = new RbacService(prisma, makePermissions());
    await svc.createRole('org-1', 'actor-1', { name: 'IT Admin', description: 'IT team', permissions: [] } as any);
    expect(prisma.customRole.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'IT Admin', isSystem: false }) }),
    );
    expect(prisma.roleAuditLog.create).toHaveBeenCalled();
  });

  it('throws ConflictException when name already exists', async () => {
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(mockRole) } });
    const svc = new RbacService(prisma, makePermissions());
    await expect(svc.createRole('org-1', 'actor-1', { name: 'IT Admin' } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('defaults color to brand purple', async () => {
    const prisma = makePrisma();
    const svc = new RbacService(prisma, makePermissions());
    await svc.createRole('org-1', 'actor-1', { name: 'New Role' } as any);
    const call = (prisma.customRole.create as jest.Mock).mock.calls[0][0];
    expect(call.data.color).toBe('#6F2D8D');
  });
});

// ─── updateRole ──────────────────────────────────────────────────────────────
describe('RbacService.updateRole', () => {
  it('throws NotFoundException for missing role', async () => {
    const svc = new RbacService(makePrisma(), makePermissions());
    await expect(svc.updateRole('org-1', 'actor-1', 'r-missing', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException for system role', async () => {
    const sysRole = { ...mockRole, isSystem: true };
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(sysRole) } });
    const svc = new RbacService(prisma, makePermissions());
    await expect(svc.updateRole('org-1', 'actor-1', 'r1', { name: 'Hacked' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates role and logs audit', async () => {
    // findFirst: first call returns role (for existence check), second returns null (no name clash)
    const findFirst = jest.fn()
      .mockResolvedValueOnce(mockRole)
      .mockResolvedValueOnce(null);
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst } });
    const svc = new RbacService(prisma, makePermissions());
    await svc.updateRole('org-1', 'actor-1', 'r1', { name: 'IT Admin v2' });
    expect(prisma.customRole.update).toHaveBeenCalled();
    expect(prisma.roleAuditLog.create).toHaveBeenCalled();
  });

  it('throws ConflictException on duplicate rename', async () => {
    const other = { ...mockRole, id: 'r2', name: 'Existing Name' };
    const prisma = makePrisma({
      customRole: {
        ...makePrisma().customRole,
        findFirst: jest.fn()
          .mockResolvedValueOnce(mockRole)   // getRole call
          .mockResolvedValueOnce(other),     // clash check
      },
    });
    const svc = new RbacService(prisma, makePermissions());
    await expect(svc.updateRole('org-1', 'actor-1', 'r1', { name: 'Existing Name' })).rejects.toBeInstanceOf(ConflictException);
  });
});

// ─── deleteRole ──────────────────────────────────────────────────────────────
describe('RbacService.deleteRole', () => {
  it('throws NotFoundException for missing role', async () => {
    const svc = new RbacService(makePrisma(), makePermissions());
    await expect(svc.deleteRole('org-1', 'actor-1', 'r-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException for system role', async () => {
    const sysRole = { ...mockRole, isSystem: true, _count: { memberships: 0 } };
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(sysRole) } });
    const svc = new RbacService(prisma, makePermissions());
    await expect(svc.deleteRole('org-1', 'actor-1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequestException when role has members', async () => {
    const roleWithMembers = { ...mockRole, _count: { memberships: 3 } };
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(roleWithMembers) } });
    const svc = new RbacService(prisma, makePermissions());
    await expect(svc.deleteRole('org-1', 'actor-1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes role and logs audit', async () => {
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(mockRole) } });
    const svc = new RbacService(prisma, makePermissions());
    await svc.deleteRole('org-1', 'actor-1', 'r1');
    expect(prisma.customRole.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(prisma.roleAuditLog.create).toHaveBeenCalled();
  });
});

// ─── assignRole ──────────────────────────────────────────────────────────────
describe('RbacService.assignRole', () => {
  it('upserts membership with given role', async () => {
    const prisma = makePrisma({ customRole: { ...makePrisma().customRole, findFirst: jest.fn().mockResolvedValue(mockRole) } });
    const svc = new RbacService(prisma, makePermissions());
    await svc.assignRole('org-1', 'actor-1', 'u1', 'r1');
    expect(prisma.organizationMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId_organizationId: { userId: 'u1', organizationId: 'org-1' } }) }),
    );
  });

  it('throws NotFoundException when customRoleId does not exist', async () => {
    const svc = new RbacService(makePrisma(), makePermissions());
    await expect(svc.assignRole('org-1', 'actor-1', 'u1', 'r-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears role when customRoleId is null', async () => {
    const prisma = makePrisma();
    const svc = new RbacService(prisma, makePermissions());
    await svc.assignRole('org-1', 'actor-1', 'u1', null);
    expect(prisma.organizationMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { customRoleId: null } }),
    );
  });
});

// ─── checkPermission ─────────────────────────────────────────────────────────
describe('RbacService.checkPermission', () => {
  it('returns allowed=true when PermissionService allows', async () => {
    const svc = new RbacService(makePrisma(), makePermissions());
    const result = await svc.checkPermission('u1', 'org-1', 'connector:install');
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('connector:install');
  });

  it('returns allowed=false when PermissionService denies', async () => {
    const perms = { can: jest.fn().mockResolvedValue(false) } as unknown as PermissionService;
    const svc = new RbacService(makePrisma(), perms);
    const result = await svc.checkPermission('u1', 'org-1', 'org:manage_members');
    expect(result.allowed).toBe(false);
  });
});
