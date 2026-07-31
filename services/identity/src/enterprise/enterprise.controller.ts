import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ORG_ADMIN_ROLES } from '@ellines-eip/shared';
import type { ConnectorInstallConfig } from '@ellines-eip/connectors-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EnterpriseService } from './enterprise.service';
import restSample from './rest-enterprise-sample.json';

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

  @Get('connectors/rest-sample')
  restSample() {
    return restSample;
  }

  @Get('connectors/installations')
  @Roles(...ORG_ADMIN_ROLES)
  listInstallations(@Request() req: { user: { organizationId: string } }) {
    return this.enterprise.listInstallations(req.user.organizationId);
  }

  @Post('connectors/installations')
  @Roles(...ORG_ADMIN_ROLES)
  createInstallation(
    @Request() req: { user: { userId: string; organizationId: string } },
    @Body()
    body: {
      catalogId: string;
      displayName: string;
      config?: ConnectorInstallConfig;
      packId?: string;
    },
  ) {
    return this.enterprise.createInstallation(
      req.user.organizationId,
      req.user.userId,
      body,
    );
  }

  @Patch('connectors/installations/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateInstallation(
    @Request() req: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() body: { displayName?: string; config?: ConnectorInstallConfig },
  ) {
    return this.enterprise.updateInstallation(req.user.organizationId, id, body);
  }

  @Delete('connectors/installations/:id')
  @Roles(...ORG_ADMIN_ROLES)
  deleteInstallation(
    @Request() req: { user: { organizationId: string } },
    @Param('id') id: string,
  ) {
    return this.enterprise.deleteInstallation(req.user.organizationId, id);
  }

  @Post('connectors/installations/:id/test')
  @Roles(...ORG_ADMIN_ROLES)
  testInstallation(
    @Request() req: { user: { organizationId: string } },
    @Param('id') id: string,
  ) {
    return this.enterprise.testInstallation(req.user.organizationId, id);
  }

  @Post('connectors/installations/:id/sync')
  @Roles(...ORG_ADMIN_ROLES)
  syncInstallation(
    @Request() req: { user: { userId: string; organizationId: string } },
    @Param('id') id: string,
  ) {
    return this.enterprise.syncInstallation(
      req.user.organizationId,
      req.user.userId,
      id,
    );
  }

  @Post('connectors/openapi/parse')
  @Roles(...ORG_ADMIN_ROLES)
  parseOpenApi(@Body() body: { document?: unknown }) {
    return this.enterprise.parseOpenApi(body?.document);
  }

  @Get('connectors/packs')
  @Roles(...ORG_ADMIN_ROLES)
  listPublishedPacks() {
    return this.enterprise.listPacks(true);
  }

  @Post('connectors/:id/sync')
  @Roles(...ORG_ADMIN_ROLES)
  sync(
    @Request() req: { user: { userId: string; organizationId: string } },
    @Param('id') id: string,
    @Body() body?: ConnectorInstallConfig,
  ) {
    return this.enterprise.syncConnector(req.user.organizationId, req.user.userId, id, body);
  }
}
