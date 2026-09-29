/**
 * PredictiveAnalyticsService — forecasting, scenario generation, early-warning
 * detection, and accuracy tracking for the EIP 2.0 analytics engine.
 *
 * All public methods are scoped to a single organisation (`orgId`) and include
 * a mandatory `org_id` tenant filter on every InfluxDB read/write.
 *
 * ETS algorithm
 * ─────────────
 * Simple single exponential smoothing (SES / ETS-A-N-N):
 *   S_t = α · x_t + (1 − α) · S_{t−1}   where α = 0.3
 *
 * Confidence intervals are computed from σ (std-dev of last 14 observed
 * points):
 *   80% CI  → ±1.28 σ
 *   95% CI  → ±1.96 σ
 *
 * For percentage metrics the interval bounds are clamped to [0, 100]
 * (Property 9 — Req 11.1).
 *
 * Scenario probabilities
 * ──────────────────────
 * [best_case=0.20, most_likely=0.50, worst_case=0.30] → sum = 1.0
 * (Property 10 — Req 11.7).
 *
 * Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InfluxDbService } from '../database/influxdb.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Public Types ───────────────────────────────────────────────────────────

export type ForecastPoint = {
  timestamp: Date;
  value: number;
  lower80: number;
  upper80: number;
  lower95: number;
  upper95: number;
};

export type ForecastResult = {
  forecastId: string;
  metric: string;
  horizon: number;
  points: ForecastPoint[];
  /** Mean-absolute-error accuracy from latest accuracy tracking, if available. */
  accuracy?: number;
};

export type Scenario = {
  id: string;
  label: 'best_case' | 'worst_case' | 'most_likely';
  probability: number;
  projectedValue: number;
};

export type ScenarioContext = {
  metric: string;
  currentValue: number;
  trend?: 'up' | 'down' | 'stable';
};

export type ForecastWarning = {
  metric: string;
  threshold: number;
  forecastedValue: number;
  expectedAt: Date;
  severity: 'critical' | 'high' | 'medium';
};

/**
 * A leading indicator: a candidate metric whose lagged values correlate with
 * a target metric.  Requirements: 11.2
 */
export type Indicator = {
  metric: string;
  lagDays: number;
  correlationStrength: number; // -1.0 to 1.0 (Pearson r)
  direction: 'positive' | 'negative';
};

// ─── Internal constants ──────────────────────────────────────────────────────

const ETS_ALPHA = 0.3;
const CI_Z_80 = 1.28;
const CI_Z_95 = 1.96;
const SIGMA_WINDOW = 14;

/** Days per horizon step (1 day). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default forecast horizon in days. */
const DEFAULT_HORIZON = 30;

/** Thresholds per domain for early-warning detection. */
const DOMAIN_THRESHOLDS: Record<
  string,
  { metric: string; threshold: number; severity: ForecastWarning['severity'] }[]
> = {
  health: [
    { metric: 'error_rate', threshold: 5, severity: 'critical' },
    { metric: 'latency_p99', threshold: 2000, severity: 'high' },
  ],
  connector: [
    { metric: 'sync_failure_rate', threshold: 10, severity: 'high' },
    { metric: 'sync_lag_minutes', threshold: 60, severity: 'medium' },
  ],
  capacity: [
    { metric: 'disk_used_pct', threshold: 85, severity: 'critical' },
    { metric: 'memory_used_pct', threshold: 90, severity: 'critical' },
    { metric: 'cpu_used_pct', threshold: 80, severity: 'high' },
  ],
};

// ─── Scenario probability constants (must sum to exactly 1.0) ────────────────

const PROB_BEST = 0.2;
const PROB_MOST_LIKELY = 0.5;
const PROB_WORST = 0.3;

@Injectable()
export class PredictiveAnalyticsService {
  private readonly logger = new Logger(PredictiveAnalyticsService.name);

