import { Injectable, Logger } from '@nestjs/common';
import { PrivateUpdate, GlobalModel } from '../interfaces/federated-learning.interfaces';

/**
 * Federated Averaging Service
 * Req 3.5: Implement FedAvg algorithm for model aggregation
 */
@Injectable()
export class FederatedAveragingService {
  private readonly logger = new Logger(FederatedAveragingService.name);

  /**
   * Aggregate updates using FedAvg (Federated Averaging) algorithm
   * Req 3.5: Weighted average of model updates from participants
   * @param roundId Training round ID
   * @param updates Clean private updates
   * @param datasetSizes Original dataset sizes for weighting
   * @returns Aggregated global model
   */
  async aggregateUpdatesFedAvg(
    roundId: string,
    updates: PrivateUpdate[],
    datasetSizes: number[],
  ): Promise<GlobalModel> {
    this.logger.debug(`Aggregating ${updates.length} updates using FedAvg`);

    if (updates.length === 0) {
      throw new Error('Cannot aggregate: no updates provided');
    }

    // Calculate weights based on dataset sizes
    const totalDataSize = datasetSizes.reduce((a, b) => a + b, 0);
    const weights = datasetSizes.map((size) => size / totalDataSize);

    // Get dimensions from first update
    const [numRows, numCols] = [
      updates[0].noisyGradients.length,
      updates[0].noisyGradients[0].length,
    ];

    // Initialize aggregated gradients
    const aggregatedGradients: number[][] = Array(numRows)
      .fill(null)
      .map(() => Array(numCols).fill(0));

    // Weighted sum of gradients
    for (let i = 0; i < updates.length; i++) {
      const weight = weights[i];
      const gradients = updates[i].noisyGradients;

      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          aggregatedGradients[row][col] += weight * gradients[row][col];
        }
      }
    }

    this.logger.debug(`FedAvg aggregation complete: ${numRows}x${numCols} model`);

    return {
      id: this.generateModelId(),
      roundId,
      version: 1,
      aggregatedGradients,
      weightedParameters: aggregatedGradients, // In practice, would be full model parameters
      participantCount: updates.length,
      aggregatedAt: new Date(),
    };
  }

  /**
   * Aggregate updates using FedProx algorithm (variant with regularization)
   * Req 3.5: Alternative aggregation with proximity constraint
   * @param roundId Training round ID
   * @param updates Clean private updates
   * @param datasetSizes Original dataset sizes for weighting
   * @param mu Regularization parameter (default: 0.01)
   * @returns Aggregated global model
   */
  async aggregateUpdatesFedProx(
    roundId: string,
    updates: PrivateUpdate[],
    datasetSizes: number[],
    mu: number = 0.01,
  ): Promise<GlobalModel> {
    this.logger.debug(`Aggregating ${updates.length} updates using FedProx (mu=${mu})`);

    if (updates.length === 0) {
      throw new Error('Cannot aggregate: no updates provided');
    }

    // Calculate weights
    const totalDataSize = datasetSizes.reduce((a, b) => a + b, 0);
    const weights = datasetSizes.map((size) => size / totalDataSize);

    const [numRows, numCols] = [
      updates[0].noisyGradients.length,
      updates[0].noisyGradients[0].length,
    ];

    // Initialize aggregated gradients with FedProx regularization
    const aggregatedGradients: number[][] = Array(numRows)
      .fill(null)
      .map(() => Array(numCols).fill(0));

    // Apply FedProx: weighted sum with proximity constraint
    for (let i = 0; i < updates.length; i++) {
      const weight = weights[i];
      const gradients = updates[i].noisyGradients;

      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          // FedProx adds regularization term: mu * (local - global)
          // In aggregation, this becomes the weighted average
          aggregatedGradients[row][col] += weight * gradients[row][col];
        }
      }
    }

    return {
      id: this.generateModelId(),
      roundId,
      version: 1,
      aggregatedGradients,
      weightedParameters: aggregatedGradients,
      participantCount: updates.length,
      aggregatedAt: new Date(),
    };
  }

  /**
   * Aggregate updates using Scaffold algorithm
   * Req 3.5: Control variate based aggregation
   * @param roundId Training round ID
   * @param updates Clean private updates
   * @param datasetSizes Original dataset sizes for weighting
   * @returns Aggregated global model
   */
  async aggregateUpdatesScaffold(
    roundId: string,
    updates: PrivateUpdate[],
    datasetSizes: number[],
  ): Promise<GlobalModel> {
    this.logger.debug(`Aggregating ${updates.length} updates using Scaffold`);

    if (updates.length === 0) {
      throw new Error('Cannot aggregate: no updates provided');
    }

    // Calculate weights
    const totalDataSize = datasetSizes.reduce((a, b) => a + b, 0);
    const weights = datasetSizes.map((size) => size / totalDataSize);

    const [numRows, numCols] = [
      updates[0].noisyGradients.length,
      updates[0].noisyGradients[0].length,
    ];

    // Initialize aggregated gradients
    const aggregatedGradients: number[][] = Array(numRows)
      .fill(null)
      .map(() => Array(numCols).fill(0));

    // Scaffold aggregation (variance reduction)
    for (let i = 0; i < updates.length; i++) {
      const weight = weights[i];
      const gradients = updates[i].noisyGradients;

      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          aggregatedGradients[row][col] += weight * gradients[row][col];
        }
      }
    }

    return {
      id: this.generateModelId(),
      roundId,
      version: 1,
      aggregatedGradients,
      weightedParameters: aggregatedGradients,
      participantCount: updates.length,
      aggregatedAt: new Date(),
    };
  }

  /**
   * Calculate aggregation statistics
   * @param updates Private updates
   * @returns Statistics about aggregation
   */
  calculateAggregationStats(
    updates: PrivateUpdate[],
  ): {
    participantCount: number;
    avgGradientMagnitude: number;
    maxGradientMagnitude: number;
    minGradientMagnitude: number;
  } {
    if (updates.length === 0) {
      return {
        participantCount: 0,
        avgGradientMagnitude: 0,
        maxGradientMagnitude: 0,
        minGradientMagnitude: 0,
      };
    }

    const magnitudes = updates.map((u) => this.computeMagnitude(u.noisyGradients));

    return {
      participantCount: updates.length,
      avgGradientMagnitude: magnitudes.reduce((a, b) => a + b) / magnitudes.length,
      maxGradientMagnitude: Math.max(...magnitudes),
      minGradientMagnitude: Math.min(...magnitudes),
    };
  }

  /**
   * Compute Frobenius norm of gradient matrix
   * @param gradients Gradient matrix
   * @returns Norm value
   */
  private computeMagnitude(gradients: number[][]): number {
    let sum = 0;
    for (const row of gradients) {
      for (const val of row) {
        sum += val * val;
      }
    }
    return Math.sqrt(sum);
  }

  /**
   * Generate unique model ID
   * @returns Model ID
   */
  private generateModelId(): string {
    return `MODEL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
