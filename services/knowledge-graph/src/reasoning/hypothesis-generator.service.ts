/**
 * Hypothesis Generator Service
 *
 * Generates hypotheses about business trends from observations and tests them
 * against historical data.
 *
 * Requirement 2.5: Generate hypotheses about business trends and test them against
 *                   historical data
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Observation,
  Hypothesis,
  EvidenceLink,
  MetricPoint,
  TimeRange,
} from './reasoning.interfaces';

@Injectable()
export class HypothesisGeneratorService {
  private readonly logger = new Logger(HypothesisGeneratorService.name);

  /**
   * Generate hypotheses from an observation and validate each against
   * the historical data embedded in the observation's metrics.
   *
   * Requirement 2.5
   */
  async generateHypotheses(observation: Observation): Promise<Hypothesis[]> {
    this.logger.log(
      `Generating hypotheses for observation "${observation.id}" (org=${observation.organizationId})`,
    );

    const hypotheses: Hypothesis[] = [];

    // Trend hypothesis: is a metric consistently increasing/decreasing?
    const trendHyp = this.generateTrendHypothesis(observation);
    if (trendHyp) {
      const validated = await this.validate(trendHyp, observation);
      hypotheses.push(validated);
    }

    // Threshold breach hypothesis: has a metric exceeded a meaningful threshold?
    const thresholdHyps = this.generateThresholdHypotheses(observation);
    for (const hyp of thresholdHyps) {
      hypotheses.push(await this.validate(hyp, observation));
    }

    // Seasonality hypothesis: does the metric show periodic behaviour?
    const seasonalHyp = this.generateSeasonalityHypothesis(observation);
    if (seasonalHyp) {
      hypotheses.push(await this.validate(seasonalHyp, observation));
    }

    // Correlation hypothesis: are two metrics moving together?
    if (observation.metrics.length >= 2) {
      const corrHyp = this.generateCorrelationHypothesis(observation);
      if (corrHyp) {
        hypotheses.push(await this.validate(corrHyp, observation));
      }
    }

    this.logger.log(
      `Generated ${hypotheses.length} hypotheses for observation "${observation.id}"`,
    );
    return hypotheses;
  }

  // ─── Hypothesis builders ──────────────────────────────────────────────────

  private generateTrendHypothesis(observation: Observation): Hypothesis | null {
    const metricGroups = this.groupByName(observation.metrics);

    for (const [name, points] of metricGroups) {
      if (points.length < 3) continue;
      const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const slope = this.computeSlope(sorted);
      if (Math.abs(slope) < 0.01) continue;

      const direction = slope > 0 ? 'increasing' : 'decreasing';
      const rate = Math.abs(slope * 100).toFixed(1);

      return this.newHypothesis(
        observation.id,
        `${name} is ${direction} at approximately ${rate}% per period`,
        0.4, // preliminary confidence — will be updated during validation
      );
    }
    return null;
  }

  private generateThresholdHypotheses(observation: Observation): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];
    const metricGroups = this.groupByName(observation.metrics);

    for (const [name, points] of metricGroups) {
      if (points.length < 2) continue;
      const values = points.map((p) => p.value);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      if (max > avg * 1.5) {
        hypotheses.push(
          this.newHypothesis(
            observation.id,
            `${name} has experienced significant spikes exceeding 1.5× the average value`,
            0.45,
          ),
        );
      }

      if (values.some((v) => v === 0) && avg > 0) {
        hypotheses.push(
          this.newHypothesis(
            observation.id,
            `${name} dropped to zero on at least one occasion, indicating potential service interruptions`,
            0.5,
          ),
        );
      }
    }

    return hypotheses;
  }

  private generateSeasonalityHypothesis(observation: Observation): Hypothesis | null {
    const metricGroups = this.groupByName(observation.metrics);

    for (const [name, points] of metricGroups) {
      if (points.length < 7) continue; // Need at least a week of data

      // Compute autocorrelation at lag = floor(N/3)
      const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const values = sorted.map((p) => p.value);
      const lag = Math.floor(values.length / 3);
      const autocorr = this.autocorrelation(values, lag);

      if (autocorr > 0.5) {
        return this.newHypothesis(
          observation.id,
          `${name} exhibits periodic/seasonal behaviour with a cycle length of approximately ${lag} periods`,
          0.4 + autocorr * 0.3,
        );
      }
    }
    return null;
  }

  private generateCorrelationHypothesis(observation: Observation): Hypothesis | null {
    const metricGroups = this.groupByName(observation.metrics);
    const entries = [...metricGroups.entries()];

    if (entries.length < 2) return null;
    const [[name1, points1], [name2, points2]] = entries;

    // Align by position (simplified — assumes same number of points)
    const len = Math.min(points1.length, points2.length);
    if (len < 3) return null;

    const v1 = points1.slice(0, len).map((p) => p.value);
    const v2 = points2.slice(0, len).map((p) => p.value);
    const corr = this.pearsonCorrelation(v1, v2);

    if (Math.abs(corr) < 0.6) return null;

    const direction = corr > 0 ? 'positively' : 'negatively';
    return this.newHypothesis(
      observation.id,
      `${name1} and ${name2} are ${direction} correlated (r=${corr.toFixed(2)}), suggesting a shared driver`,
      0.4 + Math.abs(corr) * 0.35,
    );
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Validate a hypothesis against the historical data in the observation.
   * Requirement 2.5: Test hypotheses against historical data
   */
  private async validate(
    hypothesis: Hypothesis,
    observation: Observation,
  ): Promise<Hypothesis> {
    const supporting: EvidenceLink[] = [];
    const refuting: EvidenceLink[] = [];

    const metricGroups = this.groupByName(observation.metrics);

    // For each metric group, check whether data supports the hypothesis statement
    for (const [metricName, points] of metricGroups) {
      if (points.length < 2) continue;

      const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const values = sorted.map((p) => p.value);

      const trendDir = this.computeSlope(sorted) > 0 ? 'increasing' : 'decreasing';
      const hyp = hypothesis.statement.toLowerCase();

      if (hyp.includes(metricName.toLowerCase())) {
        if (hyp.includes(trendDir)) {
          supporting.push({
            entityId: `metric_${metricName}`,
            entityType: 'MetricSeries',
            displayName: metricName,
            relationship: 'SUPPORTS_TREND',
            supportStrength: Math.min(0.5 + Math.abs(this.computeSlope(sorted)) * 10, 0.9),
            sourceSystem: observation.sourceSystem ?? 'analytics',
            dataPoint: `${values.length} data points; trend=${trendDir}`,
          });
        } else {
          refuting.push({
            entityId: `metric_${metricName}`,
            entityType: 'MetricSeries',
            displayName: metricName,
            relationship: 'CONTRADICTS_TREND',
            supportStrength: 0.3,
            sourceSystem: observation.sourceSystem ?? 'analytics',
            dataPoint: `Trend is ${trendDir}, not as hypothesised`,
          });
        }
      }
    }

    // Determine status
    const supportRatio =
      supporting.length + refuting.length > 0
        ? supporting.reduce((a, e) => a + e.supportStrength, 0) /
          (supporting.length + refuting.length)
        : 0;

    let status: Hypothesis['status'] = 'unvalidated';
    if (supporting.length > 0 && refuting.length === 0) status = 'supported';
    else if (refuting.length > 0 && supporting.length === 0) status = 'refuted';
    else if (supporting.length > 0 || refuting.length > 0) status = 'inconclusive';

    const updatedConfidence = Math.min(
      hypothesis.confidence + supportRatio * 0.4,
      0.95,
    );

    const explanation = this.buildExplanation(hypothesis.statement, status, supportRatio);

    return {
      ...hypothesis,
      status,
      confidence: updatedConfidence,
      supportingEvidence: supporting,
      refutingEvidence: refuting,
      validatedAgainstPeriod: observation.timeRange,
      explanation,
    };
  }

  // ─── Statistical utilities ────────────────────────────────────────────────

  /** Linear slope (Δvalue / Δindex) via ordinary least squares */
  private computeSlope(points: MetricPoint[]): number {
    const n = points.length;
    if (n < 2) return 0;
    const values = points.map((p) => p.value);
    const indices = values.map((_, i) => i);
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((acc, x, i) => acc + x * values[i], 0);
    const sumX2 = indices.reduce((acc, x) => acc + x * x, 0);
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  }

  /** Pearson correlation coefficient */
  private pearsonCorrelation(xs: number[], ys: number[]): number {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return 0;
    const meanX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    return num / (Math.sqrt(denX * denY) || 1);
  }

  /** Normalised autocorrelation at a given lag */
  private autocorrelation(values: number[], lag: number): number {
    if (lag >= values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    let num = 0, den = 0;
    for (let i = 0; i < values.length - lag; i++) {
      num += (values[i] - mean) * (values[i + lag] - mean);
    }
    for (const v of values) den += (v - mean) * (v - mean);
    return num / (den || 1);
  }

  private groupByName(metrics: MetricPoint[]): Map<string, MetricPoint[]> {
    const map = new Map<string, MetricPoint[]>();
    for (const m of metrics) {
      if (!map.has(m.name)) map.set(m.name, []);
      map.get(m.name)!.push(m);
    }
    return map;
  }

  private newHypothesis(
    observationId: string,
    statement: string,
    confidence: number,
  ): Hypothesis {
    return {
      id: `hyp_${observationId}_${Date.now()}`,
      statement,
      generatedFrom: observationId,
      confidence,
      status: 'unvalidated',
      supportingEvidence: [],
      refutingEvidence: [],
      explanation: '',
    };
  }

  private buildExplanation(
    statement: string,
    status: Hypothesis['status'],
    supportRatio: number,
  ): string {
    switch (status) {
      case 'supported':
        return `Historical data supports the hypothesis "${statement}" (support ratio ${(supportRatio * 100).toFixed(0)}%).`;
      case 'refuted':
        return `Historical data contradicts the hypothesis "${statement}".`;
      case 'inconclusive':
        return `Partial evidence for "${statement}" — additional data required for conclusive validation.`;
      default:
        return `Hypothesis "${statement}" could not be validated against available data.`;
    }
  }
}
