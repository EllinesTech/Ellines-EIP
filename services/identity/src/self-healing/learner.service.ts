/**
 * Self-Healing Learner Service
 *
 * Learns from remediation outcomes to improve future healing capabilities.
 * Records results, analyses patterns, incorporates manual fixes, adjusts
 * confidence thresholds, and produces architecture improvement recommendations.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * Recommendation returned by recommendImprovements() for the Super Admin AI panel.
 * Requirement 6.6
 */
export type Recommendation = {
  id: string;
  playbookPattern: string;
  frequency: number;
  suggestedAction: string;
  priority: 'high' | 'medium' | 'low';
};

// ── Internal helper types ────────────────────────────────────────────────────

type OutcomeInput = {
  executionId: string;
  outcome: 'success' | 'failure' | 'escalated';
};

type ManualFix = {
  actions: string[];
  successReason: string;
};

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LearnerService {
  private readonly logger = new Logger(LearnerService.name);

  /** Floor / cap bounds for confidenceThreshold adjustments (Requirement 6.4) */
  private readonly THRESHOLD_FLOOR = 0.5;
  private readonly THRESHOLD_CAP = 0.99;
  private readonly THRESHOLD_STEP = 0.02;

  /** Success-rate target boundaries for threshold adjustment */
  private readonly HIGH_SUCCESS_RATE = 0.9;
  private readonly LOW_SUCCESS_RATE = 0.6;

  constructor(private readonly prisma: PrismaService) {}

  // ── 1. recordOutcome ──────────────────────────────────────────────────────

  /**
   * Update a RemediationExecution's outcome and recompute the associated
   * playbook's rolling `successRate`.
   *
   * Requirement 6.1 — record outcomes of all Auto_Remediation attempts.
   *
   * Rolling average formula:
   *   new_rate = (old_rate * old_count + is_success) / new_count
   */
  async recordOutcome(result: OutcomeInput): Promise<void> {
    this.logger.log(`recordOutcome — executionId=${result.executionId} outcome=${result.outcome}`);

    // 1. Load execution row
    const execution = await this.prisma.remediationExecution.findUnique({
      where: { id: result.executionId },
    });

    if (!execution) {
      this.logger.warn(`recordOutcome — execution ${result.executionId} not found`);
      return;
    }

    // 2. Update outcome on the execution row
    await this.prisma.remediationExecution.update({
      where: { id: result.executionId },
      data: { outcome: result.outcome },
    });

    // 3. Recompute rolling success rate on the playbook
    const playbook = await this.prisma.remediationPlaybook.findUnique({
      where: { id: execution.playbookId },
    });

    if (!playbook) {
      this.logger.warn(`recordOutcome — playbook ${execution.playbookId} not found`);
      return;
    }

    const isSuccess = result.outcome === 'success' ? 1 : 0;
    const newCount = playbook.executionCount + 1;
    const newRate = (playbook.successRate * playbook.executionCount + isSuccess) / newCount;

    await this.prisma.remediationPlaybook.update({
      where: { id: playbook.id },
      data: {
        executionCount: newCount,
        successRate: newRate,
        lastExecutedAt: new Date(),
      },
    });

    this.logger.log(
      `recordOutcome — playbook ${playbook.id} successRate updated: ` +
        `${playbook.successRate.toFixed(3)} → ${newRate.toFixed(3)} (count=${newCount})`,
    );
  }

  // ── 2. analyzeSuccesses ───────────────────────────────────────────────────

  /**
   * Query successful executions in the last N days and create new
   * RemediationPlaybook entries for recurring action sequences.
   *
   * Requirement 6.2 — analyse successful remediations to identify patterns.
   * Requirement 6.8 — new strategies require Super Admin approval.
   *
   * @param orgId  Optional organization scope (null = all orgs)
   * @param days   Look-back window in days (default 30)
   */
  async analyzeSuccesses(orgId?: string, days = 30): Promise<void> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const executions = await this.prisma.remediationExecution.findMany({
      where: {
        outcome: 'success',
        createdAt: { gte: since },
        ...(orgId ? { organizationId: orgId } : {}),
      },
      select: {
        errorPattern: true,
        actionsPerformed: true,
        playbookId: true,
      },
    });

    if (executions.length === 0) {
      this.logger.log('analyzeSuccesses — no successful executions in window');
      return;
    }

    // Group by errorPattern to find common sequences
    const patternMap = new Map<string, { count: number; actions: unknown[] }>();

    for (const exec of executions) {
      const existing = patternMap.get(exec.errorPattern);
      if (existing) {
        existing.count += 1;
        // Keep first observed action sequence as representative
      } else {
        patternMap.set(exec.errorPattern, {
          count: 1,
          actions: Array.isArray(exec.actionsPerformed) ? exec.actionsPerformed : [],
        });
      }
    }

    // Only create new playbook entries for patterns that appear 2+ times
    let created = 0;
    for (const [pattern, data] of patternMap) {
      if (data.count < 2) continue;

      // Skip patterns that already have a playbook entry
      const existing = await this.prisma.remediationPlaybook.findFirst({
        where: { errorPattern: pattern },
      });
      if (existing) continue;

      // Infer category from pattern text
      const errorCategory = this.inferCategory(pattern);

      await this.prisma.remediationPlaybook.create({
        data: {
          errorPattern: pattern,
          errorCategory,
          severity: 'medium',
          stages: data.actions as unknown as import('@prisma/client').Prisma.InputJsonValue,
          confidenceThreshold: 0.85,
          maxAttempts: 3,
          verificationPeriod: 300,
          isActive: false, // Not active until Super Admin approves
          requiresApproval: true, // Requirement 6.8
          createdBy: 'learned',
          successRate: 1.0, // Derived from success-only executions
          executionCount: data.count,
        },
      });
      created += 1;
      this.logger.log(`analyzeSuccesses — created playbook for pattern "${pattern}" (${data.count} successes)`);
    }

    this.logger.log(`analyzeSuccesses — created ${created} new playbook entries`);
  }

  // ── 3. learnFromManualFix ─────────────────────────────────────────────────

  /**
   * Create a new RemediationPlaybook entry derived from a human-applied fix.
   * Starts inactive and requires approval (Requirement 6.3, 6.8).
   *
   * @param incidentId   The incident that was manually resolved
   * @param fix          Actions taken and reason for success
   * @param createdBy    User ID of the IT admin who applied the fix
   */
  async learnFromManualFix(
    incidentId: string,
    fix: ManualFix,
    createdBy: string,
  ): Promise<void> {
    this.logger.log(`learnFromManualFix — incidentId=${incidentId} createdBy=${createdBy}`);

    // Retrieve the incident's errorPattern from RemediationExecution
    const execution = await this.prisma.remediationExecution.findFirst({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
    });

    const errorPattern = execution?.errorPattern ?? `manual:${incidentId}`;
    const errorCategory = this.inferCategory(errorPattern);

    // Convert action string array into stage JSON matching the playbook format
    const stages = [
      {
        stageNumber: 1,
        timeoutMs: 60_000,
        actions: fix.actions.map((a) => ({ type: a })),
      },
    ];

    // Check for an existing entry before creating
    const existing = await this.prisma.remediationPlaybook.findFirst({
      where: { errorPattern },
    });

    if (existing) {
      // Update the existing entry rather than duplicating
      await this.prisma.remediationPlaybook.update({
        where: { id: existing.id },
        data: {
          stages,
          learnedFrom: incidentId,
          requiresApproval: true,
          isActive: false,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`learnFromManualFix — updated existing playbook ${existing.id}`);
      return;
    }

    await this.prisma.remediationPlaybook.create({
      data: {
        errorPattern,
        errorCategory,
        severity: 'medium',
        stages,
        confidenceThreshold: 0.85,
        maxAttempts: 3,
        verificationPeriod: 300,
        isActive: false, // Requirement 6.3: inactive until reviewed
        requiresApproval: true, // Requirement 6.8: Super Admin must approve
        createdBy,
        learnedFrom: incidentId,
        successRate: 0.0,
        executionCount: 0,
      },
    });

    this.logger.log(`learnFromManualFix — created playbook for pattern "${errorPattern}"`);
  }

  // ── 4. adjustThresholds ───────────────────────────────────────────────────

  /**
   * Examine the 7-day success rate for a playbook and nudge its
   * confidenceThreshold up or down by THRESHOLD_STEP.
   *
   * Requirement 6.4 — adjust confidence thresholds based on historical success rates.
   *
   * Rules:
   *   7-day rate > 90%  → raise threshold by 0.02 (cap 0.99)
   *   7-day rate < 60%  → lower threshold by 0.02 (floor 0.50)
   *   otherwise         → no change
   */
  async adjustThresholds(playbookId: string): Promise<void> {
    this.logger.log(`adjustThresholds — playbookId=${playbookId}`);

    const playbook = await this.prisma.remediationPlaybook.findUnique({
      where: { id: playbookId },
    });

    if (!playbook) {
      this.logger.warn(`adjustThresholds — playbook ${playbookId} not found`);
      return;
    }

    // 7-day window
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const executions = await this.prisma.remediationExecution.findMany({
      where: {
        playbookId,
        createdAt: { gte: since },
      },
      select: { outcome: true },
    });

    if (executions.length === 0) {
      this.logger.log(`adjustThresholds — no executions in last 7 days for playbook ${playbookId}`);
      return;
    }

    const successCount = executions.filter((e) => e.outcome === 'success').length;
    const rate = successCount / executions.length;

    let newThreshold = playbook.confidenceThreshold;

    if (rate > this.HIGH_SUCCESS_RATE) {
      newThreshold = Math.min(playbook.confidenceThreshold + this.THRESHOLD_STEP, this.THRESHOLD_CAP);
      this.logger.log(
        `adjustThresholds — rate=${rate.toFixed(2)} > ${this.HIGH_SUCCESS_RATE}; ` +
          `raising threshold ${playbook.confidenceThreshold.toFixed(2)} → ${newThreshold.toFixed(2)}`,
      );
    } else if (rate < this.LOW_SUCCESS_RATE) {
      newThreshold = Math.max(playbook.confidenceThreshold - this.THRESHOLD_STEP, this.THRESHOLD_FLOOR);
      this.logger.log(
        `adjustThresholds — rate=${rate.toFixed(2)} < ${this.LOW_SUCCESS_RATE}; ` +
          `lowering threshold ${playbook.confidenceThreshold.toFixed(2)} → ${newThreshold.toFixed(2)}`,
      );
    } else {
      this.logger.log(
        `adjustThresholds — rate=${rate.toFixed(2)} in range; no change for playbook ${playbookId}`,
      );
      return;
    }

    await this.prisma.remediationPlaybook.update({
      where: { id: playbookId },
      data: { confidenceThreshold: newThreshold },
    });
  }

  // ── 5. recommendImprovements ──────────────────────────────────────────────

  /**
   * Group recurring ErrorCluster patterns from recent RemediationExecution rows
   * and produce architecture/configuration recommendations for the Super Admin panel.
   *
   * Requirement 6.5 — identify recurring issues requiring permanent fixes.
   * Requirement 6.6 — generate recommendations for architecture improvements.
   *
   * @param orgId  Optional organization scope (null = platform-wide)
   */
  async recommendImprovements(orgId?: string): Promise<Recommendation[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    const executions = await this.prisma.remediationExecution.findMany({
      where: {
        createdAt: { gte: since },
        ...(orgId ? { organizationId: orgId } : {}),
      },
      select: {
        errorPattern: true,
        outcome: true,
        playbookId: true,
      },
    });

    // Frequency count per errorPattern
    const frequencyMap = new Map<string, { total: number; failures: number; playbookId: string }>();

    for (const exec of executions) {
      const existing = frequencyMap.get(exec.errorPattern);
      if (existing) {
        existing.total += 1;
        if (exec.outcome !== 'success') existing.failures += 1;
      } else {
        frequencyMap.set(exec.errorPattern, {
          total: 1,
          failures: exec.outcome !== 'success' ? 1 : 0,
          playbookId: exec.playbookId,
        });
      }
    }

    const recommendations: Recommendation[] = [];

    for (const [pattern, stats] of frequencyMap) {
      // Only surface patterns that appear 3+ times or have high failure rates
      const failureRate = stats.failures / stats.total;
      if (stats.total < 3 && failureRate < 0.5) continue;

      const priority = this.computePriority(stats.total, failureRate);
      const suggestedAction = this.buildSuggestedAction(pattern, failureRate);

      recommendations.push({
        id: `rec:${stats.playbookId}:${Date.now()}`,
        playbookPattern: pattern,
        frequency: stats.total,
        suggestedAction,
        priority,
      });
    }

    // Sort by frequency descending so the highest-impact recommendations come first
    recommendations.sort((a, b) => b.frequency - a.frequency);

    this.logger.log(
      `recommendImprovements — ${recommendations.length} recommendations generated` +
        (orgId ? ` for org=${orgId}` : ' (platform-wide)'),
    );

    return recommendations;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Infer a broad error category from the error pattern string.
   * Used when creating new playbook entries without an explicit category.
   */
  private inferCategory(
    pattern: string,
  ): 'database' | 'network' | 'memory' | 'authentication' | 'integration' | 'unknown' {
    const p = pattern.toLowerCase();
    if (p.includes('db') || p.includes('database') || p.includes('prisma') || p.includes('sql')) {
      return 'database';
    }
    if (p.includes('timeout') || p.includes('network') || p.includes('connection') || p.includes('econnrefused')) {
      return 'network';
    }
    if (p.includes('memory') || p.includes('heap') || p.includes('oom')) {
      return 'memory';
    }
    if (p.includes('auth') || p.includes('jwt') || p.includes('token') || p.includes('unauthoriz')) {
      return 'authentication';
    }
    if (p.includes('connector') || p.includes('integration') || p.includes('sync')) {
      return 'integration';
    }
    return 'unknown';
  }

  /**
   * Compute recommendation priority from frequency and failure rate.
   */
  private computePriority(frequency: number, failureRate: number): 'high' | 'medium' | 'low' {
    if (frequency >= 10 || failureRate >= 0.7) return 'high';
    if (frequency >= 5 || failureRate >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Build a human-readable suggestion for a recurring error pattern.
   */
  private buildSuggestedAction(pattern: string, failureRate: number): string {
    const category = this.inferCategory(pattern);

    if (failureRate >= 0.7) {
      return `Pattern "${pattern}" has a high failure rate (${(failureRate * 100).toFixed(0)}%). ` +
        `Review the playbook stages for category "${category}" and consider a permanent architectural fix.`;
    }

    const categoryAdvice: Record<string, string> = {
      database:
        `Review database connection pool sizing and query timeouts for pattern "${pattern}". ` +
        `Consider adding a read replica or connection retry logic.`,
      network:
        `Pattern "${pattern}" suggests network instability. ` +
        `Add circuit-breaker patterns and increase connection timeout thresholds.`,
      memory:
        `Pattern "${pattern}" indicates memory pressure. ` +
        `Profile heap usage and consider increasing pod memory limits or fixing leaks.`,
      authentication:
        `Pattern "${pattern}" shows recurring auth errors. ` +
        `Audit token expiry configuration and refresh-token rotation policies.`,
      integration:
        `Pattern "${pattern}" points to connector instability. ` +
        `Implement exponential back-off and connector health checks on a scheduled basis.`,
      unknown:
        `Pattern "${pattern}" recurs frequently. ` +
        `Investigate root cause and add a dedicated remediation strategy.`,
    };

    return categoryAdvice[category] ?? categoryAdvice['unknown'];
  }
}
