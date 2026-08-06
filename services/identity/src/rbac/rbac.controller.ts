import {
  Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacService } from './rbac.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/create-role.dto';

interface AuthRequest {
  user: { userId: string; organizationId: string; role: string };
}

function requireOwner(req: AuthRequest) {
  if (req.user.role !== 'owner') {
    throw Object.assign(new Error('Only Owner can manage custom roles'), { status: 403 });
  }
}

@Controller('orgs/me/custom-roles')
@UseGuards(JwtAuthGuard)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  /** GET /api/v1/orgs/me/custom-roles */
  @Get()
  list(@Req() req: AuthRequest) {
    const { organizationId, role } = req.user;
    if (role !== 'owner' && role !== 'admin') {
      return { statusCode: 403, message: 'Forbidden' };
    }
    return this.rbac.listRoles(organizationId);
  }

  /** GET /api/v1/orgs/me/custom-roles/:id */
  @Get(':id')
  getOne(@Req() req: AuthRequest, @Param('id') id: string) {
    const { organizationId, role } = req.user;
    if (role !== 'owner' && role !== 'admin') {
      return { statusCode: 403, message: 'Forbidden' };
    }
    return this.rbac.getRole(organizationId, id);
  }

  /** POST /api/v1/orgs/me/custom-roles */
  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateRoleDto) {
    requireOwner(req);
    return this.rbac.createRole(req.user.organizationId, req.user.userId, dto);
  }

  /** PATCH /api/v1/orgs/me/custom-roles/:id */
  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    requireOwner(req);
    return this.rbac.updateRole(req.user.organizationId, req.user.userId, id, dto);
  }

  /** DELETE /api/v1/orgs/me/custom-roles/:id */
  @Delete(':id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    requireOwner(req);
    return this.rbac.deleteRole(req.user.organizationId, req.user.userId, id);
  }

  /** POST /api/v1/orgs/me/custom-roles/assign */
  @Post('assign')
  assign(
    @Req() req: AuthRequest,
    @Body() body: { userId: string; customRoleId: string | null },
  ) {
    requireOwner(req);
    return this.rbac.assignRole(
      req.user.organizationId,
      req.user.userId,
      body.userId,
      body.customRoleId,
    );
  }

  /** POST /api/v1/orgs/me/custom-roles/check-permission */
  @Post('check-permission')
  checkPermission(
    @Req() req: AuthRequest,
    @Body() body: { permission: string; resourceId?: string; targetUserId?: string },
  ) {
    const userId = body.targetUserId ?? req.user.userId;
    return this.rbac.checkPermission(
      userId,
      req.user.organizationId,
      body.permission,
      body.resourceId,
    );
  }
}
