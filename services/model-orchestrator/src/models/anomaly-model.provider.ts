/**
 * Anomaly Detection Model Provider
 * 
 * Detects anomalies using statistical methods (Z-score, IQR, isolation)
 * Requirement 1.6: Anomaly detection model integration
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  BaseModelProvider,
  ModelCapability,
  ModelInvocationRequest,
  ModelInvocationResponse,
  ModelMetadata,
} from './base-model.provider';

interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  method: string;
  threshold: number;
}

@Injectable()
export class AnomalyModelProvider extends BaseModelProvider {
  private readonly logger = new Logger(AnomalyModelProvider.name);
  protected modelId = 'anomaly-detector-v1';
  protected displayName = 'Anomaly Detection Model';
  protected provider = 'ellines-internal';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse> {
    const startTime = Date.now();

    try {
      const { data, method = 'zscore', threshold } = request.parameters ?? {};

      if (!data || !Array.isArray(data)) {
        throw new Error('Data array is required for anomaly detection');
      }

      let result: AnomalyResult;

      switch (method) {
        case 'zscore':
          result = this.zScoreDetection(data, threshold ?? 3);
          break;
        case 'iqr':
          result = this.iqrDetection(data);
          break;
        default:
          result = this.zScoreDetection(data, threshold ?? 3);
      }

      const latencyMs = Date.now() - startTime;

      return {
        result,
        confidence: result.isAnomaly ? 0.85 : 0.90,
        latencyMs,
        modelId: this.modelId,
        metadata: {
          dataPoints: data.length,
          method: result.method,
        },
      };
    } catch (error) {
      this.logger.error(`Anomaly detection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Z-score based anomaly detection
   * Points beyond threshold standard deviations are anomalies
   */
  private zScoreDetection(data: number[], threshold: number): AnomalyResult {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);

    // Check the last value (most recent)
    const lastValue = data[data.length - 1];
    const zScore = Math.abs((lastValue - mean) / stdDev);
    const isAnomaly = zScore > threshold;

    return {
      isAnomaly,
      score: zScore,
      method: 'zscore',
      threshold,
    };
  }

  /**
   * Interquartile Range (IQR) based anomaly detection
   * Points beyond Q1-1.5*IQR or Q3+1.5*IQR are anomalies
   */
  private iqrDetection(data: number[]): AnomalyResult {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;

    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const lastValue = data[data.length - 1];
    const isAnomaly = lastValue < lowerBound || lastValue > upperBound;

    const score = isAnomaly
      ? Math.min(Math.abs(lastValue - lowerBound) / iqr, Math.abs(lastValue - upperBound) / iqr)
      : 0;

    return {
      isAnomaly,
      score,
      method: 'iqr',
      threshold: 1.5,
    };
  }

  async checkHealth(): Promise<boolean> {
    // Internal model, always available
    return true;
  }

  getMetadata(): ModelMetadata {
    return {
      modelId: this.modelId,
      displayName: this.displayName,
      provider: this.provider,
      capabilities: this.getCapabilities(),
      isAvailable: true,
    };
  }

  getCapabilities(): ModelCapability[] {
    return [
      { type: 'anomaly', description: 'Statistical anomaly detection (Z-score, IQR)' },
    ];
  }
}
