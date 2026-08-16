/**
 * TrendTracker — Tracks data quality trends over time.
 * 
 * Responsibilities:
 * - Track quality scores over time
 * - Calculate trend direction (improving/degrading/stable)
 * - Identify source systems with persistent issues
 * - Generate trend reports and alerts
 * - Detect quality degradation patterns
 */

import {
  DataQualityScoreResult,
  QualityDimensions,
  QualityTrend,
  TrendDataPoint,
} from './types';

export interface TrendAlert {
  type: 'degradation' | 'critical' | 'improvement' | 'persistent_issue';
  sourceSystemId: string;
  entityType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface TrendReport {
  sourceSystemId: string;
  entityType: string;
  currentScore: number;
  previousScore: number;
  trendDirection: string;
  changePercentage: number;
  daysTracked: number;
  dataPoints: TrendDataPoint[];
  alerts: TrendAlert[];
}

export class TrendTracker {
  private trends: Map<string, TrendDataPoint[]> = new Map();
  private alerts: TrendAlert[] = [];

  private static readonly TREND_KEY_SEPARATOR = '::';

  /**
   * Record a quality score data point.
   */
  recordScore(sourceSystemId: string, entityType: string, score: DataQualityScoreResult): void {
    const key = this.getTrendKey(sourceSystemId, entityType);

    const point: TrendDataPoint = {
      date: new Date(),
      overallScore: score.overallScore,
      dimensions: score.dimensions,
    };

    if (!this.trends.has(key)) {
      this.trends.set(key, []);
    }

    this.trends.get(key)!.push(point);

    // Keep only last 90 days of data
    this.pruneOldData(key, 90);

    // Check for trend alerts
    this.checkForAlerts(key, sourceSystemId, entityType, score);
  }

  /**
   * Get trend data for a source system and entity type.
   */
  getTrend(sourceSystemId: string, entityType: string, days: number = 30): QualityTrend | null {
    const key = this.getTrendKey(sourceSystemId, entityType);
    const points = this.trends.get(key);

    if (!points || points.length === 0) {
      return null;
    }

    // Filter to requested number of days
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const recentPoints = points.filter((p) => p.date >= cutoffDate);

    if (recentPoints.length < 2) {
      return {
        direction: 'stable',
        trendDays: days,
        scoreHistory: recentPoints,
        changePercentage: 0,
      };
    }

    const oldestScore = recentPoints[0].overallScore;
    const newestScore = recentPoints[recentPoints.length - 1].overallScore;
    const changePercentage = ((newestScore - oldestScore) / oldestScore) * 100;

    // Determine trend direction with 2% threshold
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
      trendDays: days,
      scoreHistory: recentPoints,
      changePercentage: Math.round(changePercentage * 100) / 100,
    };
  }

  /**
   * Get all trends.
   */
  getAllTrends(days: number = 30): QualityTrend[] {
    const allTrends: QualityTrend[] = [];

    this.trends.forEach((_, key) => {
      const [sourceSystemId, entityType] = key.split(TrendTracker.TREND_KEY_SEPARATOR);
      const trend = this.getTrend(sourceSystemId, entityType, days);
      if (trend) {
        allTrends.push(trend);
      }
    });

    return allTrends;
  }

  /**
   * Get sources with degrading quality.
   */
  getDegradingSources(days: number = 30): Array<{ sourceSystemId: string; entityType: string; trend: QualityTrend }> {
    const degrading: Array<{ sourceSystemId: string; entityType: string; trend: QualityTrend }> = [];

    this.trends.forEach((_, key) => {
      const [sourceSystemId, entityType] = key.split(TrendTracker.TREND_KEY_SEPARATOR);
      const trend = this.getTrend(sourceSystemId, entityType, days);

      if (trend && trend.direction === 'degrading') {
        degrading.push({ sourceSystemId, entityType, trend });
      }
    });

    return degrading.sort((a, b) => a.trend.changePercentage - b.trend.changePercentage);
  }

  /**
   * Get sources with improving quality.
   */
  getImprovingSources(days: number = 30): Array<{ sourceSystemId: string; entityType: string; trend: QualityTrend }> {
    const improving: Array<{ sourceSystemId: string; entityType: string; trend: QualityTrend }> = [];

    this.trends.forEach((_, key) => {
      const [sourceSystemId, entityType] = key.split(TrendTracker.TREND_KEY_SEPARATOR);
      const trend = this.getTrend(sourceSystemId, entityType, days);

      if (trend && trend.direction === 'improving') {
        improving.push({ sourceSystemId, entityType, trend });
      }
    });

    return improving.sort((a, b) => b.trend.changePercentage - a.trend.changePercentage);
  }