  constructor(
    private readonly influx: InfluxDbService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Forecast a metric for `orgId` over `horizon` days.
   *
   * Reads the last 90 days of data from InfluxDB, applies ETS, returns a
   * `ForecastResult` with one `ForecastPoint` per day.  The forecast is
   * persisted to the `forecast_accuracy` measurement so it can be compared
   * with actuals by `trackAccuracy`.
   *
   * @param orgId   Organisation scope — mandatory tenant filter.
   * @param metric  InfluxDB measurement name / field to forecast.
   * @param horizon Number of future days to project (default 30).
   * @param isPercentageMetric  When true, CI bounds are clamped to [0, 100].
   */
  async forecast(
    orgId: string,
    metric: string,
    horizon = DEFAULT_HORIZON,
    isPercentageMetric = false,
  ): Promise<ForecastResult> {
    this.logger.log(`forecast orgId=${orgId} metric=${metric} horizon=${horizon}`);

    const historicalValues = await this._fetchTimeSeries(orgId, metric);
    const forecastId = uuidv4();

    const smoothed = this._applyETS(historicalValues);
    const sigma = this._stdDev(historicalValues.slice(-SIGMA_WINDOW));
    const lastSmoothed = smoothed.length > 0 ? smoothed[smoothed.length - 1] : 0;
    const now = Date.now();

    const points: ForecastPoint[] = [];
    let currentLevel = lastSmoothed;

    for (let d = 1; d <= horizon; d++) {
      const timestamp = new Date(now + d * DAY_MS);

      // For a flat (no trend/seasonality) ETS forecast, future values hold at
      // the last smoothed level.
      const value = currentLevel;
      const raw80Lower = value - CI_Z_80 * sigma;
      const raw80Upper = value + CI_Z_80 * sigma;
      const raw95Lower = value - CI_Z_95 * sigma;
      const raw95Upper = value + CI_Z_95 * sigma;

      points.push({
        timestamp,
        value,
        lower80: isPercentageMetric ? Math.max(0, Math.min(100, raw80Lower)) : Math.max(0, raw80Lower),
        upper80: isPercentageMetric ? Math.max(0, Math.min(100, raw80Upper)) : raw80Upper,
        lower95: isPercentageMetric ? Math.max(0, Math.min(100, raw95Lower)) : Math.max(0, raw95Lower),
        upper95: isPercentageMetric ? Math.max(0, Math.min(100, raw95Upper)) : raw95Upper,
      });
    }

    // Persist the forecast for later accuracy comparison.
    await this._persistForecast(orgId, forecastId, metric, points);

    return { forecastId, metric, horizon, points };
  }

  /**
   * Generate best-case, worst-case, and most-likely scenarios.
   *
   * Probabilities always sum to exactly 1.0 (Property 10).
   *
   * @param orgId    Organisation scope.
   * @param context  Current metric value and optional trend direction.
   */
  async generateScenarios(orgId: string, context: ScenarioContext): Promise<Scenario[]> {
    this.logger.log(`generateScenarios orgId=${orgId} metric=${context.metric}`);

    const base = context.currentValue;
    const trendMultiplier =
      context.trend === 'up' ? 1.0 : context.trend === 'down' ? -1.0 : 0.0;

    // Deltas scaled to a ±20% swing from the base value.
    const swing = Math.abs(base) * 0.2 || 1;

    const bestProjected = base + swing * (1 + trendMultiplier * 0.5);
    const worstProjected = base - swing * (1 + Math.abs(trendMultiplier) * 0.5);
    const likelyProjected = base + swing * trendMultiplier * 0.3;

    return [
      {
        id: uuidv4(),
        label: 'best_case',
        probability: PROB_BEST,
        projectedValue: bestProjected,
      },
      {
        id: uuidv4(),
        label: 'most_likely',
        probability: PROB_MOST_LIKELY,
        projectedValue: likelyProjected,
      },
      {
        id: uuidv4(),
        label: 'worst_case',
        probability: PROB_WORST,
        projectedValue: worstProjected,
      },
    ];
  }

  /**
   * Detect early-warning conditions for a domain by comparing forecast values
   * against predefined alert thresholds.
   *
   * @param orgId   Organisation scope.
   * @param domain  Domain key (e.g. 'health', 'connector', 'capacity').
   */
  async detectWarnings(orgId: string, domain: string): Promise<ForecastWarning[]> {
    this.logger.log(`detectWarnings orgId=${orgId} domain=${domain}`);

    const rules = DOMAIN_THRESHOLDS[domain] ?? [];
    const warnings: ForecastWarning[] = [];

    for (const rule of rules) {
      const result = await this.forecast(orgId, rule.metric, DEFAULT_HORIZON);

      for (const point of result.points) {
        if (point.value >= rule.threshold) {
          warnings.push({
            metric: rule.metric,
            threshold: rule.threshold,
            forecastedValue: point.value,
            expectedAt: point.timestamp,
            severity: rule.severity,
          });
          // Report only the first breach per metric.
          break;
        }
      }
    }

    return warnings;
  }

  /**
   * Compare a previous forecast against actual recorded values and write the
   * accuracy delta to InfluxDB (`forecast_accuracy` measurement).
   *
   * @param orgId       Organisation scope.
   * @param forecastId  UUID of the forecast to evaluate.
   */
  async trackAccuracy(orgId: string, forecastId: string): Promise<void> {
    this.logger.log(`trackAccuracy orgId=${orgId} forecastId=${forecastId}`);

    const forecastRows = await this._fetchForecastById(orgId, forecastId);

    if (forecastRows.length === 0) {
      this.logger.warn(`trackAccuracy: no forecast rows found for forecastId=${forecastId}`);
      return;
    }

    const metric = String(forecastRows[0]['metric'] ?? 'unknown');
    let totalAbsError = 0;
    let comparisons = 0;

    for (const row of forecastRows) {
      const forecastedValue = Number(row['forecasted_value'] ?? 0);
      const pointTimestamp = new Date(String(row['_time'] ?? '')).getTime();

      // Look up the actual observed value from InfluxDB closest to this timestamp.
      const actual = await this._fetchActualValueAt(orgId, metric, pointTimestamp);

      if (actual !== null) {
        totalAbsError += Math.abs(forecastedValue - actual);
        comparisons++;
      }
    }

    if (comparisons === 0) {
      this.logger.log(`trackAccuracy: no actuals available yet for forecastId=${forecastId}`);
      return;
    }

    const mae = totalAbsError / comparisons;

    await this.influx.writePoint(
      'forecast_accuracy',
      { metric, forecastId },
      { mae, comparisons },
      orgId,
    );

    this.logger.log(`trackAccuracy: MAE=${mae.toFixed(4)} for forecastId=${forecastId}`);
  }

  // ─── ETS & Statistics Helpers ──────────────────────────────────────────────

  /**
   * Apply simple single exponential smoothing with α = 0.3.
   * Returns the array of smoothed values aligned with the input.
   */
  private _applyETS(values: number[]): number[] {
    if (values.length === 0) return [];
    const smoothed: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      smoothed.push(ETS_ALPHA * values[i] + (1 - ETS_ALPHA) * smoothed[i - 1]);
    }
    return smoothed;
  }

