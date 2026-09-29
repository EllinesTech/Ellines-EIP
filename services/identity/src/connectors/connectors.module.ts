/**
 * ConnectorsModule — Task 15.1 / 15.2
 *
 * Registers connector-related services that are shared across the platform.
 *  - ResilientConnectionService  (Task 15.1 — Requirements 28.1–28.4)
 *  - ConnectorCodeGeneratorService (Task 15.2 — Requirements 28.5–28.8)
 *  - TemplateService / TemplateController (pre-existing)
 */

import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { ResilientConnectionService } from './resilient-connection.service';
import { ConnectorCodeGeneratorService } from './connector-code-generator.service';
import { CapabilityBridgeService } from './capability-bridge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TemplateController],
  providers: [TemplateService, ResilientConnectionService, ConnectorCodeGeneratorService, CapabilityBridgeService],
  exports: [TemplateService, ResilientConnectionService, ConnectorCodeGeneratorService, CapabilityBridgeService],
})
export class ConnectorsModule {}
