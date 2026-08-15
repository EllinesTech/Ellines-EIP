/**
 * Contribution Synthesizer
 * Combines inputs from multiple users, detects conflicts, and synthesizes consensus
 */

import {
  UserContribution,
  SynthesizedContribution,
  AgreementAnalysis,
} from './types';

export class ContributionSynthesizer {
  /**
   * Synthesize multiple contributions into a coherent summary
   */
  synthesizeContributions(
    contributions: UserContribution[],
  ): SynthesizedContribution[] {
    if (contributions.length === 0) return [];

    // Group contributions by topic similarity
    const groups = this.groupContributionsByTopic(contributions);
    const synthesized: SynthesizedContribution[] = [];

    for (const group of groups) {
      if (group.length === 0) continue;

      const primary = group[0];
      const aligned = this.findAlignedContributions(primary, group);
      const conflicting = this.findConflictingContributions(primary, group);
      const consensus = conflicting.length === 0;
      const consensusScore = this.calculateConsensusScore(
        primary,
        aligned,
        conflicting,
      );

      const summary = this.generateSynthesisSummary(
        primary,
        aligned,
        conflicting,
      );

      synthesized.push({
        primaryContribution: primary,
        alignedContributions: aligned,
        conflictingContributions: conflicting,
        consensus,
        consensusScore,
        summary,
      });
    }

    return synthesized;
  }

  /**
   * Analyze agreement/disagreement between contributions
   */
  analyzeAgreement(
    referenceContribution: UserContribution,
    allContributions: UserContribution[],
  ): AgreementAnalysis {
    const alignmentScores = new Map<string, number>();
    const alignedWith: string[] = [];
    const conflictsWith: string[] = [];

    for (const contribution of allContributions) {
      if (contribution.id === referenceContribution.id) continue;

      const alignmentScore = this.calculateAlignmentScore(
        referenceContribution,
        contribution,
      );
      alignmentScores.set(contribution.participantId, alignmentScore);

      if (alignmentScore >= 70) {
        alignedWith.push(contribution.participantId);
      } else if (alignmentScore <= 30) {
        conflictsWith.push(contribution.participantId);
      }
    }

    const scores = Array.from(alignmentScores.values());
    const averageAlignment =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 50;

    const consensusExists = conflictsWith.length === 0;

    return {
      contributionId: referenceContribution.id,
      alignmentScores,
      alignedWith,
      conflictsWith,
      averageAlignment,
      consensusExists,
    };
  }

