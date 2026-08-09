/**
 * Remediation Policy Service
 *
 * Manages per-organization auto-remediation policies:
 * allowed actions, confidence thresholds, escalation rules, and blacklists.
 *
 * Requirement 5.8: Organization IT Admin configures auto-remediation policies.
 */

import { Injectable, Logger } from '@nestjs/common';

// ── Domain interfaces ──────────────────────────────────────────────────────

export type ActionType = 'restart' | 'cache_clear' | 'pool_reset' | 'rate_limit' | 'rollback' | 'scale_up';

export interface EscalationRule {
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Maximum remediation attempts before escalating */
  maxAttempts: number;
  /** Escalate if not resolved within this many minutes */
  escalateAfterMinutes: number;
  /** User IDs / role names to notify */
  notifyTargets: string[];
}

export interface RemediationPolicy {
  organizationId: string;
  /** Which action types are permitted for auto-execution */
  allowedActions: ActionType[];
  /** Per-action-type minimum confidence (0–1). Falls back to globalThreshold. */
  confidenceThresholds: Partial<Record<ActionType, number>>;
  /** Global minimum confidence when no per-action override exists */
  globalConfidenceThreshold: number;
  escalationRules: EscalationRule[];
  /** Specific targets that must never be touched by auto-remediation */
  blacklistedTargets: string[];
  /** Maximum concurrent remediations for this org */
  maxConcurrentRemediations: number;
  /** When false: no auto-remediation fires at all for this org */
  enabled: boolean;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_POLICY: RemediationPolicy = {
  organizationId: 'default',
  allowedActions: ['cache_clear', 'pool_reset', 'rate_limit'],
  confidenceThresholds: {
    cache_clear: 0.80,
    pool_reset: 0.85,
    rate_limit: 0.85,
    restart: 0.90,
    rollback: 0.95,
    scale_up: 0.85,
  },
  globalConfidenceThreshold: 0.85,
  escalationRules: [
    { severity: 'critical', maxAttempts: 3, escalateAfterMinutes: 5,  notifyTargets: ['it_admin', 'on_call'] },
    { severity: 'high',     maxAttempts: 3, escalateAfterMinutes: 15, notifyTargets: ['it_admin'] },
    { severity: 'medium',   maxAttempts: 2, escalateAfterMinutes: 30, notifyTargets: [] },
    { severity: 'low',      maxAttempts: 1, escalateAfterMinutes: 60, notifyTargets: [] },
  ],
  blacklistedTargets: ['production-database', 'identity-service'],
  maxConcurrentRemediations: 5,
  enabled: true,
};

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RemediationPolicyService {
  private readonly logger = new Logger(RemediationPolicyService.name);

  /** In-memory policy store; production version would persist to Prisma */
  private readonly policies = new Map<string, RemediationPolicy>([
    ['default', DEFAULT_POLICY],
  ]);

  // ── CRUD ────────────────────────────────────────────────────────────

  /**
   * Retrieve policy for an org (falls back to platform default).
   * Req 5.8
   */
  getPolicy(organizationId: string): RemediationPolicy {
    return this.policies.get(organizationId) ?? DEFAULT_POLICY;
  }

  /**
   * Create or fully replace a policy for an org.
   * Req 5.8: IT Admin configures policy.
   */
  setPolicy(organizationId: string, policy: RemediationPolicy): void {
    this.policies.set(organizationId, { ...policy, organizationId });
    this.logger.log(`Remediation policy set for org ${organizationId}`);
  }

  /**
   * Partially update a policy (merge).
   * Req 5.8: IT Admin updates individual policy fields.
   */
  updatePolicy(organizationId: string, patch: Partial<RemediationPolicy>): RemediationPolicy {
    const existing = this.getPolicy(organizationId);
    const updated: RemediationPolicy = {
      ...existing,
      ...patch,
      organizationId,
      confidenceThresholds: {
        ...existing.confidenceThresholds,
        ...(patch.confidenceThresholds ?? {}),
      },
    };
    this.policies.set(organizationId, updated);
    this.logger.log(`Remediation policy updated for org ${organizationId}`);
    return updated;
  }

  /** Remove org-specific policy (revert to default). */
  resetPolicy(organizationId: string): void {
    this.policies.delete(organizationId);
    this.logger.log(`Remediation policy reset to default for org ${organizationId}`);
  }

  // ── Guard helpers ────────────────────────────────────────────────────

  /**
   * Returns true if the action type is permitted under this org's policy.
   * Req 5.8: Allowed actions list.
   */
  isActionAllowed(organizationId: string, actionType: string): boolean {
    const policy = this.getPolicy(organizationId);
    return policy.enabled && policy.allowedActions.includes(actionType as ActionType);
  }

  /**
   * Returns true if the target is on the org's blacklist.
   * Req 5.8: Blacklisted targets.
   */
  isTargetBlacklisted(organizationId: string, target: string): boolean {
    const policy = this.getPolicy(organizationId);
    return policy.blacklistedTargets.some(
      (b) => b === target || target.includes(b),
    );
  }

  /**
   * Returns the minimum confidence needed to execute an action.
   * Req 5.8: Per-action confidence thresholds.
   */
  getConfidenceThreshold(organizationId: string, actionTypeOrPattern?: string): number {
    const policy = this.getPolicy(organizationId);
    if (actionTypeOrPattern && policy.confidenceThresholds[actionTypeOrPattern as ActionType] !== undefined) {
      return policy.confidenceThresholds[actionTypeOrPattern as ActionType]!;
    }
    return policy.globalConfidenceThreshold;
  }

  /**
   * Returns the escalation rule for the given severity.
   * Req 5.8: Escalation rules.
   */
  getEscalationRule(
    organizationId: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
  ): EscalationRule | undefined {
    const policy = this.getPolicy(organizationId);
    return policy.escalationRules.find((r) => r.severity === severity);
  }

  /**
   * Returns true if this org can start another concurrent remediation.
   * Req 5.8: Max concurrent remediations limit.
   */
  canExecuteRemediation(organizationId: string, currentActiveCount: number): boolean {
    const policy = this.getPolicy(organizationId);
    return policy.enabled && currentActiveCount < policy.maxConcurrentRemediations;
  }

  /**
   * Returns true if auto-remediation is enabled for this org.
   * Req 5.8: Policy enabled/disabled flag.
   */
  isEnabled(organizationId: string): boolean {
    return this.getPolicy(organizationId).enabled;
  }
}
