/**
 * Agreement/Disagreement Highlighter
 * Highlights areas of agreement and disagreement among participants
 */

import { UserContribution, AgreementAnalysis, SynthesizedContribution } from './types';

export interface HighlightedAgreement {
  participantId: string;
  type: 'strong_agreement' | 'agreement' | 'neutral' | 'disagreement' | 'strong_disagreement';
  alignmentScore: number;
  summary: string;
  relatedContributions: UserContribution[];
}

export interface AgreementSummary {
  overallConsensus: number; // 0-100
  strongAgreement: HighlightedAgreement[];
  strongDisagreement: HighlightedAgreement[];
  neutralParticipants: HighlightedAgreement[];
  keyAgreementPoints: string[];
  keyDisagreementPoints: string[];
  polarization: number; // 0-100, higher means more polarized
}

export class AgreementHighlighter {
  /**
   * Highlight areas of agreement for a reference contribution
   */
  highlightAgreement(
    reference: UserContribution,
    analysis: AgreementAnalysis,
    allContributions: UserContribution[],
  ): HighlightedAgreement[] {
    const highlights: HighlightedAgreement[] = [];

    // Strong agreement
    for (const participantId of analysis.alignedWith) {
      const score = analysis.alignmentScores.get(participantId) || 0;
      if (score >= 80) {
        const related = allContributions.filter(
          (c) => c.participantId === participantId,
        );

        highlights.push({
          participantId,
          type: 'strong_agreement',
          alignmentScore: score,
          summary: `Strongly aligned with "${reference.content.substring(0, 50)}"`,
          relatedContributions: related,
        });
      } else if (score >= 60) {
        const related = allContributions.filter(
          (c) => c.participantId === participantId,
        );

        highlights.push({
          participantId,
          type: 'agreement',
          alignmentScore: score,
          summary: `Aligned with "${reference.content.substring(0, 50)}"`,
          relatedContributions: related,
        });
      }
    }

    return highlights;
  }

  /**
   * Highlight areas of disagreement for a reference contribution
   */
  highlightDisagreement(
    reference: UserContribution,
    analysis: AgreementAnalysis,
    allContributions: UserContribution[],
  ): HighlightedAgreement[] {
    const highlights: HighlightedAgreement[] = [];

    // Strong disagreement
    for (const participantId of analysis.conflictsWith) {
      const score = analysis.alignmentScores.get(participantId) || 0;
      if (score <= 20) {
        const related = allContributions.filter(
          (c) => c.participantId === participantId,
        );

        highlights.push({
          participantId,
          type: 'strong_disagreement',
          alignmentScore: score,
          summary: `Strongly disagrees with "${reference.content.substring(0, 50)}"`,
          relatedContributions: related,
        });
      } else if (score <= 40) {
        const related = allContributions.filter(
          (c) => c.participantId === participantId,
        );

        highlights.push({
          participantId,
          type: 'disagreement',
          alignmentScore: score,
          summary: `Disagrees with "${reference.content.substring(0, 50)}"`,
          relatedContributions: related,
        });
      }
    }

    return highlights;
  }

  /**
   * Generate comprehensive agreement summary
   */
  generateAgreementSummary(
    contributions: UserContribution[],
    synthesized: SynthesizedContribution[],
  ): AgreementSummary {
    const allHighlights: HighlightedAgreement[] = [];
    const keyAgreements: Map<string, number> = new Map();
    const keyDisagreements: Map<string, number> = new Map();

    // Process synthesized items to identify key agreements and disagreements
    for (const item of synthesized) {
      const agreementKey = item.primaryContribution.content.substring(0, 50);
      
      if (item.consensusScore >= 70 && item.alignedContributions.length > 0) {
        keyAgreements.set(agreementKey, item.consensusScore);
      }

      for (const conflict of item.conflictingContributions) {
        const conflictKey = conflict.content.substring(0, 50);
        keyDisagreements.set(conflictKey, 100 - item.consensusScore);
      }
    }

    // Categorize participants by alignment
    const strongAgreements: HighlightedAgreement[] = [];
    const strongDisagreements: HighlightedAgreement[] = [];
    const neutrals: HighlightedAgreement[] = [];

    // Calculate participant alignment scores
    const participantScores = this.calculateParticipantAlignmentScores(contributions);

    for (const [participantId, score] of participantScores) {
      const related = contributions.filter((c) => c.participantId === participantId);

      if (score >= 75) {
        strongAgreements.push({
          participantId,
          type: 'strong_agreement',
          alignmentScore: score,
          summary: `Generally aligned (${score}% consensus)`,
          relatedContributions: related,
        });
      } else if (score <= 25) {
        strongDisagreements.push({
          participantId,
          type: 'strong_disagreement',
          alignmentScore: score,
          summary: `Generally disagreeing (${score}% alignment)`,
          relatedContributions: related,
        });
      } else {
        neutrals.push({
          participantId,
          type: 'neutral',
          alignmentScore: score,
          summary: `Mixed positions (${score}% alignment)`,
          relatedContributions: related,
        });
      }
    }

    // Calculate overall metrics
    const overallConsensus = this.calculateOverallConsensus(synthesized);
    const polarization = this.calculatePolarization(
      strongAgreements.length,
      strongDisagreements.length,
      neutrals.length,
    );

    return {
      overallConsensus,
      strongAgreement: strongAgreements,
      strongDisagreement: strongDisagreements,
      neutralParticipants: neutrals,
      keyAgreementPoints: Array.from(keyAgreements.keys()),
      keyDisagreementPoints: Array.from(keyDisagreements.keys()),
      polarization,
    };
  }

