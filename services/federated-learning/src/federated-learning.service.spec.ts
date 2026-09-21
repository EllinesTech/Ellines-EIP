import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FederatedLearningCoordinatorService } from './coordinator/federated-learning-coordinator.service';
import { DifferentialPrivacyService } from './privacy/differential-privacy.service';
import { PoisoningDetectorService } from './poisoning/poisoning-detector.service';
import { FederatedAveragingService } from './aggregation/federated-averaging.service';
import { ModelDistributorService } from './distribution/model-distributor.service';
import { OrgParticipationService } from './participation/org-participation.service';
import { TransparencyReporterService } from './reporting/transparency-reporter.service';
import { FederatedConfig, ModelUpdate, PrivateUpdate } from './interfaces/federated-learning.interfaces';

describe('FederatedLearningCoordinatorService (Req 3.1-3.8)', () => {
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

  afterEach(() => {
    // Clear participation state between tests
    orgParticipation.clearAll();
  });

  // ===== TEST DIFFERENTIAL PRIVACY NOISE APPLICATION (Req 3.3) =====

  describe('Differential Privacy Noise Application (Req 3.3)', () => {
    it('should apply Gaussian noise to gradients during privacy phase', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[1.0, 1.0], [1.0, 1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const privateUpdates = await privacyService.applyGaussianPrivacy(updates, 1.0, 1e-5);

      expect(privateUpdates).toHaveLength(1);
      expect(privateUpdates[0]).toHaveProperty('noisyGradients');
      expect(privateUpdates[0]).toHaveProperty('privacyGuarantee');

      // Verify noise was actually applied
      const original = updates[0].gradients;
      const noisy = privateUpdates[0].noisyGradients;
      let hasNoise = false;

      for (let i = 0; i < original.length; i++) {
        for (let j = 0; j < original[i].length; j++) {
          if (Math.abs(original[i][j] - noisy[i][j]) > 0.001) {
            hasNoise = true;
          }
        }
      }

      expect(hasNoise).toBe(true);
    });

    it('should respect privacy parameters (epsilon, delta)', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const epsilon = 0.5;
      const delta = 1e-5;
      const privateUpdates = await privacyService.applyGaussianPrivacy(updates, epsilon, delta);

      const guarantee = privateUpdates[0].privacyGuarantee;
      expect(guarantee.epsilon).toBe(epsilon);
      expect(guarantee.delta).toBe(delta);
      expect(guarantee.mechanism).toBe('gaussian');
    });

    it('should increase noise with smaller epsilon budget', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[1.0, 1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const result1 = await privacyService.applyGaussianPrivacy(updates, 0.1, 1e-5);
      const result2 = await privacyService.applyGaussianPrivacy(updates, 2.0, 1e-5);

      const noiseScale1 = result1[0].privacyGuarantee.noiseScale;
      const noiseScale2 = result2[0].privacyGuarantee.noiseScale;

      // Smaller epsilon should have larger noise scale
      expect(noiseScale1).toBeGreaterThan(noiseScale2);
    });

    it('should anonymize organization identities in private updates', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'secret-org-1',
          gradients: [[1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
        {
          orgId: 'secret-org-2',
          gradients: [[1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const privateUpdates = await privacyService.applyGaussianPrivacy(updates, 1.0, 1e-5);

      expect(privateUpdates[0].anonymizedId).not.toContain('secret');
      expect(privateUpdates[1].anonymizedId).not.toContain('secret');
      expect(privateUpdates[0].anonymizedId).not.toBe(privateUpdates[1].anonymizedId);
    });

    it('should verify privacy guarantee validity', () => {
      const validGuarantee = {
        epsilon: 1.0,
        delta: 1e-5,
        mechanism: 'gaussian' as const,
        noiseScale: 2.0,
      };

      const valid = privacyService.verifyPrivacyGuarantee(validGuarantee, 2.0);
      expect(valid).toBe(true);

      const invalidGuarantee = {
        epsilon: 3.0,
        delta: 1e-5,
        mechanism: 'gaussian' as const,
        noiseScale: 2.0,
      };

      const invalid = privacyService.verifyPrivacyGuarantee(invalidGuarantee, 2.0);
      expect(invalid).toBe(false);
    });

    it('should maintain gradient shape after privacy application', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[1, 2, 3], [4, 5, 6]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const privateUpdates = await privacyService.applyGaussianPrivacy(updates, 1.0, 1e-5);

      expect(privateUpdates[0].noisyGradients).toHaveLength(2);
      expect(privateUpdates[0].noisyGradients[0]).toHaveLength(3);
    });
  });

  // ===== TEST POISONING DETECTION (Req 3.4) =====

  describe('Poisoning Detection on Anomalous Updates (Req 3.4)', () => {
    it('should detect and remove poisoned updates', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[0.1, 0.1], [0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[0.1, 0.1], [0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'poisoned',
          noisyGradients: [[100, 100], [100, 100]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await poisoningDetector.detectPoisoningByZScore(updates, 2.5);

      expect(result.cleanUpdates.length).toBe(2);
      expect(result.poisonedUpdates.length).toBe(1);
      expect(result.poisonedUpdates[0].anonymizedId).toBe('poisoned');
    });

    it('should identify anomalous updates by Z-score', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'normal1',
          noisyGradients: [[0.5, 0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'normal2',
          noisyGradients: [[0.5, 0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'anomaly',
          noisyGradients: [[50, 50]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await poisoningDetector.detectPoisoningByZScore(updates, 2.5);

      expect(result.anomalyScores.has('normal1')).toBe(true);
      expect(result.anomalyScores.has('anomaly')).toBe(true);
      expect(result.anomalyScores.get('anomaly')).toBeDefined();
    });

    it('should use configurable anomaly threshold', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const resultStrict = await poisoningDetector.detectPoisoningByZScore(updates, 0.5);
      const resultLoose = await poisoningDetector.detectPoisoningByZScore(updates, 5.0);

      expect(resultStrict.threshold).toBe(0.5);
      expect(resultLoose.threshold).toBe(5.0);
      expect(resultLoose.poisonedUpdates.length).toBeLessThanOrEqual(resultStrict.poisonedUpdates.length);
    });

    it('should detect multiple poisoned updates in batch', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'normal',
          noisyGradients: [[0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'poison1',
          noisyGradients: [[50, 50]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'poison2',
          noisyGradients: [[60, 60]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await poisoningDetector.detectPoisoningByZScore(updates, 2.0);

      expect(result.poisonedUpdates.length).toBeGreaterThan(0);
      expect(result.cleanUpdates.length + result.poisonedUpdates.length).toBe(3);
    });

    it('should perform isolation-based anomaly detection', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[0.1, 0.1], [0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[0.1, 0.1], [0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'anomalous',
          noisyGradients: [[100, 100], [100, 100]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await poisoningDetector.detectPoisoningByIsolation(updates);

      expect(result.cleanUpdates.length + result.poisonedUpdates.length).toBe(3);
      expect(result.anomalyScores.size).toBe(3);
    });

    it('should handle edge case of single update (no anomalies)', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'single',
          noisyGradients: [[0.5, 0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await poisoningDetector.detectPoisoningByZScore(updates);

      expect(result.cleanUpdates.length + result.poisonedUpdates.length).toBe(1);
    });

    it('should exclude poisoned updates from aggregation', async () => {
      const cleanUpdates: PrivateUpdate[] = [
        {
          anonymizedId: 'clean1',
          noisyGradients: [[0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'clean2',
          noisyGradients: [[0.1, 0.1]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const stats = federatedAveraging.calculateAggregationStats(cleanUpdates);

      expect(stats.participantCount).toBe(2);
      expect(stats.avgGradientMagnitude).toBeGreaterThan(0);
    });
  });

  // ===== TEST FEDERATED AVERAGING ALGORITHM CORRECTNESS (Req 3.5) =====

  describe('Federated Averaging Algorithm Correctness (Req 3.5)', () => {
    it('should aggregate updates using FedAvg algorithm', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 2.0], [3.0, 4.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[2.0, 4.0], [6.0, 8.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const datasetSizes = [1000, 1000];
      const globalModel = await federatedAveraging.aggregateUpdatesFedAvg('round1', updates, datasetSizes);

      expect(globalModel).toBeDefined();
      expect(globalModel.aggregatedGradients).toBeDefined();
      expect(globalModel.roundId).toBe('round1');
      expect(globalModel.participantCount).toBe(2);
    });

    it('should apply weighted averaging based on dataset sizes', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[4.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const datasetSizes = [1000, 2000]; // 1:2 weight ratio
      const globalModel = await federatedAveraging.aggregateUpdatesFedAvg('round1', updates, datasetSizes);

      // Expected: (1000 * 2.0 + 2000 * 4.0) / 3000 = 10000 / 3000 = 3.333...
      const expectedValue = (1000 * 2.0 + 2000 * 4.0) / 3000;
      const aggregatedValue = globalModel.aggregatedGradients[0][0];

      expect(Math.abs(aggregatedValue - expectedValue)).toBeLessThan(0.01);
    });

    it('should support alternative aggregation strategies (FedProx)', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[2.0, 2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const datasetSizes = [1000, 1000];
      const globalModel = await federatedAveraging.aggregateUpdatesFedProx('round1', updates, datasetSizes);

      expect(globalModel).toBeDefined();
      expect(globalModel.aggregatedGradients).toBeDefined();
    });

    it('should support Scaffold aggregation algorithm', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[0.5, 0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[0.5, 0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const datasetSizes = [1000, 1000];
      const globalModel = await federatedAveraging.aggregateUpdatesScaffold('round1', updates, datasetSizes);

      expect(globalModel).toBeDefined();
      expect(globalModel.participantCount).toBe(2);
    });

    it('should calculate aggregation statistics correctly', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[3.0, 3.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const stats = federatedAveraging.calculateAggregationStats(updates);

      expect(stats.participantCount).toBe(2);
      expect(stats.avgGradientMagnitude).toBeGreaterThan(0);
      expect(stats.maxGradientMagnitude).toBeGreaterThanOrEqual(stats.minGradientMagnitude);
    });

    it('should maintain gradient matrix dimensions during aggregation', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const datasetSizes = [1000, 1000];
      const globalModel = await federatedAveraging.aggregateUpdatesFedAvg('round1', updates, datasetSizes);

      expect(globalModel.aggregatedGradients).toHaveLength(3);
      expect(globalModel.aggregatedGradients[0]).toHaveLength(3);
    });

    it('should reject empty update list', async () => {
      const updates: PrivateUpdate[] = [];
      const datasetSizes: number[] = [];

      await expect(
        federatedAveraging.aggregateUpdatesFedAvg('round1', updates, datasetSizes)
      ).rejects.toThrow();
    });

    it('should reject insufficient participants', async () => {
      await orgParticipation.optIn('org1');

      const config: FederatedConfig = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);

      const update: ModelUpdate = {
        orgId: 'org1',
        gradients: [[0.1, 0.2]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      await service.submitUpdate(round.id, update);

      await expect(service.finalizeRound(round.id)).rejects.toThrow(
        'Round ' + round.id + ' has insufficient participants (minimum 2)'
      );
    });
  });

  // ===== TEST OPT-IN/OPT-OUT ENFORCEMENT (Req 3.8) =====

  describe('Opt-In/Opt-Out Enforcement (Req 3.8)', () => {
    it('should enforce opt-in requirement before training round creation', async () => {
      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      // Should fail because orgs not opted in
      await expect(service.startTrainingRound(config)).rejects.toThrow(
        'No opted-in organizations available for training round'
      );
    });

    it('should allow opted-in organizations to participate', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);

      expect(round).toBeDefined();
      expect(round.config.participatingOrgs).toContain('org1');
      expect(round.config.participatingOrgs).toContain('org2');
    });

    it('should exclude opted-out organizations from training rounds', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');
      await orgParticipation.optOut('org2', 'Testing opt-out');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);

      expect(round.config.participatingOrgs).toContain('org1');
      expect(round.config.participatingOrgs).not.toContain('org2');
    });

    it('should track organization opt-in status', async () => {
      const orgId = 'test-org';
      const optInResult = await service.optIn(orgId);

      expect(optInResult.orgId).toBe(orgId);
      expect(optInResult.optedIn).toBe(true);
      expect(optInResult.joinedAt).toBeDefined();
    });

    it('should track organization opt-out with reason', async () => {
      const orgId = 'test-org';
      await service.optIn(orgId);

      const reason = 'Data privacy concerns';
      const optOutResult = await service.optOut(orgId, reason);

      expect(optOutResult.orgId).toBe(orgId);
      expect(optOutResult.optedIn).toBe(false);
      expect(optOutResult.reason).toBe(reason);
    });

    it('should prevent opted-out organizations from submitting updates', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);

      // Opt out org1
      await service.optOut('org1', 'Changed mind');

      const update: ModelUpdate = {
        orgId: 'org1',
        gradients: [[0.1, 0.2]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      await expect(service.submitUpdate(round.id, update)).rejects.toThrow(
        'Organization org1 is not opted in to federated learning'
      );
    });

    it('should filter opted-in organizations correctly', () => {
      orgParticipation.optIn('org1');
      orgParticipation.optIn('org2');
      orgParticipation.optIn('org3');
      orgParticipation.optOut('org2', 'Test');

      const allOrgs = ['org1', 'org2', 'org3'];
      const filtered = orgParticipation.filterOptedIn(allOrgs);

      expect(filtered).toContain('org1');
      expect(filtered).toContain('org3');
      expect(filtered).not.toContain('org2');
    });

    it('should report participation statistics', async () => {
      await orgParticipation.optIn('org1');
      await orgParticipation.optIn('org2');
      await orgParticipation.optOut('org3', 'Test');

      const stats = service.getParticipationStats();

      expect(stats.optedInCount).toBeGreaterThanOrEqual(0);
      expect(stats.optedOutCount).toBeGreaterThanOrEqual(0);
      expect(stats.optInRate).toBeGreaterThanOrEqual(0);
      expect(stats.optInRate).toBeLessThanOrEqual(1);
    });

    it('should check organization opt-in status', async () => {
      const orgId = 'org-check';
      
      let isOptedIn = orgParticipation.isOptedIn(orgId);
      expect(isOptedIn).toBe(false);

      await orgParticipation.optIn(orgId);
      isOptedIn = orgParticipation.isOptedIn(orgId);
      expect(isOptedIn).toBe(true);

      await orgParticipation.optOut(orgId, 'Test');
      isOptedIn = orgParticipation.isOptedIn(orgId);
      expect(isOptedIn).toBe(false);
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration: Full Training Round with Privacy & Poisoning Detection', () => {
    it('should execute complete training round: opt-in → submit → aggregate → detect poisoning', async () => {
      // Step 1: Organizations opt in
      await service.optIn('org1');
      await service.optIn('org2');
      await service.optIn('org3');

      // Step 2: Start training round
      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2', 'org3'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);
      expect(round.status).toBe('pending');

      // Step 3: Organizations submit updates
      const update1: ModelUpdate = {
        orgId: 'org1',
        gradients: [[0.1, 0.1], [0.1, 0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      const update2: ModelUpdate = {
        orgId: 'org2',
        gradients: [[0.1, 0.1], [0.1, 0.1]],
        datasetSize: 1200,
        timestamp: new Date(),
      };

      await service.submitUpdate(round.id, update1);
      await service.submitUpdate(round.id, update2);

      // Step 4: Finalize (aggregate, detect poisoning, apply privacy)
      const globalModel = await service.finalizeRound(round.id);

      expect(globalModel).toBeDefined();
      expect(globalModel.roundId).toBe(round.id);
      expect(globalModel.participantCount).toBeGreaterThanOrEqual(2);
    });

    it('should maintain privacy budget across multiple rounds', async () => {
      // Setup
      await service.optIn('org1');
      await service.optIn('org2');

      const initialBudget = service.getPrivacyBudgetStatus();
      expect(initialBudget.remainingBudget).toBe(initialBudget.totalBudget);

      // Complete first round
      const config1: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 0.5,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round1 = await service.startTrainingRound(config1);

      const updates1 = [
        { orgId: 'org1', gradients: [[0.1, 0.1]], datasetSize: 1000, timestamp: new Date() },
        { orgId: 'org2', gradients: [[0.1, 0.1]], datasetSize: 1000, timestamp: new Date() },
      ];

      await service.submitUpdate(round1.id, updates1[0]);
      await service.submitUpdate(round1.id, updates1[1]);
      await service.finalizeRound(round1.id);

      // Check budget consumed
      const budgetAfterRound1 = service.getPrivacyBudgetStatus();
      expect(budgetAfterRound1.consumedBudget).toBe(0.5);
      expect(budgetAfterRound1.remainingBudget).toBe(initialBudget.totalBudget - 0.5);
    });

    it('should handle privacy budget exhaustion', async () => {
      // Reset to small budget
      service.resetPrivacyBudget(0.3);

      await service.optIn('org1');
      await service.optIn('org2');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 0.5, // More than available budget
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      await expect(service.startTrainingRound(config)).rejects.toThrow(
        'Insufficient privacy budget'
      );
    });

    it('should handle round not found error', async () => {
      const update: ModelUpdate = {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      await expect(service.submitUpdate('nonexistent-round', update)).rejects.toThrow(
        'Training round nonexistent-round not found'
      );
    });
  });

  // ===== ERROR HANDLING & EDGE CASES =====

  describe('Error Handling & Edge Cases', () => {
    it('should handle round with insufficient minimum participants', async () => {
      await service.optIn('org1');

      const config: FederatedConfig = {
        participatingOrgs: ['org1'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);

      const update: ModelUpdate = {
        orgId: 'org1',
        gradients: [[0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      await service.submitUpdate(round.id, update);

      await expect(service.finalizeRound(round.id)).rejects.toThrow(
        'insufficient participants'
      );
    });

    it('should handle duplicate submission from same organization', async () => {
      await service.optIn('org1');
      await service.optIn('org2');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);

      const update: ModelUpdate = {
        orgId: 'org1',
        gradients: [[0.1, 0.1]],
        datasetSize: 1000,
        timestamp: new Date(),
      };

      const result1 = await service.submitUpdate(round.id, update);
      const update2: ModelUpdate = {
        ...update,
        gradients: [[0.2, 0.2]], // Different update from same org
      };
      const result2 = await service.submitUpdate(round.id, update2);

      // Second submission should overwrite
      expect(result2.participantsJoined).toContain('org1');
    });

    it('should retrieve training round status', async () => {
      await service.optIn('org1');
      await service.optIn('org2');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round = await service.startTrainingRound(config);
      const retrieved = service.getTrainingRound(round.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(round.id);
      expect(retrieved?.status).toBe('pending');
    });

    it('should list all active rounds', async () => {
      await service.optIn('org1');
      await service.optIn('org2');

      const config: FederatedConfig = {
        participatingOrgs: ['org1', 'org2'],
        modelType: 'neural-network',
        privacyBudget: 1.0,
        roundDuration: 3600000,
        aggregationStrategy: 'fedavg',
      };

      const round1 = await service.startTrainingRound(config);

      const activeRounds = service.getActiveRounds();

      expect(activeRounds.length).toBeGreaterThanOrEqual(1);
      expect(activeRounds.some((r) => r.id === round1.id)).toBe(true);
    });

    it('should perform health check', async () => {
      const health = await service.healthCheck();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('activeRounds');
      expect(health).toHaveProperty('privacyBudgetStatus');
      expect(health.status).toBe('healthy');
    });

    it('should validate privacy guarantee parameters', () => {
      const validGuarantee = {
        epsilon: 0.5,
        delta: 1e-5,
        mechanism: 'gaussian' as const,
        noiseScale: 1.5,
      };

      expect(privacyService.verifyPrivacyGuarantee(validGuarantee, 1.0)).toBe(true);
    });
  });
});
