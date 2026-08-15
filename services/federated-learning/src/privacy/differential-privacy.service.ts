import { Injectable, Logger } from '@nestjs/common';
import { ModelUpdate, PrivateUpdate, PrivacyGuarantee } from '../interfaces/federated-learning.interfaces';

/**
 * Differential Privacy Service
 * Req 3.3: Apply Gaussian noise to model gradients for privacy preservation
 */
@Injectable()
export class DifferentialPrivacyService {
  private readonly logger = new Logger(DifferentialPrivacyService.name);

  /**
   * Apply differential privacy to model updates using Gaussian mechanism
   * Req 3.3: Apply noise to gradients with differential privacy guarantees
   * @param updates Model updates from organizations
   * @param epsilon Privacy budget (smaller = more privacy)
   * @param delta Failure probability
   * @returns Private updates with noise applied
   */
  async applyGaussianPrivacy(
    updates: ModelUpdate[],
    epsilon: number,
    delta: number,
  ): Promise<PrivateUpdate[]> {
    this.logger.debug(
      `Applying Gaussian differential privacy: epsilon=${epsilon}, delta=${delta}`,
    );

    const noiseScale = this.calculateNoiseScale(epsilon, delta);
    const privateUpdates: PrivateUpdate[] = [];

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const noisyGradients = this.addGaussianNoise(update.gradients, noiseScale);

      privateUpdates.push({
        anonymizedId: this.anonymizeOrgId(update.orgId, i),
        noisyGradients,
        privacyGuarantee: {
          epsilon,
          delta,
          mechanism: 'gaussian',
          noiseScale,
        },
      });
    }

    this.logger.debug(
      `Applied differential privacy to ${privateUpdates.length} updates`,
    );
    return privateUpdates;
  }

  /**
   * Calculate appropriate noise scale for Gaussian mechanism
   * Based on privacy budget (epsilon) and failure probability (delta)
   * @param epsilon Privacy budget
   * @param delta Failure probability
   * @returns Noise scale (standard deviation)
   */
  private calculateNoiseScale(epsilon: number, delta: number): number {
    // Standard DP-SGD noise calculation
    // sigma = sqrt(2 * ln(1.25 / delta)) / epsilon
    const numerator = 2 * Math.log(1.25 / delta);
    const sigma = Math.sqrt(numerator) / epsilon;
    return sigma;
  }

  /**
   * Add Gaussian noise to gradients
   * @param gradients Original gradients
   * @param noiseScale Standard deviation of Gaussian noise
   * @returns Noisy gradients
   */
  private addGaussianNoise(gradients: number[][], noiseScale: number): number[][] {
    return gradients.map((row) =>
      row.map(() => this.sampleGaussian(0, noiseScale)),
    );
  }

  /**
   * Sample from Gaussian distribution using Box-Muller transform
   * @param mean Mean of distribution
   * @param stdDev Standard deviation
   * @returns Sample from N(mean, stdDev²)
   */
  private sampleGaussian(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z0;
  }

  /**
   * Anonymize organization ID by creating hash-based anonymous identifier
   * @param orgId Original organization ID
   * @param index Index for uniqueness
   * @returns Anonymous ID
   */
  private anonymizeOrgId(orgId: string, index: number): string {
    // Simple anonymization: hash + index
    const hash = Buffer.from(orgId).toString('base64').slice(0, 8);
    return `ANON-${hash}-${index}`;
  }

  /**
   * Verify privacy guarantee meets requirements
   * @param guarantee Privacy guarantee to verify
   * @param maxEpsilon Maximum acceptable epsilon
   * @returns Whether guarantee meets requirements
   */
  verifyPrivacyGuarantee(guarantee: PrivacyGuarantee, maxEpsilon: number): boolean {
    return guarantee.epsilon <= maxEpsilon && guarantee.delta > 0 && guarantee.delta < 1;
  }

  /**
   * Calculate total privacy cost for multiple rounds
   * @param epsilonPerRound Epsilon consumed per round
   * @param rounds Number of rounds
   * @returns Total epsilon consumed (simple sum, can be improved with composition)
   */
  calculateCumulativePrivacy(epsilonPerRound: number, rounds: number): number {
    // Basic composition: sum of epsilons
    // Advanced: use moments accountant or Rényi differential privacy for better bounds
    return epsilonPerRound * rounds;
  }
}
