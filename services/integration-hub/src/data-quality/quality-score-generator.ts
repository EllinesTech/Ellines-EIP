/**
 * QualityScoreGenerator — Generates and tracks data quality scores per source and entity type.
 * Maintains historical trends for analysis and visualization.
 */

import {
  DataQualityScoreResult,
  QualityTrend,
  TrendDataPoint,
  DataRecord,
  ValidationSchema,
  QualityAssessmentConfig,
} from './types';
import { DataQualityAssessor } from './data-quality-assessor';

export interface ScoreSnapshot {
  sourceSystemId: string;
  entityType: string;
  score: DataQualityScoreResult;
  timestamp: Date;
}

export class QualityScoreGenerator {
  private assessor: DataQualityAssessor;
  private scoreHistory: Map<string, TrendDataPoint[]> = new Map();

  constructor() {
    this.assessor = new DataQualityAssessor();
  }

  generateScore(
    records: DataRecord[],
    schema: ValidationSchema,
    config: QualityAssessmentConfig,
  ): ScoreSnapshot {
    const score = this.assessor.assessData(records, schema, config);

    const key = `${config.sourceSystemId}:${config.entityType}`;
    this.recordTrendPoint(key, score);

    return {
      sourceSystemId: config.sourceSystemId,
      entityType: config.entityType,
      score,
      timestamp: new Date(),
    };
  }

  private recordTrendPoint(key: string, score: DataQualityScoreResult): void {
    if (!this.scoreHistory.has(key)) {
      this.scoreHistory.set(key, []);
    }

    const history = this.scoreHistory.get(key)!;
    history.push({
      date: new Date(),
      overallScore: score.overallScore,
      dimensions: score.dimensions,
    });

    // Keep last 90 days of history
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const filtered = history.filter((point) => point.date >= ninetyDaysAgo);
    this.scoreHistory.set(key, filtered);
  }

  getTrend(sourceSystemId: string, entityType: string, trendDays: number = 7): QualityTrend {
    const key = `${sourceSystemId}:${entityType}`;
    const history = this.scoreHistory.get(key) || [];

    const trendThreshold = new Date(Date.now() - trendDays * 24 * 60 * 60 * 1000);
    const recentHistory = history.filter((point) => point.date >= trendThreshold);

    if (recentHistory.length < 2) {
      return {
        direction: 'stable',
        trendDays,
        scoreHistory: recentHistory,
        changePercentage: 0,
      };
    }

    const oldestScore = recentHistory[0].overallScore;
    const newestScore = recentHistory[recentHistory.length - 1].overallScore;
    const changePercentage = ((newestScore - oldestScore) / oldestScore) * 100;

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
      scoreHistory: recentHistory,
      changePercentage: Math.round(changePercentage * 100) / 100,
    };
  }

  getScoreHistory(
    sourceSystemId: string,
    entityType: string,
    days: number = 30,
  ): TrendDataPoint[] {
    const key = `${sourceSystemId}:${entityType}`;
    const history = this.scoreHistory.get(key) || [];

    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return history.filter((point) => point.date >= threshold);
  }

  getCurrentScore(sourceSystemId: string, entityType: string): DataQualityScoreResult | null {
    const key = `${sourceSystemId}:${entityType}`;
    const history = this.scoreHistory.get(key);

    if (!history || history.length === 0) {
      return null;
    }

    const latest = history[history.length - 1];
    return {
      overallScore: latest.overallScore,
      qualityRating:
        latest.overallScore >= 90
          ? 'excellent'
          : latest.overallScore >= 75
            ? 'good'
            : latest.overallScore >= 60
              ? 'fair'
              : 'poor',
      dimensions: latest.dimensions,
      recordsAssessed: 0, // Would need to track this separately
      recordsWithIssues: 0, // Would need to track this separately
    };
  }

  getAverageScore(sourceSystemId: string, days: number = 30): number {
    const entities = Array.from(this.scoreHistory.keys()).filter((key) =>
      key.startsWith(`${sourceSystemId}:`),
    );

    if (entities.length === 0) return 0;

    let totalScore = 0;
    let count = 0;

    entities.forEach((key) => {
      const history = this.scoreHistory.get(key) || [];
      const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const recentScores = history.filter((point) => point.date >= threshold);

      if (recentScores.length > 0) {
        const avgForEntity =
          recentScores.reduce((sum, point) => sum + point.overallScore, 0) / recentScores.length;
        totalScore += avgForEntity;
        count++;
      }
    });

    return count === 0 ? 0 : Math.round((totalScore / count) * 100) / 100;
  }

  getSourcesWithLowestScores(limit: number = 5, days: number = 7): Array<{
    sourceSystemId: string;
    entityType: string;
    overallScore: number;
    qualityRating: string;
  }> {
    const scores: Array<{
      sourceSystemId: string;
      entityType: string;
      overallScore: number;
      qualityRating: string;
    }> = [];

    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    this.scoreHistory.forEach((history, key) => {
      const recentPoints = history.filter((point) => point.date >= threshold);
      if (recentPoints.length > 0) {
        const latestPoint = recentPoints[recentPoints.length - 1];
        const [sourceSystemId, entityType] = key.split(':');
        scores.push({
          sourceSystemId,
          entityType,
          overallScore: latestPoint.overallScore,
          qualityRating:
            latestPoint.overallScore >= 90
              ? 'excellent'
              : latestPoint.overallScore >= 75
                ? 'good'
                : latestPoint.overallScore >= 60
                  ? 'fair'
                  : 'poor',
        });
      }
    });

    return scores.sort((a, b) => a.overallScore - b.overallScore).slice(0, limit);
  }
}
