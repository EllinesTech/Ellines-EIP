/**
 * AlertsModule — registers the AlertCorrelationService for the alert
 * correlation engine subsystem.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertCorrelationService } from './alert-correlation.service';

@Module({
  imports: [PrismaModule],
  providers: [AlertCorrelationService],
  exports: [AlertCorrelationService],
})
export class AlertsModule {}