  /** Population standard deviation of an array.  Returns 0 for empty/single-element arrays. */
  private _stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  // ─── InfluxDB I/O Helpers ─────────────────────────────────────────────────

  /**
   * Fetch up to 90 days of observed values for `metric` scoped to `orgId`.
   * Returns an array of floats sorted oldest-first.
   * Falls back to a single zero-value array when InfluxDB is unavailable.
   */
  private async _fetchTimeSeries(orgId: string, metric: string): Promise<number[]> {
    const fluxQuery = `
      from(bucket: "eip")
        |> range(start: -90d)
        |> filter(fn: (r) => r["_measurement"] == "${metric}")
        |> filter(fn: (r) => r["org_id"] == "${orgId}")
        |> filter(fn: (r) => r["_field"] == "value")
        |> sort(columns: ["_time"], desc: false)
    `;

    try {
      const rows = await this.influx.queryRows(fluxQuery);
      const values = rows.map((r) => Number(r['_value'] ?? 0));
      return values.length > 0 ? values : [0];
    } catch (err) {
      this.logger.warn(`_fetchTimeSeries failed for ${metric}: ${(err as Error).message}`);
      return [0];
    }
  }

  /**
   * Persist forecast points to InfluxDB under the `eip_forecast` measurement
   * so they can be retrieved later by `trackAccuracy`.
   */
  private async _persistForecast(
    orgId: string,
    forecastId: string,
    metric: string,
    points: ForecastPoint[],
  ): Promise<void> {
    try {
      for (const point of points) {
        await this.influx.writePoint(
          'eip_forecast',
          { forecastId, metric },
          {
            forecasted_value: point.value,
            lower80: point.lower80,
            upper80: point.upper80,
            lower95: point.lower95,
            upper95: point.upper95,
          },
          orgId,
          point.timestamp.getTime(),
        );
      }
    } catch (err) {
      this.logger.warn(`_persistForecast failed: ${(err as Error).message}`);
    }
  }

