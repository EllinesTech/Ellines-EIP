/**
 * ReportsModule — Task 21.1
 *
 * Provides consolidated multi-org reporting capability.
 * Imports PrismaModule to access the database via PrismaService.
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsolidatedReportService } from './consolidated-report.service';

@Module({
  imports: [PrismaModule],
  providers: [ConsolidatedReportService],
  exports: [ConsolidatedReportService],
})
export class ReportsModule {}
