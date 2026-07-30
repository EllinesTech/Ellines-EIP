import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { UserRole } from '@ellines-eip/shared';
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
    this.assertCanAssignRole(actorRole, nextRole);

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

    if (dto.role !== undefined) {
      this.assertCanAssignRole(actor.role, dto.role as UserRole);
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

  private assertCanAssignRole(actorRole: string, nextRole: UserRole) {
    if (nextRole === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Only owners can assign the owner role');
    }
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
}