  /**
   * Calculate alignment score between two contributions (0-100)
   */
  private calculateAlignmentScore(
    contrib1: UserContribution,
    contrib2: UserContribution,
  ): number {
    let score = 50; // Base neutral score

    // Same type increases alignment
    if (contrib1.type === contrib2.type) {
      score += 15;
    }

    // Analyze semantic similarity using simple keyword matching
    const words1 = this.extractKeywords(contrib1.content);
    const words2 = this.extractKeywords(contrib2.content);
    const intersection = words1.filter((w) => words2.includes(w)).length;
    const union = new Set([...words1, ...words2]).size;

    if (union > 0) {
      const jaccardSimilarity = intersection / union;
      score += jaccardSimilarity * 30;
    }

    // Factor in confidence (if available)
    if (contrib1.confidence && contrib2.confidence) {
      const confidenceDiff = Math.abs(contrib1.confidence - contrib2.confidence);
      score -= Math.min(confidenceDiff / 10, 10); // Penalize for high confidence difference
    }

    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Group contributions by topic similarity
   */
  private groupContributionsByTopic(
    contributions: UserContribution[],
  ): UserContribution[][] {
    const groups: UserContribution[][] = [];
    const processed = new Set<string>();

    for (const contrib of contributions) {
      if (processed.has(contrib.id)) continue;

      const group: UserContribution[] = [contrib];
      processed.add(contrib.id);

      for (const other of contributions) {
        if (processed.has(other.id)) continue;

        const score = this.calculateAlignmentScore(contrib, other);
        if (score >= 60) {
          group.push(other);
          processed.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Find aligned contributions for a given contribution
   */
  private findAlignedContributions(
    primary: UserContribution,
    group: UserContribution[],
  ): UserContribution[] {
    return group.filter((contrib) => {
      if (contrib.id === primary.id) return false;
      const score = this.calculateAlignmentScore(primary, contrib);
      return score >= 70;
    });
  }

  /**
   * Find conflicting contributions for a given contribution
   */
  private findConflictingContributions(
    primary: UserContribution,
    group: UserContribution[],
  ): UserContribution[] {
    return group.filter((contrib) => {
      if (contrib.id === primary.id) return false;
      const score = this.calculateAlignmentScore(primary, contrib);
      return score <= 30;
    });
  }

  /**
   * Calculate consensus score (0-100)
   */
  private calculateConsensusScore(
    primary: UserContribution,
    aligned: UserContribution[],
    conflicting: UserContribution[],
  ): number {
    const total = 1 + aligned.length + conflicting.length;
    const alignment = (1 + aligned.length) / total;
    const score = alignment * 100;
    return Math.round(score);
  }

  /**
   * Generate synthesis summary
   */
  private generateSynthesisSummary(
    primary: UserContribution,
    aligned: UserContribution[],
    conflicting: UserContribution[],
  ): string {
    const parts: string[] = [];

    parts.push(`Primary view: ${primary.content.substring(0, 100)}`);

    if (aligned.length > 0) {
      parts.push(`Supported by ${aligned.length} other(s)`);
    }

    if (conflicting.length > 0) {
      parts.push(`Opposed by ${conflicting.length} participant(s)`);
    }

    return parts.join('. ');
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - split on whitespace and filter common words
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'is',
      'are',
      'was',
      'be',
      'that',
      'it',
      'this',
      'which',
      'we',
      'i',
      'you',
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 3 && !commonWords.has(word),
      );
  }

  /**
   * Detect emerging consensus
   */
  detectConsensus(
    contributions: UserContribution[],
  ): { exists: boolean; score: number; mainTheme: string } {
    if (contributions.length < 2) {
      return { exists: true, score: 100, mainTheme: contributions[0]?.content || '' };
    }

    const synthesized = this.synthesizeContributions(contributions);
    const consensusScores = synthesized.map((s) => s.consensusScore);
    const avgScore =
      consensusScores.reduce((a, b) => a + b, 0) / consensusScores.length;

    const exists = avgScore >= 70;
    const mainTheme = synthesized.length > 0
      ? synthesized[0].summary
      : 'No consensus reached';

    return {
      exists,
      score: Math.round(avgScore),
      mainTheme,
    };
  }

  /**
   * Identify key stakeholder disagreements
   */
  identifyDisagreements(
    contributions: UserContribution[],
  ): Array<{ participant1Id: string; participant2Id: string; conflictScore: number; topic: string }> {
    const disagreements = [];

    for (let i = 0; i < contributions.length; i++) {
      for (let j = i + 1; j < contributions.length; j++) {
        const score = this.calculateAlignmentScore(
          contributions[i],
          contributions[j],
        );

        if (score <= 35) {
          disagreements.push({
            participant1Id: contributions[i].participantId,
            participant2Id: contributions[j].participantId,
            conflictScore: 100 - score,
            topic: contributions[i].type,
          });
        }
      }
    }

    return disagreements.sort((a, b) => b.conflictScore - a.conflictScore);
  }

  /**
   * Generate action items from synthesized contributions
   */
  generateActionItems(
    synthesized: SynthesizedContribution[],
  ): Array<{ description: string; priority: 'high' | 'medium' | 'low'; suggestedOwner: string }> {
    const actionItems = [];

    for (const item of synthesized) {
      // Contributions of type 'recommendation' become action items
      if (item.primaryContribution.type === 'recommendation') {
        const priority =
          item.primaryContribution.confidence && item.primaryContribution.confidence >= 80
            ? 'high'
            : item.consensusScore >= 70
              ? 'medium'
              : 'low';

        actionItems.push({
          description: item.primaryContribution.content,
          priority,
          suggestedOwner: item.alignedContributions[0]?.participantId || 'Unassigned',
        });
      }
    }

    return actionItems.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
}
