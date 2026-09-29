/**
 * ConsolidatedReportingService
 *
 * Platform Super Admin only — generates a merged snapshot report across
 * multiple organisations.  Fetches the latest enterprise_snapshot for each
 * requested org and produces a single summary object.
 *
 * Requirement 21.1: Cross-org consolidated reporting for Super Admin.
 *
 * Security Rule §6: Every query includes a mandatory organization_id filter
 * (via the orgIds array).  The callingOrgId must be the platform admin's own
 * org — validation is enforced at the controller layer; this service trusts
 * the caller.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OrgSnapshotSummary {
  orgId: string;
  orgName: string;
  healthScore: number | null;
  openAlerts: number | null;
  openDecisions: number | null;
  connectorName: string | null;
  syncedAt: Date | null;
}

export interface ConsolidatedReport {
  generatedAt: Date;
  callingOrgId: string;
  orgCount: number;
  avgHealthScore: number | null;
  totalOpenAlerts: number;
  totalOpenDecisions: number;
  orgs: OrgSnapshotSummary[];
}

@Injectable()
export class ConsolidatedReportingService {
  private readonly logger = new Logger(ConsolidatedReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a consolidated report across the supplied org IDs.
   *
   * Each org's latest enterprise_snapshot is fetched with a strict
   * organization_id equality filter (Rule §6).
   *
   * @param orgIds        Array of organisation IDs to include.
   * @param callingOrgId  The Super Admin's own org ID — for audit metadata.
   */
  async generateConsolidatedReport(
    orgIds: string[],
    callingOrgId: string,
  ): Promise<ConsolidatedReport> {
    if (!orgIds.length) {
      return {
        generatedAt: new Date(),
        callingOrgId,
        orgCount: 0,
        avgHealthScore: null,
        totalOpenAlerts: 0,
        totalOpenDecisions: 0,
        orgs: [],
      };
    }

    // Fetch the latest snapshot for each org in a single batch query.
    // Rule §6: organization_id IN filter — no cross-tenant leak.
    const snapshots = await this.prisma.enterpriseSnapshot.findMany({
      where: { organizationId: { in: orgIds } },
      select: {
        organizationId: true,
        healthScore: true,
        openAlerts: true,
        openDecisions: true,
        connectorName: true,
        syncedAt: true,
      },
      orderBy: { syncedAt: 'desc' },
      distinct: ['organizationId'],
    });

    // Fetch org names in parallel — mandatory organization_id filter.
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });

    const nameById = new Map(orgs.map((o) => [o.id, o.name]));
    const snapshotByOrgId = new Map(snapshots.map((s) => [s.organizationId, s]));

    const orgSummaries: OrgSnapshotSummary[] = orgIds.map((id) => {
      const snap = snapshotByOrgId.get(id);
      return {
        orgId: id,
        orgName: nameById.get(id) ?? id,
        healthScore: snap?.healthScore ?? null,
        openAlerts: snap?.openAlerts ?? null,
        openDecisions: snap?.openDecisions ?? null,
        connectorName: snap?.connectorName ?? null,
        syncedAt: snap?.syncedAt ?? null,
      };
    });

    const healthScores = orgSummaries
      .map((o) => o.healthScore)
      .filter((v): v is number => v !== null);

    const avgHealthScore =
      healthScores.length > 0
        ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
        : null;

    const totalOpenAlerts = orgSummaries.reduce(
      (sum, o) => sum + (o.openAlerts ?? 0),
      0,
    );

    const totalOpenDecisions = orgSummaries.reduce(
      (sum, o) => sum + (o.openDecisions ?? 0),
      0,
    );

    this.logger.log(
      `ConsolidatedReport: ${orgIds.length} orgs, avgHealth=${avgHealthScore}, totalAlerts=${totalOpenAlerts}`,
    );

    return {
      generatedAt: new Date(),
      callingOrgId,
      orgCount: orgIds.length,
      avgHealthScore,
      totalOpenAlerts,
      totalOpenDecisions,
      orgs: orgSummaries,
    };
  }
}