  /** Retrieve stored forecast points for a given forecastId. */
  private async _fetchForecastById(
    orgId: string,
    forecastId: string,
  ): Promise<Record<string, unknown>[]> {
    const fluxQuery = `
      from(bucket: "eip")
        |> range(start: -90d)
        |> filter(fn: (r) => r["_measurement"] == "eip_forecast")
        |> filter(fn: (r) => r["org_id"] == "${orgId}")
        |> filter(fn: (r) => r["forecastId"] == "${forecastId}")
        |> filter(fn: (r) => r["_field"] == "forecasted_value")
        |> sort(columns: ["_time"], desc: false)
    `;

    try {
      return await this.influx.queryRows(fluxQuery);
    } catch (err) {
      this.logger.warn(`_fetchForecastById failed: ${(err as Error).message}`);
      return [];
    }
  }

  // ─── Leading Indicator Identification ─────────────────────────────────────

  /**
   * Identify leading indicators for a target metric by computing Pearson
   * correlations between lagged candidate time-series and the target.
   *
   * Algorithm:
   * 1. Fetch 14-day time-series for `targetMetric` from InfluxDB.
   * 2. Fetch 14-day time-series for each candidate indicator metric.
   * 3. For each candidate + each lag (1–14 days), compute Pearson r between
   *    the lagged candidate and the target aligned sub-series.
   * 4. Return all indicators sorted by |correlationStrength| descending.
   * 5. Persist top-5 to `SystemHealthMetric.alertThresholds` via Prisma upsert.
   *
   * InfluxDB calls are wrapped in try/catch — returns [] on failure.
   *
   * Requirements: 11.2
   *
   * @param orgId        Organisation scope — mandatory tenant filter.
   * @param targetMetric Metric to find leading indicators for.
   */
  async identifyLeadingIndicators(
    orgId: string,
    targetMetric: string,
  ): Promise<Indicator[]> {
    this.logger.log(`identifyLeadingIndicators orgId=${orgId} target=${targetMetric}`);

    const CANDIDATE_METRICS = [
      'error_rate',
      'sync_failure_rate',
      'memory_used_pct',
      'cpu_used_pct',
      'latency_p99',
      'disk_used_pct',
      'connector_health',
    ];
    const MAX_LAG_DAYS = 14;

    // Step 1: Fetch target time-series (14 days).
    let targetSeries: number[];
    try {
      targetSeries = await this._fetchTimeSeries14d(orgId, targetMetric);
    } catch (err) {
      this.logger.warn(
        `identifyLeadingIndicators: failed to fetch target metric=${targetMetric}: ${(err as Error).message}`,
      );
      return [];
    }

    if (targetSeries.length < 2) {
      this.logger.warn(
        `identifyLeadingIndicators: insufficient data for target metric=${targetMetric}`,
      );
      return [];
    }

    const indicators: Indicator[] = [];

    // Steps 2 & 3: For each candidate, fetch its series and compute Pearson r at each lag.
    for (const candidate of CANDIDATE_METRICS) {
      if (candidate === targetMetric) continue;

      let candidateSeries: number[];
      try {
        candidateSeries = await this._fetchTimeSeries14d(orgId, candidate);
      } catch (err) {
        this.logger.warn(
          `identifyLeadingIndicators: failed to fetch candidate=${candidate}: ${(err as Error).message}`,
        );
        continue;
      }

      if (candidateSeries.length < 2) continue;

      for (let lag = 1; lag <= MAX_LAG_DAYS; lag++) {
        // Lagged candidate: candidateSeries[0..n-lag] predicts target[lag..n]
        const n = Math.min(candidateSeries.length - lag, targetSeries.length - lag);
        if (n < 2) continue;

        const x = candidateSeries.slice(0, n);       // lagged candidate
        const y = targetSeries.slice(lag, lag + n);  // corresponding target values

        const r = this._pearson(x, y);
        if (!Number.isFinite(r)) continue;

        indicators.push({
          metric: candidate,
          lagDays: lag,
          correlationStrength: Math.max(-1, Math.min(1, r)),
          direction: r >= 0 ? 'positive' : 'negative',
        });
      }
    }

    // Step 4: Sort by absolute correlation strength descending.
    indicators.sort((a, b) => Math.abs(b.correlationStrength) - Math.abs(a.correlationStrength));

    // Step 5: Persist top-5 to SystemHealthMetric.alertThresholds via upsert.
    const top5 = indicators.slice(0, 5);
    if (top5.length > 0) {
      try {
        // Use orgId-namespaced metric name as the unique key so each org has
        // its own persisted indicator set for the same target metric.
        const persistKey = `${orgId}::${targetMetric}`;
        await this.prisma.systemHealthMetric.upsert({
          where: { metricName: persistKey },
          update: {
            alertThresholds: { leadingIndicators: top5 },
          },
          create: {
            metricName: persistKey,
            displayName: `Leading indicators for ${targetMetric} (${orgId})`,
            description: `Auto-generated leading indicator set for metric: ${targetMetric}`,
            metricType: 'gauge',
            category: 'health',
            influxMeasurement: targetMetric,
            alertThresholds: { leadingIndicators: top5 },
          },
        });
      } catch (err) {
        this.logger.warn(
          `identifyLeadingIndicators: failed to persist top-5 for ${targetMetric}: ${(err as Error).message}`,
        );
      }
    }

    return indicators;
  }

