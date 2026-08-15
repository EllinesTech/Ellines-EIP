import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowOutcome,
  DecisionOutcome,
  LearningPoint,
  DecisionRecord,
  WorkflowExecutionContext,
} from '../types';
import { v4 as uuid } from 'uuid';

/**
 * Outcome Monitor
 * Tracks and records execution outcomes for learning system
 */
@Injectable()
export class OutcomeMonitor {
  private readonly logger = new Logger(OutcomeMonitor.name);
  private outcomes: Map<string, WorkflowOutcome> = new Map();
  private decisionOutcomes: Map<string, DecisionOutcome> = new Map();
  private learningPoints: Map<string, LearningPoint[]> = new Map();

  /**
   * Record workflow outcome
   */
  recordWorkflowOutcome(outcome: WorkflowOutcome): void {
    this.outcomes.set(outcome.executionId, outcome);
    this.logger.info(
      `Recorded workflow outcome: ${outcome.executionId} - Success: ${outcome.success}`,
    );

    // Extract learning points
    const learningPoints = this.extractLearningPoints(outcome);
    if (learningPoints.length > 0) {
      this.learningPoints.set(outcome.executionId, learningPoints);
      this.logger.debug(`Extracted ${learningPoints.length} learning points`);
    }
  }

  /**
   * Record decision outcome
   */
  recordDecisionOutcome(
    decisionId: string,
    outcome: DecisionOutcome,
  ): void {
    this.decisionOutcomes.set(decisionId, outcome);
    this.logger.debug(
      `Recorded decision outcome: ${decisionId} - Success: ${outcome.success}`,
    );
  }

  /**
   * Extract learning points from outcome
   */
  private extractLearningPoints(outcome: WorkflowOutcome): LearningPoint[] {
    const points: LearningPoint[] = [];

    // Learning 1: Success patterns
    if (outcome.success) {
      points.push({
        type: 'success_factor',
        description: `Workflow succeeded with ${outcome.decisionsRecorded} decisions and ${outcome.approvalsGranted} approvals`,
        confidence: 0.85,
        applicability: [`workflow_type:${outcome.workflowId}`],
        actionableInsight:
          'This workflow structure and decision sequence showed positive outcomes - candidates for expansion',
      });
    }

    // Learning 2: Error patterns
    if (outcome.errors.length > 0) {
      const errorCategories = new Map<string, number>();
      for (const error of outcome.errors) {
        const count = errorCategories.get(error.error) || 0;
        errorCategories.set(error.error, count + 1);
      }

      for (const [errorMsg, count] of errorCategories.entries()) {
        if (count > 1) {
          points.push({
            type: 'failure_reason',
            description: `Error "${errorMsg}" occurred ${count} times`,
            confidence: Math.min(0.95, 0.5 + count * 0.15),
            applicability: [`error_type:${errorMsg}`],
            actionableInsight: 'Consider adding retry logic or alternative handling for this error',
          });
        }
      }
    }

    // Learning 3: Approval patterns
    if (
      outcome.approvalsRequired > 0 &&
      outcome.approvalsGranted === outcome.approvalsRequired
    ) {
      points.push({
        type: 'pattern',
        description: `All ${outcome.approvalsRequired} approval requests were granted`,
        confidence: 0.8,
        applicability: ['approval_process'],
        actionableInsight:
          'Consider if approval threshold could be relaxed to enable more autonomous execution',
      });
    }

    if (outcome.approvalsRequired > outcome.approvalsGranted) {
      points.push({
        type: 'pattern',
        description: `${outcome.approvalsRequired - outcome.approvalsGranted} approval requests were rejected`,
        confidence: 0.8,
        applicability: ['approval_process'],
        actionableInsight: 'Investigate why approvals were rejected - may indicate policy misalignment',
      });
    }

    // Learning 4: Execution time patterns
    if (outcome.completionTime > 60000) {
      // > 1 minute
      points.push({
        type: 'unknown_interaction',
        description: `Workflow took ${(outcome.completionTime / 1000).toFixed(0)} seconds to complete`,
        confidence: 0.7,
        applicability: ['performance'],
        actionableInsight: 'Identify bottleneck steps and optimize for faster execution',
      });
    }

    return points;
  }

