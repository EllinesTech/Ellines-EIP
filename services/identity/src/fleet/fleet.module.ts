/**
 * FleetModule — Task 16.4
 *
 * Registers the FleetTrackingService and FleetController.
 *
 * Requirements 30.x: Fleet & Asset Tracking
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FleetController } from './fleet.controller';
import { FleetTrackingService } from './fleet-tracking.service';

@Module({
  imports: [PrismaModule, DatabaseModule],
  controllers: [FleetController],
  providers: [FleetTrackingService],
  exports: [FleetTrackingService],
})
export class FleetModule {}
