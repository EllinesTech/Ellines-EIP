import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';

// Legacy email intelligence (connector-installation based)
import { EmailController } from './email.controller';
import { EmailIntelligenceService } from './email-intelligence.service';

// New inbox window
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxPollerService } from './inbox-poller.service';

/**
 * EmailModule — Email Intelligence + Inbox Window
 *
 * Provides:
 *   EmailIntelligenceService — legacy connector-based email analysis (Req 32.x)
 *   InboxService             — IMAP account management + message storage
 *   InboxPollerService       — background polling loop (60 s tick)
 *   InboxController          — /api/v1/inbox routes
 *
 * Requirements: 32.1–32.8, Email Inbox Window
 */
@Module({
  imports: [PrismaModule, EncryptionModule],
  controllers: [EmailController, InboxController],
  providers: [EmailIntelligenceService, InboxService, InboxPollerService],
  exports: [EmailIntelligenceService, InboxService],
})
export class EmailModule {}
