import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { ORG_ADMIN_ROLES } from '@ellines-eip/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EnterpriseService } from './enterprise.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnterpriseController {
  constructor(private readonly enterprise: EnterpriseService) {}

  @Get('enterprise/summary')
  getSummary(@Request() req: { user: { organizationId: string } }) {
    return this.enterprise.getSummary(req.user.organizationId);
  }

  @Get('connectors')
  listConnectors(@Request() req: { user: { organizationId: string } }) {
    return this.enterprise.listConnectors(req.user.organizationId);
  }

  @Post('connectors/:id/sync')
  @Roles(...ORG_ADMIN_ROLES)
  sync(
    @Request() req: { user: { userId: string; organizationId: string } },
    @Param('id') id: string,
  ) {
    return this.enterprise.syncConnector(req.user.organizationId, req.user.userId, id);
  }
}
