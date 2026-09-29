import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PredictiveAnalyticsService } from './predictive-analytics.service';
import { AnalyticsController } from './analytics.controller';

/**
 * AnalyticsModule — houses the EIP 2.0 predictive analytics engine.
 *
 * Imports:
 *   DatabaseModule — provides InfluxDbService (time-series reads/writes)
 *   PrismaModule   — provides PrismaService for relational data access
 *
 * Exports:
 *   PredictiveAnalyticsService — so other modules can inject it directly.
 *
 * Controllers:
 *   AnalyticsController — exposes GET /ellinea/analytics/forecast and
 *                         GET /ellinea/analytics/scenarios for the Pages Functions.
 */
@Module({
  imports: [DatabaseModule, PrismaModule],
  controllers: [AnalyticsController],
  providers: [PredictiveAnalyticsService],
  exports: [PredictiveAnalyticsService],
})
export class AnalyticsModule {}
