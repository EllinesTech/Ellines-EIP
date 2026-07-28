import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { InviteUserDto } from './dto/invite-user.dto';

@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get('me')
  getMyOrg(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getOrganization(req.user.organizationId);
  }

  @Get('me/users')
  listUsers(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listUsers(req.user.organizationId);
  }

  @Post('me/users')
  inviteUser(
    @Request() req: { user: { organizationId: string; role: string } },
    @Body() dto: InviteUserDto,
  ) {
    return this.orgs.inviteUser(req.user.organizationId, req.user.role, dto);
  }

  @Get('me/branches')
  listBranches(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listBranches(req.user.organizationId);
  }

  @Post('me/branches')
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
  createDepartment(
    @Request() req: { user: { organizationId: string } },
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.orgs.createDepartment(req.user.organizationId, dto);
  }
}
