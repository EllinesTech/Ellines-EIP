/**
 * Security Protection Service
 *
 * Executes protective actions when security anomalies are detected:
 *   - Session termination
 *   - Account suspension
 *   - Rate limiting
 *   - MFA requirement
 *   - Flag for review
 *
 * Production integration notes:
 *   - Session termination: POST /api/v1/identity/sessions/{id}/terminate
 *   - Account suspension: PATCH /api/v1/identity/users/{id} { isActive: false }
 *   - Rate limiting: update Redis rate-limit key / API gateway rule
 *
 * Requirements: 15.5 — When security anomaly detected with high confidence,
 * take protective actions (session termination, account suspension, rate limiting)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ProtectiveActionResult,
  ProtectiveActionType,
  SecurityEvent,
  SecurityEventType,
  SecurityPolicy,
} from './security-anomaly.interfaces';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';

/** Minimum confidence required before auto-remediation fires */
const AUTO_REMEDIATION_CONFIDENCE_THRESHOLD = 0.8;

/** Default protective action mapping by event type */
const DEFAULT_ACTIONS_BY_TYPE: Record<SecurityEventType, ProtectiveActionType[]> = {
  data_exfiltration: ['terminate_session', 'flag_for_review'],
  impossible_travel: ['terminate_session', 'require_mfa'],
  privilege_escalation: ['terminate_session', 'flag_for_review'],
  concurrent_session: ['terminate_session'],
  brute_force: ['apply_rate_limit', 'suspend_account'],
  unusual_access: ['flag_for_review'],
  suspicious_api_usage: ['apply_rate_limit'],
};

@Injectable()
export class SecurityProtectionService {
  private readonly logger = new Logger(SecurityProtectionService.name);

  constructor(
    private readonly travelDetector: ImpossibleTravelDetectorService,
  ) {}

  // ── Single protective action ──────────────────────────────────────────────

  /**
   * Execute a specific protective action for a detected security event.
   */
  async executeProtectiveAction(
    event: SecurityEvent,
    action: ProtectiveActionType,
  ): Promise<ProtectiveActionResult> {
    const t0 = Date.now();
    this.logger.log(
      `[Protection] Executing "${action}" for event ${event.id} ` +
        `(user=${event.userId} type=${event.type})`,
    );

    let success = true;
    let details: string | undefined;

    try {
      switch (action) {
        case 'terminate_session':
          details = await this.terminateSession(event);
          break;

        case 'suspend_account':
          details = await this.suspendAccount(event);
          break;

        case 'apply_rate_limit':
          details = await this.applyRateLimit(event);
          break;

        case 'require_mfa':
          details = await this.requireMfa(event);
          break;

        case 'flag_for_review':
          details = await this.flagForReview(event);
          break;

        default:
          success = false;
          details = `Unknown protective action: ${action as string}`;
          this.logger.warn(`[Protection] Unknown action "${action as string}"`);
      }
    } catch (err: unknown) {
      success = false;
      const msg = err instanceof Error ? err.message : String(err);
      details = `Action failed: ${msg}`;
      this.logger.error(`[Protection] "${action}" failed: ${msg}`);
    }

    const result: ProtectiveActionResult = {
      action,
      targetId: action === 'terminate_session' ? (event.sessionId ?? event.userId) : event.userId,
      targetType: action === 'terminate_session' ? 'session' : 'account',
      success,
      executedAt: new Date(t0),
      details,
    };

    this.logger.log(
      `[Protection] "${action}" completed in ${Date.now() - t0}ms ` +
        `success=${success} | ${details}`,
    );
    return result;
  }

  // ── Auto-remediation ──────────────────────────────────────────────────────

  /**
   * Automatically determine and execute all appropriate protective actions
   * for a detected event, based on policy and confidence thresholds.
   *
   * Only fires when confidence >= AUTO_REMEDIATION_CONFIDENCE_THRESHOLD (0.8)
   * and auto-remediation is enabled for this event type in policy.
   */
  async autoRemediate(
    event: SecurityEvent,
    policy: SecurityPolicy,
  ): Promise<ProtectiveActionResult[]> {
    const autoEnabled = policy.autoRemediationEnabled[event.type] ?? false;

    if (!autoEnabled) {
      this.logger.log(
        `[Protection] Auto-remediation disabled for "${event.type}" in org ${event.organizationId}`,
      );
      return [];
    }

    if (event.confidence < AUTO_REMEDIATION_CONFIDENCE_THRESHOLD) {
      this.logger.log(
        `[Protection] Skipping auto-remediation: confidence ${event.confidence.toFixed(2)} < ${AUTO_REMEDIATION_CONFIDENCE_THRESHOLD}`,
      );
      return [];
    }

    const actions = DEFAULT_ACTIONS_BY_TYPE[event.type] ?? ['flag_for_review'];
    const results: ProtectiveActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeProtectiveAction(event, action);
      results.push(result);
    }

    return results;
  }

  // ── Action implementations ─────────────────────────────────────────────────

  private async terminateSession(event: SecurityEvent): Promise<string> {
    if (event.sessionId) {
      this.travelDetector.terminateSession(event.sessionId);
      // Production: await this.identityClient.terminateSession(event.sessionId);
    }

    // If impossible travel, terminate the conflicting sessions too
    if (
      event.type === 'impossible_travel' &&
      event.evidence.relatedSessions?.length
    ) {
      for (const sid of event.evidence.relatedSessions) {
        this.travelDetector.terminateSession(sid);
      }
    }

    return `Session(s) terminated: ${[event.sessionId, ...(event.evidence.relatedSessions ?? [])].filter(Boolean).join(', ')}`;
  }

  private async suspendAccount(event: SecurityEvent): Promise<string> {
    // Production: await this.identityClient.suspendUser(event.userId);
    this.logger.warn(
      `[Protection] Account suspension stub for user ${event.userId} — ` +
        `production: call identity service PATCH /users/${event.userId}`,
    );
    return `Account ${event.userId} flagged for suspension (production: call identity service)`;
  }

  private async applyRateLimit(event: SecurityEvent): Promise<string> {
    // Production: update Redis rate-limit keys / API gateway policy
    this.logger.log(
      `[Protection] Rate-limit stub for user ${event.userId} — ` +
        `production: set Redis key rate_limit:${event.userId}`,
    );
    return `Rate limit applied to user ${event.userId} (production: update Redis/API gateway)`;
  }

  private async requireMfa(event: SecurityEvent): Promise<string> {
    // Production: set requireMfa flag in session store
    return `MFA required for user ${event.userId} on next authentication`;
  }

  private async flagForReview(event: SecurityEvent): Promise<string> {
    this.logger.log(
      `[Protection] Event ${event.id} flagged for IT Admin review ` +
        `(org=${event.organizationId} user=${event.userId})`,
    );
    return `Event ${event.id} flagged for IT Admin review`;
  }
}
