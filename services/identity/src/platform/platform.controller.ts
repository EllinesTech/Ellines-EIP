import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
  type OrgDateTimeSettings,
} from '@ellines-eip/shared';
import type { ConnectorInstallConfig } from '@ellines-eip/connectors-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformService } from './platform.service';
import { EnterpriseService } from '../enterprise/enterprise.service';
import { OrgsService } from '../orgs/orgs.service';

@Controller('platform')
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly enterprise: EnterpriseService,
    private readonly orgs: OrgsService,
    private readonly config: ConfigService,
  ) {}

  private assertPlatformAdmin(email: string) {
    const allowlist = parsePlatformAdminEmails(
      this.config.get<string>('PLATFORM_ADMIN_EMAILS'),
    );
    if (!isPlatformAdminEmail(email, allowlist)) {
      throw new ForbiddenException('Platform admin only');
    }
  }

  @Get('orgs')
  listOrgs(@Request() req: { user: { email: string } }) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrganizations();
  }

  @Patch('orgs/:id')
  updateOrgStatus(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    const status =
      body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : null;
    if (!status) {
      throw new BadRequestException('status must be active or suspended');
    }
    return this.platform.updateOrganizationStatus(
      id,
      status,
      req.user.userId,
      req.user.email,
    );
  }

  @Get('orgs/:id/settings')
  getOrgSettings(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.orgs.getSettings(id);
  }

  @Patch('orgs/:id/settings')
  updateOrgSettings(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
    @Body() body: Partial<OrgDateTimeSettings>,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.orgs.updateSettings(id, body);
  }

  @Get('flags')
  listFlags(@Request() req: { user: { email: string } }) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listFeatureFlags();
  }

  @Get('connector-packs')
  listPacks(@Request() req: { user: { email: string } }) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.listPacks(false);
  }

  @Post('connector-packs')
  createPack(
    @Request() req: { user: { email: string; organizationId: string } },
    @Body()
    body: {
      slug: string;
      name: string;
      description?: string;
      catalogId: string;
      templateConfig?: ConnectorInstallConfig;
      fromInstallationId?: string;
      published?: boolean;
    },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.createPack(req.user.email, {
      ...body,
      organizationId: req.user.organizationId,
    });
  }

  // ── God-mode org creation ─────────────────────────────────────────────────

  @Post('orgs/create')
  createOrg(
    @Request() req: { user: { email: string; userId: string } },
    @Body()
    body: {
      name?: string;
      slug?: string;
      ownerEmail?: string;
      ownerFullName?: string;
      ownerPassword?: string;
    },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!body.name?.trim()) throw new BadRequestException('Organization name is required');
    return this.platform.createOrganization({
      name: body.name.trim(),
      slug: body.slug,
      ownerEmail: body.ownerEmail,
      ownerFullName: body.ownerFullName,
      ownerPassword: body.ownerPassword,
      actorUserId: req.user.userId,
      actorEmail: req.user.email,
    });
  }

  // ── God-mode user management ──────────────────────────────────────────────

  @Get('orgs/:id/users')
  listOrgUsers(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrgUsers(id);
  }

  @Post('orgs/:id/users')
  createOrgUser(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { email?: string; fullName?: string; password?: string; role?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!body.email || !body.fullName || !body.password) {
      throw new BadRequestException('email, fullName, and password are required');
    }
    return this.platform.createOrgUser(id, {
      email: body.email,
      fullName: body.fullName,
      password: body.password,
      role: body.role,
      actorUserId: req.user.userId,
      actorEmail: req.user.email,
    });
  }

  @Patch('orgs/:id/users/:userId')
  updateOrgUser(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { fullName?: string; role?: string; isActive?: boolean; password?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.updateOrgUser(id, userId, {
      ...body,
      actorUserId: req.user.userId,
      actorEmail: req.user.email,
    });
  }

  @Delete('orgs/:id/users/:userId')
  deactivateOrgUser(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.deactivateOrgUser(id, userId, req.user.userId, req.user.email);
  }

  // ── Cross-org audit log viewer ────────────────────────────────────────────

  @Get('audit-logs')
  listAuditLogs(
    @Request() req: { user: { email: string } },
    @Query('orgId') orgId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    const limit = Math.min(Math.max(1, parseInt(limitStr || '50', 10) || 50), 200);
    const offset = Math.max(0, parseInt(offsetStr || '0', 10) || 0);
    return this.platform.listAuditLogs({ orgId, action, from, to, limit, offset });
  }
}
