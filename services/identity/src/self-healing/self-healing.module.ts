/**
 * SelfHealingModule — registers the DetectorService, ErrorEventBus,
 * RemediatorService, and LearnerService for the autonomous self-healing subsystem.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.8, 6.1–6.6, 6.8
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DatabaseModule } from '../database/database.module';
import { AlertsModule } from '../alerts/alerts.module';
import { SelfHealingDetectorService } from './detector.service';
import { ErrorEventBus } from './error-event-bus';
import { RemediatorService } from './remediator.service';
import { LearnerService } from './learner.service';

@Module({
  imports: [PrismaModule, DatabaseModule, AlertsModule],
  providers: [SelfHealingDetectorService, ErrorEventBus, RemediatorService, LearnerService],
  exports: [SelfHealingDetectorService, ErrorEventBus, RemediatorService, LearnerService],
})
export class SelfHealingModule {}
