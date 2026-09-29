/**
 * PredictiveAnalyticsService — property tests
 *
 * Property 9 (Req 11.1): For percentage metrics, all ForecastPoint CI bounds
 *   are clamped to [0, 100].
 *
 * Property 10 (Req 11.7): Scenario probabilities always sum to exactly 1.0.
 */

import { PredictiveAnalyticsService, ScenarioContext } from './predictive-analytics.service';
import { InfluxDbService } from '../database/influxdb.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeInflux(values: number[] = []) {
  return {
    queryRows: jest.fn().mockResolvedValue(
      values.map((v, i) => ({ _value: v, _time: new Date(Date.now() - i * 86400000).toISOString() })),
    ),
    writePoint: jest.fn().mockResolvedValue(undefined),
  } as unknown as InfluxDbService;
}

function makePrisma() {
  return {
    systemHealthMetric: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function makeSvc(values: number[] = []) {
  return new PredictiveAnalyticsService(makeInflux(values), makePrisma());
}

// ─── Property 9: Forecast confidence bounds (percentage metric) ───────────────

describe('PredictiveAnalyticsService — Property 9: percentage metric CI bounds', () => {
  it('all CI lower bounds >= 0 for percentage metric', async () => {
    // Use a very low historical value so raw CI lower would be negative without clamping
    const svc = makeSvc(Array(14).fill(2));
    const result = await svc.forecast('org-1', 'cpu_used_pct', 5, true);
    for (const pt of result.points) {
      expect(pt.lower80).toBeGreaterThanOrEqual(0);
      expect(pt.lower95).toBeGreaterThanOrEqual(0);
    }
  });

  it('all CI upper bounds <= 100 for percentage metric', async () => {
    // Use a very high historical value so raw CI upper would exceed 100 without clamping
    const svc = makeSvc(Array(14).fill(99));
    const result = await svc.forecast('org-1', 'memory_used_pct', 5, true);
    for (const pt of result.points) {
      expect(pt.upper80).toBeLessThanOrEqual(100);
      expect(pt.upper95).toBeLessThanOrEqual(100);
    }
  });

  it('all CI bounds stay in [0, 100] when data has high variance', async () => {
    // Alternating high/low values creates high sigma, which would push CI outside [0,100]
    const values = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 1 : 99));
    const svc = makeSvc(values);
    const result = await svc.forecast('org-1', 'disk_used_pct', 10, true);
    for (const pt of result.points) {
      expect(pt.lower80).toBeGreaterThanOrEqual(0);
      expect(pt.lower95).toBeGreaterThanOrEqual(0);
      expect(pt.upper80).toBeLessThanOrEqual(100);
      expect(pt.upper95).toBeLessThanOrEqual(100);
    }
  });

  it('non-percentage metric: lower bounds are >= 0 but upper bounds may exceed 100', async () => {
    // Non-percentage metric (e.g. request count) — only lower is clamped to >= 0
    const svc = makeSvc(Array(14).fill(2));
    const result = await svc.forecast('org-1', 'request_count', 5, false);
    for (const pt of result.points) {
      expect(pt.lower80).toBeGreaterThanOrEqual(0);
      expect(pt.lower95).toBeGreaterThanOrEqual(0);
      // upper bounds are NOT limited to 100 for absolute metrics
    }
  });

  it('returns correct number of forecast points equal to horizon', async () => {
    const horizon = 7;
    const svc = makeSvc(Array(14).fill(50));
    const result = await svc.forecast('org-1', 'test_metric', horizon, true);
    expect(result.points).toHaveLength(horizon);
    expect(result.horizon).toBe(horizon);
  });

  it('returns default 30-day horizon when not specified', async () => {
    const svc = makeSvc(Array(14).fill(50));
    const result = await svc.forecast('org-1', 'test_metric');
    expect(result.points).toHaveLength(30);
  });
});

// ─── Property 10: Scenario probability sum ────────────────────────────────────

describe('PredictiveAnalyticsService — Property 10: scenario probability sum', () => {
  const EPSILON = 1e-10;

  it('scenario probabilities sum to exactly 1.0 for stable trend', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'health_score', currentValue: 75, trend: 'stable' };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    const total = scenarios.reduce((s, sc) => s + sc.probability, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(EPSILON);
  });

  it('scenario probabilities sum to exactly 1.0 for upward trend', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'revenue', currentValue: 100_000, trend: 'up' };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    const total = scenarios.reduce((s, sc) => s + sc.probability, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(EPSILON);
  });

  it('scenario probabilities sum to exactly 1.0 for downward trend', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'customer_count', currentValue: 500, trend: 'down' };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    const total = scenarios.reduce((s, sc) => s + sc.probability, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(EPSILON);
  });

  it('scenario probabilities sum to exactly 1.0 for zero base value', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'new_signups', currentValue: 0 };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    const total = scenarios.reduce((s, sc) => s + sc.probability, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(EPSILON);
  });

  it('always returns exactly 3 scenarios', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'error_rate', currentValue: 3.5 };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    expect(scenarios).toHaveLength(3);
  });

  it('scenarios include best_case, most_likely, and worst_case labels', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'uptime_pct', currentValue: 99 };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    const labels = scenarios.map((s) => s.label);
    expect(labels).toContain('best_case');
    expect(labels).toContain('most_likely');
    expect(labels).toContain('worst_case');
  });

  it('individual probabilities are all positive', async () => {
    const svc = makeSvc();
    const ctx: ScenarioContext = { metric: 'conversion_rate', currentValue: 5 };
    const scenarios = await svc.generateScenarios('org-1', ctx);
    for (const sc of scenarios) {
      expect(sc.probability).toBeGreaterThan(0);
    }
  });
});
