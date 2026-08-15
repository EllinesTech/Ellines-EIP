import { Injectable } from '@nestjs/common';
import type {
  ConfidenceExplanation,
  ConfidenceFactor,
  UncertaintySource,
} from './types';

/**
 * ConfidenceScoreExplainer
 * Explains confidence scores by identifying uncertainty sources
 * Requirement 23.3: Confidence score explainer showing uncertainty sources
 */
@Injectable()
export class ConfidenceScoreExplainer {
  /**
   * Generate explanation for a confidence score
   */
  generateExplanation(
    score: number,
    factors: ConfidenceFactor[],
    uncertaintySources: UncertaintySource[] = [],
  ): ConfidenceExplanation {
    // Validate score
    const validScore = Math.max(0, Math.min(100, score));

    // Generate narrative based on score level
    const reasoning = this.generateReasoning(validScore, factors, uncertaintySources);

    return {
      score: validScore,
      reasoning,
      uncertaintySources,
      factors,
    };
  }

  /**
   * Generate narrative explanation based on score level and factors
   */
  private generateReasoning(
    score: number,
    factors: ConfidenceFactor[],
    uncertaintySources: UncertaintySource[],
  ): string {
    let reasoning = '';

    // Score level description
    if (score >= 90) {
      reasoning = 'This recommendation has very high confidence based on strong evidence and clear patterns.';
    } else if (score >= 70) {
      reasoning = 'This recommendation has good confidence based on solid evidence, though some factors introduce uncertainty.';
    } else if (score >= 50) {
      reasoning = 'This recommendation has moderate confidence. While there is supporting evidence, several factors introduce meaningful uncertainty.';
    } else if (score >= 30) {
      reasoning = 'This recommendation has limited confidence. Multiple factors introduce significant uncertainty.';
    } else {
      reasoning = 'This recommendation has low confidence. Substantial uncertainty exists.';
    }

    // Add factor contributions
    if (factors.length > 0) {
      const positiveFactors = factors
        .filter(f => f.contribution > 0)
        .sort((a, b) => b.contribution - a.contribution);
      const negativeFactors = factors
        .filter(f => f.contribution < 0)
        .sort((a, b) => a.contribution - b.contribution);

      if (positiveFactors.length > 0) {
        const topFactor = positiveFactors[0];
        reasoning += ` Key strength: ${topFactor.factor}.`;
      }

      if (negativeFactors.length > 0) {
        const topConcern = negativeFactors[0];
        reasoning += ` Main concern: ${topConcern.factor}.`;
      }
    }

    // Add uncertainty sources
    if (uncertaintySources.length > 0) {
      const highImpactSources = uncertaintySources.filter(u => u.impact === 'high');
      if (highImpactSources.length > 0) {
        const sources = highImpactSources.map(u => u.description).join(', ');
        reasoning += ` Significant uncertainties: ${sources}.`;
      }
    }

    return reasoning;
  }

  /**
   * Identify common uncertainty sources
   */
  identifyUncertaintySources(
    hasMissingData: boolean,
    hasConflictingSignals: boolean,
    modelLimitationsPresent: boolean,
    externalFactorsPresent: boolean,
    dataAge: number, // in hours
  ): UncertaintySource[] {
    const sources: UncertaintySource[] = [];

    if (hasMissingData) {
      sources.push({
        type: 'missing_data',
        description: 'Some data required for analysis is not available',
        impact: 'high',
      });
    }

    if (hasConflictingSignals) {
      sources.push({
        type: 'conflicting_signals',
        description: 'Different data sources or metrics point to different conclusions',
        impact: 'high',
      });
    }

    if (modelLimitationsPresent) {
      sources.push({
        type: 'model_limitation',
        description: 'The AI model has inherent limitations in this domain',
        impact: 'medium',
      });
    }

    if (externalFactorsPresent) {
      sources.push({
        type: 'external_factor',
        description: 'External factors beyond available data may influence outcomes',
        impact: 'medium',
      });
    }

    if (dataAge > 24) {
      sources.push({
        type: 'temporal_lag',
        description: `Data is ${Math.floor(dataAge)} hours old; recent changes may not be reflected`,
        impact: dataAge > 72 ? 'high' : 'medium',
      });
    }

    return sources;
  }

  /**
   * Calculate confidence based on multiple factors
   * Each factor contributes positively or negatively
   */
  calculateConfidenceFromFactors(factors: ConfidenceFactor[]): number {
    if (factors.length === 0) {
      return 50; // Default neutral confidence
    }

    // Start from 50 (neutral) and adjust based on factors
    let baseConfidence = 50;
    let totalWeight = 0;
    let weightedSum = 0;

    for (const factor of factors) {
      // Each factor's weight is |contribution|
      const weight = Math.abs(factor.contribution);
      totalWeight += weight;
      weightedSum += factor.contribution * weight;
    }

    if (totalWeight > 0) {
      const adjustment = (weightedSum / totalWeight) * 0.5; // Cap adjustment at ±50 from base
      baseConfidence = Math.max(0, Math.min(100, baseConfidence + adjustment));
    }

    return Math.round(baseConfidence);
  }

  /**
   * Generate confidence factors for common scenarios
   */
  generateFactorsForScenario(scenario: {
    dataQualityScore?: number; // 0-100
    dataRecentness?: number; // 0-100 (newer = higher)
    evidenceCount?: number;
    conflictCount?: number;
    modelAccuracy?: number; // 0-100
  }): ConfidenceFactor[] {
    const factors: ConfidenceFactor[] = [];

    if (scenario.dataQualityScore !== undefined) {
      const contribution = scenario.dataQualityScore * 0.3; // Up to 30 points from data quality
      factors.push({
        factor: 'Data Quality',
        contribution,
        reason: `Data quality score of ${scenario.dataQualityScore}/100 ${contribution > 15 ? 'strongly' : 'moderately'} supports confidence`,
      });
    }

    if (scenario.dataRecentness !== undefined) {
      const contribution = scenario.dataRecentness * 0.2; // Up to 20 points from freshness
      factors.push({
        factor: 'Data Recency',
        contribution,
        reason: `${scenario.dataRecentness >= 80 ? 'Fresh' : 'Moderately fresh'} data improves confidence`,
      });
    }

    if (scenario.evidenceCount !== undefined && scenario.evidenceCount > 0) {
      const contribution = Math.min(30, scenario.evidenceCount * 5); // Up to 30 points
      factors.push({
        factor: 'Evidence Count',
        contribution,
        reason: `${scenario.evidenceCount} supporting data points strengthen confidence`,
      });
    }

    if (scenario.conflictCount !== undefined && scenario.conflictCount > 0) {
      const contribution = -Math.min(30, scenario.conflictCount * 10); // Up to -30 points
      factors.push({
        factor: 'Conflicting Signals',
        contribution,
        reason: `${scenario.conflictCount} conflicting indicators reduce confidence`,
      });
    }

    if (scenario.modelAccuracy !== undefined) {
      const contribution = (scenario.modelAccuracy - 50) * 0.4; // Range: -20 to 20 points
      factors.push({
        factor: 'Model Accuracy',
        contribution,
        reason: `Model historical accuracy of ${scenario.modelAccuracy}% ${contribution > 0 ? 'supports' : 'reduces'} confidence`,
      });
    }

    return factors;
  }
}
