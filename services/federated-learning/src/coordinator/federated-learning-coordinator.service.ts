import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  FederatedConfig,
  TrainingRound,
  ModelUpdate,
  GlobalModel,
  TransparencyReport,
  PrivacyBudget,
} from '../interfaces/federated-learning.interfaces';
import { DifferentialPrivacyService } from '../privacy/differential-privacy.service';
import { PoisoningDetectorService } from '../poisoning/poisoning-detector.service';
import { FederatedAveragingService } from '../aggregation/federated-averaging.service';
import { ModelDistributorService } from '../distribution/model-distributor.service';
import { OrgParticipationService } from '../participation/org-participation.service';
import { TransparencyReporterService } from '../reporting/transparency-reporter.service';

/**
 * Federated Learning Coordinator
 * Req 3.1–3.8: Implements privacy-preserving federated learning across organizations
 * Coordinates training rounds, differential privacy, poisoning detection, aggregation,
 * model distribution, transparency reporting, and opt-in/opt-out management
 */
@Injectable()
export class FederatedLearningCoordinatorService {
  private readonly logger = new Logger(FederatedLearningCoordinatorService.name);

  // Training rounds in progress
  private activeRounds = new Map<string, TrainingRound>();

  // Privacy budget tracking
  private privacyBudgets = new Map<string, PrivacyBudget>();

  constructor(
    private privacyService: DifferentialPrivacyService,
    private poisoningDetector: PoisoningDetectorService,
    private federatedAveraging: FederatedAveragingService,
    private modelDistributor: ModelDistributorService,
    private orgParticipation: OrgParticipationService,
    private transparencyReporter: TransparencyReporterService,
  ) {}

  /**
   * Start a new federated training round
   * Req 3.1: Training round coordination with participating organization management
   * @param config Federated learning configuration
   * @returns Training round
   */
  async startTrainingRound(config: FederatedConfig): Promise<TrainingRound> {
    this.logger.debug(`Starting federated training round with ${config.participatingOrgs.length} organizations`);

    // Filter to only opted-in organizations
    const optedInOrgs = this.orgParticipation.filterOptedIn(config.participatingOrgs);

    if (optedInOrgs.length === 0) {
      throw new BadRequestException('No opted-in organizations available for training round');
    }

    // Verify privacy budget
    const privacyBudget = this.getOrCreatePrivacyBudget();
    if (privacyBudget.remainingBudget < config.privacyBudget) {
      throw new BadRequestException(
        `Insufficient privacy budget. Required: ${config.privacyBudget}, Available: ${privacyBudget.remainingBudget}`,
      );
    }

    // Create training round
    const roundId = this.generateRoundId();
    const expectedEndTime = new Date(Date.now() + config.roundDuration);

    const trainingRound: TrainingRound = {
      id: roundId,
      config: { ...config, participatingOrgs: optedInOrgs },
      status: 'pending',
      startTime: new Date(),
      expectedEndTime,
      participantsJoined: [],
      participantUpdates: new Map(),
    };

    this.activeRounds.set(roundId, trainingRound);

    // Notify organizations
    await this.orgParticipation.broadcastNotification(
      `Federated learning round ${roundId} started. Submit updates by ${expectedEndTime.toISOString()}`,
    );

    this.logger.info(
      `Training round ${roundId} started with ${optedInOrgs.length} opted-in organizations`,
    );

    return trainingRound;
  }

  /**
   * Submit model updates from an organization
   * Req 3.2: Collect model updates from organizations
   * @param roundId Training round ID
   * @param update Model update from organization
   * @returns Updated training round
   */
  async submitUpdate(roundId: string, update: ModelUpdate): Promise<TrainingRound> {
    const round = this.activeRounds.get(roundId);
    if (!round) {
      throw new BadRequestException(`Training round ${roundId} not found`);
    }

    if (round.status !== 'pending' && round.status !== 'active') {
      throw new BadRequestException(
        `Cannot submit updates for round ${roundId} in status ${round.status}`,
      );
    }

    // Verify organization is opted in
    if (!this.orgParticipation.isOptedIn(update.orgId)) {
      throw new BadRequestException(
        `Organization ${update.orgId} is not opted in to federated learning`,
      );
    }

    // Store update
    round.participantUpdates.set(update.orgId, update);
    if (!round.participantsJoined.includes(update.orgId)) {
      round.participantsJoined.push(update.orgId);
    }

    // Update status if first participant
    if (round.status === 'pending') {
      round.status = 'active';
    }

    // Record participation
    this.orgParticipation.recordParticipation(update.orgId, roundId);

    this.logger.debug(`Received update from ${update.orgId} for round ${roundId}`);
    return round;
  }

