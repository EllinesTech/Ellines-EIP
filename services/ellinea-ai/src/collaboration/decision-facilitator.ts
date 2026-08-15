/**
 * Decision Facilitator
 * Presents decision options and trade-offs for group decision-making
 */

import {
  DecisionOption,
  DecisionFacilitationView,
  TradeOff,
  UserContribution,
} from './types';

export class DecisionFacilitator {
  /**
   * Create a decision option from contributions
   */
  createDecisionOption(
    optionId: string,
    title: string,
    description: string,
    contributions: UserContribution[],
  ): DecisionOption {
    const supportingParticipants = contributions
      .filter((c) => c.type === 'opinion' && c.confidence && c.confidence >= 70)
      .map((c) => c.participantId);

    const opposingParticipants = contributions
      .filter((c) => c.type === 'concern' && c.confidence && c.confidence >= 70)
      .map((c) => c.participantId);

    const supportingEvidence = contributions
      .filter((c) => c.type === 'data_point' || c.type === 'analysis')
      .map((c) => c.content);

    const avgConfidence =
      contributions.length > 0
        ? contributions.reduce((sum, c) => sum + (c.confidence || 50), 0) /
          contributions.length
        : 50;

    return {
      id: optionId,
      title,
      description,
      proponents: supportingParticipants,
      opponents: opposingParticipants,
      estimatedImpact: {
        financial: undefined,
        operational: undefined,
        strategic: undefined,
        risk: undefined,
      },
      tradeoffs: [],
      supportingEvidence,
      confidenceScore: Math.round(avgConfidence),
    };
  }

  /**
   * Add trade-off to a decision option
   */
  addTradeOff(
    option: DecisionOption,
    tradeoff: TradeOff,
  ): DecisionOption {
    option.tradeoffs.push(tradeoff);
    return option;
  }

  /**
   * Calculate stakeholder alignment for decision options
   */
  calculateStakeholderAlignment(
    options: DecisionOption[],
    participantRoles: Array<{ id: string; role: string }>,
  ): Map<string, number> {
    const alignment = new Map<string, number>();

    for (const role of new Set(participantRoles.map((p) => p.role))) {
      const roleParticipants = participantRoles.filter((p) => p.role === role);
      let totalSupport = 0;
      let totalOpposition = 0;

      for (const option of options) {
        for (const participant of roleParticipants) {
          if (option.proponents.includes(participant.id)) {
            totalSupport++;
          }
          if (option.opponents.includes(participant.id)) {
            totalOpposition++;
          }
        }
      }

      const total = totalSupport + totalOpposition;
      const score = total > 0
        ? (totalSupport / total) * 100
        : 50;

      alignment.set(role, Math.round(score));
    }

    return alignment;
  }

  /**
   * Generate comprehensive decision facilitation view
   */
  generateFacilitationView(
    options: DecisionOption[],
    participantRoles: Array<{ id: string; role: string }>,
  ): DecisionFacilitationView {
    const recommendations = this.generateRecommendations(options);
    const riskAssessment = this.assessRisks(options);
    const timelineSuggestion = this.suggestTimeline(options);
    const stakeholderAlignment = this.calculateStakeholderAlignment(
      options,
      participantRoles,
    );

    return {
      options,
      recommendations,
      riskAssessment,
      timelineSuggestion,
      stakeholderAlignment,
    };
  }

  /**
   * Generate recommendations for decision
   */
  private generateRecommendations(options: DecisionOption[]): string[] {
    const recommendations: string[] = [];

    if (options.length === 0) {
      return ['No options available for decision'];
    }

    // Find option with highest confidence and support
    const topOption = options.reduce((prev, current) =>
      current.proponents.length > prev.proponents.length ? current : prev,
    );

    if (topOption.proponents.length > topOption.opponents.length) {
      recommendations.push(`Strong consensus for: ${topOption.title}`);
    } else if (topOption.proponents.length === topOption.opponents.length) {
      recommendations.push(
        `Mixed support for: ${topOption.title}. Further discussion recommended.`,
      );
    } else {
      recommendations.push(
        `Consider alternative approaches. Option "${topOption.title}" has concerns.`,
      );
    }

    // Check for critical gaps
    for (const option of options) {
      if (option.opponents.length === 0 && option.proponents.length > 0) {
        recommendations.push(`Option "${option.title}" has no opposition - consider for immediate decision`);
        break;
      }
    }

    return recommendations;
  }

  /**
   * Assess risks for each option
   */
  private assessRisks(options: DecisionOption[]): string {
    const risks: string[] = [];

    for (const option of options) {
      const riskTradeoffs = option.tradeoffs.filter((t) => t.type === 'risk');
      const highRisks = riskTradeoffs.filter((t) => t.magnitude === 'high');

      if (highRisks.length > 0) {
        risks.push(`"${option.title}": ${highRisks.length} high-risk factors identified`);
      }
    }

    if (risks.length === 0) {
      return 'No major risks identified across options';
    }

    return risks.join('; ');
  }

