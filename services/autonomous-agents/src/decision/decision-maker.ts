import { Injectable, Logger } from '@nestjs/common';
import {
  Decision,
  DecisionPoint,
  DecisionReasoning,
  DecisionFactor,
  ConfidenceFactor,
  DecisionOption,
  AgentPolicy,
  ExplainableDecision,
  DecisionExplanation,
  AlternativeOption,
  RuledOutReason,
  DataSourceCitation,
} from '../types';
import { v4 as uuid } from 'uuid';

/**
 * Decision Maker Service
 * Makes autonomous decisions with confidence scoring and reasoning
 * Acts autonomously at >= 90% confidence, requests approval below that threshold
 */
@Injectable()
export class DecisionMaker {
  private readonly logger = new Logger(DecisionMaker.name);
  private readonly AUTONOMOUS_THRESHOLD = 0.9; // 90% confidence for autonomous action
  private readonly APPROVAL_THRESHOLD = 0.5; // 50% confidence requiring approval (below this = escalation)

  /**
   * Make a decision at a decision point
   */
  async makeDecision(
    decisionPoint: DecisionPoint,
    policy: AgentPolicy,
    context: Record<string, any>,
  ): Promise<Decision> {
    const decision: Decision = {
      id: uuid(),
      decisionPointId: decisionPoint.id,
      selectedOptionId: '',
      confidence: 0,
      reasoning: {
        factors: [],
        confidenceFactors: [],
        knowledgeGapWarnings: [],
        assumptionsUsed: [],
      },
      timestamp: new Date(),
      requiresApproval: false,
    };

    // Evaluate each option
    const scoredOptions = decisionPoint.options.map((option) =>
      this.scoreOption(option, decisionPoint, context, policy),
    );

    // Select best option
    const bestOption = scoredOptions.reduce((best, current) =>
      current.score > best.score ? current : best,
    );

    decision.selectedOptionId = bestOption.option.id;
    decision.confidence = bestOption.score;
    decision.reasoning = bestOption.reasoning;

    // Determine if approval is needed
    decision.requiresApproval = decision.confidence < this.AUTONOMOUS_THRESHOLD;

    this.logger.debug(
      `Decision made: ${bestOption.option.id} with confidence ${decision.confidence.toFixed(2)}`,
    );

    return decision;
  }

  /**
   * Score an option based on available data and policy
   */
  private scoreOption(
    option: DecisionOption,
    decisionPoint: DecisionPoint,
    context: Record<string, any>,
    policy: AgentPolicy,
  ): {
    option: DecisionOption;
    score: number;
    reasoning: DecisionReasoning;
  } {
    const factors: DecisionFactor[] = [];
    const confidenceFactors: ConfidenceFactor[] = [];
    const knowledgeGapWarnings: string[] = [];
    const assumptionsUsed: string[] = [];

    // Factor 1: Policy alignment (0.0 - 0.3 contribution)
    const policyAlignmentScore = this.evaluatePolicyAlignment(option, policy);
    factors.push({
      name: 'Policy Alignment',
      weight: 0.3,
      value: policyAlignmentScore,
      source: 'policy_engine',
      reliability: 0.95,
    });

    if (policyAlignmentScore < 0.7) {
      confidenceFactors.push({
        factor: 'policy_alignment',
        impact: -0.1,
        description: 'Selected option has low policy alignment',
      });
    }

    // Factor 2: Historical success rate (0.0 - 0.25 contribution)
    const historicalScore = this.evaluateHistoricalSuccess(option, context);
    factors.push({
      name: 'Historical Success Rate',
      weight: 0.25,
      value: historicalScore,
      source: 'learning_system',
      reliability: historicalScore > 0 ? 0.85 : 0.3, // Low reliability if no history
    });

    if (historicalScore === 0) {
      knowledgeGapWarnings.push('No historical data available for this option type');
    }

    // Factor 3: Contextual relevance (0.0 - 0.25 contribution)
    const contextualScore = this.evaluateContextualRelevance(option, context);
    factors.push({
      name: 'Contextual Relevance',
      weight: 0.25,
      value: contextualScore,
      source: 'context_analyzer',
      reliability: 0.88,
    });

    // Factor 4: Risk assessment (0.0 - 0.2 contribution)
    const riskScore = this.evaluateRiskAssessment(option, policy, context);
    factors.push({
      name: 'Risk Assessment',
      weight: 0.2,
      value: riskScore,
      source: 'risk_engine',
      reliability: 0.9,
    });

    if (riskScore < 0.6) {
      confidenceFactors.push({
        factor: 'high_risk',
        impact: -0.15,
        description: 'This option carries elevated risk',
      });
    }

    // Compute weighted score
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of factors) {
      totalScore += factor.value * factor.weight * factor.reliability;
      totalWeight += factor.weight * factor.reliability;
    }

