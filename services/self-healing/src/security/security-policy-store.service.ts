/**
 * Security Policy Store Service
 *
 * Manages per-organization security policy configuration.
 * Provides CRUD operations for IT Admin policy management (Req 15.8).
 *
 * In-memory store (production: persist to Prisma/PostgreSQL).
 * Requirements: 15.8
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_SECURITY_POLICY,
  SecurityEventType,
  SecurityPolicy,
} from './security-anomaly.interfaces';

@Injectable()
export class SecurityPolicyStoreService {
  private readonly logger = new Logger(SecurityPolicyStoreService.name);

  /** Per-org policy overrides keyed by organizationId */
  private readonly policies = new Map<string, SecurityPolicy>();

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Get the effective policy for an organization.
   * Falls back to DEFAULT_SECURITY_POLICY if no custom policy is set.
   */
  getEffectivePolicy(organizationId: string): SecurityPolicy {
    const override = this.policies.get(organizationId);
    if (override) return override;
    return {
      ...DEFAULT_SECURITY_POLICY,
      organizationId,
      updatedAt: new Date(0),
    };
  }

  /**
   * Create or fully replace a policy for an organization.
   */
  setPolicy(
    organizationId: string,
    input: Partial<Omit<SecurityPolicy, 'organizationId' | 'updatedAt'>>,
  ): SecurityPolicy {
    const current = this.getEffectivePolicy(organizationId);
    const updated: SecurityPolicy = {
      ...current,
      ...input,
      organizationId,
      updatedAt: new Date(),
    };
    this.policies.set(organizationId, updated);
    this.logger.log(`[PolicyStore] Policy created/updated for org ${organizationId}`);
    return updated;
  }

  /**
   * Patch (partial update) the policy for an organization.
   * Only the provided fields are changed; others keep their current values.
   */
  patchPolicy(
    organizationId: string,
    patch: Partial<Omit<SecurityPolicy, 'organizationId' | 'updatedAt'>>,
  ): SecurityPolicy {
    return this.setPolicy(organizationId, patch);
  }

  /**
   * Reset policy to platform defaults for an organization.
   */
  resetPolicy(organizationId: string): SecurityPolicy {
    const defaultPolicy: SecurityPolicy = {
      ...DEFAULT_SECURITY_POLICY,
      organizationId,
      updatedAt: new Date(),
    };
    this.policies.set(organizationId, defaultPolicy);
    this.logger.log(`[PolicyStore] Policy reset to defaults for org ${organizationId}`);
    return defaultPolicy;
  }

  /**
   * Delete a custom policy override — org reverts to platform defaults.
   */
  deletePolicy(organizationId: string): boolean {
    const existed = this.policies.has(organizationId);
    this.policies.delete(organizationId);
    if (existed) {
      this.logger.log(`[PolicyStore] Custom policy deleted for org ${organizationId}`);
    }
    return existed;
  }

  /**
   * Enable or disable auto-remediation for a specific event type.
   */
  setAutoRemediation(
    organizationId: string,
    eventType: SecurityEventType,
    enabled: boolean,
  ): SecurityPolicy {
    const current = this.getEffectivePolicy(organizationId);
    const updatedAutoRemediation = {
      ...current.autoRemediationEnabled,
      [eventType]: enabled,
    };
    return this.setPolicy(organizationId, {
      autoRemediationEnabled: updatedAutoRemediation as Record<SecurityEventType, boolean>,
    });
  }

  /**
   * List all organizations that have custom policy overrides.
   */
  listCustomPolicies(): SecurityPolicy[] {
    return Array.from(this.policies.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  /**
   * Check whether a custom policy exists for the organization.
   */
  hasCustomPolicy(organizationId: string): boolean {
    return this.policies.has(organizationId);
  }
}
