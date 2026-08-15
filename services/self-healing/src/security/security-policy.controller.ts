/**
 * Security Policy Controller
 *
 * REST CRUD endpoints for IT Admin to configure security policies per organization.
 *
 * Routes:
 *   GET    /security/policy/:orgId              — Get effective policy
 *   PUT    /security/policy/:orgId              — Create or replace policy
 *   PATCH  /security/policy/:orgId              — Partial update
 *   DELETE /security/policy/:orgId              — Reset to defaults
 *   PATCH  /security/policy/:orgId/auto-remediation/:eventType — Toggle auto-remediation
 *   GET    /security/policy                     — List all custom policies (platform admin)
 *
 * Requirements: 15.8 — Organization_IT_Admin SHALL configure security policies
 * including anomaly sensitivity, Auto_Remediation actions, and notification rules.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import { SecurityPolicyStoreService } from './security-policy-store.service';
import { SecurityEventType } from './security-anomaly.interfaces';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class SecurityPolicyDto {
  /** Detection sensitivity 0–1; higher = stricter */
  anomalySensitivity?: number;
  /** Multiplier of role export baseline before flagging as exfiltration (default 3) */
  exfiltrationThresholdMultiplier?: number;
  /** Max hours between two geo-separated sessions for impossible-travel detection (default 1) */
  impossibleTravelWindowHours?: number;
  /** Absolute max export bytes before triggering exfiltration detection (default 500 MB) */
  maxExportBytesAbsolute?: number;
  /** Enable/disable auto-remediation per event type */
  autoRemediationEnabled?: Record<SecurityEventType, boolean>;
  /** Notification channels: email, in_app, webhook */
  notifyChannels?: Array<'email' | 'in_app' | 'webhook'>;
  /** Webhook URL for security notifications */
  webhookUrl?: string;
}

export class AutoRemediationToggleDto {
  /** Whether to enable (true) or disable (false) auto-remediation for this event type */
  enabled!: boolean;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('security/policy')
export class SecurityPolicyController {
  constructor(private readonly policyStore: SecurityPolicyStoreService) {}

  /**
   * List all organizations with custom policy overrides.
   * GET /security/policy
   * (Platform Super Admin only in production — no auth guard here, apply via guard)
   */
  @Get()
  listCustomPolicies() {
    const policies = this.policyStore.listCustomPolicies();
    return { policies, count: policies.length };
  }

  /**
   * Get the effective policy for an organization.
   * GET /security/policy/:orgId
   */
  @Get(':orgId')
  getPolicy(@Param('orgId') orgId: string) {
    const policy = this.policyStore.getEffectivePolicy(orgId);
    const isCustom = this.policyStore.hasCustomPolicy(orgId);
    return { policy, isCustom };
  }

  /**
   * Create or fully replace the policy for an organization.
   * PUT /security/policy/:orgId
   */
  @Put(':orgId')
  setPolicy(@Param('orgId') orgId: string, @Body() dto: SecurityPolicyDto) {
    const policy = this.policyStore.setPolicy(orgId, dto);
    return { success: true, policy };
  }

  /**
   * Partially update the policy for an organization.
   * PATCH /security/policy/:orgId
   */
  @Patch(':orgId')
  patchPolicy(@Param('orgId') orgId: string, @Body() dto: SecurityPolicyDto) {
    const policy = this.policyStore.patchPolicy(orgId, dto);
    return { success: true, policy };
  }

  /**
   * Reset the policy to platform defaults.
   * DELETE /security/policy/:orgId
   */
  @Delete(':orgId')
  resetPolicy(@Param('orgId') orgId: string) {
    const policy = this.policyStore.resetPolicy(orgId);
    return { success: true, message: 'Policy reset to platform defaults', policy };
  }

  /**
   * Toggle auto-remediation for a specific event type.
   * PATCH /security/policy/:orgId/auto-remediation/:eventType
   */
  @Patch(':orgId/auto-remediation/:eventType')
  setAutoRemediation(
    @Param('orgId') orgId: string,
    @Param('eventType') eventType: string,
    @Body() dto: AutoRemediationToggleDto,
  ) {
    const policy = this.policyStore.setAutoRemediation(
      orgId,
      eventType as SecurityEventType,
      dto.enabled,
    );
    return {
      success: true,
      message: `Auto-remediation for "${eventType}" ${dto.enabled ? 'enabled' : 'disabled'} in org ${orgId}`,
      policy,
    };
  }
}
