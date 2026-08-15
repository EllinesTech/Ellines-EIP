import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FederatedLearningCoordinatorService } from './federated-learning-coordinator.service';
import { FederatedConfig, TrainingRound, GlobalModel, TransparencyReport } from '../interfaces/federated-learning.interfaces';

/**
 * Federated Learning Coordinator Controller
 * REST API for federated learning operations
 */
@ApiTags('Federated Learning')
@Controller('federated-learning')
export class FederatedLearningCoordinatorController {
  constructor(private coordinatorService: FederatedLearningCoordinatorService) {}

  /**
   * Start a new training round
   */
  @Post('rounds/start')
  @HttpCode(201)
  @ApiOperation({ summary: 'Start a new federated training round' })
  @ApiResponse({ status: 201, description: 'Training round started' })
  @ApiResponse({ status: 400, description: 'Invalid configuration or no opted-in organizations' })
  async startTrainingRound(@Body() config: FederatedConfig): Promise<TrainingRound> {
    if (!config.participatingOrgs || config.participatingOrgs.length === 0) {
      throw new BadRequestException('participatingOrgs must be non-empty');
    }

    if (!config.modelType || config.modelType.trim().length === 0) {
      throw new BadRequestException('modelType must be specified');
    }

    if (config.privacyBudget <= 0) {
      throw new BadRequestException('privacyBudget must be positive');
    }

    if (config.roundDuration <= 0) {
      throw new BadRequestException('roundDuration must be positive');
    }

    return this.coordinatorService.startTrainingRound(config);
  }

  /**
   * Submit model update from organization
   */
  @Post('rounds/:roundId/updates')
  @HttpCode(201)
  @ApiOperation({ summary: 'Submit model update for a training round' })
  @ApiResponse({ status: 201, description: 'Update submitted' })
  @ApiResponse({ status: 400, description: 'Invalid round or update' })
  async submitUpdate(
    @Param('roundId') roundId: string,
    @Body() body: { orgId: string; gradients: number[][]; datasetSize: number },
  ): Promise<TrainingRound> {
    if (!body.orgId) {
      throw new BadRequestException('orgId must be specified');
    }

    if (!Array.isArray(body.gradients) || body.gradients.length === 0) {
      throw new BadRequestException('gradients must be non-empty array');
    }

    if (body.datasetSize <= 0) {
      throw new BadRequestException('datasetSize must be positive');
    }

    return this.coordinatorService.submitUpdate(roundId, {
      orgId: body.orgId,
      gradients: body.gradients,
      datasetSize: body.datasetSize,
      timestamp: new Date(),
    });
  }

