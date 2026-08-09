/**
 * Forecasting Service
 *
 * Time-series forecasting with 30+ day horizon and confidence intervals
 * Requirements: 11.1, 11.4, 11.5, 11.6
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ForecastPoint {
  timestamp: Date;
  value: number;
  lowerBound: number;
  upperBound: number;
  confidence: number; // 0-1
}

export interface Forecast {
  metric: string;
  organizationId: string;
  method: 'exponential_smoothing' | 'linear_regression' | 'ensemble';
  horizon: number; // days
  points: ForecastPoint[];
  drivers: string[];
  accuracy?: number;
  generatedAt: Date;
}

export interface Scenario {
  name: string;
  type: 'best_case' | 'worst_case' | 'most_likely';
  probability: number; // 0-1, all three must sum to 1
  forecast: ForecastPoint[];
  assumptions: string[];
}

export interface EarlyWarning {
  type: 'operational_risk' | 'financial_issue' | 'resource_constraint';
  metric: string;
  description: string;
  probability: number;
  timeframe: string;
  indicators: string[];
  recommendations: string[];
}

@Injectable()
export class ForecastingService {
  private readonly logger = new Logger(ForecastingService.name);

  /**
   * Generate 30+ day forecast with confidence intervals
   * Requirement 11.1: 30+ day horizon
   */
  forecast(
    metric: string,
    organizationId: string,
    historicalData: number[],
    horizon = 30,
  ): Forecast {
    if (historicalData.length < 2) {
      throw new Error('At least 2 historical data points required');
    }

    const ensembleForecast = this.ensembleForecast(historicalData, horizon);
    const drivers = this.identifyDrivers(historicalData);

    return {
      metric,
      organizationId,
      method: 'ensemble',
      horizon,
      points: ensembleForecast,
      drivers,
      generatedAt: new Date(),
    };
  }

  /**
   * Ensemble forecasting: combine exponential smoothing + linear regression
   * Requirement 11.4: Ensemble methods combining multiple techniques
   */
  private ensembleForecast(data: number[], horizon: number): ForecastPoint[] {
    const esPoints = this.exponentialSmoothing(data, horizon);
    const lrPoints = this.linearRegression(data, horizon);

    // Weighted average: 60% ES, 40% LR
    return esPoints.map((esPoint, i) => {
      const lrPoint = lrPoints[i];
      const value = esPoint.value * 0.6 + lrPoint.value * 0.4;
      const spread = Math.abs(esPoint.value - lrPoint.value);

      // Confidence decreases with distance from last known point
      const confidence = Math.max(0.5, 0.95 - i * 0.01);
      const margin = spread * 1.5 + value * 0.05;

      return {
        timestamp: esPoint.timestamp,
        value: Math.max(0, value),
        lowerBound: Math.max(0, value - margin),
        upperBound: value + margin,
        confidence,
      };
    });
  }

  /**
   * Exponential smoothing (Holt's method with trend)
   */
  private exponentialSmoothing(data: number[], horizon: number): ForecastPoint[] {
    const alpha = 0.3; // level smoothing
    const beta = 0.1;  // trend smoothing

    let level = data[0];
    let trend = data.length > 1 ? data[1] - data[0] : 0;

    for (let i = 1; i < data.length; i++) {
      const prevLevel = level;
      level = alpha * data[i] + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    const now = new Date();
    return Array.from({ length: horizon }, (_, i) => {
      const value = level + trend * (i + 1);
      return {
        timestamp: new Date(now.getTime() + (i + 1) * 86400000),
        value: Math.max(0, value),
        lowerBound: 0,
        upperBound: 0,
        confidence: 0,
      };
    });
  }

  /**
   * Linear regression trend extrapolation
   */
  private linearRegression(data: number[], horizon: number): ForecastPoint[] {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i; sumY += data[i];
      sumXY += i * data[i]; sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const now = new Date();
    return Array.from({ length: horizon }, (_, i) => ({
      timestamp: new Date(now.getTime() + (i + 1) * 86400000),
      value: Math.max(0, intercept + slope * (n + i)),
      lowerBound: 0,
      upperBound: 0,
      confidence: 0,
    }));
  }

  /**
   * Identify key drivers of the forecast
   * Requirement 11.6: Explain forecast drivers
   */
  private identifyDrivers(data: number[]): string[] {
    const trend = this.calculateTrend(data);
    const volatility = this.calculateVolatility(data);
    const drivers: string[] = [];

    if (Math.abs(trend) > 0.05) {
      drivers.push(trend > 0 ? 'Positive trend (+' + (trend * 100).toFixed(1) + '% avg)' : 'Negative trend (' + (trend * 100).toFixed(1) + '% avg)');
    }
    if (volatility > 0.2) {
      drivers.push(`High volatility (${(volatility * 100).toFixed(1)}% std dev)`);
    }
    if (data[data.length - 1] > data[0] * 1.5) {
      drivers.push('Strong growth from baseline');
    }
    if (drivers.length === 0) {
      drivers.push('Stable trend with low variance');
    }

    return drivers;
  }

  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;
    return (data[data.length - 1] - data[0]) / (data[0] * data.length);
  }

  private calculateVolatility(data: number[]): number {
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const variance = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / data.length;
    return mean > 0 ? Math.sqrt(variance) / mean : 0;
  }

  /**
   * Generate best/worst/likely scenarios — probabilities sum to 1.0
   * Requirement 11.7: Scenario analysis
   */
  generateScenarios(
    metric: string,
    historicalData: number[],
    horizon = 30,
  ): Scenario[] {
    const baseForecast = this.ensembleForecast(historicalData, horizon);
    const growthRate = this.calculateTrend(historicalData);

    const mostLikelyProb = 0.6;
    const bestProb = 0.25;
    const worstProb = 0.15; // sums to 1.0

    return [
      {
        name: 'Most Likely',
        type: 'most_likely',
        probability: mostLikelyProb,
        forecast: baseForecast,
        assumptions: ['Current trends continue', 'No major disruptions'],
      },
      {
        name: 'Best Case',
        type: 'best_case',
        probability: bestProb,
        forecast: baseForecast.map((p) => ({
          ...p,
          value: p.value * (1 + Math.abs(growthRate) * 0.5 + 0.1),
          upperBound: p.upperBound * 1.2,
        })),
        assumptions: ['Favorable market conditions', 'Improved efficiency'],
      },
      {
        name: 'Worst Case',
        type: 'worst_case',
        probability: worstProb,
        forecast: baseForecast.map((p) => ({
          ...p,
          value: Math.max(0, p.value * (1 - Math.abs(growthRate) * 0.5 - 0.1)),
          lowerBound: Math.max(0, p.lowerBound * 0.8),
        })),
        assumptions: ['Market headwinds', 'Operational challenges'],
      },
    ];
  }

  /**
   * Detect early warning signals
   * Requirement 11.3: Early warning detection
   */
  detectWarnings(
    metric: string,
    data: number[],
    forecast: ForecastPoint[],
  ): EarlyWarning[] {
    const warnings: EarlyWarning[] = [];

    // Check for downward trend
    const trend = this.calculateTrend(data);
    if (trend < -0.05) {
      warnings.push({
        type: 'operational_risk',
        metric,
        description: `${metric} is declining at ${Math.abs(trend * 100).toFixed(1)}% per period`,
        probability: Math.min(0.9, Math.abs(trend) * 5),
        timeframe: '30 days',
        indicators: ['Negative trend', 'Below baseline'],
        recommendations: ['Investigate root causes', 'Review resource allocation'],
      });
    }

    // Check for high volatility
    const volatility = this.calculateVolatility(data);
    if (volatility > 0.3) {
      warnings.push({
        type: 'operational_risk',
        metric,
        description: `High volatility detected in ${metric} (${(volatility * 100).toFixed(1)}%)`,
        probability: 0.7,
        timeframe: '14 days',
        indicators: ['High variance', 'Unpredictable pattern'],
        recommendations: ['Stabilize contributing factors', 'Monitor closely'],
      });
    }

    // Check for resource constraint (near capacity)
    const lastValue = data[data.length - 1];
    const avgForecast = forecast.slice(0, 7).reduce((s, p) => s + p.value, 0) / 7;
    if (avgForecast > lastValue * 1.2) {
      warnings.push({
        type: 'resource_constraint',
        metric,
        description: `${metric} projected to increase 20%+ in next 7 days`,
        probability: forecast[6]?.confidence || 0.7,
        timeframe: '7 days',
        indicators: ['Accelerating growth', 'Approaching limits'],
        recommendations: ['Pre-provision capacity', 'Plan scaling'],
      });
    }

    return warnings;
  }

  /**
   * Detect concept drift (model needs retraining)
   * Requirement 11.5: Concept drift detection
   */
  detectConceptDrift(actualValues: number[], predictedValues: number[]): boolean {
    if (actualValues.length !== predictedValues.length || actualValues.length < 5) {
      return false;
    }

    // Calculate Mean Absolute Percentage Error
    const mape = actualValues.reduce((sum, actual, i) => {
      const pred = predictedValues[i];
      return sum + (pred > 0 ? Math.abs((actual - pred) / pred) : 0);
    }, 0) / actualValues.length;

    // Drift detected if MAPE > 20%
    return mape > 0.2;
  }
}
