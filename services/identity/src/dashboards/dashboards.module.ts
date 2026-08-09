import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DashboardWebSocketGateway } from './dashboard-websocket.gateway';
import { DashboardExportService } from './dashboard-export.service';
import { DashboardSharingService } from './dashboard-sharing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardWebSocketGateway,
    DashboardExportService,
    DashboardSharingService,
  ],
  exports: [
    DashboardService,
    DashboardWebSocketGateway,
    DashboardExportService,
    DashboardSharingService,
  ],
})
export class DashboardsModule {}
