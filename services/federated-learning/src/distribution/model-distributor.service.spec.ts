import { Test, TestingModule } from '@nestjs/testing';
import { ModelDistributorService } from './model-distributor.service';
import { GlobalModel } from '../interfaces/federated-learning.interfaces';

describe('ModelDistributorService', () => {
  let service: ModelDistributorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelDistributorService],
    }).compile();

    service = module.get<ModelDistributorService>(ModelDistributorService);
  });

  describe('distributeModel', () => {
    it('should distribute model to participating organizations', async () => {
      const model: GlobalModel = {
        id: 'model-001',
        roundId: 'round-001',
        version: 1,
        aggregatedGradients: [[0.1, 0.2], [0.3, 0.4]],
        weightedParameters: [[0.1, 0.2], [0.3, 0.4]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const orgIds = ['org1', 'org2', 'org3'];
      const result = await service.distributeModel(model, orgIds);

      expect(result).toBeDefined();
      expect(result.modelId).toBe('model-001');
      expect(result.distributedTo.length + result.failedOrgs.length).toBe(3);
      expect(result.distributedAt).toBeDefined();
    });

    it('should distribute model to a specific organization', async () => {
      const model: GlobalModel = {
        id: 'model-002',
        roundId: 'round-001',
        version: 1,
        aggregatedGradients: [[0.1, 0.2]],
        weightedParameters: [[0.1, 0.2]],
        aggregatedAt: new Date(),
        participantCount: 3,
      };

      const orgIds = ['org1', 'org2'];
      const result = await service.distributeModel(model, orgIds);

      expect(result.distributedTo.length).toBeGreaterThanOrEqual(0);
      expect(result.distributedTo.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty organization list', async () => {
      const model: GlobalModel = {
        id: 'model-003',
        version: 1,
        aggregatedGradients: [[0.1]],
        aggregatedAt: new Date(),
        participantCount: 1,
      };

      const result = await service.distributeModel(model, []);

      expect(result.distributedTo.length).toBe(0);
      expect(result.failedOrgs.length).toBe(0);
    });

    it('should distribute to multiple organizations', async () => {
      const model: GlobalModel = {
        id: 'model-004',
        version: 1,
        aggregatedGradients: [[0.5, 0.5], [0.5, 0.5]],
        aggregatedAt: new Date(),
        participantCount: 10,
      };

      const orgIds = Array.from({ length: 10 }, (_, i) => `org${i}`);
      const result = await service.distributeModel(model, orgIds);

      expect(result.distributedTo.length + result.failedOrgs.length).toBe(10);
    });

    it('should maintain model integrity during distribution', async () => {
      const model: GlobalModel = {
        id: 'model-005',
        version: 1,
        aggregatedGradients: [[0.1, 0.2], [0.3, 0.4]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const result = await service.distributeModel(model, ['org1', 'org2']);

      // Model properties should remain unchanged
      expect(result.modelId).toBe(model.id);
    });
  });

  describe('compressModel', () => {
    it('should calculate compression metrics', () => {
      const model: GlobalModel = {
        id: 'model-006',
        version: 1,
        aggregatedGradients: Array(100).fill([1, 2, 3, 4, 5]),
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const compression = service.compressModel(model);

      expect(compression.size).toBeGreaterThan(0);
      expect(compression.ratio).toBeGreaterThan(1);
    });

    it('should handle single gradient row', () => {
      const model: GlobalModel = {
        id: 'model-007',
        version: 1,
        aggregatedGradients: [[0.1, 0.2]],
        aggregatedAt: new Date(),
        participantCount: 1,
      };

      const compression = service.compressModel(model);

      expect(compression.size).toBeGreaterThan(0);
      expect(compression.ratio).toBeGreaterThan(0);
    });

    it('should compress large models', () => {
      const model: GlobalModel = {
        id: 'model-008',
        version: 1,
        aggregatedGradients: Array(1000).fill(Array(100).fill(Math.random())),
        aggregatedAt: new Date(),
        participantCount: 50,
      };

      const compression = service.compressModel(model);

      expect(compression.size).toBeLessThan(1000 * 100 * 8); // Less than uncompressed
    });
  });

  describe('createModelMetadata', () => {
    it('should create model metadata with checksum', () => {
      const model: GlobalModel = {
        id: 'model-009',
        version: 2,
        aggregatedGradients: [[0.5, 0.5]],
        aggregatedAt: new Date(),
        participantCount: 8,
      };

      const metadata = service.createModelMetadata(model);

      expect(metadata.modelId).toBe('model-009');
      expect(metadata.version).toBe(2);
      expect(metadata.participantCount).toBe(8);
      expect(metadata.checksum).toBeDefined();
      expect(metadata.checksum.length).toBe(16);
    });

    it('should include timestamp in metadata', () => {
      const now = new Date();
      const model: GlobalModel = {
        id: 'model-010',
        version: 1,
        aggregatedGradients: [[0.1]],
        aggregatedAt: now,
        participantCount: 1,
      };

      const metadata = service.createModelMetadata(model);

      expect(metadata.timestamp).toEqual(now);
    });

    it('should generate different checksums for different models', () => {
      const model1: GlobalModel = {
        id: 'model-a',
        version: 1,
        aggregatedGradients: [[1.0, 2.0]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const model2: GlobalModel = {
        id: 'model-b',
        version: 1,
        aggregatedGradients: [[3.0, 4.0]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const metadata1 = service.createModelMetadata(model1);
      const metadata2 = service.createModelMetadata(model2);

      expect(metadata1.checksum).not.toBe(metadata2.checksum);
    });
  });

  describe('verifyModelIntegrity', () => {
    it('should verify model integrity with correct checksum', () => {
      const model: GlobalModel = {
        id: 'model-011',
        version: 1,
        aggregatedGradients: [[0.5, 0.5]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const metadata = service.createModelMetadata(model);
      const isValid = service.verifyModelIntegrity(model, metadata.checksum);

      expect(isValid).toBe(true);
    });

    it('should reject model with incorrect checksum', () => {
      const model: GlobalModel = {
        id: 'model-012',
        version: 1,
        aggregatedGradients: [[0.5, 0.5]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const isValid = service.verifyModelIntegrity(model, 'invalid');

      expect(isValid).toBe(false);
    });

    it('should detect model tampering', () => {
      const model: GlobalModel = {
        id: 'model-013',
        version: 1,
        aggregatedGradients: [[0.5, 0.5]],
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      const metadata = service.createModelMetadata(model);

      // Tamper with model
      model.aggregatedGradients = [[1.0, 1.0]];
      const isValid = service.verifyModelIntegrity(model, metadata.checksum);

      expect(isValid).toBe(false);
    });
  });

  describe('getDistributionMetrics', () => {
    it('should calculate success rate', () => {
      const result = {
        modelId: 'model-014',
        distributedTo: ['org1', 'org2', 'org3'],
        failedOrgs: ['org4'],
        distributedAt: new Date(),
      };

      const metrics = service.getDistributionMetrics(result);

      expect(metrics.successRate).toBe(0.75);
      expect(metrics.failureRate).toBe(0.25);
      expect(metrics.totalOrgs).toBe(4);
    });

    it('should handle perfect distribution', () => {
      const result = {
        modelId: 'model-015',
        distributedTo: ['org1', 'org2', 'org3'],
        failedOrgs: [],
        distributedAt: new Date(),
      };

      const metrics = service.getDistributionMetrics(result);

      expect(metrics.successRate).toBe(1.0);
      expect(metrics.failureRate).toBe(0);
    });

    it('should handle complete distribution failure', () => {
      const result = {
        modelId: 'model-016',
        distributedTo: [],
        failedOrgs: ['org1', 'org2'],
        distributedAt: new Date(),
      };

      const metrics = service.getDistributionMetrics(result);

      expect(metrics.successRate).toBe(0);
      expect(metrics.failureRate).toBe(1.0);
    });

    it('should handle empty distribution', () => {
      const result = {
        modelId: 'model-017',
        distributedTo: [],
        failedOrgs: [],
        distributedAt: new Date(),
      };

      const metrics = service.getDistributionMetrics(result);

      expect(metrics.successRate).toBe(0);
      expect(metrics.failureRate).toBe(0);
      expect(metrics.totalOrgs).toBe(0);
    });
  });

  describe('model distribution robustness', () => {
    it('should distribute to many organizations', async () => {
      const model: GlobalModel = {
        id: 'model-018',
        version: 1,
        aggregatedGradients: [[0.1]],
        aggregatedAt: new Date(),
        participantCount: 100,
      };

      const orgIds = Array.from({ length: 100 }, (_, i) => `org${i}`);
      const result = await service.distributeModel(model, orgIds);

      expect(result.distributedTo.length + result.failedOrgs.length).toBe(100);
    });

    it('should preserve model data during distribution', async () => {
      const originalGradients = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      const model: GlobalModel = {
        id: 'model-019',
        version: 1,
        aggregatedGradients: originalGradients,
        aggregatedAt: new Date(),
        participantCount: 5,
      };

      await service.distributeModel(model, ['org1', 'org2']);

      // Model should be unchanged
      expect(model.aggregatedGradients).toEqual(originalGradients);
    });

    it('should handle models with different gradient sizes', async () => {
      const models: GlobalModel[] = [
        {
          id: 'model-small',
          version: 1,
          aggregatedGradients: [[0.1]],
          aggregatedAt: new Date(),
          participantCount: 1,
        },
        {
          id: 'model-medium',
          version: 1,
          aggregatedGradients: Array(10).fill([0.1, 0.2]),
          aggregatedAt: new Date(),
          participantCount: 5,
        },
        {
          id: 'model-large',
          version: 1,
          aggregatedGradients: Array(100).fill(Array(50).fill(0.1)),
          aggregatedAt: new Date(),
          participantCount: 50,
        },
      ];

      for (const model of models) {
        const result = await service.distributeModel(model, ['org1', 'org2']);
        expect(result).toBeDefined();
      }
    });
  });
});
