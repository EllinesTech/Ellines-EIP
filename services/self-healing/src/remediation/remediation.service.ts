/**
 * Self-Healing Remediation Service
 *
 * Executes automated remediation actions for detected issues using a
 * multi-stage escalating approach with playbook lookup, action execution,
 * 5-minute post-action verification, and full audit trail.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RemediationPolicyService } from './remediation-policy.service';

// ── Domain interfaces ──────────────────────────────────────────────────────

export interface RemediationAction {
  type: 'restart' | 'cache_clear' | 'pool_reset' | 'rate_limit' | 'rollback' | 'scale_up';
  target: string;
  parameters?: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface RemediationStage {
  stageNumber: number;
  actions: RemediationAction[];
  timeout: number; // ms
}

export interface RemediationStrategy {
  id?: string;
  errorPattern: string;
  stages: RemediationStage[];
  confidenceThreshold: number;
  maxAttempts: number;
  verificationPeriod: number; // seconds
}

export interface SystemSnapshot {
  timestamp: Date;
  metrics: Record<string, any>;
  status: string;
}

export interface RemediationAttempt {
  stageNumber: number;
  action: RemediationAction;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface RemediationResult {
  success: boolean;
  stagesExecuted: number;
  actionsPerformed: RemediationAction[];
  attempts: RemediationAttempt[];
  timeTaken: number;
  beforeSnapshot: SystemSnapshot;
  afterSnapshot: SystemSnapshot;
  escalated: boolean;
  escalationReason?: string;
  verifiedAt?: Date;
}

export interface ActionResult {
  success: boolean;
  durationMs: number;
  message?: string;
  error?: string;
}

export interface VerificationResult {
  success: boolean;
  durationMonitored: number; // seconds
  observations: string[];
  recurred: boolean;
}

export interface EscalationPayload {
  incidentId: string;
  organizationId: string;
  reason: string;
  attempts: RemediationAttempt[];
  diagnostics: Record<string, any>;
  timestamp: Date;
  affectedComponents: string[];
  errorPattern: string;
  severity: string;
}

export interface Incident {
  id: string;
  organizationId: string;
  errorPattern: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedComponents: string[];
  /** 0–1 decimal confidence (e.g. 0.90 = 90%) */
  confidence: number;
  diagnostics: Record<string, any>;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RemediationService implements OnModuleDestroy {
  private readonly logger = new Logger(RemediationService.name);
  private readonly prisma: PrismaClient;

  /**
   * Req 5.2: Only execute auto-remediation when confidence >= 85 %
   */
  private readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

  /**
   * Req 5.5: Escalate after 3 failed attempts
   */
  private readonly DEFAULT_MAX_ATTEMPTS = 3;

  /**
   * Req 5.6: Verify remediation for 5 minutes (300 s) post-action
   */
  private readonly VERIFICATION_PERIOD_SECONDS = 300;

  /** Tracks active concurrent remediations per org */
  private readonly activeRemediations = new Map<string, number>();

  constructor(private readonly policyService: RemediationPolicyService) {
    this.prisma = new PrismaClient();
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Execute remediation for an incident.
   * Req 5.2, 5.4, 5.5, 5.6, 5.7
   */
  async remediate(incident: Incident): Promise<RemediationResult> {
    const startTime = Date.now();
    this.logger.log(
      `Starting remediation for incident ${incident.id} (confidence=${incident.confidence}, pattern=${incident.errorPattern})`,
    );

    // Req 5.2: Confidence gate
    const threshold = this.policyService.getConfidenceThreshold(
      incident.organizationId,
      incident.errorPattern,
    );
    if (incident.confidence < threshold) {
      this.logger.warn(
        `Incident ${incident.id}: confidence ${incident.confidence} < threshold ${threshold}. Skipping.`,
      );
      return this.buildFailedResult(startTime, 'Confidence below threshold', false);
    }

    // Policy: check allowed actions / concurrency
    const activeCount = this.activeRemediations.get(incident.organizationId) || 0;
    if (!this.policyService.canExecuteRemediation(incident.organizationId, activeCount)) {
      this.logger.warn(`Concurrency limit reached for org ${incident.organizationId}`);
      return this.buildFailedResult(startTime, 'Concurrency limit exceeded', false);
    }

    this.incrementActive(incident.organizationId);

    try {
      // Req 5.1: Playbook lookup
      const strategy = await this.lookupStrategy(incident.errorPattern);
      if (!strategy) {
        this.logger.warn(`No playbook found for pattern: ${incident.errorPattern}`);
        await this.escalate(incident, [], 'No remediation strategy found');
        return this.buildFailedResult(startTime, 'No strategy found', true);
      }

      // Req 5.7: Before snapshot
      const beforeSnapshot = await this.captureSystemSnapshot(incident.affectedComponents, 'before');

      // Req 5.4: Multi-stage execution
      const stageResult = await this.executeStages(incident, strategy);

      // Req 5.7: After snapshot
      const afterSnapshot = await this.captureSystemSnapshot(incident.affectedComponents, 'after');

      // Req 5.6: 5-minute verification
      let verifiedAt: Date | undefined;
      if (stageResult.success) {
        const verification = await this.verifySuccess(incident, this.VERIFICATION_PERIOD_SECONDS);
        if (!verification.success) {
          this.logger.warn(`Post-remediation verification failed for incident ${incident.id}`);
          stageResult.success = false;
          stageResult.escalated = true;
          stageResult.escalationReason = 'Issue recurred during verification window';
          await this.escalate(incident, stageResult.attempts, 'Issue recurred after remediation');
        } else {
          verifiedAt = new Date();
          this.logger.log(`Incident ${incident.id} verified stable after ${this.VERIFICATION_PERIOD_SECONDS}s`);
        }
      }

      const timeTaken = Date.now() - startTime;
      const result: RemediationResult = {
        ...stageResult,
        timeTaken,
        beforeSnapshot,
        afterSnapshot,
        verifiedAt,
      };

      // Req 5.7: Audit log
      await this.auditExecution(incident, result, strategy);
      return result;
    } finally {
      this.decrementActive(incident.organizationId);
    }
  }

  /**
   * Lookup remediation strategy from the playbook table.
   * Req 5.1: Maintain a remediation playbook mapping error types to actions.
   */
  async lookupStrategy(errorPattern: string): Promise<RemediationStrategy | null> {
    const playbook = await this.prisma.remediationPlaybook.findFirst({
      where: { errorPattern, isActive: true },
    });

    if (!playbook) {
      // Fallback: fuzzy match by substring
      const all = await this.prisma.remediationPlaybook.findMany({
        where: { isActive: true },
      });
      const fuzzy = all.find((p) => {
        try {
          return new RegExp(p.errorPattern, 'i').test(errorPattern);
        } catch {
          return errorPattern.includes(p.errorPattern);
        }
      });
      if (!fuzzy) return null;
      return this.mapPlaybookToStrategy(fuzzy);
    }

    return this.mapPlaybookToStrategy(playbook);
  }

  /**
   * Execute a single remediation action.
   * Req 5.3: Actions = restart, cache_clear, pool_reset, rate_limit, rollback, scale_up
   */
  async executeAction(action: RemediationAction, stage: number): Promise<ActionResult> {
    const t0 = Date.now();
    this.logger.log(`[Stage ${stage}] Executing ${action.type} on ${action.target}`);

    // Policy guard: check if action is allowed
    // (organizationId not available here — caller validates policy upstream)
    try {
      let success = false;
      let message = '';

      switch (action.type) {
        case 'restart':
          ({ success, message } = await this.doRestart(action));
          break;
        case 'cache_clear':
          ({ success, message } = await this.doCacheClear(action));
          break;
        case 'pool_reset':
          ({ success, message } = await this.doPoolReset(action));
          break;
        case 'rate_limit':
          ({ success, message } = await this.doRateLimit(action));
          break;
        case 'rollback':
          ({ success, message } = await this.doRollback(action));
          break;
        case 'scale_up':
          ({ success, message } = await this.doScaleUp(action));
          break;
        default:
          message = `Unknown action type: ${(action as any).type}`;
          success = false;
      }

      return { success, durationMs: Date.now() - t0, message };
    } catch (err: any) {
      this.logger.error(`Action ${action.type} threw: ${err?.message}`);
      return { success: false, durationMs: Date.now() - t0, error: err?.message };
    }
  }

  /**
   * Verify remediation success by monitoring for `duration` seconds.
   * Req 5.6: Monitor for 5 minutes after action.
   */
  async verifySuccess(incident: Incident, duration: number): Promise<VerificationResult> {
    this.logger.log(`Verifying incident ${incident.id} for ${duration}s`);

    const observations: string[] = [];
    const pollIntervalMs = 30_000; // poll every 30 s
    const pollCount = Math.max(1, Math.floor((duration * 1000) / pollIntervalMs));
    let recurred = false;

    for (let i = 0; i < pollCount; i++) {
      await this.sleep(pollIntervalMs);
      const ok = await this.probeIncident(incident);
      observations.push(`Poll ${i + 1}/${pollCount}: ${ok ? 'stable' : 'issue_detected'}`);
      if (!ok) {
        recurred = true;
        this.logger.warn(`Incident ${incident.id} recurred at poll ${i + 1}`);
        break;
      }
    }

    return {
      success: !recurred,
      durationMonitored: duration,
      observations,
      recurred,
    };
  }

  /**
   * Escalate incident to IT admins with full diagnostics.
   * Req 5.5: Escalate after 3 failed attempts with detailed diagnostic info.
   */
  async escalate(
    incident: Incident,
    attempts: RemediationAttempt[],
    reason: string,
  ): Promise<void> {
    this.logger.warn(`Escalating incident ${incident.id}: ${reason}`);

    const payload: EscalationPayload = {
      incidentId: incident.id,
      organizationId: incident.organizationId,
      reason,
      attempts,
      diagnostics: incident.diagnostics,
      timestamp: new Date(),
      affectedComponents: incident.affectedComponents,
      errorPattern: incident.errorPattern,
      severity: incident.severity,
    };

    // Persist escalation record so dashboards and learner can consume it
    await this.prisma.remediationExecution.create({
      data: {
        playbookId: await this.resolvePlaybookId(incident.errorPattern),
        organizationId: incident.organizationId,
        incidentId: incident.id,
        errorPattern: incident.errorPattern,
        stagesExecuted: attempts.length,
        actionsPerformed: attempts as any,
        confidence: incident.confidence,
        outcome: 'escalated',
        beforeSnapshot: null,
        afterSnapshot: null,
        timeTaken: 0,
        escalatedTo: 'it_admin',
        escalationReason: reason,
        verifiedAt: null,
      },
    });

    this.logger.log(`Escalation persisted for incident ${incident.id}. Payload: ${JSON.stringify(payload)}`);
    // In production: send notification via NotificationService / PagerDuty / email
  }

  // ── Stage Executor ────────────────────────────────────────────────────

  /**
   * Execute remediation in escalating stages.
   * Req 5.4: Lightweight fixes first, heavier interventions if initial attempts fail.
   * Req 5.5: Escalate after MAX_ATTEMPTS.
   */
  private async executeStages(
    incident: Incident,
    strategy: RemediationStrategy,
  ): Promise<Omit<RemediationResult, 'timeTaken' | 'beforeSnapshot' | 'afterSnapshot' | 'verifiedAt'>> {
    const actionsPerformed: RemediationAction[] = [];
    const attempts: RemediationAttempt[] = [];
    let stagesExecuted = 0;
    const maxAttempts = strategy.maxAttempts || this.DEFAULT_MAX_ATTEMPTS;

    // Stages are already ordered lightweight → heavy (Req 5.4)
    for (const stage of strategy.stages) {
      if (stagesExecuted >= maxAttempts) {
        await this.escalate(incident, attempts, 'Max attempts reached');
        return { success: false, stagesExecuted, actionsPerformed, attempts, escalated: true, escalationReason: 'Max attempts reached' };
      }

      this.logger.log(`Incident ${incident.id}: executing stage ${stage.stageNumber}`);
      stagesExecuted++;
      let stageOk = true;

      for (const action of stage.actions) {
        // Policy check per action
        if (!this.policyService.isActionAllowed(incident.organizationId, action.type)) {
          this.logger.warn(`Action ${action.type} not allowed for org ${incident.organizationId}`);
          const attempt: RemediationAttempt = { stageNumber: stage.stageNumber, action, success: false, durationMs: 0, error: 'Not allowed by policy' };
          attempts.push(attempt);
          stageOk = false;
          continue;
        }

        if (this.policyService.isTargetBlacklisted(incident.organizationId, action.target)) {
          this.logger.warn(`Target ${action.target} is blacklisted for org ${incident.organizationId}`);
          const attempt: RemediationAttempt = { stageNumber: stage.stageNumber, action, success: false, durationMs: 0, error: 'Target blacklisted' };
          attempts.push(attempt);
          stageOk = false;
          continue;
        }

        const result = await this.executeAction(action, stage.stageNumber);
        actionsPerformed.push(action);
        attempts.push({ stageNumber: stage.stageNumber, action, success: result.success, durationMs: result.durationMs, error: result.error });

        if (!result.success) {
          this.logger.warn(`Stage ${stage.stageNumber} action ${action.type} failed: ${result.error || result.message}`);
          stageOk = false;
        }
      }

      // Give the system time to stabilise before probing
      await this.sleep(2_000);
      const resolved = await this.probeIncident(incident);
      if (resolved) {
        this.logger.log(`Incident ${incident.id} resolved after stage ${stage.stageNumber}`);
        return { success: true, stagesExecuted, actionsPerformed, attempts, escalated: false };
      }

      this.logger.log(`Stage ${stage.stageNumber} did not resolve incident — advancing to next stage`);
    }

    // All stages exhausted
    await this.escalate(incident, attempts, 'All remediation stages failed');
    return { success: false, stagesExecuted, actionsPerformed, attempts, escalated: true, escalationReason: 'All stages failed' };
  }

  // ── Action Handlers ───────────────────────────────────────────────────

  /**
   * Restart a service.
   * Req 5.3: Service restart action.
   */
  private async doRestart(action: RemediationAction): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Restarting service: ${action.target}`);
    // Production: call k8s API / systemd / Docker to trigger graceful restart
    await this.sleep(1_000);
    return { success: true, message: `Service ${action.target} restart initiated` };
  }

  /**
   * Clear cache entries.
   * Req 5.3: Cache invalidation action.
   */
  private async doCacheClear(action: RemediationAction): Promise<{ success: boolean; message: string }> {
    const namespace = action.parameters?.namespace || action.target;
    this.logger.log(`Clearing cache namespace: ${namespace}`);
    // Production: call Redis FLUSHDB / selective key eviction
    await this.sleep(300);
    return { success: true, message: `Cache cleared for namespace: ${namespace}` };
  }

  /**
   * Reset connection pool.
   * Req 5.3: Connection pool reset action.
   */
  private async doPoolReset(action: RemediationAction): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Resetting connection pool for: ${action.target}`);
    // Production: call database pool manager API to drain and refill pool
    await this.sleep(500);
    return { success: true, message: `Connection pool reset for ${action.target}` };
  }

  /**
   * Apply temporary rate limiting.
   * Req 5.3: Temporary rate limiting action.
   */
  private async doRateLimit(action: RemediationAction): Promise<{ success: boolean; message: string }> {
    const limit = action.parameters?.limit ?? 100;
    const windowSec = action.parameters?.windowSeconds ?? 60;
    this.logger.log(`Applying rate limit to ${action.target}: ${limit} req/${windowSec}s`);
    // Production: update rate-limit config in Redis or API gateway
    await this.sleep(300);
    return { success: true, message: `Rate limit applied: ${limit} req/${windowSec}s on ${action.target}` };
  }

  /**
   * Rollback configuration to a previous version.
   * Req 5.3: Configuration rollback action.
   */
  private async doRollback(action: RemediationAction): Promise<{ success: boolean; message: string }> {
    const version = action.parameters?.version || 'previous';
    this.logger.log(`Rolling back ${action.target} to version: ${version}`);
    // Production: call config management API (Consul / Vault / feature flags)
    await this.sleep(1_000);
    return { success: true, message: `Configuration rolled back to version ${version} for ${action.target}` };
  }

  /**
   * Scale up a service instance count.
   * Req 5.3: Scale-up action.
   */
  private async doScaleUp(action: RemediationAction): Promise<{ success: boolean; message: string }> {
    const replicas = action.parameters?.replicas ?? 2;
    this.logger.log(`Scaling up ${action.target} to ${replicas} replicas`);
    // Production: call k8s HPA / ECS service update
    await this.sleep(2_000);
    return { success: true, message: `Scaled ${action.target} to ${replicas} replicas` };
  }

  // ── Snapshot ──────────────────────────────────────────────────────────

  /**
   * Capture a system snapshot for audit trail.
   * Req 5.7: Before/after state snapshots.
   */
  private async captureSystemSnapshot(
    components: string[],
    phase: 'before' | 'after',
  ): Promise<SystemSnapshot> {
    // Production: collect actual CPU/memory/connections/error-rate from Prometheus / InfluxDB
    const metrics: Record<string, any> = {};
    for (const comp of components) {
      metrics[comp] = {
        cpuPercent: Math.round(Math.random() * 100),
        memoryPercent: Math.round(Math.random() * 100),
        openConnections: Math.floor(Math.random() * 500),
        errorRatePer5m: Math.round(Math.random() * 50),
      };
    }
    this.logger.debug(`System snapshot (${phase}) captured for components: ${components.join(', ')}`);
    return { timestamp: new Date(), metrics, status: phase };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Probe whether the incident is still active.
   * In production: query InfluxDB / log pipeline / health endpoints.
   */
  private async probeIncident(_incident: Incident): Promise<boolean> {
    // Simulate 70% success probability for unit-testability
    await this.sleep(200);
    return Math.random() > 0.3;
  }

  private mapPlaybookToStrategy(playbook: any): RemediationStrategy {
    return {
      id: playbook.id,
      errorPattern: playbook.errorPattern,
      stages: (playbook.stages as RemediationStage[]) || [],
      confidenceThreshold: playbook.confidenceThreshold,
      maxAttempts: playbook.maxAttempts,
      verificationPeriod: playbook.verificationPeriod,
    };
  }

  /** Resolve the playbook DB id for a given error pattern (used in escalation) */
  private async resolvePlaybookId(errorPattern: string): Promise<string> {
    const playbook = await this.prisma.remediationPlaybook.findFirst({
      where: { errorPattern, isActive: true },
      select: { id: true },
    });
    // If no exact match, return a sentinel that is still stored (escalation still works)
    return playbook?.id ?? 'unknown';
  }

  /**
   * Write full audit log entry.
   * Req 5.7: Log all actions with before/after snapshots.
   */
  private async auditExecution(
    incident: Incident,
    result: RemediationResult,
    strategy: RemediationStrategy,
  ): Promise<void> {
    try {
      await this.prisma.remediationExecution.create({
        data: {
          playbookId: strategy.id ?? await this.resolvePlaybookId(incident.errorPattern),
          organizationId: incident.organizationId,
          incidentId: incident.id,
          errorPattern: incident.errorPattern,
          stagesExecuted: result.stagesExecuted,
          actionsPerformed: result.actionsPerformed as any,
          confidence: incident.confidence,
          outcome: result.success
            ? 'success'
            : result.escalated
              ? 'escalated'
              : 'failure',
          beforeSnapshot: result.beforeSnapshot as any,
          afterSnapshot: result.afterSnapshot as any,
          timeTaken: result.timeTaken,
          escalatedTo: result.escalated ? 'it_admin' : null,
          escalationReason: result.escalationReason ?? null,
          verifiedAt: result.verifiedAt ?? null,
        },
      });
      this.logger.log(`Audit record created for incident ${incident.id} — outcome: ${result.success ? 'success' : 'failure'}`);
    } catch (err: any) {
      this.logger.error(`Failed to write audit record: ${err?.message}`);
    }
  }

  private buildFailedResult(
    startTime: number,
    reason: string,
    escalated: boolean,
  ): RemediationResult {
    const snap: SystemSnapshot = { timestamp: new Date(), metrics: {}, status: 'unavailable' };
    return {
      success: false,
      stagesExecuted: 0,
      actionsPerformed: [],
      attempts: [],
      timeTaken: Date.now() - startTime,
      beforeSnapshot: snap,
      afterSnapshot: snap,
      escalated,
      escalationReason: reason,
    };
  }

  private incrementActive(orgId: string): void {
    this.activeRemediations.set(orgId, (this.activeRemediations.get(orgId) || 0) + 1);
  }

  private decrementActive(orgId: string): void {
    const n = this.activeRemediations.get(orgId) || 1;
    this.activeRemediations.set(orgId, Math.max(0, n - 1));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
