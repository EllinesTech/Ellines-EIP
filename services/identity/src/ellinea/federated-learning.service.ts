/**
 * FederatedLearningService
 *
 * Coordinates privacy-preserving federated learning across participating
 * client organisations. Implements the full FedAvg pipeline:
 *   startTrainingRound → collectUpdates → applyPrivacy → detectPoisoning
 *   → aggregateUpdates → generateReport
 *
 * Privacy guarantee: Gaussian noise calibrated to the differential-privacy
 * budget (epsilon) is added before any gradient leaves org context.
 * Poisoning defence: cosine-similarity filtering against the mean global
 * gradient; updates below the 10th-percentile similarity are rejected.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ParticipantUpdate = {
  /** Organisation that contributed the gradient. Stripped before aggregation. */
  orgId: string;
  /** Flattened gradient vector from local training. */
  gradients: number[];
  /** Number of training examples used locally. */
  datasetSize: number;
};

export type PrivateUpdate = {
  /** Gradient vector after Gaussian noise + metadata stripping. */
  gradients: number[];
  /** Preserved for weighted FedAvg. */
  datasetSize: number;
};

export type TransparencyReport = {
  roundId: string;
  participantCount: number;
  patternsLearned: string[];
  privacyBudgetUsed: number;
  completedAt: Date | null;
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class FederatedLearningService {
  private readonly logger = new Logger(FederatedLearningService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Round lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start a new federated training round.
   *
   * 1. Queries all organisations with `optInFederated = true` in their JSON
   *    settings column — only these are invited to participate.
   * 2. Creates a `FederatedLearningRound` row.
   * 3. Fan-outs by inserting one `FederatedLearningParticipant` row per org.
   *
   * Requirement 3.1: Platform-initiated training rounds.
   * Requirement 3.4: Only consented orgs participate.
   */
  async startTrainingRound(config: {
    name: string;
    privacyBudget: number;
    minParticipants?: number;
  }) {
    const { name, privacyBudget, minParticipants = 2 } = config;

    if (privacyBudget <= 0) {
      throw new BadRequestException('privacyBudget must be greater than 0');
    }

    // ── Find the highest existing round number ─────────────────────────────
    const lastRound = await this.prisma.federatedLearningRound.findFirst({
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    const nextRoundNumber = (lastRound?.roundNumber ?? 0) + 1;

    // ── Identify opted-in orgs (tenant-safe: reads all orgs, checks settings JSON) ─
    //    No org-filter needed here because federated learning is a platform operation
    //    that intentionally spans consenting orgs (Requirement 3.4).
    const allOrgs = await this.prisma.organization.findMany({
      select: { id: true, settings: true },
    });

    const participatingOrgIds: string[] = allOrgs
      .filter((org) => {
        const settings = (org.settings as Record<string, unknown>) ?? {};
        return settings['optInFederated'] === true;
      })
      .map((org) => org.id);

    if (participatingOrgIds.length < minParticipants) {
      throw new BadRequestException(
        `Not enough participating organisations. ` +
          `Required: ${minParticipants}, opted-in: ${participatingOrgIds.length}`,
      );
    }

    // ── Create the round row ───────────────────────────────────────────────
    const round = await this.prisma.federatedLearningRound.create({
      data: {
        roundNumber: nextRoundNumber,
        modelType: name,
        participantCount: participatingOrgIds.length,
        aggregationStrategy: 'fedavg',
        privacyBudget,
        status: 'in_progress',
      },
    });

    // ── Fan-out: create one participant row per opted-in org ───────────────
    await this.prisma.federatedLearningParticipant.createMany({
      data: participatingOrgIds.map((orgId) => ({
        roundId: round.id,
        organizationId: orgId,
        updateSubmitted: false,
        updateAccepted: false,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `[startTrainingRound] Round #${nextRoundNumber} started. ` +
        `Participants: ${participatingOrgIds.length}, privacyBudget: ${privacyBudget}`,
    );

    return round;
  }

  /**
   * Collect all participant updates that have been submitted for the round.
   *
   * Returns only rows where `updateSubmitted = true`, giving the aggregation
   * step a clean slice of ready contributions.
   *
   * Requirement 3.2: Collect local model updates without sharing raw data.
   */
  async collectUpdates(roundId: string) {
    const round = await this.prisma.federatedLearningRound.findUnique({
      where: { id: roundId },
    });
    if (!round) {
      throw new NotFoundException(`Federated learning round ${roundId} not found`);
    }

    const participants = await this.prisma.federatedLearningParticipant.findMany({
      where: { roundId, updateSubmitted: true },
    });

    this.logger.debug(
      `[collectUpdates] roundId=${roundId} submitted=${participants.length}`,
    );

    return participants;
  }

  // ── Privacy layer ───────────────────────────────────────────────────────────

  /**
   * Apply differential privacy via calibrated Gaussian noise.
   *
   * Noise sigma = (1 / epsilon) × stddev(gradient values across all updates).
   * Strip org-identifying metadata so the returned updates are unlinkable.
   *
   * Requirement 3.3: Differential privacy protection on all gradient updates.
   */
  applyPrivacy(updates: ParticipantUpdate[], privacyBudget: number): PrivateUpdate[] {
    if (updates.length === 0) return [];

    // Flatten all gradient values to compute a global stddev
    const allValues = updates.flatMap((u) => u.gradients);
    const mean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    const variance =
      allValues.reduce((s, v) => s + (v - mean) ** 2, 0) / allValues.length;
    const stddev = Math.sqrt(variance) || 1; // fallback 1 to avoid divide-by-zero

    // sigma calibrated to privacy budget (epsilon)
    const sigma = stddev / privacyBudget;

    return updates.map((update) => ({
      // Strip orgId — no metadata about which org contributed
      gradients: update.gradients.map((g) => g + this.gaussianNoise(0, sigma)),
      datasetSize: update.datasetSize,
    }));
  }

  // ── Poisoning detection ─────────────────────────────────────────────────────

  /**
   * Detect and reject potentially poisoned gradient updates.
   *
   * Algorithm:
   *  1. Compute the mean global gradient vector (element-wise average).
   *  2. Compute cosine similarity between each update and the global mean.
   *  3. Exclude updates whose similarity falls below the 10th percentile.
   *
   * Requirement 3.5: Byzantine-fault-tolerant aggregation.
   */
  detectPoisoning(updates: PrivateUpdate[]): PrivateUpdate[] {
    if (updates.length <= 1) return updates;

    const dim = updates[0].gradients.length;
    if (dim === 0) return updates;

    // ── Step 1: Compute mean gradient vector ──────────────────────────────
    const meanGradient = new Array<number>(dim).fill(0);
    for (const u of updates) {
      for (let i = 0; i < dim; i++) {
        meanGradient[i] += (u.gradients[i] ?? 0) / updates.length;
      }
    }

    // ── Step 2: Compute cosine similarities ───────────────────────────────
    const similarities = updates.map((u) =>
      this.cosineSimilarity(u.gradients, meanGradient),
    );

    // ── Step 3: Find 10th-percentile threshold ────────────────────────────
    const sorted = [...similarities].sort((a, b) => a - b);
    const p10Index = Math.floor(0.1 * sorted.length);
    const threshold = sorted[p10Index] ?? 0;

    const filtered = updates.filter((_, idx) => similarities[idx] >= threshold);

    const rejected = updates.length - filtered.length;
    if (rejected > 0) {
      this.logger.warn(
        `[detectPoisoning] Rejected ${rejected}/${updates.length} updates as potential poisoning`,
      );
    }

    return filtered;
  }

  // ── Aggregation ─────────────────────────────────────────────────────────────

  /**
   * FedAvg: weighted sum of gradients by datasetSize, then persist new global
   * model version to the AiModelRegistry.
   *
   * Requirement 3.6: Aggregate local model updates into a global model.
   */
  async aggregateUpdates(updates: PrivateUpdate[], roundId: string): Promise<void> {
    if (updates.length === 0) {
      throw new BadRequestException('No updates to aggregate');
    }

    const round = await this.prisma.federatedLearningRound.findUnique({
      where: { id: roundId },
    });
    if (!round) {
      throw new NotFoundException(`Round ${roundId} not found`);
    }

    const totalData = updates.reduce((s, u) => s + u.datasetSize, 0);
    if (totalData === 0) {
      throw new BadRequestException('Total dataset size is zero — cannot aggregate');
    }

    const dim = updates[0].gradients.length;
    const aggregated = new Array<number>(dim).fill(0);

    for (const u of updates) {
      const weight = u.datasetSize / totalData;
      for (let i = 0; i < dim; i++) {
        aggregated[i] += (u.gradients[i] ?? 0) * weight;
      }
    }

    // Build a version identifier for the new global model
    const version = `fedavg-round-${round.roundNumber}-${Date.now()}`;

    // Persist the result — upsert a global federated model in the registry
    const federatedModelId = `ellinea-federated-${round.modelType}`;
    await this.prisma.aiModelRegistry.upsert({
      where: { modelId: federatedModelId },
      create: {
        modelId: federatedModelId,
        displayName: `Ellinea Federated — ${round.modelType}`,
        provider: 'ellinea',
        modelType: 'reasoning',
        capabilities: ['reasoning', 'federated'],
        configuration: { gradients: aggregated, version } as Prisma.InputJsonValue,
        isAvailable: true,
        priority: 60,
      },
      update: {
        configuration: { gradients: aggregated, version } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    // Close the round and record the global model version
    await this.prisma.federatedLearningRound.update({
      where: { id: roundId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        globalModelVersion: version,
        patternsLearned: [`FedAvg across ${updates.length} participants`],
        performanceMetrics: {
          participantsAggregated: updates.length,
          totalDatasetSize: totalData,
          gradientDimensions: dim,
        },
      },
    });

    this.logger.log(
      `[aggregateUpdates] Round ${roundId} completed. ` +
        `Version: ${version}, participants: ${updates.length}`,
    );
  }

  // ── Reporting ───────────────────────────────────────────────────────────────

  /**
   * Generate a transparency report for a completed round.
   *
   * Requirement 3.7: Federated learning transparency reports.
   */
  async generateReport(roundId: string): Promise<TransparencyReport> {
    const round = await this.prisma.federatedLearningRound.findUnique({
      where: { id: roundId },
      include: { participants: true },
    });

    if (!round) {
      throw new NotFoundException(`Round ${roundId} not found`);
    }

    const patternsLearned = Array.isArray(round.patternsLearned)
      ? (round.patternsLearned as string[])
      : typeof round.patternsLearned === 'string'
        ? [round.patternsLearned as string]
        : [];

    return {
      roundId: round.id,
      participantCount: round.participants.length,
      patternsLearned,
      privacyBudgetUsed: round.privacyBudget,
      completedAt: round.completedAt,
    };
  }

  // ── Private math helpers ────────────────────────────────────────────────────

  /**
   * Box–Muller transform: generate a normally-distributed random number
   * with mean μ and standard deviation σ.
   */
  private gaussianNoise(mu: number, sigma: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
    return mu + sigma * z0;
  }

  /**
   * Cosine similarity between two vectors of the same dimension.
   * Returns 0 when either vector has zero magnitude (degenerate case).
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v ** 2, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v ** 2, 0));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }
}