  /**
   * Finalize training round and aggregate updates
   * Req 3.3, 3.4, 3.5: Apply privacy, detect poisoning, aggregate
   * @param roundId Training round ID
   * @returns Aggregated global model
   */
  async finalizeRound(roundId: string): Promise<GlobalModel> {
    const round = this.activeRounds.get(roundId);
    if (!round) {
      throw new BadRequestException(`Training round ${roundId} not found`);
    }

    if (round.status === 'aggregating' || round.status === 'distributing' || round.status === 'completed') {
      throw new BadRequestException(
        `Round ${roundId} is already being finalized or completed`,
      );
    }

    this.logger.debug(`Finalizing round ${roundId} with ${round.participantsJoined.length} participants`);

    // Check minimum participation
    if (round.participantsJoined.length < 2) {
      throw new BadRequestException(`Round ${roundId} has insufficient participants (minimum 2)`);
    }

    round.status = 'aggregating';

    try {
      // Step 1: Collect updates
      const updates = Array.from(round.participantUpdates.values());
      const datasetSizes = updates.map((u) => u.datasetSize);

      // Step 2: Apply differential privacy (Req 3.3)
      const privacyBudget = this.getOrCreatePrivacyBudget();
      const privateUpdates = await this.privacyService.applyGaussianPrivacy(
        updates,
        round.config.privacyBudget,
        1e-5, // delta
      );

      // Step 3: Detect poisoning (Req 3.4)
      const validationResult = await this.poisoningDetector.detectPoisoningByZScore(privateUpdates);

      this.logger.info(
        `Poisoning detection: ${validationResult.cleanUpdates.length} clean, ${validationResult.poisonedUpdates.length} poisoned`,
      );

      // Step 4: Aggregate clean updates (Req 3.5)
      const cleanDatasetSizes = validationResult.cleanUpdates.map((_, i) => {
        const idx = privateUpdates.indexOf(_);
        return datasetSizes[idx] || 1;
      });

      let globalModel: GlobalModel;
      switch (round.config.aggregationStrategy) {
        case 'fedprox':
          globalModel = await this.federatedAveraging.aggregateUpdatesFedProx(
            roundId,
            validationResult.cleanUpdates,
            cleanDatasetSizes,
          );
          break;
        case 'scaffold':
          globalModel = await this.federatedAveraging.aggregateUpdatesScaffold(
            roundId,
            validationResult.cleanUpdates,
            cleanDatasetSizes,
          );
          break;
        case 'fedavg':
        default:
          globalModel = await this.federatedAveraging.aggregateUpdatesFedAvg(
            roundId,
            validationResult.cleanUpdates,
            cleanDatasetSizes,
          );
          break;
      }

      // Step 5: Update privacy budget
      privacyBudget.consumedBudget += round.config.privacyBudget;
      privacyBudget.remainingBudget = privacyBudget.totalBudget - privacyBudget.consumedBudget;
      privacyBudget.roundsCompleted += 1;

      this.logger.info(`Round ${roundId} aggregated successfully. Model ID: ${globalModel.id}`);
      return globalModel;
    } catch (error) {
      round.status = 'failed';
      this.logger.error(`Failed to finalize round ${roundId}: ${error}`);
      throw error;
    }
  }

  /**
   * Distribute aggregated model to participants
   * Req 3.6: Model distribution mechanism to participating organizations
   * @param roundId Training round ID
   * @param model Global model to distribute
   * @returns Distribution result
   */
  async distributeModel(roundId: string, model: GlobalModel): Promise<{ modelId: string; distributedTo: string[]; failedOrgs: string[] }> {
    const round = this.activeRounds.get(roundId);
    if (!round) {
      throw new BadRequestException(`Training round ${roundId} not found`);
    }

    round.status = 'distributing';

    try {
      // Distribute to all participants
      const result = await this.modelDistributor.distributeModel(model, round.participantsJoined);

      round.status = 'completed';
      round.endTime = new Date();

      this.logger.info(
        `Model distributed to ${result.distributedTo.length} organizations, ${result.failedOrgs.length} failed`,
      );

      return {
        modelId: result.modelId,
        distributedTo: result.distributedTo,
        failedOrgs: result.failedOrgs,
      };
    } catch (error) {
      round.status = 'failed';
      this.logger.error(`Failed to distribute model for round ${roundId}: ${error}`);
      throw error;
    }
  }

