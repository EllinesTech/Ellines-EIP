import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { EmailController } from './email.controller';
import { EmailIntelligenceService } from './email-intelligence.service';

/**
 * EmailModule — EIP 2.0 Task 14.2
 *
 * Provides the Email Intelligence service and controller for the EIP platform.
 *
 * Imports:
 *   PrismaModule      — required by EmailIntelligenceService (ConnectorInstallation reads/writes)
 *   EncryptionModule  — required by EmailIntelligenceService (credential encryption at rest, §5)
 *
 * Requirements: 26.4, 32.1–32.8
 */
@Module({
  imports: [PrismaModule, EncryptionModule],
  controllers: [EmailController],
  providers: [EmailIntelligenceService],
  exports: [EmailIntelligenceService],
})
export class EmailModule {}
