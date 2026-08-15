import { Injectable, Logger } from '@nestjs/common';
import { GlobalModel, DistributionResult } from '../interfaces/federated-learning.interfaces';

/**
 * Model Distributor Service
 * Req 3.6: Distribute aggregated global model to participating organizations
 */
@Injectable()
export class ModelDistributorService {
  private readonly logger = new Logger(ModelDistributorService.name);

  /**
   * Distribute global model to participating organizations
   * Req 3.6: Model distribution mechanism to participating organizations
   * @param model Global model to distribute
   * @param orgIds Organization IDs to distribute to
   * @returns Distribution result
   */
  async distributeModel(model: GlobalModel, orgIds: string[]): Promise<DistributionResult> {
    this.logger.debug(`Distributing model ${model.id} to ${orgIds.length} organizations`);

    const distributedTo: string[] = [];
    const failedOrgs: string[] = [];

    for (const orgId of orgIds) {
      try {
        await this.sendModelToOrganization(model, orgId);
        distributedTo.push(orgId);
        this.logger.debug(`Successfully distributed model to ${orgId}`);
      } catch (error) {
        failedOrgs.push(orgId);
        this.logger.error(`Failed to distribute model to ${orgId}: ${error}`);
      }
    }

    return {
      modelId: model.id,
      distributedTo,
      failedOrgs,
      distributedAt: new Date(),
    };
  }

  /**
   * Send model to a specific organization
   * @param model Global model
   * @param orgId Organization ID
   */
  private async sendModelToOrganization(model: GlobalModel, orgId: string): Promise<void> {
    // In production, this would:
    // 1. Compress model parameters
    // 2. Encrypt for transport
    // 3. Send via secure API to organization's endpoint
    // 4. Request acknowledgment
    // 5. Retry on failure

    // Simulated implementation:
    await this.simulateNetworkDelay();

    if (Math.random() > 0.95) {
      throw new Error(`Network error sending to ${orgId}`);
    }

    this.logger.debug(`Model ${model.id} sent to ${orgId}`);
  }

  /**
   * Compress model for efficient distribution
   * @param model Global model
   * @returns Compressed model representation
   */
  compressModel(model: GlobalModel): { size: number; ratio: number } {
    // Estimate original size
    const originalSize = model.aggregatedGradients.length * model.aggregatedGradients[0].length * 8; // 8 bytes per float

    // Estimate compressed size (50% compression typical)
    const compressedSize = Math.floor(originalSize * 0.5);

    return {
      size: compressedSize,
      ratio: originalSize / compressedSize,
    };
  }

  /**
   * Create model metadata for distribution
   * @param model Global model
   * @returns Model metadata
   */
  createModelMetadata(model: GlobalModel): {
    modelId: string;
    version: number;
    timestamp: Date;
    participantCount: number;
    checksum: string;
  } {
    const checksum = this.computeChecksum(model);

    return {
      modelId: model.id,
      version: model.version,
      timestamp: model.aggregatedAt,
      participantCount: model.participantCount,
      checksum,
    };
  }

  /**
   * Compute checksum for model integrity verification
   * @param model Global model
   * @returns Checksum string
   */
  private computeChecksum(model: GlobalModel): string {
    // Simple checksum: sum of all gradients
    let sum = 0;
    for (const row of model.aggregatedGradients) {
      for (const val of row) {
        sum += val;
      }
    }
    return Buffer.from(sum.toString()).toString('hex').slice(0, 16);
  }

  /**
   * Verify model integrity using checksum
   * @param model Model to verify
   * @param expectedChecksum Expected checksum
   * @returns Whether model is valid
   */
  verifyModelIntegrity(model: GlobalModel, expectedChecksum: string): boolean {
    const actualChecksum = this.computeChecksum(model);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Simulate network delay
   */
  private async simulateNetworkDelay(): Promise<void> {
    const delay = Math.random() * 100 + 50; // 50-150ms
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Track distribution metrics
   * @param result Distribution result
   * @returns Metrics
   */
  getDistributionMetrics(result: DistributionResult): {
    successRate: number;
    failureRate: number;
    totalOrgs: number;
  } {
    const total = result.distributedTo.length + result.failedOrgs.length;
    return {
      successRate: total > 0 ? result.distributedTo.length / total : 0,
      failureRate: total > 0 ? result.failedOrgs.length / total : 0,
      totalOrgs: total,
    };
  }
}
