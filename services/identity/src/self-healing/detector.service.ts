/**
 * SelfHealingDetectorService
 *
 * Monitors platform error streams, groups errors into clusters using a
 * sliding 5-minute window, classifies each error, and persists incidents
 * to the RemediationExecution table.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.8
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorEventBus, ERROR_CAPTURED_EVENT } from './error-event-bus';
import { AlertCorrelationService } from '../alerts/alert-correlation.service';
import type {
  ErrorLogEntry,
  ErrorCluster,
  ErrorClassification,
  RemediationExecutionRecord,
} from './detector.types';

/** Cluster threshold — emit incident when same error code appears ≥ N times */
const CLUSTER_THRESHOLD = 3;

/** Default sliding window in milliseconds (5 minutes) */
const DEFAULT_WINDOW_MS = 5 * 60 * 1_000;

/**
 * Endpoint patterns mapped to severity (evaluated in order — first match wins).
 * Rules (per spec 5.1):
 *   /auth            → critical
 *   /api/v1/platform → high
 *   /api/v1/         → medium
 *   else             → low
 */
const SEVERITY_PATTERNS: Array<{ pattern: RegExp; severity: ErrorClassification['severity'] }> = [
  { pattern: /\/auth/i, severity: 'critical' },
  { pattern: /\/api\/v1\/platform/i, severity: 'high' },
  { pattern: /\/api\/v1\//i, severity: 'medium' },
];

/** Sentinel playbook error pattern used when persisting open incidents */
const INCIDENT_PLAYBOOK_PATTERN = 'incident:open';

@Injectable()
export class SelfHealingDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SelfHealingDetectorService.name);

  /** In-memory rolling log — trimmed on each detection pass */
  private readonly rollingLog: ErrorLogEntry[] = [];

  private unsubscribe?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: ErrorEventBus,
    private readonly alertCorrelation: AlertCorrelationService,
  ) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  onModuleInit(): void {
    this.unsubscribe = this.eventBus.onError((entry) => {
      this.rollingLog.push(entry);
      // Trim to last 10 minutes to bound memory usage
      const cutoff = Date.now() - DEFAULT_WINDOW_MS * 2;
      while (this.rollingLog.length && this.rollingLog[0].timestamp.getTime() < cutoff) {
        this.rollingLog.shift();
      }
      // Opportunistically detect patterns on each new entry
      this.detectErrorPattern(this.rollingLog)
        .then(() => { /* clusters handled inside detectErrorPattern */ })
        .catch((err) =>
          this.logger.error(`Background pattern detection failed: ${err}`),
        );
    });
    this.logger.log('SelfHealingDetectorService initialised — listening for error events');
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  // -------------------------------------------------------------------------
  // Core Detection
  // -------------------------------------------------------------------------

  /**
   * Groups log entries by error code within a sliding window and emits an
   * incident record for every code that hits the cluster threshold.
   *
   * Requirement 4.2 — detects errors from multiple sources (logs/metrics/health)
   * Requirement 4.5 — correlates related errors to find root-cause clusters
   */
  async detectErrorPattern(
    logs: ErrorLogEntry[],
    windowMs = DEFAULT_WINDOW_MS,
  ): Promise<ErrorCluster[]> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Keep only entries inside the sliding window
    const windowed = logs.filter((e) => e.timestamp.getTime() >= windowStart);

    // Group by error code
    const groups = new Map<string, ErrorLogEntry[]>();
    for (const entry of windowed) {
      const bucket = groups.get(entry.errorCode) ?? [];
      bucket.push(entry);
      groups.set(entry.errorCode, bucket);
    }

    const clusters: ErrorCluster[] = [];

    // Build AlertInputs from the windowed logs for correlation (Requirement 12.6, 12.8)
    const alertInputs = windowed.map((log) => ({
      id: log.errorCode + '-' + log.timestamp.getTime(),
      source: log.endpoint ?? 'unknown',
      errorCode: log.errorCode,
      timestamp: log.timestamp,
      message: log.message,
    }));

    // Run alert correlation in parallel with cluster building
    const alertClustersPromise = alertInputs.length
      ? this.alertCorrelation.correlateAlerts(alertInputs, windowMs).catch((err) => {
          this.logger.warn(`Alert correlation failed (non-fatal): ${err}`);
          return [];
        })
      : Promise.resolve([]);

    for (const [errorCode, entries] of groups.entries()) {
      if (entries.length < CLUSTER_THRESHOLD) {
        continue;
      }

      const sorted = [...entries].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );

      const cluster: ErrorCluster = {
        clusterId: `${errorCode}-${now}`,
        errorCode,
        errorCount: entries.length,
        windowStartMs: windowStart,
        windowEndMs: now,
        affectedEndpoints: [...new Set(entries.map((e) => e.endpoint ?? 'unknown'))],
        firstOccurrence: sorted[0].timestamp,
        lastOccurrence: sorted[sorted.length - 1].timestamp,
      };

      clusters.push(cluster);
    }

    // Resolve alert clusters and attach root cause context to incident creation
    const alertClusters = await alertClustersPromise;
    const firstAlertCluster = alertClusters[0] ?? null;
    const rootCauseCode = firstAlertCluster?.rootCause?.errorCode ?? null;

    for (const cluster of clusters) {
      // Persist as an open incident (fire-and-forget; errors are logged)
      this.createIncident(cluster, undefined, rootCauseCode).catch((err) =>
        this.logger.error(`Failed to persist incident for cluster ${cluster.clusterId}: ${err}`),
      );
    }

    return clusters;
  }

  // -------------------------------------------------------------------------
  // Classification
  // -------------------------------------------------------------------------

  /**
   * Classifies a single error entry by severity and determines whether it is
   * a root cause (i.e., it precedes ≥ 2 other errors in the same window).
   *
   * Requirement 4.3 — severity classification
   * Requirement 4.5 — root cause vs symptom identification
   */
  classifyError(error: ErrorLogEntry, recentLogs: ErrorLogEntry[] = []): ErrorClassification {
    const severity = this.deriveSeverity(error.endpoint);

    const windowStart = error.timestamp.getTime() - DEFAULT_WINDOW_MS;
    const windowEnd = error.timestamp.getTime() + DEFAULT_WINDOW_MS;

    // Count errors that occur strictly AFTER this error within the window
    const subsequentErrors = recentLogs.filter((e) => {
      const t = e.timestamp.getTime();
      return t > error.timestamp.getTime() && t <= windowEnd && t >= windowStart;
    });

    // Count how many times THIS error code appeared BEFORE the subsequent errors
    const priorOccurrences = recentLogs.filter((e) => {
      const t = e.timestamp.getTime();
      return (
        e.errorCode === error.errorCode &&
        t >= windowStart &&
        t <= error.timestamp.getTime()
      );
    }).length;

    // Root cause: this error code appeared ≥ 1 time before ≥ 2 subsequent errors
    const isRootCause = priorOccurrences >= 1 && subsequentErrors.length >= 2;

    // Collect error codes of related (subsequent) errors for cross-reference
    const relatedErrors = [...new Set(subsequentErrors.map((e) => e.errorCode))];

    return {
      severity,
      isRootCause,
      relatedErrors,
      suggestedAction: this.buildSuggestedAction(severity, isRootCause),
    };
  }

  // -------------------------------------------------------------------------
  // Incident Persistence
  // -------------------------------------------------------------------------

  /**
   * Persists an error cluster as an open incident in `RemediationExecution`.
   *
   * Because RemediationExecution has a required FK to RemediationPlaybook, we
   * upsert a lightweight "open incident" sentinel playbook entry first, then
   * insert the execution record with `status = 'open'`.
   *
   * Requirement 4.8 — structured incident records with diagnostic data
   */
  async createIncident(cluster: ErrorCluster, orgId?: string, rootCauseCode?: string | null): Promise<RemediationExecutionRecord> {
    // Upsert the sentinel playbook so we always have a valid FK
    const playbook = await this.prisma.remediationPlaybook.upsert({
      where: { errorPattern: INCIDENT_PLAYBOOK_PATTERN },
      update: {},
      create: {
        errorPattern: INCIDENT_PLAYBOOK_PATTERN,
        errorCategory: 'application',
        severity: 'medium',
        stages: [],
        confidenceThreshold: 1.0,
        maxAttempts: 0,
        verificationPeriod: 0,
        isActive: false,
        createdBy: 'system',
      },
    });

    const execution = await this.prisma.remediationExecution.create({
      data: {
        playbookId: playbook.id,
        organizationId: orgId ?? null,
        // incidentId is stored as the human-readable cluster id
        incidentId: cluster.clusterId,
        errorPattern: cluster.errorCode,
        stagesExecuted: 0,
        actionsPerformed: [],
        confidence: 0,
        // 'open' is not one of the enum values in the schema; use 'escalated' as
        // the closest available until a remediator processes it.  We surface
        // the real state via the escalationReason field.
        outcome: 'escalated',
        escalationReason: `open_incident:cluster_size=${cluster.errorCount}`,
        timeTaken: cluster.windowEndMs - cluster.windowStartMs,
        beforeSnapshot: {
          clusterId: cluster.clusterId,
          errorCode: cluster.errorCode,
          errorCount: cluster.errorCount,
          affectedEndpoints: cluster.affectedEndpoints,
          firstOccurrence: cluster.firstOccurrence.toISOString(),
          lastOccurrence: cluster.lastOccurrence.toISOString(),
          ...(rootCauseCode != null ? { rootCauseCode } : {}),
        },
      },
    });

    this.logger.warn(
      `Incident created: ${execution.id} — cluster ${cluster.clusterId} ` +
        `(${cluster.errorCount}× ${cluster.errorCode})`,
    );

    return {
      id: execution.id,
      playbookId: execution.playbookId,
      organizationId: execution.organizationId,
      incidentId: execution.incidentId,
      errorPattern: execution.errorPattern,
      stagesExecuted: execution.stagesExecuted,
      actionsPerformed: execution.actionsPerformed as unknown[],
      confidence: execution.confidence,
      outcome: execution.outcome,
      timeTaken: execution.timeTaken,
      createdAt: execution.createdAt,
    };
  }

  // -------------------------------------------------------------------------
  // Monitoring helpers — Requirement 4.1 (multi-source)
  // -------------------------------------------------------------------------

  /**
   * Queries recent ModelPerformanceLog entries and injects them into the
   * rolling log as error entries when the success rate drops below threshold.
   *
   * Called by external scheduler or on-demand.
   */
  async monitorApiErrorRate(windowMs = DEFAULT_WINDOW_MS): Promise<void> {
    const since = new Date(Date.now() - windowMs);
    try {
      const logs = await (this.prisma as any).modelPerformanceLog?.findMany({
        where: { createdAt: { gte: since } },
        select: { modelId: true, errorMessage: true, createdAt: true, endpoint: true },
      });
      if (!logs) return;

      for (const log of logs as Array<{
        modelId: string;
        errorMessage?: string;
        createdAt: Date;
        endpoint?: string;
      }>) {
        if (log.errorMessage) {
          this.rollingLog.push({
            errorCode: `model_error:${log.modelId}`,
            endpoint: log.endpoint ?? '/api/v1/ellinea',
            timestamp: log.createdAt,
            message: log.errorMessage,
          });
        }
      }
    } catch {
      // ModelPerformanceLog may not yet have data — non-fatal
    }
  }

  /**
   * Checks connector sync failure counts from ConnectorInstallation and
   * injects failure entries into the rolling log.
   */
  async monitorConnectorFailures(windowMs = DEFAULT_WINDOW_MS): Promise<void> {
    const since = new Date(Date.now() - windowMs);
    try {
      const failing = await (this.prisma as any).connectorInstallation?.findMany({
        where: {
          lastSyncStatus: 'error',
          updatedAt: { gte: since },
        },
        select: { id: true, connectorType: true, updatedAt: true, organizationId: true },
      });
      if (!failing) return;

      for (const c of failing as Array<{
        id: string;
        connectorType: string;
        updatedAt: Date;
        organizationId: string;
      }>) {
        this.rollingLog.push({
          errorCode: `connector_sync_error:${c.connectorType}`,
          endpoint: `/api/v1/connectors/${c.id}`,
          timestamp: c.updatedAt,
          message: `Connector ${c.id} (${c.connectorType}) last sync failed`,
        });
      }
    } catch {
      // Non-fatal if table doesn't exist yet
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private deriveSeverity(endpoint?: string): ErrorClassification['severity'] {
    if (!endpoint) return 'low';
    for (const { pattern, severity } of SEVERITY_PATTERNS) {
      if (pattern.test(endpoint)) return severity;
    }
    return 'low';
  }

  private buildSuggestedAction(
    severity: ErrorClassification['severity'],
    isRootCause: boolean,
  ): string {
    if (severity === 'critical') {
      return isRootCause
        ? 'Immediately investigate auth service — this error is driving downstream failures'
        : 'Auth service is degraded — check JWT validation and token store';
    }
    if (severity === 'high') {
      return isRootCause
        ? 'Platform API root cause detected — review recent deployments or config changes'
        : 'Platform API errors are symptomatic — trace back to the root cause first';
    }
    return isRootCause
      ? 'Root cause identified — apply targeted fix before addressing symptoms'
      : 'Monitor this error; resolve root cause errors first';
  }
}
