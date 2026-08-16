/**
 * QualityScoreGenerator — Generates composite quality scores and tracks trends.
 * 
 * Responsibility:
 * - Compute composite quality scores (0-100) from dimension scores
 * - Support configurable weighting of dimensions
 * - Track scores over time for trend analysis
 * - Calculate trend direction and change percentage
 */

import {
  DataQualityScoreResult,
  QualityDimensions,
  TrendDataPoint,
  QualityTrend,
} from './types';

export interface ScoreWeighting {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  validity: number;
}

export class QualityScoreGenerator {
  private static readonly DEFAULT_WEIGHTING: ScoreWeighting = {
    completeness: 0.25,
    accuracy: 0.30,
    consistency: 0.15,
    timeliness: 0.20,
    validity: 0.10,
  };

  /**
   * Generate a composite quality score from dimension scores.
   * By default uses weighted average, but can apply custom weighting.
   */
  generateCompositeScore(
    dimensions: QualityDimensions,
    weighting?: ScoreWeighting,
  ): number {
    const weights = weighting || QualityScoreGenerator.DEFAULT_WEIGHTING;

    const score =
      dimensions.completeness * weights.completeness +
      dimensions.accuracy * weights.accuracy +
      dimensions.consistency * weights.consistency +
      dimensions.timeliness * weights.timeliness +
      dimensions.validity * weights.validity;

    return Math.min(100, Math.max(0, Math.round(score * 100) / 100));
  }

  /**
   * Generate a quality rating based on overall score.
   */
  getQualityRating(overallScore: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (overallScore >= 90) return 'excellent';
    if (overallScore >= 75) return 'good';
    if (overallScore >= 60) return 'fair';
    return 'poor';
  }

  /**
   * Calculate trend from a sequence of score data points.
   * Trend is determined by comparing current score against historical average.
   */
  calculateTrend(scoreHistory: DataQualityScoreResult[], trendDays: number = 7): QualityTrend {
    if (scoreHistory.length === 0) {
      return {
        direction: 'stable',
        trendDays,
        scoreHistory: [],
        changePercentage: 0,
      };
    }

    const trendPoints = this.buildTrendPoints(scoreHistory);

    if (trendPoints.length < 2) {
      return {
        direction: 'stable',
        trendDays,
        scoreHistory: trendPoints,
        changePercentage: 0,
      };
    }

    const oldestScore = trendPoints[0].overallScore;
    const newestScore = trendPoints[trendPoints.length - 1].overallScore;
    const changePercentage = ((newestScore - oldestScore) / oldestScore) * 100;

    // Determine trend direction with 2% threshold to avoid noise
    let direction: 'improving' | 'stable' | 'degrading';
    if (changePercentage > 2) {
      direction = 'improving';
    } else if (changePercentage < -2) {
      direction = 'degrading';
    } else {
      direction = 'stable';
    }

    return {
      direction,
      trendDays,
      scoreHistory: trendPoints,
      changePercentage: Math.round(changePercentage * 100) / 100,
    };
  }

  /**
   * Convert quality assessment results to trend data points.
   */
  private buildTrendPoints(scoreHistory: DataQualityScoreResult[]): TrendDataPoint[] {
    return scoreHistory.map((result) => ({
      date: new Date(),
      overallScore: result.overallScore,
      dimensions: result.dimensions,
    }));
  }

  /**
   * Generate a quality report for a source system.
   * Useful for IT admin notifications and dashboard display.
   */
  generateQualityReport(
    sourceSystemId: string,
    entityType: string,
    latestScore: DataQualityScoreResult,
    trend?: QualityTrend,
  ): Record<string, unknown> {
    const trend_text =
      trend?.direction === 'improving'
        ? `Data quality is improving (+${trend.changePercentage}%)`
        : trend?.direction === 'degrading'
          ? `Data quality is degrading (${trend.changePercentage}%)`
          : 'Data quality is stable';

    const critical_issues = this.identifyCriticalIssues(latestScore);

    return {
      sourceSystemId,
      entityType,
      overallScore: latestScore.overallScore,
      qualityRating: latestScore.qualityRating,
      dimensions: latestScore.dimensions,
      recordsAssessed: latestScore.recordsAssessed,
      recordsWithIssues: latestScore.recordsWithIssues,
      issuePercentage: Math.round(
        (latestScore.recordsWithIssues / latestScore.recordsAssessed) * 100 * 100,
      ) / 100,
      trend: trend_text,
      trendDirection: trend?.direction || 'stable',
      trendChangePercentage: trend?.changePercentage || 0,
      criticalIssues: critical_issues,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Identify critical issues based on dimension scores.
   */
  private identifyCriticalIssues(score: DataQualityScoreResult): string[] {
    const issues: string[] = [];

    if (score.dimensions.completeness < 70) {
      issues.push('Critical: Missing required fields in ' + score.dimensions.completeness + '% of records');
    }
    if (score.dimensions.accuracy < 70) {
      issues.push('Critical: Inaccurate data in ' + score.dimensions.accuracy + '% of records');
    }
    if (score.dimensions.validity < 70) {
      issues.push('Critical: Invalid data formats in ' + score.dimensions.validity + '% of records');
    }
    if (score.dimensions.timeliness < 50) {
      issues.push('Critical: Stale data detected - ' + score.dimensions.timeliness + '% timeliness');
    }
    if (score.dimensions.consistency < 70) {
      issues.push('Critical: Data inconsistencies across sources - ' + score.dimensions.consistency + '% consistency');
    }

    return issues;
  }
}