  /**
   * Get learning points for decision type
   */
  getLearningPointsForDecisionType(
    decisionPointId: string,
    limit: number = 10,
  ): LearningPoint[] {
    const allPoints: LearningPoint[] = [];

    for (const points of this.learningPoints.values()) {
      allPoints.push(
        ...points.filter((p) => p.applicability.includes(`decision:${decisionPointId}`)),
      );
    }

    return allPoints.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  }

  /**
   * Get success rate for decision
   */
  getDecisionSuccessRate(decisionId: string): number {
    const outcome = this.decisionOutcomes.get(decisionId);
    if (!outcome) {
      return 0.5; // Default neutral confidence
    }

    return outcome.success ? 0.8 : 0.2;
  }

  /**
   * Get workflow success rate
   */
  getWorkflowSuccessRate(workflowId: string): number {
    const workflowOutcomes = Array.from(this.outcomes.values()).filter(
      (o) => o.workflowId === workflowId,
    );

    if (workflowOutcomes.length === 0) {
      return 0.5;
    }

    const successCount = workflowOutcomes.filter((o) => o.success).length;
    return successCount / workflowOutcomes.length;
  }

  /**
   * Get agent statistics
   */
  getAgentStatistics(agentId: string) {
    const agentOutcomes = Array.from(this.outcomes.values()).filter(
      (o) => o.agentId === agentId,
    );

    const stats = {
      totalExecutions: agentOutcomes.length,
      successfulExecutions: agentOutcomes.filter((o) => o.success).length,
      failedExecutions: agentOutcomes.filter((o) => !o.success).length,
      successRate:
        agentOutcomes.length > 0
          ? agentOutcomes.filter((o) => o.success).length / agentOutcomes.length
          : 0,
      totalDecisions: agentOutcomes.reduce((sum, o) => sum + o.decisionsRecorded, 0),
      totalApprovalsRequired: agentOutcomes.reduce(
        (sum, o) => sum + o.approvalsRequired,
        0,
      ),
      totalApprovalsGranted: agentOutcomes.reduce(
        (sum, o) => sum + o.approvalsGranted,
        0,
      ),
      averageExecutionTime: agentOutcomes.length
        ? agentOutcomes.reduce((sum, o) => sum + o.completionTime, 0) /
          agentOutcomes.length
        : 0,
    };

    return stats;
  }

  /**
   * Get most recent outcomes
   */
  getRecentOutcomes(limit: number = 20): WorkflowOutcome[] {
    return Array.from(this.outcomes.values())
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Find similar outcomes
   */
  findSimilarOutcomes(
    workflowId: string,
    errorPattern?: string,
  ): WorkflowOutcome[] {
    return Array.from(this.outcomes.values()).filter((o) => {
      const isWorkflowMatch = o.workflowId === workflowId;
      if (!errorPattern) {
        return isWorkflowMatch;
      }
      const hasErrorPattern = o.errors.some((e) =>
        e.error.toLowerCase().includes(errorPattern.toLowerCase()),
      );
      return isWorkflowMatch && hasErrorPattern;
    });
  }

  /**
   * Clear old outcomes (for memory management)
   */
  clearOldOutcomes(olderThanMs: number): number {
    const cutoffTime = new Date().getTime() - olderThanMs;
    let removed = 0;

    for (const [key, outcome] of this.outcomes.entries()) {
      if (outcome.recordedAt.getTime() < cutoffTime) {
        this.outcomes.delete(key);
        this.learningPoints.delete(key);
        removed++;
      }
    }

    this.logger.debug(`Cleared ${removed} old outcomes`);
    return removed;
  }
}
