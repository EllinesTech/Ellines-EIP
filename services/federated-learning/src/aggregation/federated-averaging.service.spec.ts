import { Test, TestingModule } from '@nestjs/testing';
import { FederatedAveragingService } from './federated-averaging.service';
import { PrivateUpdate } from '../interfaces/federated-learning.interfaces';

describe('FederatedAveragingService', () => {
  let service: FederatedAveragingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FederatedAveragingService],
    }).compile();

    service = module.get<FederatedAveragingService>(FederatedAveragingService);
  });

  describe('aggregateUpdatesFedAvg', () => {
    it('should aggregate model updates correctly', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 2.0], [3.0, 4.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[1.0, 2.0], [3.0, 4.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.aggregateUpdatesFedAvg('round1', updates, [1000, 1000]);

      expect(result).toBeDefined();
      expect(result.aggregatedGradients.length).toBe(2);
      expect(result.aggregatedGradients[0].length).toBe(2);
      expect(result.roundId).toBe('round1');
      expect(result.participantCount).toBe(2);
    });

    it('should weight updates by dataset size', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[0.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      // 3:1 weighting ratio
      const result = await service.aggregateUpdatesFedAvg('round1', updates, [3, 1]);

      // Expected: (2.0 * 0.75) + (0.0 * 0.25) = 1.5
      expect(result.aggregatedGradients[0][0]).toBeCloseTo(1.5, 1);
    });

    it('should handle unequal dataset sizes', async () => {
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
        {
          anonymizedId: 'update3',
          noisyGradients: [[3.0, 3.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.aggregateUpdatesFedAvg('round1', updates, [100, 200, 700]);

      expect(result.participantCount).toBe(3);
      expect(result.aggregatedGradients.length).toBe(1);
    });

    it('should set proper metadata on global model', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.aggregateUpdatesFedAvg('round1', updates, [1000]);

      expect(result.id).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.aggregatedAt).toBeInstanceOf(Date);
    });

    it('should reject empty updates', async () => {
      const updates: PrivateUpdate[] = [];

      await expect(
        service.aggregateUpdatesFedAvg('round1', updates, []),
      ).rejects.toThrow('Cannot aggregate: no updates provided');
    });
  });

  describe('aggregateUpdatesFedProx', () => {
    it('should aggregate with FedProx regularization', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[1.0, 2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.aggregateUpdatesFedProx('round1', updates, [1000, 1000], 0.01);

      expect(result).toBeDefined();
      expect(result.participantCount).toBe(2);
    });

    it('should support custom mu parameter', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result1 = await service.aggregateUpdatesFedProx('round1', updates, [1000], 0.01);
      const result2 = await service.aggregateUpdatesFedProx('round1', updates, [1000], 0.1);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should reject empty updates', async () => {
      await expect(
        service.aggregateUpdatesFedProx('round1', [], [], 0.01),
      ).rejects.toThrow('Cannot aggregate: no updates provided');
    });
  });

  describe('aggregateUpdatesScaffold', () => {
    it('should aggregate using Scaffold algorithm', async () => {
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

      const result = await service.aggregateUpdatesScaffold('round1', updates, [1000, 1000]);

      expect(result).toBeDefined();
      expect(result.participantCount).toBe(2);
      expect(result.aggregatedGradients).toBeDefined();
    });

    it('should produce valid output dimensions', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1, 2, 3], [4, 5, 6]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[1, 2, 3], [4, 5, 6]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.aggregateUpdatesScaffold('round1', updates, [500, 500]);

      expect(result.aggregatedGradients.length).toBe(2);
      expect(result.aggregatedGradients[0].length).toBe(3);
      expect(result.aggregatedGradients[1].length).toBe(3);
    });
  });

  describe('calculateAggregationStats', () => {
    it('should calculate statistics for updates', () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 1.0], [1.0, 1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[2.0, 2.0], [2.0, 2.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const stats = service.calculateAggregationStats(updates);

      expect(stats.participantCount).toBe(2);
      expect(stats.avgGradientMagnitude).toBeGreaterThan(0);
      expect(stats.maxGradientMagnitude).toBeGreaterThan(stats.minGradientMagnitude);
    });

    it('should handle empty updates in stats', () => {
      const stats = service.calculateAggregationStats([]);

      expect(stats.participantCount).toBe(0);
      expect(stats.avgGradientMagnitude).toBe(0);
      expect(stats.maxGradientMagnitude).toBe(0);
      expect(stats.minGradientMagnitude).toBe(0);
    });

    it('should correctly compute gradient magnitudes', () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[3.0, 4.0]], // magnitude = 5
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const stats = service.calculateAggregationStats(updates);

      expect(stats.maxGradientMagnitude).toBeCloseTo(5, 0);
      expect(stats.minGradientMagnitude).toBeCloseTo(5, 0);
      expect(stats.avgGradientMagnitude).toBeCloseTo(5, 0);
    });
  });

  describe('aggregation correctness', () => {
    it('should produce weighted average correctly', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[4.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[0.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      // 4:1 weighting
      const result = await service.aggregateUpdatesFedAvg('round1', updates, [4, 1]);

      // Expected: (4.0 * 4/5) + (0.0 * 1/5) = 3.2
      expect(result.aggregatedGradients[0][0]).toBeCloseTo(3.2, 1);
    });

    it('should normalize weights to sum to 1', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.aggregateUpdatesFedAvg('round1', updates, [1, 1]);

      // With equal weights: (1.0 * 0.5) + (1.0 * 0.5) = 1.0
      expect(result.aggregatedGradients[0][0]).toBeCloseTo(1.0, 1);
    });

    it('should handle large number of participants', async () => {
      const updates: PrivateUpdate[] = Array.from({ length: 100 }, (_, i) => ({
        anonymizedId: `update${i}`,
        noisyGradients: [[1.0]],
        privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
      }));

      const datasetSizes = Array(100).fill(1000);
      const result = await service.aggregateUpdatesFedAvg('round1', updates, datasetSizes);

      expect(result.participantCount).toBe(100);
      expect(result.aggregatedGradients[0][0]).toBeCloseTo(1.0, 1);
    });
  });
});