  /**
   * Generate transparency report for training round
   * Req 3.7: Transparency reporting with patterns learned and privacy budget tracking
   * @param roundId Training round ID
   * @param model Global model
   * @returns Transparency report
   */
  async generateTransparencyReport(roundId: string, model: GlobalModel): Promise<TransparencyReport> {
    const round = this.activeRounds.get(roundId);
    if (!round) {
      throw new BadRequestException(`Training round ${roundId} not found`);
    }

    const privacyBudget = this.getOrCreatePrivacyBudget();
    const report = await this.transparencyReporter.generateReport(roundId, round, model, privacyBudget);

    this.logger.debug(`Generated transparency report for round ${roundId}`);
    return report;
  }

  /**
   * Opt organization into federated learning
   * Req 3.8: Opt-in/opt-out management per organization
   * @param orgId Organization ID
   * @returns Participation status
   */
  async optIn(orgId: string): Promise<{ orgId: string; optedIn: boolean; joinedAt: Date }> {
    const result = await this.orgParticipation.optIn(orgId);
    this.logger.info(`Organization ${orgId} opted in to federated learning`);
    return {
      orgId: result.orgId,
      optedIn: result.optedIn,
      joinedAt: result.joinedAt!,
    };
  }

  /**
   * Opt organization out of federated learning
   * Req 3.8: Opt-in/opt-out management per organization
   * @param orgId Organization ID
   * @param reason Opt-out reason
   * @returns Participation status
   */
  async optOut(orgId: string, reason: string): Promise<{ orgId: string; optedIn: boolean; reason: string }> {
    const result = await this.orgParticipation.optOut(orgId, reason);
    this.logger.info(`Organization ${orgId} opted out: ${reason}`);
    return {
      orgId: result.orgId,
      optedIn: result.optedIn,
      reason: result.optOutReason || '',
    };
  }

  /**
   * Get training round status
   * @param roundId Training round ID
   * @returns Training round
   */
  getTrainingRound(roundId: string): TrainingRound | undefined {
    return this.activeRounds.get(roundId);
  }

  /**
   * Get all active training rounds
   * @returns Array of training rounds
   */
  getActiveRounds(): TrainingRound[] {
    return Array.from(this.activeRounds.values());
  }

  /**
   * Get privacy budget status
   * @returns Privacy budget
   */
  getPrivacyBudgetStatus(): PrivacyBudget {
    return this.getOrCreatePrivacyBudget();
  }

  /**
   * Get participation statistics
   * @returns Participation stats
   */
  getParticipationStats(): {
    totalOrganizations: number;
    optedInCount: number;
    optedOutCount: number;
    optInRate: number;
  } {
    return this.orgParticipation.getParticipationStats();
  }

  /**
   * Reset privacy budget (admin function)
   * @param newBudget New total privacy budget
   */
  resetPrivacyBudget(newBudget: number): void {
    this.privacyBudgets.clear();
    const budget: PrivacyBudget = {
      totalBudget: newBudget,
      consumedBudget: 0,
      remainingBudget: newBudget,
      roundsCompleted: 0,
      lastUpdated: new Date(),
    };
    this.privacyBudgets.set('default', budget);
    this.logger.info(`Privacy budget reset to ${newBudget}`);
  }

  /**
   * Get or create privacy budget
   * @returns Privacy budget
   */
  private getOrCreatePrivacyBudget(): PrivacyBudget {
    let budget = this.privacyBudgets.get('default');

    if (!budget) {
      budget = {
        totalBudget: 10.0, // Default privacy budget (epsilon)
        consumedBudget: 0,
        remainingBudget: 10.0,
        roundsCompleted: 0,
        lastUpdated: new Date(),
      };
      this.privacyBudgets.set('default', budget);
    }

    return budget;
  }

  /**
   * Generate unique round ID
   * @returns Round ID
   */
  private generateRoundId(): string {
    return `ROUND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check
   * @returns Service health status
   */
  async healthCheck(): Promise<{ status: string; activeRounds: number; privacyBudgetStatus: string }> {
    const budget = this.getOrCreatePrivacyBudget();
    const budgetStatus =
      budget.remainingBudget / budget.totalBudget > 0.2 ? 'healthy' : 'warning';

    return {
      status: 'healthy',
      activeRounds: this.activeRounds.size,
      privacyBudgetStatus: budgetStatus,
    };
  }
}
