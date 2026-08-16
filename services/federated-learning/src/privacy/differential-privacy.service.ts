import { Injectable, Logger } from '@nestjs/common';
import { ModelUpdate, PrivateUpdate, PrivacyGuarantee } from '../interfaces/federated-learning.interfaces';

/**
 * Differential Privacy Service
 * Requirement 3.3: Apply differential privacy techniques to model gradients
 */
@Injectable()
export class DifferentialPrivacyService {
  private readonly logger = new Logger(DifferentialPrivacyService.name);

  /**
   * Apply Gaussian differential privacy to a batch of model updates
   * Req 3.3: Apply differential privacy to gradients
   * @param updates Model updates to privatize
   * @param epsilon Privacy budget parameter
   * @param delta Differential privacy delta parameter
   * @returns Array of privatized updates
   */
  async applyGaussianPrivacy(
    updates: ModelUpdate[],
    epsilon: number,
    delta: number,
  ): Promise<PrivateUpdate[]> {
    return updates.map((update) => this.applyPrivacyToUpdate(update, epsilon, delta));
  }

  /**
   * Apply Gaussian mechanism differential privacy to gradients
   * Uses noise addition to ensure privacy guarantee
   */
  applyGaussianMechanism(
    gradients: number[][],
    epsilon: number,
    delta: number,
    sensitivityBound: number = 1.0,
  ): {
    noisyGradients: number[][];
    guarantee: PrivacyGuarantee;
    noiseScale: number;
  } {
    const noiseScale = this.calculateNoiseScale(sensitivityBound, epsilon, delta);

    const noisyGradients = gradients.map((layer) =>
      layer.map((gradient) => {
        const noise = this.sampleGaussianNoise(noiseScale);
        return gradient + noise;
      }),
    );

    return {
      noisyGradients,
      guarantee: {
        epsilon,
        delta,
        noiseScale,
        mechanism: 'gaussian',
      },
      noiseScale,
    };
  }

  /**
   * Apply Laplace mechanism differential privacy to gradients
   * Alternative privacy mechanism with sharper privacy guarantees
   */
  applyLaplaceMechanism(
    gradients: number[][],
    epsilon: number,
    sensitivityBound: number = 1.0,
  ): {
    noisyGradients: number[][];
    guarantee: PrivacyGuarantee;
    noiseScale: number;
  } {
    const noiseScale = sensitivityBound / epsilon;

    const noisyGradients = gradients.map((layer) =>
      layer.map((gradient) => {
        const noise = this.sampleLaplaceNoise(noiseScale);
        return gradient + noise;
      }),
    );

    return {
      noisyGradients,
      guarantee: {
        epsilon,
        delta: 0, // Laplace mechanism achieves pure epsilon-DP
        noiseScale,
        mechanism: 'laplace',
      },
      noiseScale,
    };
  }

  /**
   * Apply differentially private aggregation with noise
   */
  applyPrivacyToUpdate(
    update: ModelUpdate,
    epsilon: number,
    delta: number,
  ): PrivateUpdate {
    const { noisyGradients, guarantee, noiseScale } = this.applyGaussianMechanism(
      update.gradients,
      epsilon,
      delta,
    );

    // Create anonymized ID based on round and org, but not revealing specific org details
    const anonymizedId = this.generateAnonymizedId(update.orgId, update.roundId);

    this.logger.debug(
      `Applied differential privacy to update from ${update.orgId} (noise scale: ${noiseScale})`,
    );

    return {
      anonymizedId,
      roundId: update.roundId,
      noisyGradients,
      privacyGuarantee: guarantee,
      isClean: true, // Will be verified by poisoning detector
      validationScore: 1.0,
    };
  }

  /**
   * Calculate required noise scale for Gaussian mechanism
   * Formula: sigma = sqrt(2 * ln(1.25/delta)) * sensitivity / epsilon
   */
  private calculateNoiseScale(
    sensitivity: number,
    epsilon: number,
    delta: number,
  ): number {
    if (epsilon <= 0) {
      throw new Error('Epsilon must be positive');
    }
    if (delta <= 0 || delta >= 1) {
      throw new Error('Delta must be between 0 and 1');
    }

    const sqrtTerm = Math.sqrt(2 * Math.log(1.25 / delta));
    return (sqrtTerm * sensitivity) / epsilon;
  }

  /**
   * Sample from Gaussian (normal) distribution with mean 0
   */
  private sampleGaussianNoise(scale: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();

    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * scale;
  }

  /**
   * Sample from Laplace distribution with mean 0
   */
  private sampleLaplaceNoise(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Generate anonymized ID that preserves round information but hides org identity
   */
  private generateAnonymizedId(orgId: string, roundId: string): string {
    // Hash the org ID to create an anonymized token
    let hash = 0;
    for (let i = 0; i < orgId.length; i++) {
      const char = orgId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Keep within 32-bit integer
    }

    const anonymousOrgToken = Math.abs(hash).toString(16).padStart(8, '0');
    return `anon-${roundId}-${anonymousOrgToken}`;
  }

  /**
   * Compose privacy budgets when multiple mechanisms are applied
   * Req 3.2: Track privacy budget usage
   */
  composeBudgets(budgets: PrivacyGuarantee[]): PrivacyGuarantee {
    // Simple composition: epsilon and delta sum (loose upper bound)
    const totalEpsilon = budgets.reduce((sum, b) => sum + b.epsilon, 0);
    const totalDelta = budgets.reduce((sum, b) => sum + b.delta, 0);

    return {
      epsilon: totalEpsilon,
      delta: Math.min(totalDelta, 1),
      noiseScale: Math.max(...budgets.map((b) => b.noiseScale)),
      mechanism: 'gaussian',
    };
  }

  /**
   * Verify privacy budget is not exceeded
   */
  isPrivacyBudgetExceeded(
    usedEpsilon: number,
    totalBudget: number,
    threshold: number = 0.9,
  ): boolean {
    return usedEpsilon > totalBudget * threshold;
  }

  /**
   * Calculate remaining privacy budget
   */
  getRemainingBudget(usedEpsilon: number, totalBudget: number): number {
    return Math.max(0, totalBudget - usedEpsilon);
  }

  /**
   * Verify privacy guarantee validity
   * @param guarantee Privacy guarantee to verify
   * @param threshold Maximum acceptable epsilon
   * @returns Whether guarantee is valid
   */
  verifyPrivacyGuarantee(guarantee: PrivacyGuarantee, threshold: number): boolean {
    return guarantee.epsilon <= threshold && guarantee.delta >= 0 && guarantee.delta <= 1;
  }

  /**
   * Calculate cumulative privacy cost across multiple rounds
   * @param epsilonPerRound Privacy budget per round
   * @param numRounds Number of rounds
   * @returns Total privacy cost
   */
  calculateCumulativePrivacy(epsilonPerRound: number, numRounds: number): number {
    // Simple composition: sum of all epsilons (loose upper bound)
    // In practice, would use advanced composition for tighter bounds
    return epsilonPerRound * numRounds;
  }
}
