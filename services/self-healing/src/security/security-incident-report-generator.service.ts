/**
 * Security Incident Report Generator Service
 *
 * Produces structured security incident reports with:
 *   - Evidence and timeline
 *   - Severity classification
 *   - Protective actions taken
 *   - Recommended remediation steps
 *
 * Requirements: 15.6 — Generate security incident reports with evidence
 * and recommended remediation.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ProtectiveActionResult,
  SecurityEvent,
  SecurityEventType,
  SecurityIncidentReport,
} from './security-anomaly.interfaces';

/** Extended report with rich timeline and structured remediation guidance */
export interface EnrichedSecurityIncidentReport extends SecurityIncidentReport {
  /** Ordered timeline of events, evidence, and actions */
  timeline: TimelineEntry[];
  /** Structured remediation guide grouped by urgency */
  remediationPlan: RemediationPlan;
  /** Exportable JSON payload */
  exportPayload: Record<string, unknown>;
}

export interface TimelineEntry {
  timestamp: Date;
  type: 'detection' | 'evidence' | 'action' | 'note';
  description: string;
  actor?: string;
}

export interface RemediationPlan {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
}

@Injectable()
export class SecurityIncidentReportGeneratorService {
  private readonly logger = new Logger(SecurityIncidentReportGeneratorService.name);

  /** In-memory report store (production: persist to DB) */
  private readonly reports = new Map<string, EnrichedSecurityIncidentReport>();

  // ── Report generation ─────────────────────────────────────────────────────