  /**
   * Finalize training round and aggregate
   */
  @Post('rounds/:roundId/finalize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Finalize training round and aggregate updates' })
  @ApiResponse({ status: 200, description: 'Aggregation completed' })
  @ApiResponse({ status: 400, description: 'Invalid round state or insufficient participants' })
  async finalizeRound(@Param('roundId') roundId: string): Promise<GlobalModel> {
    return this.coordinatorService.finalizeRound(roundId);
  }

  /**
   * Distribute aggregated model
   */
  @Post('rounds/:roundId/distribute/:modelId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Distribute aggregated model to participants' })
  @ApiResponse({ status: 200, description: 'Distribution completed' })
  @ApiResponse({ status: 400, description: 'Invalid round or model' })
  async distributeModel(
    @Param('roundId') roundId: string,
    @Param('modelId') modelId: string,
    @Body() body: { aggregatedGradients: number[][] },
  ): Promise<{ modelId: string; distributedTo: string[]; failedOrgs: string[] }> {
    const round = this.coordinatorService.getTrainingRound(roundId);
    if (!round) {
      throw new BadRequestException(`Round ${roundId} not found`);
    }

    const model: GlobalModel = {
      id: modelId,
      roundId,
      version: 1,
      aggregatedGradients: body.aggregatedGradients,
      weightedParameters: body.aggregatedGradients,
      participantCount: round.participantsJoined.length,
      aggregatedAt: new Date(),
    };

    return this.coordinatorService.distributeModel(roundId, model);
  }

  /**
   * Generate transparency report
   */
  @Post('rounds/:roundId/report')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate transparency report for training round' })
  @ApiResponse({ status: 200, description: 'Report generated' })
  @ApiResponse({ status: 400, description: 'Invalid round' })
  async generateReport(
    @Param('roundId') roundId: string,
    @Body() body: { aggregatedGradients: number[][] },
  ): Promise<TransparencyReport> {
    const round = this.coordinatorService.getTrainingRound(roundId);
    if (!round) {
      throw new BadRequestException(`Round ${roundId} not found`);
    }

    const model: GlobalModel = {
      id: `MODEL-${roundId}`,
      roundId,
      version: 1,
      aggregatedGradients: body.aggregatedGradients,
      weightedParameters: body.aggregatedGradients,
      participantCount: round.participantsJoined.length,
      aggregatedAt: new Date(),
    };

    return this.coordinatorService.generateTransparencyReport(roundId, model);
  }

  /**
   * Get training round
   */
  @Get('rounds/:roundId')
  @ApiOperation({ summary: 'Get training round status' })
  @ApiResponse({ status: 200, description: 'Round details' })
  @ApiResponse({ status: 404, description: 'Round not found' })
  getTrainingRound(@Param('roundId') roundId: string): TrainingRound | undefined {
    const round = this.coordinatorService.getTrainingRound(roundId);
    if (!round) {
      throw new BadRequestException(`Round ${roundId} not found`);
    }
    return round;
  }

  /**
   * Get active rounds
   */
  @Get('rounds')
  @ApiOperation({ summary: 'Get all active training rounds' })
  @ApiResponse({ status: 200, description: 'List of active rounds' })
  getActiveRounds(): TrainingRound[] {
    return this.coordinatorService.getActiveRounds();
  }

  /**
   * Opt organization in
   */
  @Post('participation/:orgId/opt-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Opt organization into federated learning' })
  @ApiResponse({ status: 200, description: 'Organization opted in' })
  async optIn(@Param('orgId') orgId: string): Promise<{ orgId: string; optedIn: boolean; joinedAt: Date }> {
    return this.coordinatorService.optIn(orgId);
  }

  /**
   * Opt organization out
   */
  @Post('participation/:orgId/opt-out')
  @HttpCode(200)
  @ApiOperation({ summary: 'Opt organization out of federated learning' })
  @ApiResponse({ status: 200, description: 'Organization opted out' })
  async optOut(
    @Param('orgId') orgId: string,
    @Body() body: { reason?: string },
  ): Promise<{ orgId: string; optedIn: boolean; reason: string }> {
    const reason = body.reason || 'No reason provided';
    return this.coordinatorService.optOut(orgId, reason);
  }

  /**
   * Get participation statistics
   */
  @Get('participation/stats')
  @ApiOperation({ summary: 'Get participation statistics' })
  @ApiResponse({ status: 200, description: 'Participation stats' })
  getParticipationStats(): {
    totalOrganizations: number;
    optedInCount: number;
    optedOutCount: number;
    optInRate: number;
  } {
    return this.coordinatorService.getParticipationStats();
  }

  /**
   * Get privacy budget status
   */
  @Get('privacy/budget')
  @ApiOperation({ summary: 'Get privacy budget status' })
  @ApiResponse({ status: 200, description: 'Privacy budget information' })
  getPrivacyBudget(): {
    totalBudget: number;
    consumedBudget: number;
    remainingBudget: number;
    roundsCompleted: number;
  } {
    const budget = this.coordinatorService.getPrivacyBudgetStatus();
    return {
      totalBudget: budget.totalBudget,
      consumedBudget: budget.consumedBudget,
      remainingBudget: budget.remainingBudget,
      roundsCompleted: budget.roundsCompleted,
    };
  }

  /**
   * Health check
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check for federated learning service' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async health(): Promise<{ status: string; activeRounds: number; privacyBudgetStatus: string }> {
    return this.coordinatorService.healthCheck();
  }
}
