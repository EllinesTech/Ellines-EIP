import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ORG_ADMIN_ROLES } from '@ellines-eip/shared';
import { OrgsService } from './orgs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('orgs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get('me')
  getMyOrg(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getOrganization(req.user.organizationId);
  }

  @Get('me/users')
  @Roles(...ORG_ADMIN_ROLES)
  listUsers(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listUsers(req.user.organizationId);
  }

  @Post('me/users')
  @Roles(...ORG_ADMIN_ROLES)
  inviteUser(
    @Request() req: { user: { organizationId: string; role: string } },
    @Body() dto: InviteUserDto,
  ) {
    return this.orgs.inviteUser(req.user.organizationId, req.user.role, dto);
  }

  @Patch('me/users/:userId')
  @Roles(...ORG_ADMIN_ROLES)
  updateUser(
    @Request() req: { user: { userId: string; organizationId: string; role: string } },
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.orgs.updateUser(
      req.user.organizationId,
      { id: req.user.userId, role: req.user.role },
      userId,
      dto,
    );
  }

  @Get('me/branches')
  listBranches(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listBranches(req.user.organizationId);
  }

  @Post('me/branches')
  @Roles(...ORG_ADMIN_ROLES)
  createBranch(
    @Request() req: { user: { organizationId: string } },
    @Body() dto: CreateBranchDto,
  ) {
    return this.orgs.createBranch(req.user.organizationId, dto);
  }

  @Get('me/departments')
  listDepartments(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listDepartments(req.user.organizationId);
  }

  @Post('me/departments')
  @Roles(...ORG_ADMIN_ROLES)
  createDepartment(
    @Request() req: { user: { organizationId: string } },
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.orgs.createDepartment(req.user.organizationId, dto);
  }
}