  /**
   * Suggest timeline for decision
   */
  private suggestTimeline(options: DecisionOption[]): string {
    if (options.length === 0) return 'Decision timeline: Unable to determine';

    const consensusLevel = (options.reduce((sum, o) => sum + o.proponents.length, 0) /
      (options.length * 10)) *
      100;

    if (consensusLevel >= 80) {
      return 'Consensus strong: Decision can proceed immediately (1-2 hours)';
    } else if (consensusLevel >= 60) {
      return 'Moderate consensus: Recommend 24-hour reflection period';
    } else {
      return 'Low consensus: Recommend 48+ hours for additional discussion and stakeholder input';
    }
  }

  /**
   * Present option comparison
   */
  compareOptions(
    option1: DecisionOption,
    option2: DecisionOption,
  ): {
    similarities: string[];
    differences: string[];
    recommendedOption: string;
  } {
    const similarities: string[] = [];
    const differences: string[] = [];

    // Compare impact areas
    if (option1.estimatedImpact.financial === option2.estimatedImpact.financial) {
      similarities.push('Same financial impact');
    } else {
      differences.push('Different financial implications');
    }

    if (option1.estimatedImpact.operational === option2.estimatedImpact.operational) {
      similarities.push('Same operational impact');
    } else {
      differences.push('Different operational requirements');
    }

    // Compare support levels
    const supportRatio1 =
      option1.proponents.length / Math.max(option1.proponents.length + option1.opponents.length, 1);
    const supportRatio2 =
      option2.proponents.length / Math.max(option2.proponents.length + option2.opponents.length, 1);

    const recommendedOption =
      supportRatio1 > supportRatio2
        ? option1.title
        : supportRatio2 > supportRatio1
          ? option2.title
          : 'Requires further discussion';

    return {
      similarities,
      differences,
      recommendedOption,
    };
  }

  /**
   * Format decision option for presentation
   */
  formatOptionPresentation(option: DecisionOption): {
    title: string;
    summary: string;
    supportScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    readinessScore: number;
  } {
    const totalStakeholders = option.proponents.length + option.opponents.length;
    const supportScore =
      totalStakeholders > 0
        ? (option.proponents.length / totalStakeholders) * 100
        : 50;

    const riskCount = option.tradeoffs.filter((t) => t.type === 'risk').length;
    const highRiskCount = option.tradeoffs.filter((t) => t.type === 'risk' && t.magnitude === 'high').length;
    const riskLevel: 'low' | 'medium' | 'high' =
      highRiskCount > 0 ? 'high' : riskCount > 2 ? 'medium' : 'low';

    // Readiness is based on support, confidence, and evidence
    const readinessScore = Math.round(
      (supportScore * 0.4 +
        option.confidenceScore * 0.3 +
        (option.supportingEvidence.length > 0 ? 100 : 0) * 0.3) /
        100,
    );

    return {
      title: option.title,
      summary: option.description,
      supportScore: Math.round(supportScore),
      riskLevel,
      readinessScore,
    };
  }

  /**
   * Identify decision blockers
   */
  identifyBlockers(options: DecisionOption[]): Array<{ type: string; description: string; severity: 'critical' | 'high' | 'medium' }> {
    const blockers = [];

    for (const option of options) {
      // Strong opposition is a blocker
      if (option.opponents.length > option.proponents.length) {
        blockers.push({
          type: 'OPPOSITION',
          description: `Option "${option.title}" has more opposition (${option.opponents.length}) than support (${option.proponents.length})`,
          severity: 'high',
        });
      }

      // High risks are blockers
      const highRisks = option.tradeoffs.filter((t) => t.type === 'risk' && t.magnitude === 'high');
      if (highRisks.length > 0) {
        blockers.push({
          type: 'RISK',
          description: `${highRisks.length} high-risk factor(s) identified for "${option.title}"`,
          severity: 'critical',
        });
      }

      // Low confidence is a blocker
      if (option.confidenceScore < 50) {
        blockers.push({
          type: 'LOW_CONFIDENCE',
          description: `Option "${option.title}" has low confidence score (${option.confidenceScore}%)`,
          severity: 'medium',
        });
      }

      // No evidence is a blocker
      if (option.supportingEvidence.length === 0) {
        blockers.push({
          type: 'NO_EVIDENCE',
          description: `Option "${option.title}" lacks supporting evidence`,
          severity: 'medium',
        });
      }
    }

    return blockers.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
}
