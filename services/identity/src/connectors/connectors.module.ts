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
import { ProxySyncController } from './proxy-sync.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [PrismaModule, EncryptionModule],
  controllers: [TemplateController, ProxySyncController],
  providers: [TemplateService, ResilientConnectionService, ConnectorCodeGeneratorService, CapabilityBridgeService],
  exports: [TemplateService, ResilientConnectionService, ConnectorCodeGeneratorService, CapabilityBridgeService],
})
export class ConnectorsModule {}
