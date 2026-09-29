/**
 * ConsolidatedReportService
 *
 * Generates cross-organisation consolidated reports by aggregating
 * EnterpriseSnapshot data across multiple orgs.  Only available to
 * Super Admins — tenant isolation is enforced via the `orgIds` filter.
 *
 * Requirement 21.1: Consolidated multi-org reporting for platform-level view.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ConsolidatedReportPeriod {
  start: string; // ISO 8601
  end?: string;
}

export interface ConsolidatedReportRow {
  organizationId: string;
  connectorName: string | null;
  healthScore: number | null;
  openAlerts: number | null;
  openDecisions: number | null;
  briefHighlight: string | null;
  updatedAt: Date | null;
}

export interface ConsolidatedReport {
  reportType: string;
  period: ConsolidatedReportPeriod;
  orgIds: string[];
  rows: ConsolidatedReportRow[];
  generatedAt: Date;
}

@Injectable()
export class ConsolidatedReportService {
  private readonly logger = new Logger(ConsolidatedReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a consolidated report across the supplied org IDs.
   *
   * @param orgIds      Array of org IDs to include (Super Admin decides scope).
   * @param reportType  Report category, e.g. 'health' | 'alerts' | 'summary'.
   * @param period      Time period metadata attached to the report record.
   */
  async generateConsolidated(
    orgIds: string[],
    reportType: string,
    period: ConsolidatedReportPeriod,
  ): Promise<ConsolidatedReport> {
    if (!orgIds.length) {
      this.logger.warn('generateConsolidated called with empty orgIds list');
      return {
        reportType,
        period,
        orgIds: [],
        rows: [],
        generatedAt: new Date(),
      };
    }

    const snapshots = await this.prisma.enterpriseSnapshot.findMany({
      where: { organizationId: { in: orgIds } },
      select: {
        organizationId: true,
        connectorName: true,
        healthScore: true,
        openAlerts: true,
        openDecisions: true,
        briefHighlight: true,
        updatedAt: true,
      },
    });

    const rows: ConsolidatedReportRow[] = snapshots.map((s) => ({
      organizationId: s.organizationId,
      connectorName: s.connectorName,
      healthScore: s.healthScore,
      openAlerts: s.openAlerts,
      openDecisions: s.openDecisions,
      briefHighlight: s.briefHighlight,
      updatedAt: s.updatedAt,
    }));

    this.logger.log(
      `Consolidated report (${reportType}) generated for ${orgIds.length} orgs — ${rows.length} snapshots found`,
    );

    return {
      reportType,
      period,
      orgIds,
      rows,
      generatedAt: new Date(),
    };
  }
}
