import { Injectable, Logger } from '@nestjs/common';
import {
  PrivateUpdate,
  ValidationResult,
  AnomalyMetadata,
} from '../interfaces/federated-learning.interfaces';

/**
 * Poisoning Detector Service
 * Req 3.4: Detect poisoned/adversarial updates using statistical anomaly detection
 */
@Injectable()
export class PoisoningDetectorService {
  private readonly logger = new Logger(PoisoningDetectorService.name);

  /**
   * Detect poisoned updates using Z-score based statistical anomaly detection
   * Req 3.4: Statistical anomaly detection on updates
   * @param updates Private updates to validate
   * @param threshold Z-score threshold for outlier detection (default: 2.5)
   * @returns Validation result with clean and poisoned updates
   */
  async detectPoisoningByZScore(
    updates: PrivateUpdate[],
    threshold: number = 2.5,
  ): Promise<ValidationResult> {
    this.logger.debug(`Detecting poisoning with Z-score threshold: ${threshold}`);

    const anomalies = this.computeZScores(updates);
    const cleanUpdates: PrivateUpdate[] = [];
    const poisonedUpdates: PrivateUpdate[] = [];
    const anomalyScores = new Map<string, number>();

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const metadata = anomalies[i];
      anomalyScores.set(update.anonymizedId, metadata.zScore);

      if (metadata.isOutlier) {
        poisonedUpdates.push(update);
        this.logger.warn(
          `Poisoned update detected: ${update.anonymizedId} (Z-score: ${metadata.zScore})`,
        );
      } else {
        cleanUpdates.push(update);
      }
    }

    this.logger.debug(
      `Poisoning detection: ${cleanUpdates.length} clean, ${poisonedUpdates.length} poisoned`,
    );

