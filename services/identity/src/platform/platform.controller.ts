import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
}
