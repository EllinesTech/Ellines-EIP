/**
 * CapabilityBridgeService — Task 21.3
 *
 * Detects gaps between an organisation's AI capability needs and the
 * currently available connector/model set by querying ModelDecisionLog
 * for recent failed or low-confidence queries.
 *
 * Requirement 21.3: Capability gap detection and connector recommendation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CapabilityRecommendation {
  capability: string;
  reason: string;
  failureCount: number;
  avgConfidence: number | null;
}

export interface CapabilityGapReport {
  organizationId: string;
  analysedAt: Date;
  gaps: CapabilityRecommendation[];
}

@Injectable()
export class CapabilityBridgeService {
  private readonly logger = new Logger(CapabilityBridgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect capability gaps for a given org by analysing recent model
   * decision logs that have low confidence or marked as failures.
   *
   * @param orgId  Org to analyse — included in every query (tenant isolation).
   * @param limit  Max number of decision logs to scan (default 200).
   */
  async detectGaps(
    orgId: string,
    limit = 200,
  ): Promise<CapabilityGapReport> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    const decisions = await this.prisma.modelDecisionLog.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: since },
        OR: [{ success: false }, { confidence: { lt: 0.5 } }],
      },
      select: {
        queryType: true,
        confidence: true,
        success: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Group by queryType and compute aggregates.
    const grouped: Record<
      string,
      { count: number; confidenceSum: number; confidenceCount: number }
    > = {};

    for (const d of decisions) {
      const qt = d.queryType ?? 'unknown';
      if (!grouped[qt]) {
        grouped[qt] = { count: 0, confidenceSum: 0, confidenceCount: 0 };
      }
      grouped[qt].count++;
      if (d.confidence !== null) {
        grouped[qt].confidenceSum += d.confidence;
        grouped[qt].confidenceCount++;
      }
    }

    const gaps: CapabilityRecommendation[] = Object.entries(grouped)
      .map(([capability, stats]) => ({
        capability,
        reason:
          `${stats.count} recent query(ies) for "${capability}" failed or had low confidence. ` +
          `Consider connecting a specialised model or data source for this query type.`,
        failureCount: stats.count,
        avgConfidence:
          stats.confidenceCount > 0
            ? stats.confidenceSum / stats.confidenceCount
            : null,
      }))
      .sort((a, b) => b.failureCount - a.failureCount);

    this.logger.log(
      `CapabilityBridge detectGaps: orgId=${orgId} — ${gaps.length} gap(s) found`,
    );

    return {
      organizationId: orgId,
      analysedAt: new Date(),
      gaps,
    };
  }
}
