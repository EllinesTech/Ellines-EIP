import { Controller, Get, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPlatformAdminEmail, parsePlatformAdminEmails } from '@ellines-eip/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformService } from './platform.service';

@Controller('platform')
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
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
}
