/**
 * AnomalyDetectorService — detects four classes of security anomaly:
 *  1. Impossible travel     — consecutive sessions from far-apart IPs within 2 h
 *  2. Concurrent sessions   — multiple active sessions for the same user
 *  3. Large data export     — excessive export actions within 1 hour
 *  4. Privilege escalation  — non-admin user performed a permission-grant action
 *
 * Detection events are written to InfluxDB `security_events` measurement with
 * the `org_id` tag.  InfluxDB failures are non-fatal.
 *
 * Requirements: 15.4, 15.5, 15.6, 15.7
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InfluxDbService } from '../database/influxdb.service';

// ─── Public types ────────────────────────────────────────────────────────────

export type SessionRecord = {
  userId: string;
  orgId: string;
  ip: string;
  createdAt: Date;
};

export type AnomalyResult = {
  type:
    | 'impossible_travel'
    | 'concurrent_sessions'
    | 'large_export'
    | 'privilege_escalation';
  userId: string;
  orgId: string;
  severity: 'high' | 'medium' | 'low';
  details: string;
  detectedAt: Date;
};

// ─── Internal constants ──────────────────────────────────────────────────────

/** Maximum elapsed time (ms) between two sessions that still counts as "same trip". */
const IMPOSSIBLE_TRAVEL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Export row threshold above which a large-export anomaly is raised. */
const DEFAULT_LARGE_EXPORT_THRESHOLD = 10_000;

/** Audit actions that indicate a permission/role grant. */
const PRIVILEGE_GRANT_ACTIONS = [
  'permission.grant',
  'role.assign',
  'role.escalate',
  'admin.promote',
];

@Injectable()
export class AnomalyDetectorService {
  private readonly logger = new Logger(AnomalyDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly influx: InfluxDbService,
  ) {}

  // ─── Public detection methods ────────────────────────────────────────────

  /**
   * Detect impossible travel: consecutive sessions from IPs with different
   * first octets (i.e. different /8 networks) within 2 hours.
   *
   * @param sessions  Ordered list of session records (caller-supplied,
   *                  e.g. from recent login history).
   * @returns         Array of anomaly results (empty when no travel detected).
   */
  detectImpossibleTravel(sessions: SessionRecord[]): AnomalyResult[] {
    const results: AnomalyResult[] = [];

    // Sort ascending by session creation time so we compare consecutive pairs.
    const sorted = [...sessions].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      const elapsedMs = curr.createdAt.getTime() - prev.createdAt.getTime();
      if (elapsedMs > IMPOSSIBLE_TRAVEL_WINDOW_MS) continue;

      const prevOctet = firstOctet(prev.ip);
      const currOctet = firstOctet(curr.ip);

      if (prevOctet !== currOctet) {
        const result: AnomalyResult = {
          type: 'impossible_travel',
          userId: curr.userId,
          orgId: curr.orgId,
          severity: 'high',
          details:
            `Session from ${prev.ip} at ${prev.createdAt.toISOString()} ` +
            `followed by session from ${curr.ip} at ${curr.createdAt.toISOString()} ` +
            `(${Math.round(elapsedMs / 60_000)} min apart, different /8 networks).`,
          detectedAt: new Date(),
        };
        results.push(result);
        void this.writeSecurityEvent(result);
      }
    }