  // ─── Pearson Correlation Helper ────────────────────────────────────────────

  /**
   * Compute the Pearson correlation coefficient between two equal-length arrays.
   * Returns `NaN` when standard deviation of either series is zero.
   */
  private _pearson(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n < 2) return NaN;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? NaN : num / denom;
  }

  /**
   * Fetch up to 14 days of observed values for `metric` scoped to `orgId`.
   * Returns an array of floats sorted oldest-first.
   * Throws on InfluxDB failure (callers must catch).
   */
  private async _fetchTimeSeries14d(orgId: string, metric: string): Promise<number[]> {
    const fluxQuery = `
      from(bucket: "eip")
        |> range(start: -14d)
        |> filter(fn: (r) => r["_measurement"] == "${metric}")
        |> filter(fn: (r) => r["org_id"] == "${orgId}")
        |> filter(fn: (r) => r["_field"] == "value")
        |> sort(columns: ["_time"], desc: false)
    `;

    const rows = await this.influx.queryRows(fluxQuery);
    const values = rows.map((r) => Number(r['_value'] ?? 0));
    return values.length > 0 ? values : [0];
  }

  /**
   * Fetch the actual observed value for `metric` at or near `timestampMs`.
   * Returns `null` when no data is found for that time.
   */
  private async _fetchActualValueAt(
    orgId: string,
    metric: string,
    timestampMs: number,
  ): Promise<number | null> {
    // Query a ±12-hour window around the target timestamp.
    const windowHours = 12;
    const startRFC = new Date(timestampMs - windowHours * 3600 * 1000).toISOString();
    const stopRFC = new Date(timestampMs + windowHours * 3600 * 1000).toISOString();

    const fluxQuery = `
      from(bucket: "eip")
        |> range(start: ${startRFC}, stop: ${stopRFC})
        |> filter(fn: (r) => r["_measurement"] == "${metric}")
        |> filter(fn: (r) => r["org_id"] == "${orgId}")
        |> filter(fn: (r) => r["_field"] == "value")
        |> first()
    `;

    try {
      const rows = await this.influx.queryRows(fluxQuery);
      if (rows.length > 0) {
        return Number(rows[0]['_value'] ?? null);
      }
      return null;
    } catch (err) {
      this.logger.warn(`_fetchActualValueAt failed: ${(err as Error).message}`);
      return null;
    }
  }
}
