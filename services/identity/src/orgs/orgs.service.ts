import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { InviteUserDto } from './dto/invite-user.dto';
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

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ForbiddenException('Email already registered');
    }

    const tempPassword = dto.temporaryPassword || `Temp-${Math.random().toString(36).slice(2, 10)}!`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        passwordHash,
        organizationId,
        role: dto.role || 'member',
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
