/**
 * Security Anomaly Detector Service
 *
 * Detects security threats: data exfiltration, impossible travel, privilege
 * escalation, and unusual access patterns. Issues protective actions via
 * in-memory stub (production: call Identity service REST API).
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  UserBehaviorBaseline,
  UserSession,
  SecurityEvent,
  SecurityEventType,
  SecuritySeverity,
  SecurityPolicy,
  SecurityIncidentReport,
  ProtectiveActionResult,
  ProtectiveActionType,
  DEFAULT_SECURITY_POLICY,
} from './security-anomaly.interfaces';

// ── In-memory stubs (no Prisma models defined for security events yet) ──────

@Injectable()
export class SecurityAnomalyDetectorService {
  private readonly logger = new Logger(SecurityAnomalyDetectorService.name);

  /** In-memory behavior baselines keyed by userId */
  private readonly baselines = new Map<string, UserBehaviorBaseline>();

  /** In-memory active sessions keyed by sessionId */
  private readonly activeSessions = new Map<string, UserSession>();

  /** Security events log (in-memory) */
  private readonly securityEvents: SecurityEvent[] = [];

  /** Per-org policy overrides */
  private readonly policies = new Map<string, SecurityPolicy>();

  // ── Behavior Profiling (Req 15.7) ────────────────────────────────────────

  /**
   * Update the behavior baseline for a user after a completed session.
   * Uses exponential moving average (EMA) to incorporate new observations.
   */
  updateBaseline(session: UserSession, role: string, department: string): void {
    const existing = this.baselines.get(session.userId);
    const alpha = 0.2; // EMA smoothing factor

    if (!existing) {
      const baseline: UserBehaviorBaseline = {
        userId: session.userId,
        organizationId: session.organizationId,
        role,
        department,
        avgRequestsPerSession: session.requestCount,
        avgDataAccessedBytes: session.dataAccessedBytes,
        avgExportVolumeBytes: session.exportVolumeBytes,
        typicalActiveHours: this.extractActiveHours(session),
        typicalCountries: [session.countryCode],
        frequentEndpoints: session.endpointsAccessed.slice(0, 10),
        sampleCount: 1,
        updatedAt: new Date(),
      };
      this.baselines.set(session.userId, baseline);
      this.logger.debug(`Created baseline for user ${session.userId}`);
      return;
    }

    // EMA update
    existing.avgRequestsPerSession =
      alpha * session.requestCount + (1 - alpha) * existing.avgRequestsPerSession;
    existing.avgDataAccessedBytes =
      alpha * session.dataAccessedBytes + (1 - alpha) * existing.avgDataAccessedBytes;
    existing.avgExportVolumeBytes =
      alpha * session.exportVolumeBytes + (1 - alpha) * existing.avgExportVolumeBytes;

    // Add country if not seen before
    if (!existing.typicalCountries.includes(session.countryCode)) {
      existing.typicalCountries.push(session.countryCode);
    }

    // Merge active hours
    const newHours = this.extractActiveHours(session);
    for (const h of newHours) {
      if (!existing.typicalActiveHours.includes(h)) {
        existing.typicalActiveHours.push(h);
      }
    }

    existing.sampleCount++;
    existing.updatedAt = new Date();
    this.logger.debug(`Updated baseline for user ${session.userId} (samples=${existing.sampleCount})`);
  }

  getBaseline(userId: string): UserBehaviorBaseline | null {
    return this.baselines.get(userId) ?? null;
  }

  // ── Session Management ────────────────────────────────────────────────────

  registerSession(session: UserSession): void {
    this.activeSessions.set(session.sessionId, session);
  }

  updateSession(sessionId: string, updates: Partial<UserSession>): void {
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      Object.assign(existing, updates);
    }
  }

  terminateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
    }
  }

  getActiveSessions(userId: string): UserSession[] {
    return Array.from(this.activeSessions.values()).filter(
      (s) => s.userId === userId && s.isActive,
    );
  }

  // ── Detection Methods ─────────────────────────────────────────────────────

  /**
   * Req 15.2: Detect data exfiltration — flag when download/export volume
   * exceeds exfiltrationThresholdMultiplier × role baseline in a session.
   */
  async detectDataExfiltration(
    session: UserSession,
  ): Promise<SecurityEvent | null> {
    const baseline = this.baselines.get(session.userId);
    if (!baseline || baseline.sampleCount < 3) return null; // need enough samples

    const policy = this.getEffectivePolicy(session.organizationId);
    const threshold =
      baseline.avgExportVolumeBytes * policy.exfiltrationThresholdMultiplier;

    if (session.exportVolumeBytes <= threshold) return null;

    const confidence = Math.min(
      0.6 + 0.4 * ((session.exportVolumeBytes - threshold) / threshold),
      1.0,
    );

    const event = this.createEvent(session, 'data_exfiltration', 'high', confidence, {
      description: `Export volume ${this.formatBytes(session.exportVolumeBytes)} exceeds ${policy.exfiltrationThresholdMultiplier}x baseline (${this.formatBytes(baseline.avgExportVolumeBytes)})`,
      data: {
        exportVolumeBytes: session.exportVolumeBytes,
        baselineBytes: baseline.avgExportVolumeBytes,
        multiplier: session.exportVolumeBytes / Math.max(baseline.avgExportVolumeBytes, 1),
      },
    });

    this.securityEvents.push(event);
    this.logger.warn(`[Exfiltration] user=${session.userId} vol=${this.formatBytes(session.exportVolumeBytes)} conf=${confidence.toFixed(2)}`);
    return event;
  }

  /**
   * Req 15.3: Detect impossible travel — concurrent active sessions from IPs
   * in different countries within the configured time window.
   */
  async detectImpossibleTravel(session: UserSession): Promise<SecurityEvent | null> {
    const policy = this.getEffectivePolicy(session.organizationId);
    const windowMs = policy.impossibleTravelWindowHours * 60 * 60 * 1000;

    const otherSessions = this.getActiveSessions(session.userId).filter(
      (s) =>
        s.sessionId !== session.sessionId &&
        s.isActive &&
        Math.abs(s.lastActivityAt.getTime() - session.lastActivityAt.getTime()) <= windowMs,
    );

    for (const other of otherSessions) {
      if (other.countryCode !== session.countryCode) {
        const event = this.createEvent(
          session,
          'impossible_travel',
          'critical',
          0.95,
          {
            description: `Concurrent sessions from ${other.countryCode} (${other.sessionId}) and ${session.countryCode} (${session.sessionId}) within ${policy.impossibleTravelWindowHours}h`,
            data: {
              session1: { id: session.sessionId, country: session.countryCode, ip: session.ipAddress },
              session2: { id: other.sessionId, country: other.countryCode, ip: other.ipAddress },
            },
            relatedSessions: [other.sessionId],
          },
        );
        this.securityEvents.push(event);
        this.logger.warn(`[ImpossibleTravel] user=${session.userId} countries=[${other.countryCode},${session.countryCode}]`);
        return event;
      }
    }
    return null;
  }

  /**
   * Req 15.4: Detect privilege escalation — attempts to access endpoints
   * beyond the user's role level.
   */
  detectPrivilegeEscalation(
    userId: string,
    organizationId: string,
    sessionId: string,
    attemptedEndpoint: string,
    userRole: string,
  ): SecurityEvent | null {
    const allowedPrefixes = this.getAllowedEndpointPrefixes(userRole);
    const isAllowed = allowedPrefixes.some((prefix) =>
      attemptedEndpoint.startsWith(prefix),
    );

    if (isAllowed) return null;

    const confidence = this.getPrivEscConfidence(attemptedEndpoint, userRole);
    const severity: SecuritySeverity = confidence >= 0.9 ? 'critical' : 'high';

    const session = this.activeSessions.get(sessionId);
    const fakeSession: UserSession = session ?? {
      sessionId,
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

    const event = this.createEvent(fakeSession, 'privilege_escalation', severity, confidence, {
      description: `User with role "${userRole}" attempted to access restricted endpoint "${attemptedEndpoint}"`,
      data: {
        attemptedEndpoint,
        userRole,
        allowedPrefixes,
      },
    });

    this.securityEvents.push(event);
    this.logger.warn(`[PrivEsc] user=${userId} role=${userRole} endpoint=${attemptedEndpoint} conf=${confidence.toFixed(2)}`);
    return event;
  }

  /**
   * Req 15.1: Detect unusual access — access patterns deviating significantly
   * from the user's established baseline.
   */
  async detectUnusualAccess(session: UserSession): Promise<SecurityEvent | null> {
    const baseline = this.baselines.get(session.userId);
    if (!baseline || baseline.sampleCount < 5) return null;

    const requestDeviation =
      session.requestCount / Math.max(baseline.avgRequestsPerSession, 1);
    const dataDeviation =
      session.dataAccessedBytes / Math.max(baseline.avgDataAccessedBytes, 1);

    const policy = this.getEffectivePolicy(session.organizationId);
    const deviationThreshold = 1 + policy.anomalySensitivity * 4; // 1.0–5.0x

    if (requestDeviation <= deviationThreshold && dataDeviation <= deviationThreshold) {
      return null;
    }

    const maxDeviation = Math.max(requestDeviation, dataDeviation);
    const confidence = Math.min(0.5 + 0.1 * (maxDeviation - deviationThreshold), 0.95);
    const severity: SecuritySeverity = confidence >= 0.8 ? 'high' : 'medium';

    const event = this.createEvent(session, 'unusual_access', severity, confidence, {
      description: `Access pattern deviates from baseline: ${requestDeviation.toFixed(1)}x requests, ${dataDeviation.toFixed(1)}x data`,
      data: {
        requestDeviation,
        dataDeviation,
        baselineRequests: baseline.avgRequestsPerSession,
        observedRequests: session.requestCount,
        baselineDataBytes: baseline.avgDataAccessedBytes,
        observedDataBytes: session.dataAccessedBytes,
      },
      baseline,
    });

    this.securityEvents.push(event);
    this.logger.warn(`[UnusualAccess] user=${session.userId} req-dev=${requestDeviation.toFixed(2)} data-dev=${dataDeviation.toFixed(2)}`);
    return event;
  }

  /**
   * Run all detectors for a session and return detected events.
   */
  async analyzeSession(
    session: UserSession,
  ): Promise<SecurityEvent[]> {
    const detectedEvents: SecurityEvent[] = [];

    const [exfil, travel, unusual] = await Promise.all([
      this.detectDataExfiltration(session),
      this.detectImpossibleTravel(session),
      this.detectUnusualAccess(session),
    ]);

    if (exfil) detectedEvents.push(exfil);
    if (travel) detectedEvents.push(travel);
    if (unusual) detectedEvents.push(unusual);

    return detectedEvents;
  }

  // ── Protective Actions (Req 15.5) ─────────────────────────────────────────

  /**
   * Req 15.5: When a security anomaly is detected with high confidence,
   * execute protective actions (session termination, account suspension,
   * rate limiting).
   */
  async executeProtectiveAction(
    event: SecurityEvent,
    action: ProtectiveActionType,
  ): Promise<ProtectiveActionResult> {
    const t0 = Date.now();
    this.logger.log(`Executing protective action "${action}" for event ${event.id} (user=${event.userId})`);

    let success = true;
    let details: string | undefined;

    try {
      switch (action) {
        case 'terminate_session':
          if (event.sessionId) {
            this.terminateSession(event.sessionId);
            // Production: POST /api/v1/identity/sessions/{id}/terminate
          }
          details = `Session ${event.sessionId ?? 'all'} terminated`;
          break;

        case 'suspend_account':
          // Production: PATCH /api/v1/identity/users/{userId} { isActive: false }
          details = `Account ${event.userId} flagged for suspension (stub)`;
          this.logger.warn(`Account suspension for ${event.userId} — production: call identity service`);
          break;

        case 'apply_rate_limit':
          // Production: update rate-limit policy in Redis / API gateway
          details = `Rate limit applied to user ${event.userId}`;
          this.logger.log(`Rate limiting ${event.userId} — production: call rate-limit service`);
          break;

        case 'flag_for_review':
          details = `Event ${event.id} flagged for IT Admin review`;
          break;

        case 'require_mfa':
          // Production: set requireMfa flag in user session store
          details = `MFA required for user ${event.userId} on next request`;
          break;

        default:
          success = false;
          details = `Unknown protective action: ${action as string}`;
      }
    } catch (err: any) {
      success = false;
      details = `Action failed: ${err?.message}`;
      this.logger.error(`Protective action ${action} failed: ${err?.message}`);
    }

    const result: ProtectiveActionResult = {
      action,
      targetId: event.sessionId ?? event.userId,
      targetType: action === 'terminate_session' ? 'session' : 'account',
      success,
      executedAt: new Date(t0),
      details,
    };

    this.logger.log(`Protective action "${action}" completed in ${Date.now() - t0}ms — success=${success}`);
    return result;
  }

  /**
   * Automatically determine and execute protective actions based on event type
   * and policy configuration. Requires confidence >= 0.8 for auto-remediation.
   */
  async autoRemediate(event: SecurityEvent): Promise<ProtectiveActionResult[]> {
    const policy = this.getEffectivePolicy(event.organizationId);
    const enabled = policy.autoRemediationEnabled[event.type];

    if (!enabled || event.confidence < 0.8) {
      this.logger.log(`Auto-remediation skipped for ${event.type} (enabled=${enabled}, confidence=${event.confidence})`);
      return [];
    }

    const actionsForType: Record<SecurityEventType, ProtectiveActionType[]> = {
      data_exfiltration: ['terminate_session', 'flag_for_review'],
      impossible_travel: ['terminate_session', 'require_mfa'],
      privilege_escalation: ['terminate_session', 'flag_for_review'],
      concurrent_session: ['terminate_session'],
      brute_force: ['apply_rate_limit', 'suspend_account'],
      unusual_access: ['flag_for_review'],
      suspicious_api_usage: ['apply_rate_limit'],
    };

    const actions = actionsForType[event.type] ?? ['flag_for_review'];
    const results: ProtectiveActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeProtectiveAction(event, action);
      results.push(result);
    }

    return results;
  }

  // ── Incident Report (Req 15.6) ────────────────────────────────────────────

  /**
   * Req 15.6: Generate a structured security incident report.
   */
  generateIncidentReport(
    event: SecurityEvent,
    protectiveActions: ProtectiveActionResult[],
  ): SecurityIncidentReport {
    const recommendations = this.buildRecommendations(event);

    const report: SecurityIncidentReport = {
      incidentId: `sec_inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      organizationId: event.organizationId,
      userId: event.userId,
      eventType: event.type,
      severity: event.severity,
      confidence: event.confidence,
      evidence: event.evidence,
      protectiveActionsTaken: protectiveActions,
      recommendedActions: recommendations,
      timestamp: event.timestamp,
      summary: this.buildSummaryText(event, protectiveActions, recommendations),
    };

    this.logger.log(`Generated security incident report ${report.incidentId} for event ${event.id}`);
    return report;
  }

  // ── Policy Management (Req 15.8) ─────────────────────────────────────────

  setPolicy(organizationId: string, policy: Partial<SecurityPolicy>): SecurityPolicy {
    const current = this.getEffectivePolicy(organizationId);
    const updated: SecurityPolicy = {
      ...current,
      ...policy,
      organizationId,
      updatedAt: new Date(),
    };
    this.policies.set(organizationId, updated);
    this.logger.log(`Security policy updated for org ${organizationId}`);
    return updated;
  }

  getEffectivePolicy(organizationId: string): SecurityPolicy {
    const override = this.policies.get(organizationId);
    if (override) return override;
    return {
      ...DEFAULT_SECURITY_POLICY,
      organizationId,
      updatedAt: new Date(0),
    };
  }

  // ── Query Interface ───────────────────────────────────────────────────────

  getSecurityEvents(
    organizationId: string,
    options?: { limit?: number; unresolved?: boolean },
  ): SecurityEvent[] {
    let events = this.securityEvents.filter(
      (e) => e.organizationId === organizationId,
    );
    if (options?.unresolved) {
      events = events.filter((e) => !e.resolved);
    }
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, options?.limit ?? 50);
  }

  resolveEvent(eventId: string): boolean {
    const event = this.securityEvents.find((e) => e.id === eventId);
    if (!event) return false;
    event.resolved = true;
    event.resolvedAt = new Date();
    return true;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private createEvent(
    session: UserSession,
    type: SecurityEventType,
    severity: SecuritySeverity,
    confidence: number,
    evidence: { description: string; data: Record<string, unknown>; relatedSessions?: string[]; baseline?: unknown; observed?: Record<string, unknown> },
  ): SecurityEvent {
    return {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      organizationId: session.organizationId,
      userId: session.userId,
      sessionId: session.sessionId,
      type,
      severity,
      confidence,
      evidence: {
        description: evidence.description,
        data: evidence.data,
        relatedSessions: evidence.relatedSessions,
        baseline: evidence.baseline as Partial<UserBehaviorBaseline> | undefined,
        observed: evidence.observed,
      },
      timestamp: new Date(),
      resolved: false,
    };
  }

  private extractActiveHours(session: UserSession): number[] {
    return [session.startedAt.getHours()];
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  /** Endpoint prefixes accessible by each role */
  private getAllowedEndpointPrefixes(role: string): string[] {
    const prefixMap: Record<string, string[]> = {
      platform_admin: ['/'],
      owner: ['/app/', '/api/v1/'],
      it_admin: ['/app/', '/api/v1/', '/api/v1/admin/'],
      executive: ['/app/'],
      manager: ['/app/'],
      member: ['/app/'],
      staff: ['/app/'],
    };
    return prefixMap[role] ?? ['/app/'];
  }

  private getPrivEscConfidence(endpoint: string, _role: string): number {
    // Platform admin and super admin endpoints are highly sensitive
    if (endpoint.includes('/platform') || endpoint.includes('/super-admin')) return 0.95;
    if (endpoint.includes('/admin') || endpoint.includes('/settings/global')) return 0.85;
    return 0.75;
  }

  private buildRecommendations(event: SecurityEvent): string[] {
    const recommendations: string[] = [];

    switch (event.type) {
      case 'data_exfiltration':
        recommendations.push('Review exported data for sensitive content');
        recommendations.push('Check if user has legitimate business reason for large export');
        recommendations.push('Consider enabling DLP (Data Loss Prevention) controls');
        break;
      case 'impossible_travel':
        recommendations.push('Contact the user to verify their current location');
        recommendations.push('Check if VPN or proxy usage might explain the discrepancy');
        recommendations.push('Consider requiring re-authentication from new location');
        recommendations.push('Review session logs for suspicious activity');
        break;
      case 'privilege_escalation':
        recommendations.push('Review user role and verify current permissions are appropriate');
        recommendations.push('Check if endpoint access was attempted repeatedly');
        recommendations.push('Audit recent changes to user permissions');
        break;
      case 'unusual_access':
        recommendations.push('Verify user identity and confirm access was authorized');
        recommendations.push('Review accessed data for potential data exfiltration');
        break;
      case 'brute_force':
        recommendations.push('Reset user credentials immediately');
        recommendations.push('Enable account lockout after failed attempts');
        recommendations.push('Check for additional compromised accounts');
        break;
      default:
        recommendations.push('Review activity logs and verify user intent');
        recommendations.push('Consider contacting the user for verification');
    }

    return recommendations;
  }

  private buildSummaryText(
    event: SecurityEvent,
    actions: ProtectiveActionResult[],
    recommendations: string[],
  ): string {
    const actionsText = actions.length
      ? `Protective actions taken: ${actions.map((a) => a.action).join(', ')}.`
      : 'No automatic protective actions were taken.';

    return (
      `Security Incident — ${event.type.replace(/_/g, ' ').toUpperCase()} ` +
      `[${event.severity.toUpperCase()}] — Confidence: ${(event.confidence * 100).toFixed(0)}%\n` +
      `User: ${event.userId} | Time: ${event.timestamp.toISOString()}\n` +
      `Evidence: ${event.evidence.description}\n` +
      `${actionsText}\n` +
      `Top recommendation: ${recommendations[0] ?? 'Review manually.'}`
    );
  }
}
