import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from './permission.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  // ── List custom roles ────────────────────────────────────────────────────
  async listRoles(organizationId: string) {
    return this.prisma.customRole.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        baseRole: true,
        permissions: true,
        isSystem: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Get single role ──────────────────────────────────────────────────────
  async getRole(organizationId: string, roleId: string) {
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, organizationId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw new NotFoundException('Custom role not found');
    return role;
  }

  // ── Create role ──────────────────────────────────────────────────────────
  async createRole(organizationId: string, actorId: string, dto: CreateRoleDto) {
    // Ensure name is unique within org
    const existing = await this.prisma.customRole.findFirst({
      where: { organizationId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`A role named '${dto.name}' already exists`);
    }

    const role = await this.prisma.customRole.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? '',
        color: dto.color ?? '#6F2D8D',
        baseRole: dto.baseRole ?? null,
        permissions: (dto.permissions ?? []) as object[],
        isSystem: false,
        isActive: true,
        createdBy: actorId,
      },
    });

    await this.audit(organizationId, actorId, 'role.created', role.id, { name: role.name });
    return role;
  }

  // ── Update role ──────────────────────────────────────────────────────────
  async updateRole(
    organizationId: string,
    actorId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ) {
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, organizationId },
    });
    if (!role) throw new NotFoundException('Custom role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be modified');

    if (dto.name && dto.name !== role.name) {
      const clash = await this.prisma.customRole.findFirst({
        where: { organizationId, name: dto.name, id: { not: roleId } },
      });
      if (clash) throw new ConflictException(`A role named '${dto.name}' already exists`);
    }

    const prev = { name: role.name, permissions: role.permissions };

    const updated = await this.prisma.customRole.update({
      where: { id: roleId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.baseRole !== undefined && { baseRole: dto.baseRole }),
        ...(dto.permissions !== undefined && { permissions: dto.permissions as object[] }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit(organizationId, actorId, 'role.updated', roleId, {
      prev,
      next: { name: updated.name, permissions: updated.permissions },
    });
    return updated;
  }

  // ── Delete role ──────────────────────────────────────────────────────────
  async deleteRole(organizationId: string, actorId: string, roleId: string) {
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, organizationId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw new NotFoundException('Custom role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
    if (role._count.memberships > 0) {
      throw new BadRequestException(
        `Cannot delete role '${role.name}' — ${role._count.memberships} member(s) assigned. Reassign them first.`,
      );
    }

    await this.prisma.customRole.delete({ where: { id: roleId } });
    await this.audit(organizationId, actorId, 'role.deleted', null, { deletedId: roleId, name: role.name });
    return { message: 'Role deleted' };
  }

  // ── Assign custom role to user ───────────────────────────────────────────
  async assignRole(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    customRoleId: string | null,
  ) {
    // Verify role belongs to org
    if (customRoleId) {
      const role = await this.prisma.customRole.findFirst({
        where: { id: customRoleId, organizationId, isActive: true },
      });
      if (!role) throw new NotFoundException('Custom role not found or inactive');
    }

    // Upsert membership row with customRoleId
    const membership = await this.prisma.organizationMembership.upsert({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
      create: {
        userId: targetUserId,
        organizationId,
        role: 'member',
        customRoleId,
        isActive: true,
      },
      update: { customRoleId },
    });

    await this.audit(organizationId, actorId, 'role.assigned', customRoleId, {
      targetUserId,
      customRoleId,
    });
    return membership;
  }

  // ── Evaluate permission for a user ──────────────────────────────────────
  async checkPermission(
    userId: string,
    organizationId: string,
    permission: string,
    resourceId?: string,
  ) {
    const allowed = await this.permissions.can({
      userId,
      organizationId,
      permission,
      resourceId,
    });
    return { allowed, permission, resourceId };
  }

  // ── Internal audit helper ────────────────────────────────────────────────
  private async audit(
    organizationId: string,
    userId: string,
    action: string,
    roleId: string | null,
    details?: unknown,
  ) {
    await this.prisma.roleAuditLog.create({
      data: { organizationId, userId, roleId, action, details: details as object },
    });
  }
}
