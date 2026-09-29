/**
 * AlertCorrelationService — groups alerts into clusters, identifies root causes,
 * deduplicates duplicates, detects alert storms, and calculates urgency scores.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertInput = {
  id: string;
  source: string;
  errorCode: string;
  resourceId?: string;
  component?: string;
  userId?: string;
  connectorId?: string;
  timestamp: Date;
  businessImpact?: number;
  affectedUsers?: number;
  dependencyDepth?: number;
  message?: string;
};

export type AlertCluster = {
  clusterId: string;
  alerts: AlertInput[];
  rootCause: AlertInput | null;
  windowStartMs: number;
  windowEndMs: number;
  createdAt: Date;
};

export type StormResult = {
  alertCount: number;
  windowMs: number;
  summaryIncidentId?: string;
  action: 'create_incident';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default correlation window: 5 minutes in milliseconds (Property 7). */
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

/** An alert storm is declared when more than this many alerts fall in the window. */
const STORM_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AlertCorrelationService {
  private readonly logger = new Logger(AlertCorrelationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // correlateAlerts — Requirement 12.1, Property 7
  // -------------------------------------------------------------------------

  /**
   * Groups `alerts` into `AlertCluster[]` where every member of a cluster
   * shares a correlation axis (component, userId, or connectorId) AND falls
   * within `windowMs` of the cluster's first alert (Property 7).
   *
   * Each cluster is persisted to AuditLog with action = 'alert.cluster.created'.
   */
  async correlateAlerts(
    alerts: AlertInput[],
    windowMs: number = DEFAULT_WINDOW_MS,
  ): Promise<AlertCluster[]> {
    if (!alerts.length) return [];

    // Sort ascending so the first alert in each group anchors the window.
    const sorted = [...alerts].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const clusters: AlertCluster[] = [];
    const assigned = new Set<string>();

    for (const anchor of sorted) {
      if (assigned.has(anchor.id)) continue;

      // Collect all unassigned alerts that share an axis with the anchor AND
      // fall within [anchor.timestamp, anchor.timestamp + windowMs].
      const windowEnd = anchor.timestamp.getTime() + windowMs;

      const members = sorted.filter((a) => {
        if (assigned.has(a.id)) return false;
        if (a.timestamp.getTime() < anchor.timestamp.getTime()) return false;
        if (a.timestamp.getTime() > windowEnd) return false;
        return this.shareAxis(anchor, a);
      });

      if (members.length === 0) continue;

      members.forEach((a) => assigned.add(a.id));

      const cluster = await this.buildCluster(members, windowMs);
      clusters.push(cluster);
    }

    return clusters;
  }

  // -------------------------------------------------------------------------
  // identifyRootCause — Requirement 12.2, Property 8
  // -------------------------------------------------------------------------

  /**
   * Identifies the root cause of a cluster: the earliest alert that precedes
   * at least two others.  Each cluster has exactly one root cause (Property 8).
   *
   * If the cluster has fewer than 3 alerts the earliest alert is returned so
   * the cluster always carries a non-null rootCause.
   */
  identifyRootCause(cluster: AlertCluster): AlertCluster {
    if (!cluster.alerts.length) {
      return { ...cluster, rootCause: null };
    }

    const sorted = [...cluster.alerts].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Walk from earliest: find the first alert that precedes ≥ 2 others.
    let rootCause: AlertInput = sorted[0];

    for (let i = 0; i < sorted.length; i++) {
      const candidateTs = sorted[i].timestamp.getTime();
      const later = sorted.filter((a) => a.timestamp.getTime() > candidateTs);
      if (later.length >= 2) {
        rootCause = sorted[i];
        break;
      }
    }

    return { ...cluster, rootCause };
  }

  // -------------------------------------------------------------------------
  // suppressDuplicates — Requirement 12.3
  // -------------------------------------------------------------------------

  /**
   * Removes duplicates from `alerts` by the composite key
   * `(source, errorCode, resourceId)` within the same default time window.
   * The earliest occurrence is kept.
   */
  suppressDuplicates(
    alerts: AlertInput[],
    windowMs: number = DEFAULT_WINDOW_MS,
  ): AlertInput[] {
    if (!alerts.length) return [];

    const sorted = [...alerts].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const seen = new Map<string, number>(); // key → earliest timestamp
    const unique: AlertInput[] = [];

    for (const alert of sorted) {
      const key = `${alert.source}::${alert.errorCode}::${alert.resourceId ?? ''}`;
      const earliestTs = seen.get(key);

      if (earliestTs === undefined) {
        seen.set(key, alert.timestamp.getTime());
        unique.push(alert);
      } else if (alert.timestamp.getTime() - earliestTs > windowMs) {
        // Outside the dedup window — treat as a new occurrence.
        seen.set(key, alert.timestamp.getTime());
        unique.push(alert);
      }
      // else: duplicate within window — discard
    }

    return unique;
  }

  // -------------------------------------------------------------------------
  // detectStorm — Requirement 12.4
  // -------------------------------------------------------------------------

  /**
   * Declares an alert storm when more than 10 alerts occur within `timeWindow`.
   * Returns a `StormResult` with `action = 'create_incident'` or `null`.
   */
  detectStorm(
    alerts: AlertInput[],
    timeWindow: number = DEFAULT_WINDOW_MS,
  ): StormResult | null {
    if (alerts.length <= STORM_THRESHOLD) return null;

    // Find the densest window using a sliding approach.
    const sorted = [...alerts].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    for (let i = 0; i < sorted.length; i++) {
      const windowStart = sorted[i].timestamp.getTime();
      const windowEnd = windowStart + timeWindow;
      const inWindow = sorted.filter(
        (a) =>
          a.timestamp.getTime() >= windowStart &&
          a.timestamp.getTime() <= windowEnd,
      );
      if (inWindow.length > STORM_THRESHOLD) {
        this.logger.warn(
          `Alert storm detected: ${inWindow.length} alerts in ${timeWindow}ms window`,
        );
        return {
          alertCount: inWindow.length,
          windowMs: timeWindow,
          action: 'create_incident',
        };
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // calculateUrgency — Requirement 12.5
  // -------------------------------------------------------------------------

  /**
   * Score = (businessImpact × 40) + (affectedUsers × 40) + (dependencyDepth × 20).
   * Clamped to [0, 100].
   *
   * Each input dimension is expected in [0, 1]; defaults to 0 when absent.
   */
  calculateUrgency(alert: AlertInput): number {
    const impact = clamp01(alert.businessImpact ?? 0);
    const users = clamp01(alert.affectedUsers ?? 0);
    const depth = clamp01(alert.dependencyDepth ?? 0);

    const raw = impact * 40 + users * 40 + depth * 20;
    return Math.min(100, Math.max(0, raw));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Returns true when two alerts share at least one correlation axis. */
  private shareAxis(a: AlertInput, b: AlertInput): boolean {
    if (a.component && b.component && a.component === b.component) return true;
    if (a.userId && b.userId && a.userId === b.userId) return true;
    if (a.connectorId && b.connectorId && a.connectorId === b.connectorId)
      return true;
    return false;
  }

  /**
   * Builds an `AlertCluster` from a set of member alerts, identifies the root
   * cause, and persists an audit log entry (Requirement 12.7).
   */
  private async buildCluster(
    members: AlertInput[],
    windowMs: number,
  ): Promise<AlertCluster> {
    const sorted = [...members].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const windowStartMs = sorted[0].timestamp.getTime();
    const windowEndMs = windowStartMs + windowMs;
    const clusterId = `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const draft: AlertCluster = {
      clusterId,
      alerts: sorted,
      rootCause: null,
      windowStartMs,
      windowEndMs,
      createdAt: now,
    };

    const cluster = this.identifyRootCause(draft);

    // Persist to AuditLog — Requirement 12.7
    await this.persistClusterAudit(cluster);

    return cluster;
  }

  /** Writes an AuditLog row for the created cluster (Requirement 12.7). */
  private async persistClusterAudit(cluster: AlertCluster): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'alert.cluster.created',
          resource: 'alert_cluster',
          metadata: {
            clusterId: cluster.clusterId,
            alertCount: cluster.alerts.length,
            rootCauseId: cluster.rootCause?.id ?? null,
            windowStartMs: cluster.windowStartMs,
            windowEndMs: cluster.windowEndMs,
            alertIds: cluster.alerts.map((a) => a.id),
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Non-fatal: log but don't break the correlation flow.
      this.logger.warn(`Failed to persist cluster audit log: ${String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Clamps a number to [0, 1]. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
