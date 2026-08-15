/**
 * Property-Based Tests for Forecasting Service
 *
 * **Validates: Requirements 11.1, 11.7**
 */

import fc from 'fast-check';
import { ForecastingService, ForecastPoint, Scenario } from './forecasting.service';

describe('ForecastingService - Property-Based Tests', () => {
  let service: ForecastingService;

  beforeEach(() => {
    service = new ForecastingService();
  });

  /**
   * Property 9: Forecast confidence bounds
   * All forecast points have confidence intervals within 0-100%
   *
   * **Validates: Requirements 11.1**
   *
   * For every forecast generated from arbitrary historical data:
   * - All forecast points must have lowerBound >= 0
   * - All forecast points must have upperBound >= lowerBound
   * - All forecast points must have confidence in [0, 1]
   * - All forecast points must have value in [lowerBound, upperBound]
   */
  it('Property 9: All forecast points have confidence intervals within 0-100%', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary historical data: at least 2 positive numbers
        fc.array(
          fc.tuple(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 10000 })),
          {
            minLength: 2,
            maxLength: 50,
          },
        ),
        fc.integer({ min: 5, max: 90 }), // horizon
        (dataPoints, horizon) => {
          // Convert to flat array of numbers
          const historicalData = dataPoints.flatMap(([a, b]) => [a, b]);

          // Generate forecast
          const forecast = service.forecast('test-metric', 'org-123', historicalData, horizon);

          // All predictions must satisfy the confidence bounds property
          forecast.points.forEach((point: ForecastPoint) => {
            // Lower bound must be non-negative
            expect(point.lowerBound).toBeGreaterThanOrEqual(0);

            // Upper bound must be greater than or equal to lower bound
            expect(point.upperBound).toBeGreaterThanOrEqual(point.lowerBound);

            // Confidence must be in [0, 1] (representing 0-100%)
            expect(point.confidence).toBeGreaterThanOrEqual(0);
            expect(point.confidence).toBeLessThanOrEqual(1);

            // Value must be within bounds
            expect(point.value).toBeGreaterThanOrEqual(point.lowerBound);
            expect(point.value).toBeLessThanOrEqual(point.upperBound);
          });

          // Number of points generated must equal horizon
          expect(forecast.points.length).toBe(horizon);
        },
      ),
      { numRuns: 50 }, // Reduced from default (100+) for faster execution
    );
  });

  /**
   * Property 10: Scenario probability sum
   * Best/worst/likely scenario probabilities sum to 100% (1.0)
   *
   * **Validates: Requirements 11.7**
   *
   * For every set of scenarios generated from arbitrary historical data:
   * - There must be exactly 3 scenarios (best, worst, most likely)
   * - Each scenario must have probability in [0, 1]
   * - The sum of all probabilities must equal 1.0 (with allowance for floating point precision)
   * - Each scenario type must be distinct
   */
  it('Property 10: Scenario probabilities sum to 100% (1.0)', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary historical data
        fc.array(
          fc.integer({ min: 1, max: 10000 }),
          {
            minLength: 2,
            maxLength: 50,
          },
        ),
        fc.integer({ min: 5, max: 90 }), // horizon
        (historicalData, horizon) => {
          // Generate scenarios
          const scenarios = service.generateScenarios('test-metric', historicalData, horizon);

          // Must have exactly 3 scenarios
          expect(scenarios.length).toBe(3);

          // Extract scenario types and probabilities
          const scenarioTypes = new Set<string>();
          let totalProbability = 0;

          scenarios.forEach((scenario: Scenario) => {
            // Each scenario must have distinct type
            expect(scenarioTypes.has(scenario.type)).toBe(false);
            scenarioTypes.add(scenario.type);

            // Probability must be in [0, 1]
            expect(scenario.probability).toBeGreaterThanOrEqual(0);
            expect(scenario.probability).toBeLessThanOrEqual(1);

            // Accumulate total probability
            totalProbability += scenario.probability;

            // Each scenario must have a forecast with the correct number of points
            expect(scenario.forecast.length).toBe(horizon);

            // All forecast points in scenario must satisfy bounds
            scenario.forecast.forEach((point: ForecastPoint) => {
              expect(point.value).toBeGreaterThanOrEqual(0);
              expect(point.upperBound).toBeGreaterThanOrEqual(point.lowerBound);
            });
          });

          // Verify exact types are present
          expect(scenarioTypes.has('best_case')).toBe(true);
          expect(scenarioTypes.has('worst_case')).toBe(true);
          expect(scenarioTypes.has('most_likely')).toBe(true);

          // Total probability must sum to 1.0
          // Allow for floating point precision errors (within 1e-10)
          expect(Math.abs(totalProbability - 1.0)).toBeLessThan(1e-10);
        },
      ),
      { numRuns: 50 }, // Reduced from default for faster execution
    );
  });

  /**
   * Property 9 Alternative Test with explicit edge cases
   * Tests with minimal and maximal historical data
   */
  it('Property 9: Confidence intervals with minimal historical data', () => {
    // Minimal case: exactly 2 data points
    const forecast = service.forecast('test-metric', 'org-123', [100, 150], 10);

    forecast.points.forEach((point: ForecastPoint) => {
      expect(point.lowerBound).toBeGreaterThanOrEqual(0);
      expect(point.upperBound).toBeGreaterThanOrEqual(point.lowerBound);
      expect(point.confidence).toBeGreaterThanOrEqual(0);
      expect(point.confidence).toBeLessThanOrEqual(1);
      expect(point.value).toBeGreaterThanOrEqual(point.lowerBound);
      expect(point.value).toBeLessThanOrEqual(point.upperBound);
    });
  });

  /**
   * Property 10 Alternative Test with explicit values
   * Tests specific known scenario distributions
   */
  it('Property 10: Scenarios sum to exactly 1.0 with known data', () => {
    const scenarios = service.generateScenarios('revenue', [100, 110, 120, 130, 140], 30);

    const probabilities = scenarios.map((s) => s.probability);
    const sum = probabilities.reduce((a, b) => a + b, 0);

    expect(sum).toBeCloseTo(1.0, 10);

    // Specific probability checks for known distribution
    const bestCaseScenario = scenarios.find((s) => s.type === 'best_case');
    const worstCaseScenario = scenarios.find((s) => s.type === 'worst_case');
    const likelyScenario = scenarios.find((s) => s.type === 'most_likely');

    expect(bestCaseScenario?.probability).toBeCloseTo(0.25, 2);
    expect(worstCaseScenario?.probability).toBeCloseTo(0.15, 2);
    expect(likelyScenario?.probability).toBeCloseTo(0.6, 2);
  });
});
