/**
 * Self-Healing Learner Service
 *
 * Learns from remediation outcomes to improve future healing capabilities.
 * Records outcomes, identifies patterns, captures manual fixes, adjusts
 * confidence thresholds, identifies recurring issues, recommends architecture
 * improvements, and shares learnings via federated learning.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RemediationResult, RemediationAction, Incident } from '../remediation/remediation.service';
import {
  TimeRange,
  ManualFix,
  ManualAction,
  NewStrategy,
  UpdatedStrategy,
  ImpactEstimate,
  Recommendation,
  FederatedContribution,
  AnonymizedStrategy,
  RecurringIssue,
  RemediationOutcome,
  StrategyPattern,
} from './learner.interfaces';

// Re-export for backward compatibility
export {
  TimeRange,
  ManualFix,
  ManualAction,
  NewStrategy,
  UpdatedStrategy,
  ImpactEstimate,
  Recommendation,
  FederatedContribution,
  AnonymizedStrategy,
  RecurringIssue,
  RemediationOutcome,
};

/** @deprecated Use StrategyPattern from learner.interfaces instead */
export type Pattern = StrategyPattern;

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class LearnerService implements OnModuleDestroy {
  private readonly logger = new Logger(LearnerService.name);
  private readonly prisma: PrismaClient;

  /**
   * Minimum number of successful executions before a pattern is promoted to a candidate strategy.
   * Req 6.2: Analyze successful remediations to identify patterns.
   */
  private readonly MIN_PATTERN_SUPPORT = 3;

  /**
   * Minimum success rate to include a strategy in federated sharing.
   * Req 6.7: Share learned remediations via federated learning.
   */
  private readonly MIN_FEDERATED_SUCCESS_RATE = 0.7;

  /**
   * Occurrence threshold to flag an issue as recurring.
   * Req 6.5: Identify recurring issues requiring permanent fixes.
   */
  private readonly RECURRING_THRESHOLD = 5;

  /**
   * Confidence threshold adjustment step.
   * Req 6.4: Adjust thresholds based on historical success rates.
   */
  private readonly THRESHOLD_ADJUSTMENT_STEP = 0.05;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Record the outcome of a remediation attempt.
   * Req 6.1: Record outcomes (success, failure, partial success, escalated).
   *
   * This is triggered by RemediationService after each execution and persists
   * the outcome in RemediationExecution for downstream analysis.
   */
  async recordOutcome(result: RemediationResult, incident: Incident): Promise<void> {
    this.logger.log(
      `Recording outcome for incident ${incident.id}: ${result.success ? 'success' : result.escalated ? 'escalated' : 'failure'}`,
    );

    // Determine outcome label
    let outcome: 'success' | 'partial_success' | 'failure' | 'escalated';
    if (result.success) {
      outcome = 'success';
    } else if (result.escalated) {
      outcome = 'escalated';
    } else if (result.stagesExecuted > 0 && result.actionsPerformed.length > 0) {
      outcome = 'partial_success';
    } else {
      outcome = 'failure';
    }

    // Update playbook success rate and execution count (Req 6.4 prerequisite)
    await this.updatePlaybookStats(incident.errorPattern, outcome);

    // Update or create recurring issue tracker (Req 6.5 prerequisite)
    await this.trackRecurringIssue(incident.errorPattern, incident.organizationId, outcome);

    this.logger.log(`Outcome '${outcome}' recorded for pattern: ${incident.errorPattern}`);
  }

  /**
   * Analyze successful remediations within a time window to identify patterns
   * and promote promising new strategies.
   * Req 6.2: Analyze successful remediations to identify patterns and add new strategies.
   */
  async analyzeSuccesses(timeWindow: TimeRange): Promise<StrategyPattern[]> {
    this.logger.log(
      `Analyzing successes from ${timeWindow.from.toISOString()} to ${timeWindow.to.toISOString()}`,
    );

    const executions = await this.prisma.remediationExecution.findMany({
      where: {
        outcome: 'success',
        createdAt: { gte: timeWindow.from, lte: timeWindow.to },
      },
      include: { playbook: true },
    });

    if (executions.length === 0) {
      this.logger.log('No successful executions found in time window');
      return [];
    }

    // Group by errorPattern
    const grouped = new Map<string, typeof executions>();
    for (const exec of executions) {
      const key = exec.errorPattern;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(exec);
    }

    const patterns: StrategyPattern[] = [];

    for (const [errorPattern, group] of grouped.entries()) {
      const successCount = group.length;
      const totalForPattern = await this.prisma.remediationExecution.count({
        where: {
          errorPattern,
          createdAt: { gte: timeWindow.from, lte: timeWindow.to },
        },
      });

      const successRate = totalForPattern > 0 ? successCount / totalForPattern : 0;
      const avgTimeTaken = group.reduce((sum, e) => sum + e.timeTaken, 0) / group.length;

      // Collect most common action types across successful runs
      const actionCounts = new Map<string, number>();
      for (const exec of group) {
        const actions = (exec.actionsPerformed as unknown as RemediationAction[]) || [];
        for (const action of actions) {
          actionCounts.set(action.type, (actionCounts.get(action.type) || 0) + 1);
        }
      }

      const commonActions: RemediationAction[] = Array.from(actionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => ({
          type: type as RemediationAction['type'],
          target: errorPattern,
          riskLevel: 'low' as const,
        }));

      patterns.push({
        errorPattern,
        occurrenceCount: successCount,
        successRate,
        commonActions,
        avgTimeTaken,
      });

      // Req 6.2: If pattern has enough support and high success rate, create a candidate strategy
      if (successCount >= this.MIN_PATTERN_SUPPORT && successRate >= 0.8) {
        await this.promoteToCandidate(errorPattern, commonActions, successRate, 'pattern_analysis');
      }
    }

    this.logger.log(`Pattern analysis complete: ${patterns.length} patterns identified`);
    return patterns;
  }

  /**
   * Learn the remediation approach from a manual admin fix for future automation.
   * Req 6.3: When manual fix resolves escalated issue, learn the approach.
   * Req 6.8: New strategy requires Platform_Super_Admin approval before deployment.
   */
  async learnFromManualFix(incident: Incident, fix: ManualFix): Promise<NewStrategy> {
    this.logger.log(
      `Learning from manual fix by admin ${fix.adminId} for incident ${fix.incidentId}`,
    );

    // Convert manual actions to RemediationAction format
    const learnedActions: RemediationAction[] = fix.actions.map((a) => ({
      type: (a.type as RemediationAction['type']) || 'restart',
      target: a.target,
      parameters: a.parameters,
      riskLevel: 'medium' as const,
    }));

    // Initial confidence is low — starts at 0.5 since only one example
    const confidence = 0.5;

    // Req 6.8: All manually-learned strategies require approval before deployment
    const requiresApproval = true;

    // Create a candidate strategy awaiting Platform_Super_Admin review
    const candidate = await this.prisma.learnerStrategyCandidate.create({
      data: {
        errorPattern: incident.errorPattern,
        learnedActions: learnedActions as any,
        confidence,
        source: 'manual_fix',
        sourceIncidentId: fix.incidentId,
        sourceAdminId: fix.adminId,
        status: 'pending',
        organizationId: incident.organizationId,
        patternSupport: 1,
      },
    });

    this.logger.log(
      `Strategy candidate ${candidate.id} created from manual fix — awaiting approval`,
    );

    return {
      errorPattern: incident.errorPattern,
      learnedActions,
      confidence,
      requiresApproval,
      candidateId: candidate.id,
    };
  }

  /**
   * EMA smoothing factor for confidence threshold adjustment.
   * Alpha = 0.2 means 20% weight on the latest observation, 80% retained.
   * Req 6.4: Use EMA to adjust confidence thresholds.
   */
  private readonly EMA_ALPHA = 0.2;

  /**
   * Adjust the confidence threshold for a remediation strategy using EMA.
   * Req 6.4: Adjust confidence thresholds for Auto_Remediation actions based on historical success rates.
   *
   * EMA formula: new_threshold = alpha * target + (1 - alpha) * current
   * Target is derived from success rate:
   *   - High success (>= 90%): target = 0.75 (allow easier triggering)
   *   - Low success  (<= 60%): target = 0.95 (require higher confidence)
   *   - Otherwise: no adjustment
   */
  async adjustThresholds(errorPattern: string): Promise<UpdatedStrategy> {
    this.logger.log(`Adjusting confidence threshold via EMA for pattern: ${errorPattern}`);

    const playbook = await this.prisma.remediationPlaybook.findFirst({
      where: { errorPattern, isActive: true },
    });

    if (!playbook) {
      throw new Error(`No active playbook found for pattern: ${errorPattern}`);
    }

    const oldThreshold = playbook.confidenceThreshold;
    let newThreshold = oldThreshold;
    const successRate = playbook.successRate;
    const executionCount = playbook.executionCount;

    // Only adjust after sufficient executions to have statistical validity
    if (executionCount >= 10) {
      let target: number | null = null;

      if (successRate >= 0.9) {
        // Lower threshold target: strategy is very reliable — trigger more readily
        target = Math.max(0.5, oldThreshold - this.THRESHOLD_ADJUSTMENT_STEP);
        this.logger.log(
          `Pattern "${errorPattern}" has high success (${(successRate * 100).toFixed(1)}%) — EMA target toward lower threshold`,
        );
      } else if (successRate <= 0.6) {
        // Raise threshold target: strategy is unreliable — require higher confidence
        target = Math.min(0.99, oldThreshold + this.THRESHOLD_ADJUSTMENT_STEP);
        this.logger.log(
          `Pattern "${errorPattern}" has low success (${(successRate * 100).toFixed(1)}%) — EMA target toward higher threshold`,
        );
      } else {
        this.logger.log(
          `Pattern "${errorPattern}" success rate ${(successRate * 100).toFixed(1)}% within normal range — no threshold adjustment`,
        );
      }

      if (target !== null) {
        // Apply EMA: smooth transition toward target
        newThreshold = this.EMA_ALPHA * target + (1 - this.EMA_ALPHA) * oldThreshold;
        // Round to 3 decimal places
        newThreshold = Math.round(newThreshold * 1000) / 1000;
      }
    } else {
      this.logger.log(
        `Pattern "${errorPattern}" has only ${executionCount} executions — insufficient data for EMA adjustment (need >= 10)`,
      );
    }

    if (newThreshold !== oldThreshold) {
      await this.prisma.remediationPlaybook.update({
        where: { id: playbook.id },
        data: { confidenceThreshold: newThreshold },
      });
    }

    return {
      errorPattern,
      oldThreshold,
      newThreshold,
      successRate,
      executionCount,
    };
  }

  /**
   * Generate architecture improvement recommendations based on recurring issue patterns.
   * Req 6.6: Generate recommendations for architecture improvements that would prevent classes of issues.
   */
  async recommendImprovements(): Promise<Recommendation[]> {
    this.logger.log('Generating architecture improvement recommendations');

    // Find recurring issues that have not been resolved
    const recurringIssues = await this.prisma.learnerRecurringIssue.findMany({
      where: {
        permanentFixNeeded: true,
        status: 'active',
      },
      orderBy: { occurrenceCount: 'desc' },
      take: 20,
    });

    // Also look at playbooks with consistently low success rates
    const weakPlaybooks = await this.prisma.remediationPlaybook.findMany({
      where: {
        isActive: true,
        executionCount: { gte: 5 },
        successRate: { lt: 0.6 },
      },
      orderBy: { successRate: 'asc' },
      take: 10,
    });

    const recommendations: Recommendation[] = [];

    // Generate recommendations from recurring issues
    for (const issue of recurringIssues) {
      const rec = await this.buildRecommendationFromRecurring(issue);
      if (rec) {
        // Persist recommendation
        const saved = await this.prisma.learnerArchitectureRecommendation.upsert({
          where: {
            // Use a deterministic check — if a recommendation for this pattern + type exists, update it
            id: await this.findExistingRecommendationId(issue.errorPattern, rec.type),
          },
          update: {
            rationale: rec.rationale,
            estimatedImpact: rec.estimatedImpact as any,
          },
          create: {
            type: rec.type,
            description: rec.description,
            rationale: rec.rationale,
            preventedErrorTypes: rec.preventedErrorTypes as any,
            estimatedImpact: rec.estimatedImpact as any,
            organizationId: issue.organizationId,
            status: 'open',
          },
        });
        recommendations.push({ ...rec, id: saved.id });
      }
    }

    // Generate recommendations from weak playbooks
    for (const pb of weakPlaybooks) {
      const rec = this.buildRecommendationFromWeakPlaybook(pb);
      const saved = await this.prisma.learnerArchitectureRecommendation.create({
        data: {
          type: rec.type,
          description: rec.description,
          rationale: rec.rationale,
          preventedErrorTypes: rec.preventedErrorTypes as any,
          estimatedImpact: rec.estimatedImpact as any,
          status: 'open',
        },
      });
      recommendations.push({ ...rec, id: saved.id });
    }

    this.logger.log(`Generated ${recommendations.length} improvement recommendations`);
    return recommendations;
  }

  /**
   * Share learned remediation strategies across organizations via federated learning.
   * Req 6.7: Share learned remediations using federated learning techniques.
   *
   * Anonymizes organization-specific data before contributing to the federated pool.
   * Only shares strategies that have demonstrated high success rates.
   */
  async shareStrategies(organizationId?: string): Promise<FederatedContribution> {
    this.logger.log(
      `Preparing federated learning contribution${organizationId ? ` for org ${organizationId}` : ''}`,
    );

    // Gather approved, high-performing playbooks for this organization
    const where: any = {
      isActive: true,
      successRate: { gte: this.MIN_FEDERATED_SUCCESS_RATE },
      executionCount: { gte: this.MIN_PATTERN_SUPPORT },
    };
    if (organizationId) {
      // Organization-specific executions are tracked via RemediationExecution
      // Playbooks are platform-wide, so we filter by org executions
      const orgPatterns = await this.prisma.remediationExecution.groupBy({
        by: ['errorPattern'],
        where: { organizationId, outcome: 'success' },
        _count: { errorPattern: true },
        having: { errorPattern: { _count: { gte: this.MIN_PATTERN_SUPPORT } } },
      });
      where.errorPattern = { in: orgPatterns.map((p) => p.errorPattern) };
    }

    const playbooks = await this.prisma.remediationPlaybook.findMany({ where });

    // Anonymize: hash the error pattern, keep only action type summaries (no org-specific targets)
    const anonymizedStrategies: AnonymizedStrategy[] = playbooks.map((pb) => {
      const stages = (pb.stages as any[]) || [];
      const actionTypes = stages
        .flatMap((s: any) => (s.actions || []).map((a: any) => a.type))
        .filter(Boolean);

      return {
        errorPatternHash: this.hashString(pb.errorPattern),
        actionTypes,
        successRate: pb.successRate,
        executionCount: pb.executionCount,
      };
    });

    const contribution: FederatedContribution = {
      contributedPatterns: anonymizedStrategies.length,
      anonymizedStrategies,
      organizationId: organizationId || 'platform',
      timestamp: new Date(),
    };

    this.logger.log(
      `Federated contribution prepared: ${contribution.contributedPatterns} anonymized strategies`,
    );

    return contribution;
  }

  /**
   * Get all pending strategy candidates awaiting Platform_Super_Admin approval.
   * Req 6.8: Platform_Super_Admin reviews and approves before production deployment.
   */
  async getPendingApprovals(): Promise<any[]> {
    return this.prisma.learnerStrategyCandidate.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Approve a pending strategy candidate and promote it to the remediation playbook.
   * Req 6.8: Platform_Super_Admin approves new strategies before production deployment.
   */
  async approveStrategy(candidateId: string, reviewerId: string, notes?: string): Promise<void> {
    const candidate = await this.prisma.learnerStrategyCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
    if (candidate.status !== 'pending') {
      throw new Error(`Candidate ${candidateId} is not pending (status: ${candidate.status})`);
    }

    // Promote to playbook
    await this.prisma.remediationPlaybook.upsert({
      where: { errorPattern: candidate.errorPattern },
      update: {
        stages: this.actionsToStages(candidate.learnedActions as any[]) as any,
        confidenceThreshold: candidate.confidence,
        isActive: true,
        learnedFrom: candidate.sourceIncidentId,
      },
      create: {
        errorPattern: candidate.errorPattern,
        errorCategory: 'learned',
        severity: 'medium',
        stages: this.actionsToStages(candidate.learnedActions as any[]) as any,
        confidenceThreshold: candidate.confidence,
        isActive: true,
        createdBy: 'learned',
        learnedFrom: candidate.sourceIncidentId,
      },
    });

    await this.prisma.learnerStrategyCandidate.update({
      where: { id: candidateId },
      data: {
        status: 'deployed',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    this.logger.log(
      `Strategy candidate ${candidateId} approved by ${reviewerId} and deployed to playbook`,
    );
  }

  /**
   * Reject a pending strategy candidate.
   * Req 6.8: Platform_Super_Admin can reject strategies.
   */
  async rejectStrategy(candidateId: string, reviewerId: string, notes?: string): Promise<void> {
    await this.prisma.learnerStrategyCandidate.update({
      where: { id: candidateId },
      data: {
        status: 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    this.logger.log(`Strategy candidate ${candidateId} rejected by ${reviewerId}`);
  }

  /**
   * Get recurring issues flagged for permanent fix.
   * Req 6.5: Identify recurring issues requiring permanent fixes.
   */
  async getRecurringIssues(organizationId?: string): Promise<any[]> {
    return this.prisma.learnerRecurringIssue.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        permanentFixNeeded: true,
        status: 'active',
      },
      orderBy: { occurrenceCount: 'desc' },
    });
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Update the success rate and execution count on the playbook record.
   * Req 6.4: Prerequisite data for threshold adjustment.
   */
  private async updatePlaybookStats(
    errorPattern: string,
    outcome: 'success' | 'partial_success' | 'failure' | 'escalated',
  ): Promise<void> {
    const playbook = await this.prisma.remediationPlaybook.findFirst({
      where: { errorPattern, isActive: true },
    });
    if (!playbook) return;

    const newCount = playbook.executionCount + 1;

    // Rolling success rate: weight new result into existing rate
    const isSuccess = outcome === 'success';
    const newRate =
      (playbook.successRate * playbook.executionCount + (isSuccess ? 1 : 0)) / newCount;

    await this.prisma.remediationPlaybook.update({
      where: { id: playbook.id },
      data: {
        executionCount: newCount,
        successRate: newRate,
        lastExecutedAt: new Date(),
      },
    });
  }

  /**
   * Track recurring issues for Req 6.5.
   */
  private async trackRecurringIssue(
    errorPattern: string,
    organizationId: string,
    outcome: string,
  ): Promise<void> {
    const existing = await this.prisma.learnerRecurringIssue.findFirst({
      where: { errorPattern, organizationId },
    });

    if (existing) {
      const newCount = existing.occurrenceCount + 1;
      const remediationCount =
        existing.remediationCount + (['success', 'partial_success', 'failure', 'escalated'].includes(outcome) ? 1 : 0);

      const permanentFixNeeded = newCount >= this.RECURRING_THRESHOLD;

      await this.prisma.learnerRecurringIssue.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: newCount,
          remediationCount,
          lastSeenAt: new Date(),
          permanentFixNeeded,
        },
      });

      if (permanentFixNeeded && !existing.permanentFixNeeded) {
        this.logger.warn(
          `Issue "${errorPattern}" for org ${organizationId} flagged for permanent fix (${newCount} occurrences)`,
        );
      }
    } else {
      await this.prisma.learnerRecurringIssue.create({
        data: {
          errorPattern,
          organizationId,
          occurrenceCount: 1,
          remediationCount: 1,
          permanentFixNeeded: false,
          status: 'active',
        },
      });
    }
  }

  /**
   * Promote a pattern to a candidate strategy awaiting approval.
   * Req 6.2: Add new remediation strategies derived from successful patterns.
   */
  private async promoteToCandidate(
    errorPattern: string,
    actions: RemediationAction[],
    successRate: number,
    source: 'pattern_analysis' | 'manual_fix' | 'federated',
  ): Promise<void> {
    // Check if a pending/deployed candidate already exists for this pattern
    const existing = await this.prisma.learnerStrategyCandidate.findFirst({
      where: { errorPattern, status: { in: ['pending', 'approved', 'deployed'] } },
    });

    if (existing) {
      // Update support count and confidence
      await this.prisma.learnerStrategyCandidate.update({
        where: { id: existing.id },
        data: {
          patternSupport: existing.patternSupport + 1,
          confidence: Math.min(0.95, successRate),
        },
      });
      this.logger.log(`Updated existing candidate for pattern "${errorPattern}"`);
      return;
    }

    await this.prisma.learnerStrategyCandidate.create({
      data: {
        errorPattern,
        learnedActions: actions as any,
        confidence: Math.min(0.95, successRate),
        source,
        status: 'pending',
        patternSupport: 1,
      },
    });

    this.logger.log(`New strategy candidate created for pattern "${errorPattern}" — awaiting approval`);
  }

  /**
   * Build a Recommendation from a recurring issue record.
   * Req 6.6: Recommendations for architecture improvements.
   */
  private async buildRecommendationFromRecurring(issue: any): Promise<Recommendation | null> {
    const pattern = issue.errorPattern as string;

    // Infer recommendation type and description from error pattern
    let type: Recommendation['type'] = 'monitoring';
    let description = '';
    let rationale = '';

    if (/database|db|connection|pool/i.test(pattern)) {
      type = 'architecture';
      description = `Implement database connection pooling or read replicas to prevent recurring "${pattern}" failures`;
      rationale = `This pattern has occurred ${issue.occurrenceCount} times and been temporarily remediated ${issue.remediationCount} times. A persistent architectural fix would prevent these occurrences.`;
    } else if (/memory|heap|oom|out.of.memory/i.test(pattern)) {
      type = 'configuration';
      description = `Increase memory limits and implement circuit breakers for services affected by "${pattern}"`;
      rationale = `Memory-related issue "${pattern}" has recurred ${issue.occurrenceCount} times. Configuration tuning or horizontal scaling will prevent recurrence.`;
    } else if (/timeout|slow|latency|response.time/i.test(pattern)) {
      type = 'architecture';
      description = `Implement caching layer or async processing for operations triggering "${pattern}"`;
      rationale = `Performance issue "${pattern}" recurred ${issue.occurrenceCount} times. Caching or offloading to async queues will eliminate the root cause.`;
    } else if (/auth|token|credential|permission/i.test(pattern)) {
      type = 'configuration';
      description = `Review and rotate credentials/tokens for services affected by "${pattern}"`;
      rationale = `Authentication issue "${pattern}" occurred ${issue.occurrenceCount} times. Credential rotation and health monitoring will detect issues early.`;
    } else {
      type = 'monitoring';
      description = `Add proactive monitoring and alerting for "${pattern}" to detect root causes earlier`;
      rationale = `This issue has recurred ${issue.occurrenceCount} times. Better observability will allow root cause identification before it escalates.`;
    }

    const impactPerMonth = Math.ceil(issue.occurrenceCount / 3); // rough monthly estimate
    return {
      type,
      description,
      rationale,
      preventedErrorTypes: [pattern],
      estimatedImpact: {
        affectedIncidentsPerMonth: impactPerMonth,
        estimatedMttrReductionMinutes: 15,
        confidenceLevel: issue.occurrenceCount >= 10 ? 'high' : issue.occurrenceCount >= 5 ? 'medium' : 'low',
      },
    };
  }

  /**
   * Build a Recommendation from a weak playbook (low success rate).
   * Req 6.6: Recommendations for architecture improvements.
   */
  private buildRecommendationFromWeakPlaybook(playbook: any): Recommendation {
    return {
      type: 'configuration',
      description: `Review and strengthen remediation strategy for "${playbook.errorPattern}" — current auto-fix success rate is ${(playbook.successRate * 100).toFixed(0)}%`,
      rationale: `The existing remediation playbook for "${playbook.errorPattern}" has only a ${(playbook.successRate * 100).toFixed(0)}% success rate across ${playbook.executionCount} executions. Manual review and improved playbook actions are needed.`,
      preventedErrorTypes: [playbook.errorPattern],
      estimatedImpact: {
        affectedIncidentsPerMonth: Math.ceil(playbook.executionCount / 3),
        estimatedMttrReductionMinutes: 30,
        confidenceLevel: 'medium',
      },
    };
  }

  /** Try to find an existing open recommendation for a pattern+type to avoid duplicates */
  private async findExistingRecommendationId(
    errorPattern: string,
    type: string,
  ): Promise<string> {
    const existing = await this.prisma.learnerArchitectureRecommendation.findFirst({
      where: {
        preventedErrorTypes: { array_contains: errorPattern } as any,
        type,
        status: 'open',
      },
      select: { id: true },
    });
    // Return a non-existent id if not found — upsert will create instead
    return existing?.id ?? 'non-existent-id-will-trigger-create';
  }

  /**
   * Convert a flat list of RemediationActions to a single-stage strategy format.
   */
  private actionsToStages(actions: RemediationAction[]): object[] {
    return [
      {
        stageNumber: 1,
        actions,
        timeout: 30000,
      },
    ];
  }

  /**
   * Simple deterministic hash for anonymizing error patterns in federated contributions.
   * Req 6.7: Privacy-preserving sharing.
   */
  private hashString(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