    return {
      cleanUpdates,
      poisonedUpdates,
      anomalyScores,
      threshold,
    };
  }

  /**
   * Detect poisoning using Isolation Forest concept (simplified)
   * Req 3.4: Advanced anomaly detection for poisoned updates
   * @param updates Private updates to validate
   * @returns Validation result with isolated anomalies
   */
  async detectPoisoningByIsolation(updates: PrivateUpdate[]): Promise<ValidationResult> {
    this.logger.debug('Detecting poisoning using isolation-based anomaly detection');

    const cleanUpdates: PrivateUpdate[] = [];
    const poisonedUpdates: PrivateUpdate[] = [];
    const anomalyScores = new Map<string, number>();

    // Simplified isolation forest: compute isolation score based on gradient magnitude
    const isolationScores = this.computeIsolationScores(updates);

    const threshold = this.estimateThreshold(isolationScores);

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const score = isolationScores.get(update.anonymizedId) || 0;
      anomalyScores.set(update.anonymizedId, score);

      if (score > threshold) {
        poisonedUpdates.push(update);
        this.logger.warn(
          `Anomalous update isolated: ${update.anonymizedId} (isolation score: ${score})`,
        );
      } else {
        cleanUpdates.push(update);
      }
    }

    return {
      cleanUpdates,
      poisonedUpdates,
      anomalyScores,
      threshold,
    };
  }

  /**
   * Compute Z-scores for each update to detect statistical anomalies
   * @param updates Private updates
   * @returns Anomaly metadata for each update
   */
  private computeZScores(updates: PrivateUpdate[]): AnomalyMetadata[] {
    // Calculate gradient magnitudes
    const magnitudes = updates.map((u) => this.computeGradientMagnitude(u.noisyGradients));

    // Calculate mean and standard deviation
    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance =
      magnitudes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / magnitudes.length;
    const stdDev = Math.sqrt(variance);

    // Compute Z-scores
    const threshold = 2.5;
    return updates.map((u, i) => {
      const zScore = stdDev === 0 ? 0 : (magnitudes[i] - mean) / stdDev;
      const isOutlier = Math.abs(zScore) > threshold;

      return {
        updateId: u.anonymizedId,
        zScore,
        isolationScore: 0, // Not used in Z-score method
        isOutlier,
        reasons: isOutlier
          ? [`High Z-score: ${zScore.toFixed(2)}, threshold: ${threshold}`]
          : [],
      };
    });
  }

  /**
   * Compute isolation scores based on gradient properties
   * @param updates Private updates
   * @returns Map of update ID to isolation score
   */
  private computeIsolationScores(updates: PrivateUpdate[]): Map<string, number> {
    const scores = new Map<string, number>();

    // Calculate gradient properties for each update
    const properties = updates.map((u) => ({
      magnitude: this.computeGradientMagnitude(u.noisyGradients),
      sparsity: this.computeSparsity(u.noisyGradients),
      maxAbsValue: this.computeMaxAbsValue(u.noisyGradients),
    }));

    // Normalize properties to 0-1 range
    const normalizedProps = this.normalizeProperties(properties);

    // Compute isolation score as weighted combination
    for (let i = 0; i < updates.length; i++) {
      const props = normalizedProps[i];
      // Isolation score: high when far from normal distribution
      const isolationScore =
        (Math.abs(props.magnitude - 0.5) +
          Math.abs(props.sparsity - 0.5) +
          Math.abs(props.maxAbsValue - 0.5)) /
        3;

      scores.set(updates[i].anonymizedId, isolationScore);
    }

    return scores;
  }

  /**
   * Compute Frobenius norm (magnitude) of gradient matrix
   * @param gradients Gradient matrix
   * @returns Frobenius norm
   */
  private computeGradientMagnitude(gradients: number[][]): number {
    let sum = 0;
    for (const row of gradients) {
      for (const val of row) {
        sum += val * val;
      }
    }
    return Math.sqrt(sum);
  }

  /**
   * Compute sparsity of gradients (fraction of zeros)
   * @param gradients Gradient matrix
   * @returns Sparsity value (0-1)
   */
  private computeSparsity(gradients: number[][]): number {
    let zeroCount = 0;
    let total = 0;
    for (const row of gradients) {
      for (const val of row) {
        if (val === 0 || Math.abs(val) < 1e-10) zeroCount++;
        total++;
      }
    }
    return total === 0 ? 0 : zeroCount / total;
  }

  /**
   * Compute maximum absolute value in gradients
   * @param gradients Gradient matrix
   * @returns Max absolute value
   */
  private computeMaxAbsValue(gradients: number[][]): number {
    let max = 0;
    for (const row of gradients) {
      for (const val of row) {
        max = Math.max(max, Math.abs(val));
      }
    }
    return max;
  }

  /**
   * Normalize properties to 0-1 range
   * @param properties Property array
   * @returns Normalized properties
   */
  private normalizeProperties(
    properties: Array<{
      magnitude: number;
      sparsity: number;
      maxAbsValue: number;
    }>,
  ) {
    const magnitudes = properties.map((p) => p.magnitude);
    const sparsities = properties.map((p) => p.sparsity);
    const maxValues = properties.map((p) => p.maxAbsValue);

    const normalize = (values: number[]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      return values.map((v) => (v - min) / range);
    };

    const normMagnitudes = normalize(magnitudes);
    const normSparsities = normalize(sparsities);
    const normMaxValues = normalize(maxValues);

    return properties.map((_, i) => ({
      magnitude: normMagnitudes[i],
      sparsity: normSparsities[i],
      maxAbsValue: normMaxValues[i],
    }));
  }

  /**
   * Estimate threshold for anomaly detection based on data distribution
   * @param scores Anomaly scores
   * @returns Estimated threshold
   */
  private estimateThreshold(scores: Map<string, number>): number {
    const scoreArray = Array.from(scores.values());
    if (scoreArray.length === 0) return 0.5;

    // Use 75th percentile as threshold
    scoreArray.sort((a, b) => a - b);
    const index = Math.floor(scoreArray.length * 0.75);
    return scoreArray[index];
  }
}
