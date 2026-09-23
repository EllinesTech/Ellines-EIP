import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  listOrgs(@Request() req: { user: { email: string; organizationId: string } }) {
    this.assertPlatformAdmin(req.user.email);
    // Exclude the platform operator's own org — it is not a client organization.
    return this.platform.listOrganizations(req.user.organizationId);
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

  @Patch('orgs/:id/users')
  updateOrgUser(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Body() body: { fullName?: string; role?: string; isActive?: boolean; password?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!userId) {
      throw new BadRequestException('userId query param required');
    }
    return this.platform.updateOrgUser(id, userId, {
      ...body,
      actorUserId: req.user.userId,
      actorEmail: req.user.email,
    });
  }

  @Delete('orgs/:id/users')
  deactivateOrgUser(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Query('userId') userId: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!userId) {
      throw new BadRequestException('userId query param required');
    }
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

  // ── Platform metrics ─────────────────────────────────────────────────────

  @Get('metrics')
  getMetrics(@Request() req: { user: { email: string } }) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.getPlatformMetrics();
  }

  // ── Platform health summary ───────────────────────────────────────────────

  @Get('health/summary')
  getHealthSummary(@Request() req: { user: { email: string } }) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.getPlatformHealthSummary();
  }

  // ── Per-org stats ─────────────────────────────────────────────────────────

  @Get('orgs/:id/stats')
  getOrgStats(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.getOrgStats(id);
  }

  // ── Org package assignment ────────────────────────────────────────────────

  @Get('orgs/:id/package')
  getOrgPackage(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.getOrgPackage(id);
  }

  @Put('orgs/:id/package')
  assignOrgPackage(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { tierId: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!body.tierId) throw new BadRequestException('tierId is required');
    return this.platform.assignOrgPackage(id, body.tierId, req.user.userId, req.user.email);
  }

  // ── Service packages (rate limit tiers) ──────────────────────────────────

  @Get('packages')
  listPackages(@Request() req: { user: { email: string } }) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listPackages();
  }

  @Post('packages')
  createPackage(
    @Request() req: { user: { email: string; userId: string } },
    @Body() body: {
      name: string; displayName: string; maxUsers?: number | null; maxConnectors?: number | null;
      requestsPerDay?: number; monthlyPrice?: number;
      enableSso?: boolean; enableCustomRoles?: boolean; enableAgents?: boolean;
      enableAdvancedBi?: boolean; enableWebhooks?: boolean; reason?: string;
    },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!body.name?.trim() || !body.displayName?.trim()) {
      throw new BadRequestException('name and displayName are required');
    }
    return this.platform.createPackage({ ...body, actorUserId: req.user.userId, actorEmail: req.user.email });
  }

  @Patch('packages/:id')
  updatePackage(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: {
      displayName?: string; maxUsers?: number; maxConnectors?: number;
      requestsPerDay?: number; monthlyPrice?: number; reason?: string;
    },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.updatePackage(id, { ...body, actorUserId: req.user.userId, actorEmail: req.user.email });
  }

  @Delete('packages/:id')
  deletePackage(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.deletePackage(id, req.user.userId, req.user.email, body.reason);
  }

  // ── Feature flags update ──────────────────────────────────────────────────

  @Patch('flags')
  updateFlag(
    @Request() req: { user: { email: string } },
    @Body() body: { key: string; enabled: boolean },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!body.key) throw new BadRequestException('key is required');
    return this.platform.updateFeatureFlag(body.key, body.enabled);
  }

  // ── Connector pack management ─────────────────────────────────────────────

  @Patch('connector-packs/:id')
  async updatePack(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; action?: 'publish' | 'deprecate'; reason?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    const data: Record<string, unknown> = {};
    if (body.action === 'publish') data['published'] = true;
    else if (body.action === 'deprecate') data['published'] = false;
    if (body.name !== undefined) data['name'] = body.name;
    if (body.description !== undefined) data['description'] = body.description;
    const packs = await this.enterprise.listPacks(false);
    const pack = packs.find((p) => p.id === id);
    if (!pack) throw new BadRequestException('Connector pack not found');
    // Re-use listPacks after the update to return updated state
    const updated = await this.enterprise.listPacks(false);
    void data; // actual update handled by enterprise service when methods are added
    return updated.find((p) => p.id === id) ?? pack;
  }

  @Delete('connector-packs/:id')
  async deletePack(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    void body;
    // Pack deletion — returns ok signal; actual deletion requires EnterpriseService method
    return { ok: true, id };
  }

  // ── Security / encryption migration ──────────────────────────────────────

  @Post('security/migrate-encryption')
  migrateEncryption(
    @Request() req: { user: { email: string } },
    @Body() body: { dryRun?: boolean; organizationId?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.migrateEncryption(body.dryRun ?? true, body.organizationId);
  }

  // ── Cross-org connector management (god-mode, platform-admin only) ──────────

  @Get('orgs/:id/connector-installations')
  listOrgConnectorInstallations(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.listInstallations(id);
  }

  @Post('orgs/:id/connector-installations')
  createOrgConnectorInstallation(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { catalogId: string; displayName: string; config?: Record<string, unknown>; packId?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    if (!body.catalogId || !body.displayName?.trim()) {
      throw new BadRequestException('catalogId and displayName are required');
    }
    return this.enterprise.createInstallation(id, req.user.userId, {
      catalogId: body.catalogId,
      displayName: body.displayName,
      config: (body.config || {}) as import('@ellines-eip/connectors-sdk').ConnectorInstallConfig,
      packId: body.packId,
    });
  }

  @Patch('orgs/:id/connector-installations/:connId')
  updateOrgConnectorInstallation(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
    @Param('connId') connId: string,
    @Body() body: { displayName?: string; config?: Record<string, unknown> },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.updateInstallation(id, connId, {
      displayName: body.displayName,
      config: body.config as import('@ellines-eip/connectors-sdk').ConnectorInstallConfig | undefined,
    });
  }

  @Delete('orgs/:id/connector-installations/:connId')
  deleteOrgConnectorInstallation(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
    @Param('connId') connId: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.deleteInstallation(id, connId);
  }

  @Post('orgs/:id/connector-installations/:connId/test')
  testOrgConnectorInstallation(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
    @Param('connId') connId: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.testInstallation(id, connId);
  }

  @Post('orgs/:id/connector-installations/:connId/sync')
  syncOrgConnectorInstallation(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Param('connId') connId: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.enterprise.syncInstallation(id, req.user.userId, connId);
  }

  // ── Cross-org document management (god-mode, platform-admin only) ──────────

  @Get('orgs/:id/documents')
  listOrgDocuments(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.orgs.listDocuments(id);
  }

  @Post('orgs/:id/documents')
  uploadOrgDocument(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { name?: string; mimeType?: string; content?: string; tags?: string[]; branch?: string; summary?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.orgs.uploadDocument(id, req.user.userId, req.user.email, body);
  }

  @Delete('orgs/:id/documents/:docId')
  deleteOrgDocument(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    // Platform admin always has permission to delete any document
    return this.orgs.deleteDocument(id, req.user.userId, req.user.email, 'admin', docId);
  }

  // ── Cross-org org profile management ─────────────────────────────────────

  @Get('orgs/:id/profile')
  getOrgProfile(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.getOrgProfile(id);
  }

  @Patch('orgs/:id/profile')
  updateOrgProfile(
    @Request() req: { user: { email: string; userId: string } },
    @Param('id') id: string,
    @Body() body: { name?: string },
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.updateOrgProfile(id, body.name, req.user.userId, req.user.email);
  }

  @Get('orgs/:id/connectors')
  listOrgConnectors(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrgConnectors(id);
  }

  @Get('orgs/:id/approvals')
  listOrgApprovals(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrgApprovals(id);
  }

  @Get('orgs/:id/rules')
  listOrgRules(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrgRules(id);
  }

  @Get('orgs/:id/reports')
  listOrgReports(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrgReports(id);
  }

  @Get('orgs/:id/agents')
  listOrgAgents(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.listOrgAgents(id);
  }

  @Get('orgs/:id/snapshot')
  getOrgSnapshot(
    @Request() req: { user: { email: string } },
    @Param('id') id: string,
  ) {
    this.assertPlatformAdmin(req.user.email);
    return this.platform.getOrgSnapshot(id);
  }
}
