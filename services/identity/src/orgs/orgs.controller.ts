import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ORG_ADMIN_ROLES,
  isOrgAdminRole,
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
  type OrgDateTimeSettings,
} from '@ellines-eip/shared';
import { OrgsService } from './orgs.service';
import { MultiOrgService } from './multi-org.service';
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
  constructor(
    private readonly orgs: OrgsService,
    private readonly multiOrg: MultiOrgService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  getMyOrg(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getOrganization(req.user.organizationId);
  }

  @Get('me/settings')
  getSettings(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getSettings(req.user.organizationId);
  }

  @Get('me/ellinea-memory')
  getEllineaMemory(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getEllineaMemory(req.user.organizationId);
  }

  @Patch('me/settings')
  updateSettings(
    @Request() req: { user: { email: string; organizationId: string; role: string } },
    @Body() body: Partial<OrgDateTimeSettings>,
  ) {
    const allowlist = parsePlatformAdminEmails(
      this.config.get<string>('PLATFORM_ADMIN_EMAILS'),
    );
    const canEdit =
      isOrgAdminRole(req.user.role) || isPlatformAdminEmail(req.user.email, allowlist);
    if (!canEdit) {
      throw new ForbiddenException(
        'Only organization admins or platform operators can change date & time settings',
      );
    }
    return this.orgs.updateSettings(req.user.organizationId, body);
  }

  @Put('me/ellinea-memory')
  putEllineaMemory(
    @Request() req: { user: { organizationId: string } },
    @Body() body: unknown,
  ) {
    const notes = Array.isArray(body) ? body : (body as { notes?: unknown })?.notes;
    return this.orgs.putEllineaMemory(req.user.organizationId, notes);
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

  // ── Multi-org (v1.1) ────────────────────────────────────────────────────

  /** GET /api/v1/orgs/my-orgs — list all orgs this user belongs to */
  @Get('my-orgs')
  listMyOrgs(@Request() req: { user: { userId: string } }) {
    return this.multiOrg.listMyOrgs(req.user.userId);
  }

  /** POST /api/v1/orgs/switch — issue a new token for a different org */
  @Post('switch')
  switchOrg(
    @Request() req: { user: { userId: string } },
    @Body() body: { organizationId: string },
  ) {
    return this.multiOrg.switchOrg(req.user.userId, body.organizationId);
  }

  /** POST /api/v1/orgs/me/create-child — Owner creates a linked child org */
  @Post('me/create-child')
  @Roles('owner')
  createChildOrg(
    @Request() req: { user: { userId: string; organizationId: string; role: string } },
    @Body() body: { name: string },
  ) {
    return this.multiOrg.createChildOrg(
      req.user.userId,
      req.user.role,
      req.user.organizationId,
      body.name,
    );
  }

  /** GET /api/v1/orgs/me/alert-correlations — real-time alert correlation engine */
  @Get('me/alert-correlations')
  @Roles('owner', 'admin')
  getAlertCorrelations(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getAlertCorrelations(req.user.organizationId);
  }

  // ── Audit Logs ────────────────────────────────────────────────────────────

  @Get('me/audit-logs')
  listAuditLogs(
    @Request() req: { user: { organizationId: string } },
    @Query('limit') limit?: string,
  ) {
    return this.orgs.listAuditLogs(req.user.organizationId, Number(limit) || 80);
  }

  // ── Webhook Secret ────────────────────────────────────────────────────────

  @Get('me/webhook-secret')
  @Roles(...ORG_ADMIN_ROLES)
  getWebhookSecret(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getWebhookSecret(req.user.organizationId);
  }

  @Post('me/webhook-secret')
  @Roles(...ORG_ADMIN_ROLES)
  rotateWebhookSecret(@Request() req: { user: { userId: string; organizationId: string } }) {
    return this.orgs.rotateWebhookSecret(req.user.organizationId, req.user.userId);
  }

  // ── Notify Policy ──────────────────────────────────────────────────────────

  @Get('me/notify-policy')
  getNotifyPolicy(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getNotifyPolicy(req.user.organizationId);
  }

  @Put('me/notify-policy')
  @Roles(...ORG_ADMIN_ROLES)
  saveNotifyPolicy(
    @Request() req: { user: { userId: string; organizationId: string } },
    @Body() body: unknown,
  ) {
    return this.orgs.saveNotifyPolicy(req.user.organizationId, req.user.userId, body);
  }

  // ── API Keys ───────────────────────────────────────────────────────────────

  @Get('me/api-keys')
  @Roles(...ORG_ADMIN_ROLES)
  listApiKeys(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listApiKeys(req.user.organizationId);
  }

  @Post('me/api-keys')
  @Roles(...ORG_ADMIN_ROLES)
  createApiKey(
    @Request() req: { user: { userId: string; email: string; organizationId: string } },
    @Body() body: { name?: string; expiresInDays?: number },
  ) {
    return this.orgs.createApiKey(
      req.user.organizationId,
      req.user.userId,
      req.user.email,
      body.name || '',
      body.expiresInDays,
    );
  }

  @Delete('me/api-keys')
  @Roles(...ORG_ADMIN_ROLES)
  revokeApiKey(
    @Request() req: { user: { userId: string; organizationId: string } },
    @Body() body: { id?: string },
  ) {
    return this.orgs.revokeApiKey(req.user.organizationId, req.user.userId, body.id || '');
  }

  // ── Ellinea Learning ───────────────────────────────────────────────────────

  @Get('me/ellinea-learning')
  getEllineaLearning(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getEllineaLearning(req.user.organizationId);
  }

  @Put('me/ellinea-learning')
  @Roles(...ORG_ADMIN_ROLES)
  saveEllineaLearning(
    @Request() req: { user: { organizationId: string } },
    @Body() body: unknown,
  ) {
    return this.orgs.saveEllineaLearning(req.user.organizationId, body);
  }

  // ── Org Status ─────────────────────────────────────────────────────────────

  @Get('me/status')
  getOrgStatus(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.getOrgStatus(req.user.organizationId);
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  @Get('me/documents')
  listDocuments(@Request() req: { user: { organizationId: string } }) {
    return this.orgs.listDocuments(req.user.organizationId);
  }

  @Post('me/documents')
  uploadDocument(
    @Request() req: { user: { organizationId: string; userId: string; email: string } },
    @Body() body: { name?: string; mimeType?: string; content?: string; tags?: string[]; branch?: string; department?: string; summary?: string },
  ) {
    return this.orgs.uploadDocument(req.user.organizationId, req.user.userId, req.user.email, body);
  }

  @Delete('me/documents')
  deleteDocument(
    @Request() req: { user: { organizationId: string; userId: string; email: string; role: string } },
    @Body() body: { id?: string },
  ) {
    return this.orgs.deleteDocument(
      req.user.organizationId,
      req.user.userId,
      req.user.email,
      req.user.role,
      body.id || '',
    );
  }
}
