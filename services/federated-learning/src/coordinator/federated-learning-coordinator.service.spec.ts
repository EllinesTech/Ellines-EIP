import { Test, TestingModule } from '@nestjs/testing';
import { FederatedLearningCoordinatorService } from './federated-learning-coordinator.service';
import { DifferentialPrivacyService } from '../privacy/differential-privacy.service';
import { PoisoningDetectorService } from '../poisoning/poisoning-detector.service';
import { FederatedAveragingService } from '../aggregation/federated-averaging.service';
import { ModelDistributorService } from '../distribution/model-distributor.service';
import { OrgParticipationService } from '../participation/org-participation.service';
import { TransparencyReporterService } from '../reporting/transparency-reporter.service';
import { BadRequestException } from '@nestjs/common';

describe('FederatedLearningCoordinatorService', () => {
  let service: FederatedLearningCoordinatorService;
  let privacyService: DifferentialPrivacyService;
  let poisoningDetector: PoisoningDetectorService;
  let federatedAveraging: FederatedAveragingService;
  let modelDistributor: ModelDistributorService;
  let orgParticipation: OrgParticipationService;
  let transparencyReporter: TransparencyReporterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FederatedLearningCoordinatorService,
        DifferentialPrivacyService,
        PoisoningDetectorService,
        FederatedAveragingService,
        ModelDistributorService,
        OrgParticipationService,
        TransparencyReporterService,
      ],
    }).compile();

    service = module.get<FederatedLearningCoordinatorService>(FederatedLearningCoordinatorService);
    privacyService = module.get<DifferentialPrivacyService>(DifferentialPrivacyService);
    poisoningDetector = module.get<PoisoningDetectorService>(PoisoningDetectorService);
    federatedAveraging = module.get<FederatedAveragingService>(FederatedAveragingService);
    modelDistributor = module.get<ModelDistributorService>(ModelDistributorService);
    orgParticipation = module.get<OrgParticipationService>(OrgParticipationService);
    transparencyReporter = module.get<TransparencyReporterService>(TransparencyReporterService);
  });

  describe('startTrainingRound', () => {
    it('should start a training round', async () => {
      // Opt in organizations
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000, // 1 hour
        aggregationStrategy: 'fedavg' as const,
      };

      const result = await service.startTrainingRound(config);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.participantsJoined).toEqual([]);
      expect(result.config.participatingOrgs).toContain('org1');
    });

    it('should filter only opted-in organizations', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optOut('org2', 'Not interested');

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const result = await service.startTrainingRound(config);

      expect(result.config.participatingOrgs).toContain('org1');
      expect(result.config.participatingOrgs).not.toContain('org2');
    });

    it('should reject with no opted-in organizations', async () => {
      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      await expect(service.startTrainingRound(config)).rejects.toThrow(BadRequestException);
    });

    it('should check privacy budget availability', async () => {
      await orgParticipation.optIn('org1');

      // Consume most of the privacy budget
      service.resetPrivacyBudget(1.0);

      const config = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 2.0, // Larger than available budget
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      await expect(service.startTrainingRound(config)).rejects.toThrow(BadRequestException);
    });

    it('should set expected end time', async () => {
      await orgParticipation.optIn('org1');

      const duration = 3600000; // 1 hour
      const beforeTime = new Date();

      const config = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: duration,
        aggregationStrategy: 'fedavg' as const,
      };

      const result = await service.startTrainingRound(config);

      expect(result.expectedEndTime.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime() + duration,
      );
    });
  });

  describe('submitUpdate', () => {
    it('should submit model update from organization', async () => {
      await orgParticipation.optIn('org1');

      const config = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);
      const roundId = round.id;

      const update = {
        orgId: 'org1',
        gradients: [[0.1, 0.2], [0.3, 0.4]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      const result = await service.submitUpdate(roundId, update);

      expect(result.participantsJoined).toContain('org1');
      expect(result.participantUpdates.get('org1')).toEqual(update);
    });

    it('should update round status on first submission', async () => {
      await orgParticipation.optIn('org1');

      const config = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);
      expect(round.status).toBe('pending');

      const update = {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      const result = await service.submitUpdate(round.id, update);

      expect(result.status).toBe('active');
    });

    it('should reject update from non-opted-in org', async () => {
      await orgParticipation.optIn('org1');

      const config = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      const update = {
        orgId: 'org2', // Not opted in
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      await expect(service.submitUpdate(round.id, update)).rejects.toThrow(BadRequestException);
    });

    it('should reject update for non-existent round', async () => {
      const update = {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      await expect(service.submitUpdate('invalid-round-id', update)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('finalizeRound', () => {
    it('should aggregate updates into global model', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[0.1, 0.2]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org2',
        gradients: [[0.15, 0.25]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      const globalModel = await service.finalizeRound(round.id);

      expect(globalModel).toBeDefined();
      expect(globalModel.id).toBeDefined();
      expect(globalModel.roundId).toBe(round.id);
      expect(globalModel.participantCount).toBe(2);
    });

    it('should apply differential privacy', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 0.5,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[1.0]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org2',
        gradients: [[1.0]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      const globalModel = await service.finalizeRound(round.id);

      expect(globalModel).toBeDefined();
      expect(globalModel.aggregatedGradients).toBeDefined();
    });

    it('should reject finalization with insufficient participants', async () => {
      await orgParticipation.optIn('org1');

      const config = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      // Only 1 participant, but minimum is 2
      await expect(service.finalizeRound(round.id)).rejects.toThrow(BadRequestException);
    });

    it('should update privacy budget on finalization', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const budgetBefore = service.getPrivacyBudgetStatus();
      const consumedBefore = budgetBefore.consumedBudget;

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 0.5,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org2',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.finalizeRound(round.id);

      const budgetAfter = service.getPrivacyBudgetStatus();

      expect(budgetAfter.consumedBudget).toBeGreaterThan(consumedBefore);
      expect(budgetAfter.roundsCompleted).toBe(budgetBefore.roundsCompleted + 1);
    });

    it('should support different aggregation strategies', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      for (const strategy of ['fedavg', 'fedprox', 'scaffold']) {
        const config = {
          participatingOrgs: ['org1', 'org2'],
          modelType: 'neural-network',
          privacyBudget: 1.0,
          roundDuration: 3600000,
          aggregationStrategy: strategy as any,
        };

        const round = await service.startTrainingRound(config);

        await service.submitUpdate(round.id, {
          orgId: 'org1',
          gradients: [[0.1]],
          datasetSize: 1000,
          timestamp: new Date(),
        });

        await service.submitUpdate(round.id, {
          orgId: 'org2',
          gradients: [[0.1]],
          datasetSize: 1000,
          timestamp: new Date(),
        });

        const model = await service.finalizeRound(round.id);

        expect(model).toBeDefined();
        expect(model.participantCount).toBe(2);
      }
    });
  });

  describe('distributeModel', () => {
    it('should distribute model to participants', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org2',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      const globalModel = await service.finalizeRound(round.id);
      const result = await service.distributeModel(round.id, globalModel);

      expect(result.modelId).toBe(globalModel.id);
      expect(result.distributedTo.length + result.failedOrgs.length).toBeGreaterThan(0);
    });
  });

  describe('generateTransparencyReport', () => {
    it('should generate transparency report', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);

      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org2',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      const globalModel = await service.finalizeRound(round.id);
      const report = await service.generateTransparencyReport(round.id, globalModel);

      expect(report).toBeDefined();
      expect(report.roundId).toBe(round.id);
      expect(report.participantCount).toBe(2);
      expect(report.patternsLearned).toBeDefined();
    });
  });

  describe('optInOptOut', () => {
    it('should opt organization in', async () => {
      const result = await service.optIn('org1');

      expect(result.orgId).toBe('org1');
      expect(result.optedIn).toBe(true);
      expect(result.joinedAt).toBeInstanceOf(Date);
    });

    it('should opt organization out', async () => {
      await service.optIn('org1');
      const result = await service.optOut('org1', 'Testing opt-out');

      expect(result.orgId).toBe('org1');
      expect(result.optedIn).toBe(false);
      expect(result.reason).toBe('Testing opt-out');
    });
  });

  describe('statusAndStats', () => {
    it('should get privacy budget status', () => {
      const status = service.getPrivacyBudgetStatus();

      expect(status).toBeDefined();
      expect(status.totalBudget).toBeGreaterThan(0);
      expect(status.remainingBudget).toBeLessThanOrEqual(status.totalBudget);
    });

    it('should get participation stats', async () => {
      await service.optIn('org1');
      await service.optIn('org2');
      await service.optOut('org3', 'Not interested');

      const stats = service.getParticipationStats();

      expect(stats.totalOrganizations).toBeGreaterThanOrEqual(2);
      expect(stats.optedInCount).toBeGreaterThanOrEqual(2);
      expect(stats.optInRate).toBeGreaterThanOrEqual(0);
      expect(stats.optInRate).toBeLessThanOrEqual(1);
    });

    it('should get health check', async () => {
      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.activeRounds).toBeGreaterThanOrEqual(0);
      expect(health.privacyBudgetStatus).toMatch(/healthy|warning/);
    });
  });

  describe('integration tests', () => {
    it('should complete full federated learning cycle', async () => {
      // Setup: Opt in organizations
      await service.optIn('org1');
      await service.optIn('org2');
      await service.optIn('org3');

      // Start round
      const config = {
        participatingOrgs: ['org1', 'org2', 'org3'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg' as const,
      };

      const round = await service.startTrainingRound(config);
      expect(round.status).toBe('pending');

      // Submit updates
      await service.submitUpdate(round.id, {
        orgId: 'org1',
        gradients: [[0.1, 0.2]],
        datasetSize: 1000,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org2',
        gradients: [[0.15, 0.25]],
        datasetSize: 1200,
        timestamp: new Date(),
      });

      await service.submitUpdate(round.id, {
        orgId: 'org3',
        gradients: [[0.12, 0.22]],
        datasetSize: 1100,
        timestamp: new Date(),
      });

      // Finalize (apply privacy + detect poisoning + aggregate)
      const globalModel = await service.finalizeRound(round.id);
      expect(globalModel).toBeDefined();
      expect(globalModel.participantCount).toBe(3);

      // Generate report
      const report = await service.generateTransparencyReport(round.id, globalModel);
      expect(report).toBeDefined();

      // Verify budget consumed
      const budget = service.getPrivacyBudgetStatus();
      expect(budget.roundsCompleted).toBe(1);
    });
  });
});