    const baseScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;

    // Apply confidence factor adjustments
    let finalScore = baseScore;
    for (const cf of confidenceFactors) {
      finalScore += cf.impact;
    }

    // Clamp to 0-1
    finalScore = Math.max(0, Math.min(1, finalScore));

    // Collect assumptions
    if (historicalScore === 0) {
      assumptionsUsed.push(
        'Assuming this is first occurrence of this option type - conservative scoring applied',
      );
    }

    assumptionsUsed.push(
      'Policy thresholds assumed to be correctly calibrated for organization',
    );

    return {
      option,
      score: finalScore,
      reasoning: {
        factors,
        confidenceFactors,
        knowledgeGapWarnings,
        assumptionsUsed,
      },
    };
  }

  /**
   * Evaluate option against policy
   */
  private evaluatePolicyAlignment(option: DecisionOption, policy: AgentPolicy): number {
    // Check if option value is in allowed categories
    if (option.value && typeof option.value === 'string') {
      // Simple check: no negative keywords
      const negativeKeywords = ['restricted', 'forbidden', 'disallowed', 'prohibited'];
      if (negativeKeywords.some((kw) => option.value.toLowerCase().includes(kw))) {
        return 0.2;
      }
    }

    // Default to good alignment if not explicitly forbidden
    return 0.85;
  }

  /**
   * Evaluate historical success rate for similar decisions
   */
  private evaluateHistoricalSuccess(option: DecisionOption, context: Record<string, any>): number {
    // In real implementation, would query learning database
    // For now, return a default based on context
    if (context.similarDecisionCount && context.similarDecisionSuccess) {
      return context.similarDecisionSuccess / context.similarDecisionCount;
    }

    return 0; // No historical data
  }

  /**
   * Evaluate contextual relevance of option
   */
  private evaluateContextualRelevance(option: DecisionOption, context: Record<string, any>): number {
    let score = 0.5; // Base score

    // Check for matching keywords in context
    if (context.keywords && Array.isArray(context.keywords)) {
      const optionText = (option.label + ' ' + option.description).toLowerCase();
      const keywordMatches = context.keywords.filter((kw: string) =>
        optionText.includes(kw.toLowerCase()),
      ).length;

      if (keywordMatches > 0) {
        score = Math.min(0.95, 0.5 + keywordMatches * 0.1);
      }
    }

    return score;
  }

  /**
   * Evaluate risk of choosing this option
   */
  private evaluateRiskAssessment(
    option: DecisionOption,
    policy: AgentPolicy,
    context: Record<string, any>,
  ): number {
    let riskScore = 0.7; // Start with moderate risk (scale: 0=high risk, 1=low risk)

    // Check policy risk tolerance
    const toleranceMultiplier =
      policy.riskToleranceLevel === 'aggressive' ? 1.2 : policy.riskToleranceLevel === 'conservative' ? 0.8 : 1.0;

    riskScore *= toleranceMultiplier;

    // Check for risky patterns in option
    if (option.value && typeof option.value === 'string') {
      const riskyKeywords = ['delete', 'terminate', 'irreversible', 'permanent'];
      if (riskyKeywords.some((kw) => option.value.toLowerCase().includes(kw))) {
        riskScore *= 0.6; // Reduce score for risky operations
      }
    }

    // Check context for elevated risk indicators
    if (context.systemUnderStress || context.criticalPeriod) {
      riskScore *= 0.75;
    }

    return Math.max(0, Math.min(1, riskScore));
  }

  /**
   * Generate explainable decision with full reasoning and alternatives
   */
  async generateExplainableDecision(
    decision: Decision,
    decisionPoint: DecisionPoint,
    context: Record<string, any>,
    policy: AgentPolicy,
  ): Promise<ExplainableDecision> {
    const selectedOption = decisionPoint.options.find((o) => o.id === decision.selectedOptionId)!;

    // Evaluate alternative options for explanation
    const alternatives: AlternativeOption[] = decisionPoint.options
      .filter((o) => o.id !== decision.selectedOptionId)
      .map((option) => {
        const scored = this.scoreOption(option, decisionPoint, context, policy);
        return {
          optionId: option.id,
          label: option.label,
          whyNotChosen: `Confidence score (${scored.score.toFixed(2)}) is lower than selected option`,
          confidence: scored.score,
          tradeoffs: [
            `Selecting this would reduce overall decision confidence`,
            `Less historical precedent for this choice`,
          ],
        };
      });

    // Find ruled out options (extremely low scores)
    const ruledOut: RuledOutReason[] = alternatives
      .filter((a) => a.confidence < 0.3)
      .map((a) => ({
        optionId: a.optionId,
        reason: 'Confidence score below minimum threshold for viable decision',
        confidence: a.confidence,
      }));

    // Generate explanation
    const explanation: DecisionExplanation = {
      summary: `Selected "${selectedOption.label}" because it best aligns with policies, has strong historical precedent, and presents acceptable risk.`,
      detailedReasoning: this.generateDetailedReasoning(
        decision,
        selectedOption,
        decision.reasoning,
        policy,
      ),
      keyFactors: decision.reasoning.factors
        .filter((f) => f.weight > 0.15)
        .map((f) => ({
          name: f.name,
          importance: f.weight,
          value: f.value.toFixed(2),
        })),
      dataSourceCitations: this.generateDataSourceCitations(context),
      uncertaintySources: {
        dataQuality: ['Historical data may be incomplete'],
        modelLimitations: ['Decision model does not account for novel scenarios'],
        knowledgeGaps: decision.reasoning.knowledgeGapWarnings,
        timelinessIssues: [],
      },
    };

    return {
      decision,
      explanation,
      alternativeOptions: alternatives.filter((a) => a.confidence > 0.3),
      assumptionsHighlights: decision.reasoning.assumptionsUsed,
      confidenceBreakdown: decision.reasoning.confidenceFactors,
      ruledOutReasons: ruledOut,
    };
  }

  /**
   * Generate detailed reasoning text
   */
  private generateDetailedReasoning(
    decision: Decision,
    selectedOption: DecisionOption,
    reasoning: DecisionReasoning,
    policy: AgentPolicy,
  ): string {
    const lines: string[] = [];

    lines.push(`Decision Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    lines.push(`Autonomy Threshold: ${(this.AUTONOMOUS_THRESHOLD * 100).toFixed(0)}%`);
    lines.push('');

    lines.push('Key Contributing Factors:');
    for (const factor of reasoning.factors) {
      const contribution = ((factor.value * factor.weight * 100) / 100).toFixed(0);
      lines.push(
        `  • ${factor.name}: ${(factor.value * 100).toFixed(0)}% (${contribution}% contribution)`,
      );
    }

    if (reasoning.confidenceFactors.length > 0) {
      lines.push('');
      lines.push('Confidence Adjustments:');
      for (const cf of reasoning.confidenceFactors) {
        lines.push(`  • ${cf.factor}: ${cf.description}`);
      }
    }

    if (reasoning.knowledgeGapWarnings.length > 0) {
      lines.push('');
      lines.push('Warnings and Gaps:');
      for (const warning of reasoning.knowledgeGapWarnings) {
        lines.push(`  ⚠ ${warning}`);
      }
    }

    lines.push('');
    lines.push(`Policy Risk Tolerance: ${policy.riskToleranceLevel}`);
    lines.push(
      decision.confidence >= this.AUTONOMOUS_THRESHOLD
        ? 'Status: Sufficient confidence for autonomous execution'
        : 'Status: Requires human approval',
    );

    return lines.join('\n');
  }

  /**
   * Generate data source citations
   */
  private generateDataSourceCitations(context: Record<string, any>): DataSourceCitation[] {
    const citations: DataSourceCitation[] = [];

    // Extract citations from context if available
    if (context.sources && Array.isArray(context.sources)) {
      for (const source of context.sources) {
        citations.push({
          source: source.name || 'Unknown',
          systemId: source.systemId || 'unknown',
          recordId: source.recordId || '',
          fieldName: source.field || '',
          value: source.value,
          retrievedAt: new Date(),
          confidence: source.confidence || 0.8,
        });
      }
    }

    return citations;
  }

  /**
   * Determine if decision requires approval based on confidence threshold
   */
  requiresApproval(confidence: number): boolean {
    return confidence < this.AUTONOMOUS_THRESHOLD;
  }

  /**
   * Determine if decision should be escalated
   */
  shouldEscalate(confidence: number): boolean {
    return confidence < this.APPROVAL_THRESHOLD;
  }

  /**
   * Get confidence thresholds for policy
   */
  getConfidenceThresholds(policy: AgentPolicy) {
    return {
      autonomousAction: this.AUTONOMOUS_THRESHOLD,
      requiresApproval: this.APPROVAL_THRESHOLD,
      requiresEscalation: Math.min(this.APPROVAL_THRESHOLD, 0.3),
      policyAutonomy: policy.autonomyThreshold,
      policyApproval: policy.approvalThreshold,
      policyEscalation: policy.escalationThreshold,
    };
  }
}
