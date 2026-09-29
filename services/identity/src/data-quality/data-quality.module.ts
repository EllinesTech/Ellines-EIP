/**
 * DataQualityModule
 *
 * Houses the EIP 2.0 data quality engine (Req 18.1-18.8).
 *
 * Imports:
 *   PrismaModule — provides PrismaService for all database access
 *
 * Exports:
 *   DataQualityService — so other modules (e.g. EnterpriseModule) can inject it
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataQualityService } from './data-quality.service';

@Module({
  imports:   [PrismaModule],
  providers: [DataQualityService],
  exports:   [DataQualityService],
})
export class DataQualityModule {}
