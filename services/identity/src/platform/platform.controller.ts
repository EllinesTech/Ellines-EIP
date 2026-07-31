import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPlatformAdminEmail, parsePlatformAdminEmails } from '@ellines-eip/shared';
import type { ConnectorInstallConfig } from '@ellines-eip/connectors-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformService } from './platform.service';
import { EnterpriseService } from '../enterprise/enterprise.service';

@Controller('platform')
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly enterprise: EnterpriseService,
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