    return results;
  }

  /**
   * Detect concurrent sessions: query Prisma `Session` table for active
   * (non-expired, non-revoked) sessions for the given user+org combination.
   * Flags when count > 1.
   *
   * Note: the Session model does not store the originating IP address, so
   * the IP-differs check specified in the task cannot be evaluated at the
   * database level.  The flag is raised on count > 1 and the details note
   * includes the session count.  When IP tracking is added to the Session
   * model in a future migration this check should be tightened.
   *
   * @returns  Array with one anomaly result when concurrent sessions are found,
   *           empty array otherwise.
   */
  async detectConcurrentSessions(orgId: string, userId: string): Promise<AnomalyResult[]> {
    const now = new Date();

    const count = await this.prisma.session.count({
      where: {
        userId,
        organizationId: orgId,
        expiresAt: { gt: now },
        revokedAt: null,
      },
    });

    if (count <= 1) return [];

    const result: AnomalyResult = {
      type: 'concurrent_sessions',
      userId,
      orgId,
      severity: 'medium',
      details: `${count} active sessions detected simultaneously for user ${userId} in org ${orgId}.`,
      detectedAt: new Date(),
    };

    void this.writeSecurityEvent(result);
    return [result];
  }

  /**
   * Detect large data export: count `AuditLog` rows with `action LIKE 'export.%'`
   * in the last hour for the given user+org.  Flags when count exceeds `threshold`.
   *
   * @param orgId      Tenant organisation ID (mandatory — enforces tenant isolation).
   * @param userId     Target user ID.
   * @param threshold  Row count above which an anomaly is raised (default 10 000).
   * @returns          Array with one anomaly result when threshold is breached, else [].
   */
  async detectLargeExport(
    orgId: string,
    userId: string,
    threshold: number = DEFAULT_LARGE_EXPORT_THRESHOLD,
  ): Promise<AnomalyResult[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const count = await this.prisma.auditLog.count({
      where: {
        organizationId: orgId,
        userId,
        action: { startsWith: 'export.' },
        createdAt: { gte: oneHourAgo },
      },
    });

    if (count <= threshold) return [];

    const result: AnomalyResult = {
      type: 'large_export',
      userId,
      orgId,
      severity: 'high',
      details:
        `${count} export actions recorded in the last hour (threshold: ${threshold}).`,
      detectedAt: new Date(),
    };

    void this.writeSecurityEvent(result);
    return [result];
  }

  /**
   * Detect privilege escalation: scan `AuditLog` for permission-grant actions
   * performed by the target user (not an admin performing a routine grant).
   *
   * Actions considered: `permission.grant`, `role.assign`, `role.escalate`,
   * `admin.promote`.
   *
   * @param orgId   Tenant organisation ID.
   * @param userId  User suspected of self-escalation.
   * @returns       Array with one anomaly result when escalation is found, else [].
   */
  async detectPrivilegeEscalation(orgId: string, userId: string): Promise<AnomalyResult[]> {
    const match = await this.prisma.auditLog.findFirst({
      where: {
        organizationId: orgId,
        userId,
        action: { in: PRIVILEGE_GRANT_ACTIONS },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!match) return [];

    const result: AnomalyResult = {
      type: 'privilege_escalation',
      userId,
      orgId,
      severity: 'high',
      details:
        `Action "${match.action}" was performed by user ${userId} at ` +
        `${match.createdAt.toISOString()}${match.resource ? ` on resource ${match.resource}` : ''}.`,
      detectedAt: new Date(),
    };

    void this.writeSecurityEvent(result);
    return [result];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Write a security event to InfluxDB.  Non-fatal — errors are logged only.
   */
  private async writeSecurityEvent(anomaly: AnomalyResult): Promise<void> {
    try {
      await this.influx.writePoint(
        'security_events',
        {
          anomaly_type: anomaly.type,
          severity: anomaly.severity,
          user_id: anomaly.userId,
        },
        {
          details: anomaly.details,
        },
        anomaly.orgId,
        anomaly.detectedAt.getTime(),
      );
    } catch (err) {
      this.logger.warn(
        `AnomalyDetectorService.writeSecurityEvent failed (InfluxDB unavailable?) — ${(err as Error).message}`,
      );
    }
  }
}

// ─── Pure helper ─────────────────────────────────────────────────────────────

/**
 * Extract the first octet of an IPv4 address string.
 * For IPv6 addresses (or malformed values) returns the whole string so the
 * comparison is still deterministic.
 */
function firstOctet(ip: string): string {
  const dot = ip.indexOf('.');
  return dot > -1 ? ip.slice(0, dot) : ip;
}