  /**
   * Identify sources with persistent issues (consistently low scores).
   */
  getPersistentIssueSources(scoreThreshold: number = 60, days: number = 30): Array<{
    sourceSystemId: string;
    entityType: string;
    averageScore: number;
  }> {
    const persistentIssues: Array<{ sourceSystemId: string; entityType: string; averageScore: number }> = [];

    this.trends.forEach((points, key) => {
      if (points.length === 0) return;

      const [sourceSystemId, entityType] = key.split(TrendTracker.TREND_KEY_SEPARATOR);

      // Filter to recent data
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const recentPoints = points.filter((p) => p.date >= cutoffDate);

      if (recentPoints.length === 0) return;

      const averageScore =
        recentPoints.reduce((sum, p) => sum + p.overallScore, 0) / recentPoints.length;

      if (averageScore < scoreThreshold) {
        persistentIssues.push({
          sourceSystemId,
          entityType,
          averageScore: Math.round(averageScore * 100) / 100,
        });
      }
    });

    return persistentIssues.sort((a, b) => a.averageScore - b.averageScore);
  }

  /**
   * Get recent alerts.
   */
  getAlerts(limit: number = 10): TrendAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear all tracked data (for testing).
   */
  clear(): void {
    this.trends.clear();
    this.alerts = [];
  }

  /**
   * Generate a trend report for a source system.
   */
  generateTrendReport(sourceSystemId: string, entityType: string, days: number = 30): TrendReport | null {
    const trend = this.getTrend(sourceSystemId, entityType, days);

    if (!trend || trend.scoreHistory.length === 0) {
      return null;
    }

    const scores = trend.scoreHistory.map((p) => p.overallScore);
    const currentScore = scores[scores.length - 1];
    const previousScore = scores.length > 1 ? scores[scores.length - 2] : currentScore;

    const sourceAlerts = this.alerts.filter(
      (a) => a.sourceSystemId === sourceSystemId && a.entityType === entityType,
    );

    return {
      sourceSystemId,
      entityType,
      currentScore,
      previousScore,
      trendDirection: trend.direction,
      changePercentage: trend.changePercentage,
      daysTracked: days,
      dataPoints: trend.scoreHistory,
      alerts: sourceAlerts,
    };
  }

  /**
   * Private: Check for trend alerts based on score changes.
   */
  private checkForAlerts(key: string, sourceSystemId: string, entityType: string, currentScore: DataQualityScoreResult): void {
    const points = this.trends.get(key);
    if (!points || points.length < 2) {
      return;
    }

    const previousPoint = points[points.length - 2];
    const currentPoint = points[points.length - 1];

    // Check for degradation
    const degradationPercent =
      ((previousPoint.overallScore - currentPoint.overallScore) / previousPoint.overallScore) * 100;

    if (degradationPercent > 10) {
      this.alerts.push({
        type: 'degradation',
        sourceSystemId,
        entityType,
        severity: degradationPercent > 25 ? 'critical' : 'high',
        message: `Data quality degraded by ${Math.round(degradationPercent)}%`,
        data: {
          previousScore: previousPoint.overallScore,
          currentScore: currentPoint.overallScore,
          degradation: degradationPercent,
        },
        timestamp: new Date(),
      });
    }

    // Check for critical scores
    if (currentPoint.overallScore < 60) {
      this.alerts.push({
        type: 'critical',
        sourceSystemId,
        entityType,
        severity: 'critical',
        message: `Critical data quality issue: score is ${currentPoint.overallScore}`,
        data: {
          overallScore: currentPoint.overallScore,
          dimensions: currentPoint.dimensions,
        },
        timestamp: new Date(),
      });
    }

    // Check for improvement
    if (degradationPercent < -5) {
      this.alerts.push({
        type: 'improvement',
        sourceSystemId,
        entityType,
        severity: 'low',
        message: `Data quality improved by ${Math.round(Math.abs(degradationPercent))}%`,
        data: {
          previousScore: previousPoint.overallScore,
          currentScore: currentPoint.overallScore,
          improvement: Math.abs(degradationPercent),
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Private: Remove data older than threshold days.
   */
  private pruneOldData(key: string, retentionDays: number): void {
    const points = this.trends.get(key);
    if (!points) return;

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const filtered = points.filter((p) => p.date >= cutoffDate);
    if (filtered.length > 0) {
      this.trends.set(key, filtered);
    }
  }

  /**
   * Private: Generate trend key for storage.
   */
  private getTrendKey(sourceSystemId: string, entityType: string): string {
    return `${sourceSystemId}${TrendTracker.TREND_KEY_SEPARATOR}${entityType}`;
  }
}