  /**
   * Generate a comprehensive security incident report from a detected event
   * and any protective actions that were taken.
   */
  generate(
    event: SecurityEvent,
    protectiveActions: ProtectiveActionResult[],
  ): EnrichedSecurityIncidentReport {
    const incidentId = `sec_inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const recommendations = this.buildRecommendations(event);
    const remediationPlan = this.buildRemediationPlan(event);
    const timeline = this.buildTimeline(event, protectiveActions);
    const summary = this.buildSummary(event, protectiveActions, recommendations);

    const report: EnrichedSecurityIncidentReport = {
      incidentId,
      organizationId: event.organizationId,
      userId: event.userId,
      eventType: event.type,
      severity: event.severity,
      confidence: event.confidence,
      evidence: event.evidence,
      protectiveActionsTaken: protectiveActions,
      recommendedActions: recommendations,
      timestamp: event.timestamp,
      summary,
      timeline,
      remediationPlan,
      exportPayload: this.buildExportPayload(
        incidentId,
        event,
        protectiveActions,
        recommendations,
        remediationPlan,
        timeline,
        summary,
      ),
    };

    this.reports.set(incidentId, report);

    this.logger.log(
      `[ReportGen] Generated report ${incidentId} ` +
        `(org=${event.organizationId} user=${event.userId} type=${event.type} ` +
        `severity=${event.severity} confidence=${(event.confidence * 100).toFixed(0)}%)`,
    );
    return report;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getReport(incidentId: string): EnrichedSecurityIncidentReport | null {
    return this.reports.get(incidentId) ?? null;
  }

  listReports(
    organizationId: string,
    options?: { limit?: number; eventType?: SecurityEventType },
  ): EnrichedSecurityIncidentReport[] {
    let results = Array.from(this.reports.values()).filter(
      (r) => r.organizationId === organizationId,
    );
    if (options?.eventType) {
      results = results.filter((r) => r.eventType === options.eventType);
    }
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return results.slice(0, options?.limit ?? 50);
  }

  // ── Private builders ──────────────────────────────────────────────────────

  private buildTimeline(
    event: SecurityEvent,
    actions: ProtectiveActionResult[],
  ): TimelineEntry[] {
    const entries: TimelineEntry[] = [
      {
        timestamp: event.timestamp,
        type: 'detection',
        description: `Security anomaly detected: ${event.type.replace(/_/g, ' ')} [${event.severity.toUpperCase()}]`,
        actor: 'AnomalyDetectionEngine',
      },
      {
        timestamp: event.timestamp,
        type: 'evidence',
        description: event.evidence.description,
        actor: 'AnomalyDetectionEngine',
      },
    ];

    for (const action of actions) {
      entries.push({
        timestamp: action.executedAt,
        type: 'action',
        description: `Protective action executed: ${action.action.replace(/_/g, ' ')} → ${action.success ? 'SUCCESS' : 'FAILED'}${action.details ? ' | ' + action.details : ''}`,
        actor: 'SecurityProtectionService',
      });
    }

    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return entries;
  }

  private buildRecommendations(event: SecurityEvent): string[] {
    const rec: string[] = [];

    switch (event.type) {
      case 'data_exfiltration':
        rec.push('Review exported data for sensitive content classification');
        rec.push('Verify user has a legitimate business reason for the large export');
        rec.push('Consider enabling DLP (Data Loss Prevention) controls');
        rec.push('Audit all export logs for this user in the last 30 days');
        break;

      case 'impossible_travel':
        rec.push('Contact the user immediately to verify their current location');
        rec.push('Check whether VPN or proxy usage might explain the geographic discrepancy');
        rec.push('Require re-authentication and fresh MFA from the new location before granting access');
        rec.push('Review all actions taken in both conflicting sessions');
        rec.push('Rotate the user\'s credentials as a precaution');
        break;

      case 'privilege_escalation':
        rec.push('Review the user\'s assigned role and verify permissions are appropriate');
        rec.push('Check if endpoint access was attempted repeatedly (potential automated attack)');
        rec.push('Audit recent permission changes for this user account');
        rec.push('Enable strict endpoint-level access control (RBAC) enforcement');
        break;

      case 'unusual_access':
        rec.push('Verify user identity and confirm access intent was legitimate');
        rec.push('Review accessed resources for potential data exfiltration risk');
        rec.push('Consider enforcing stricter session timeouts during off-hours');
        break;

      case 'brute_force':
        rec.push('Reset user credentials immediately');
        rec.push('Enable account lockout after N failed attempts in policy');
        rec.push('Check for additional compromised accounts with similar patterns');
        rec.push('Enable CAPTCHA or adaptive authentication for the affected endpoint');
        break;

      case 'concurrent_session':
        rec.push('Terminate duplicate sessions and force re-authentication');
        rec.push('Check if the user explicitly shared credentials with another person');
        break;

      default:
        rec.push('Review full activity logs for the affected user and session');
        rec.push('Contact the user to confirm intent and verify identity');
    }

    return rec;
  }

  private buildRemediationPlan(event: SecurityEvent): RemediationPlan {
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const longTerm: string[] = [];

    // Immediate actions (within minutes)
    if (event.severity === 'critical' || event.severity === 'high') {
      immediate.push('Terminate suspicious sessions');
      immediate.push('Notify IT Admin and Security team');
    }
    if (event.type === 'impossible_travel' || event.type === 'brute_force') {
      immediate.push('Reset user credentials');
    }

    // Short-term actions (within 24 hours)
    shortTerm.push('Conduct full audit of affected user activities');
    shortTerm.push('Review organization-wide access logs for similar patterns');
    if (event.type === 'data_exfiltration') {
      shortTerm.push('Classify exported data and assess breach scope');
    }
    if (event.type === 'privilege_escalation') {
      shortTerm.push('Audit and tighten RBAC policy for affected endpoints');
    }

    // Long-term actions (within 1–4 weeks)
    longTerm.push('Update security policy sensitivity thresholds based on incident');
    longTerm.push('Add detection rules for newly identified attack pattern');
    longTerm.push('Conduct security awareness training relevant to incident type');
    if (event.type === 'data_exfiltration') {
      longTerm.push('Implement DLP (Data Loss Prevention) controls');
    }
    if (event.type === 'privilege_escalation') {
      longTerm.push('Implement Zero Trust access model with least-privilege enforcement');
    }

    return { immediate, shortTerm, longTerm };
  }

  private buildSummary(
    event: SecurityEvent,
    actions: ProtectiveActionResult[],
    recommendations: string[],
  ): string {
    const successfulActions = actions.filter((a) => a.success);
    const actionsText =
      successfulActions.length > 0
        ? `Protective actions taken: ${successfulActions.map((a) => a.action.replace(/_/g, ' ')).join(', ')}.`
        : 'No automatic protective actions were taken.';

    return (
      `SECURITY INCIDENT — ${event.type.replace(/_/g, ' ').toUpperCase()}\n` +
      `Severity: ${event.severity.toUpperCase()} | Confidence: ${(event.confidence * 100).toFixed(0)}%\n` +
      `User: ${event.userId} | Organization: ${event.organizationId}\n` +
      `Detected: ${event.timestamp.toISOString()}\n\n` +
      `Evidence: ${event.evidence.description}\n\n` +
      `${actionsText}\n\n` +
      `Primary recommendation: ${recommendations[0] ?? 'Review manually.'}`
    );
  }

  private buildExportPayload(
    incidentId: string,
    event: SecurityEvent,
    actions: ProtectiveActionResult[],
    recommendations: string[],
    remediationPlan: RemediationPlan,
    timeline: TimelineEntry[],
    summary: string,
  ): Record<string, unknown> {
    return {
      schema: 'ellines_eip_security_incident/v1',
      incidentId,
      generatedAt: new Date().toISOString(),
      event: {
        id: event.id,
        type: event.type,
        severity: event.severity,
        confidence: event.confidence,
        timestamp: event.timestamp.toISOString(),
        organizationId: event.organizationId,
        userId: event.userId,
        sessionId: event.sessionId,
        evidence: event.evidence,
      },
      protectiveActions: actions.map((a) => ({
        ...a,
        executedAt: a.executedAt.toISOString(),
      })),
      recommendations,
      remediationPlan,
      timeline: timeline.map((t) => ({
        ...t,
        timestamp: t.timestamp.toISOString(),
      })),
      summary,
    };
  }
}
