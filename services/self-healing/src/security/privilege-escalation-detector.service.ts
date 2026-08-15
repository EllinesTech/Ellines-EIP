/**
 * Privilege Escalation Detector Service
 *
 * Detects privilege escalation attempts and unauthorized permission changes.
 * Checks attempted endpoint access against the user's role-defined allowed prefixes.
 *
 * Requirements: 15.4 — Detect privilege escalation attempts and unauthorized
 * permission changes.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SecurityEvent,
  SecuritySeverity,
  UserSession,
} from './security-anomaly.interfaces';

/** Endpoint prefixes accessible by role */
const ROLE_ENDPOINT_MAP: Record<string, string[]> = {
  platform_admin: ['/'],
  it_admin: ['/app/', '/api/v1/', '/api/v1/admin/'],
  owner: ['/app/', '/api/v1/'],
  executive: ['/app/', '/api/v1/reports/', '/api/v1/analytics/'],
  manager: ['/app/', '/api/v1/team/'],
  member: ['/app/'],
  staff: ['/app/'],
};

/** Endpoint segments that trigger higher suspicion */
const HIGH_SENSITIVITY_PATTERNS = [
  '/platform',
  '/super-admin',
  '/admin/global',
  '/settings/global',
  '/users/impersonate',
  '/debug',
  '/internal',
];

const MEDIUM_SENSITIVITY_PATTERNS = [
  '/admin',
  '/settings',
  '/billing',
  '/audit-logs',
];

@Injectable()
export class PrivilegeEscalationDetectorService {
  private readonly logger = new Logger(PrivilegeEscalationDetectorService.name);

  /** Track recent escalation attempts per user to detect patterns */
  private readonly recentAttempts = new Map<
    string,
    Array<{ endpoint: string; timestamp: Date }>
  >();

  // ── Detection ─────────────────────────────────────────────────────────────

  /**
   * Detect whether a user is attempting to access an endpoint outside
   * their role's allowed scope.
   *
   * @param userId           Subject user
   * @param organizationId   Organisation context
   * @param sessionId        Current session (may be undefined)
   * @param attemptedEndpoint  The endpoint path attempted
   * @param userRole         The user's current assigned role
   */
  detect(
    userId: string,
    organizationId: string,
    sessionId: string | undefined,
    attemptedEndpoint: string,
    userRole: string,
  ): SecurityEvent | null {
    const allowedPrefixes = this.getAllowedPrefixes(userRole);
    const normalizedEndpoint = attemptedEndpoint.toLowerCase().split('?')[0];

    const isAllowed = allowedPrefixes.some((prefix) =>
      normalizedEndpoint.startsWith(prefix),
    );

    if (isAllowed) return null;

    // Track the attempt
    this.trackAttempt(userId, attemptedEndpoint);

    const confidence = this.computeConfidence(normalizedEndpoint, userRole, userId);
    const severity: SecuritySeverity = confidence >= 0.9 ? 'critical' : 'high';

    const recentAttempts = this.recentAttempts.get(userId) ?? [];
    const repeatedAttempts = recentAttempts.filter(
      (a) =>
        a.endpoint === attemptedEndpoint &&
        Date.now() - a.timestamp.getTime() < 10 * 60 * 1000,
    ).length;

    const session: UserSession = {
      sessionId: sessionId ?? `no_session_${userId}`,
      userId,
      organizationId,
      ipAddress: 'unknown',
      countryCode: 'unknown',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      requestCount: 1,
      dataAccessedBytes: 0,
      exportVolumeBytes: 0,
      endpointsAccessed: [attemptedEndpoint],
      isActive: true,
    };

    const event: SecurityEvent = {
      id: `privesc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId,
      userId,
      sessionId: session.sessionId,
      type: 'privilege_escalation',
      severity,
      confidence: Math.min(confidence + 0.05 * repeatedAttempts, 0.99),
      evidence: {
        description:
          `User with role "${userRole}" attempted to access restricted endpoint "${attemptedEndpoint}"` +
          (repeatedAttempts > 1
            ? ` (${repeatedAttempts} repeated attempts in last 10 minutes)`
            : ''),
        data: {
          attemptedEndpoint,
          userRole,
          allowedPrefixes,
          repeatedAttempts,
          isSensitiveEndpoint:
            HIGH_SENSITIVITY_PATTERNS.some((p) => normalizedEndpoint.includes(p)) ||
            MEDIUM_SENSITIVITY_PATTERNS.some((p) => normalizedEndpoint.includes(p)),
        },
        observed: { attemptedEndpoint, repeatedAttempts },
      },
      timestamp: new Date(),
      resolved: false,
    };

    this.logger.warn(
      `[PrivEsc] user=${userId} org=${organizationId} role=${userRole} ` +
        `endpoint=${attemptedEndpoint} conf=${confidence.toFixed(2)} severity=${severity} ` +
        `repeats=${repeatedAttempts}`,
    );
    return event;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getAllowedPrefixes(role: string): string[] {
    return ROLE_ENDPOINT_MAP[role.toLowerCase()] ?? ['/app/'];
  }

  private computeConfidence(endpoint: string, _role: string, _userId: string): number {
    if (HIGH_SENSITIVITY_PATTERNS.some((p) => endpoint.includes(p))) return 0.95;
    if (MEDIUM_SENSITIVITY_PATTERNS.some((p) => endpoint.includes(p))) return 0.85;
    return 0.75;
  }

  private trackAttempt(userId: string, endpoint: string): void {
    const attempts = this.recentAttempts.get(userId) ?? [];
    attempts.push({ endpoint, timestamp: new Date() });

    // Prune old attempts (keep last 60 minutes)
    const cutoff = Date.now() - 60 * 60 * 1000;
    const pruned = attempts.filter((a) => a.timestamp.getTime() > cutoff);

    // Limit to 100 stored attempts per user
    this.recentAttempts.set(userId, pruned.slice(-100));
  }

  /** Get recent privilege escalation attempts for a user */
  getRecentAttempts(
    userId: string,
    windowMinutes = 60,
  ): Array<{ endpoint: string; timestamp: Date }> {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    return (this.recentAttempts.get(userId) ?? []).filter(
      (a) => a.timestamp.getTime() > cutoff,
    );
  }

  /** Expose the role endpoint map (for policy UI) */
  getRoleEndpointMap(): Record<string, string[]> {
    return { ...ROLE_ENDPOINT_MAP };
  }
}