  /**
   * Highlight consensus points
   */
  highlightConsensusPoints(synthesized: SynthesizedContribution[]): string[] {
    return synthesized
      .filter((s) => s.consensusScore >= 75)
      .map((s) => s.primaryContribution.content)
      .slice(0, 10);
  }

  /**
   * Highlight contentious points
   */
  highlightContentiousPoints(synthesized: SynthesizedContribution[]): string[] {
    return synthesized
      .filter((s) => s.conflictingContributions.length > 0 && s.consensusScore < 50)
      .map((s) => s.primaryContribution.content)
      .slice(0, 10);
  }

  /**
   * Generate participant alignment report
   */
  generateParticipantAlignmentReport(
    contributions: UserContribution[],
  ): Map<string, { alignmentScore: number; alignedWith: string[]; conflictsWith: string[] }> {
    const report = new Map<string, { alignmentScore: number; alignedWith: string[]; conflictsWith: string[] }>();

    // Group contributions by participant
    const byParticipant = new Map<string, UserContribution[]>();
    for (const contrib of contributions) {
      if (!byParticipant.has(contrib.participantId)) {
        byParticipant.set(contrib.participantId, []);
      }
      byParticipant.get(contrib.participantId)!.push(contrib);
    }

    // Calculate alignment between pairs
    const participantIds = Array.from(byParticipant.keys());
    for (const id1 of participantIds) {
      const contribs1 = byParticipant.get(id1)!;
      const alignedWith: string[] = [];
      const conflictsWith: string[] = [];
      let totalScore = 0;
      let scoreCount = 0;

      for (const id2 of participantIds) {
        if (id1 === id2) continue;

        const contribs2 = byParticipant.get(id2)!;
        const pairScore = this.calculateParticipantPairAlignment(contribs1, contribs2);

        totalScore += pairScore;
        scoreCount++;

        if (pairScore >= 70) {
          alignedWith.push(id2);
        } else if (pairScore <= 30) {
          conflictsWith.push(id2);
        }
      }

      const avgScore = scoreCount > 0 ? totalScore / scoreCount : 50;

      report.set(id1, {
        alignmentScore: Math.round(avgScore),
        alignedWith,
        conflictsWith,
      });
    }

    return report;
  }

  /**
   * Calculate participant pair alignment
   */
  private calculateParticipantPairAlignment(
    contribs1: UserContribution[],
    contribs2: UserContribution[],
  ): number {
    if (contribs1.length === 0 || contribs2.length === 0) return 50;

    let totalScore = 0;
    let count = 0;

    for (const c1 of contribs1) {
      for (const c2 of contribs2) {
        // Simple alignment: same type and similar confidence = aligned
        let score = 50;
        if (c1.type === c2.type) score += 20;
        if (c1.confidence && c2.confidence) {
          const diff = Math.abs(c1.confidence - c2.confidence);
          score += Math.max(0, 30 - diff / 2);
        }
        totalScore += Math.min(100, Math.max(0, score));
        count++;
      }
    }

    return count > 0 ? totalScore / count : 50;
  }

  /**
   * Calculate overall consensus level
   */
  private calculateOverallConsensus(synthesized: SynthesizedContribution[]): number {
    if (synthesized.length === 0) return 0;

    const scores = synthesized.map((s) => s.consensusScore);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Calculate polarization index (how divided participants are)
   */
  private calculatePolarization(
    strongAgree: number,
    strongDisagree: number,
    neutral: number,
  ): number {
    const total = strongAgree + strongDisagree + neutral;
    if (total === 0) return 0;

    // High polarization when participants are split between extremes
    return Math.round(((strongAgree + strongDisagree) / total) * 100);
  }

  /**
   * Calculate participant alignment scores
   */
  private calculateParticipantAlignmentScores(
    contributions: UserContribution[],
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const byParticipant = new Map<string, UserContribution[]>();

    // Group by participant
    for (const contrib of contributions) {
      if (!byParticipant.has(contrib.participantId)) {
        byParticipant.set(contrib.participantId, []);
      }
      byParticipant.get(contrib.participantId)!.push(contrib);
    }

    // Calculate score for each participant
    for (const [participantId, contribs] of byParticipant) {
      let score = 50;

      // More recommendations and opinions (higher confidence) = more aligned
      const highConfidenceContribs = contribs.filter((c) => c.confidence && c.confidence >= 70);
      score += Math.min(25, highConfidenceContribs.length * 5);

      // Concerns and disagreements lower alignment
      const concernCount = contribs.filter((c) => c.type === 'concern').length;
      score -= Math.min(25, concernCount * 5);

      scores.set(participantId, Math.max(0, Math.min(100, score)));
    }

    return scores;
  }

  /**
   * Find bridge-building suggestions (who should communicate)
   */
  findBridgeBuildingSuggestions(
    report: Map<string, { alignmentScore: number; alignedWith: string[]; conflictsWith: string[] }>,
  ): Array<{ participant1: string; participant2: string; gapSize: number; recommendation: string }> {
    const suggestions = [];

    const participants = Array.from(report.keys());
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const p1 = participants[i];
        const p2 = participants[j];

        const p1Report = report.get(p1)!;
        const p2Report = report.get(p2)!;

        // Check if they're on opposite sides
        if (
          p1Report.conflictsWith.includes(p2) &&
          p2Report.conflictsWith.includes(p1)
        ) {
          const gapSize = 100 - (p1Report.alignmentScore + p2Report.alignmentScore) / 2;

          suggestions.push({
            participant1: p1,
            participant2: p2,
            gapSize: Math.round(gapSize),
            recommendation: `${p1} and ${p2} have significant differences (${Math.round(gapSize)}% gap). Facilitated discussion recommended.`,
          });
        }
      }
    }

    return suggestions.sort((a, b) => b.gapSize - a.gapSize);
  }
}
