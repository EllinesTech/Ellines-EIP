/**
 * Remediation Policy Service
 * 
 * Manages remediation policies and configurations
 * Requirement 5.8: Remediation policy configuration
 */

import { Injectable, Logger } from '@nestjs/common';

export interface RemediationPolicy {
  organizationId: string;
  allowedActions: string[];
  confidenceThresholds: Record<string, number>;
  escalationRules: EscalationRule[];
  blacklistedTargets: string[];
  maxConcurrentRemediations: number;
}

export interface EscalationRule {
  severity: 'critical' | 'high' | 'medium' | 'low';
  maxAttempts: number;
  escalateAfterMinutes: number;
  notifyUsers: string[];
}

@Injectable()
export class RemediationPolicyService {
  private readonly logger = new Logger(RemediationPolicyService.name);
  
  // Default policy
  private readonly DEFAULT_POLICY: RemediationPolicy = {
    organizationId: 'default',
    allowedActions: ['cache_clear', 'pool_reset', 'rate_limit'],
    confidenceThresholds: {
      cache_clear: 0.80,
      pool_reset: 0.85,
      restart: 0.90,
      rollback: 0.95,
      scale_up: 0.85,
    },
    escalationRules: [
      {
        severity: 'critical',
        maxAttempts: 3,
        escalateAfterMinutes: 5,
        notifyUsers: ['admin'],
      },
      {
        severity: 'high',
        maxAttempts: 3,
        escalateAfterMinutes: 15,
        notifyUsers: ['admin'],
      },
      {
        severity: 'medium',
        maxAttempts: 2,
        escalateAfterMinutes: 30,
        notifyUsers: [],
      },
      {
        severity: 'low',
        maxAttempts: 1,
        escalateAfterMinutes: 60,
        notifyUsers: [],
      },
    ],
    blacklistedTargets: ['production-database', 'identity-service'],
    maxConcurrentRemediations: 5,
  };

  private policies: Map<string, RemediationPolicy> = new Map();

  constructor() {
    // Initialize with default policy
    this.policies.set('default', this.DEFAULT_POLICY);
  }

  /**
   * Get policy for organization
   */
  getPolicy(organizationId: string): RemediationPolicy {
    return this.policies.get(organizationId) || this.DEFAULT_POLICY;
  }

  /**
   * Set policy for organization
   */
  setPolicy(organizationId: string, policy: RemediationPolicy): void {
    this.policies.set(organizationId, policy);
    this.logger.log(`Updated remediation policy for org ${organizationId}`);
  }

  /**
   * Check if action is allowed
   */
  isActionAllowed(organizationId: string, actionType: string): boolean {
    const policy = this.getPolicy(organizationId);
    return policy.allowedActions.includes(actionType);
  }

  /**
   * Check if target is blacklisted
   */
  isTargetBlacklisted(organizationId: string, target: string): boolean {
    const policy = this.getPolicy(organizationId);
    return policy.blacklistedTargets.includes(target);
  }

  /**
   * Get confidence threshold for action
   */
  getConfidenceThreshold(organizationId: string, actionType: string): number {
    const policy = this.getPolicy(organizationId);
    return policy.confidenceThresholds[actionType] || 0.85;
  }

  /**
   * Get escalation rule for severity
   */
  getEscalationRule(
    organizationId: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
  ): EscalationRule | undefined {
    const policy = this.getPolicy(organizationId);
    return policy.escalationRules.find((rule) => rule.severity === severity);
  }

  /**
   * Check if max concurrent remediations reached
   */
  canExecuteRemediation(organizationId: string, currentCount: number): boolean {
    const policy = this.getPolicy(organizationId);
    return currentCount < policy.maxConcurrentRemediations;
  }
}
