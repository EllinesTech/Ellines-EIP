import { Test, TestingModule } from '@nestjs/testing';
import { DifferentialPrivacyService } from './differential-privacy.service';
import { ModelUpdate, PrivateUpdate } from '../interfaces/federated-learning.interfaces';

describe('DifferentialPrivacyService', () => {
  let service: DifferentialPrivacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DifferentialPrivacyService],
    }).compile();

    service = module.get<DifferentialPrivacyService>(DifferentialPrivacyService);
  });

  describe('applyGaussianPrivacy', () => {
    it('should apply privacy to model updates', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[0.1, 0.2], [0.3, 0.4]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
        {
          orgId: 'org2',
          gradients: [[0.15, 0.25], [0.35, 0.45]],
          datasetSize: 1200,
          timestamp: new Date(),
        },
      ];

      const result = await service.applyGaussianPrivacy(updates, 1.0, 1e-5);

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('anonymizedId');
      expect(result[0]).toHaveProperty('noisyGradients');
      expect(result[0]).toHaveProperty('privacyGuarantee');
    });

    it('should add noise to gradients', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[1.0, 1.0], [1.0, 1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const result = await service.applyGaussianPrivacy(updates, 0.1, 1e-5);
      const noisyGradients = result[0].noisyGradients;

      // Should have same dimensions
      expect(noisyGradients.length).toBe(2);
      expect(noisyGradients[0].length).toBe(2);

      // Values should be different due to noise
      const originalFlat = updates[0].gradients.flat();
      const noisyFlat = noisyGradients.flat();

      const hasNoise = originalFlat.some((orig, i) => Math.abs(orig - noisyFlat[i]) > 0.01);
      expect(hasNoise).toBe(true);
    });

    it('should create valid privacy guarantees', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[0.1, 0.2]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const epsilon = 1.0;
      const delta = 1e-5;
      const result = await service.applyGaussianPrivacy(updates, epsilon, delta);

      const guarantee = result[0].privacyGuarantee;
      expect(guarantee.epsilon).toBe(epsilon);
      expect(guarantee.delta).toBe(delta);
      expect(guarantee.mechanism).toBe('gaussian');
      expect(guarantee.noiseScale).toBeGreaterThan(0);
    });

    it('should anonymize organization IDs', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'secret-org-id-1',
          gradients: [[0.1]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
        {
          orgId: 'secret-org-id-2',
          gradients: [[0.2]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const result = await service.applyGaussianPrivacy(updates, 1.0, 1e-5);

      // Organization IDs should be anonymized
      expect(result[0].anonymizedId).not.toContain('secret');
      expect(result[1].anonymizedId).not.toContain('secret');
      expect(result[0].anonymizedId).not.toBe(result[1].anonymizedId);
    });

    it('should handle larger epsilon with smaller noise', async () => {
      const updates: ModelUpdate[] = [
        {
          orgId: 'org1',
          gradients: [[1.0, 1.0]],
          datasetSize: 1000,
          timestamp: new Date(),
        },
      ];

      const result1 = await service.applyGaussianPrivacy(updates, 0.5, 1e-5);
      const result2 = await service.applyGaussianPrivacy(updates, 2.0, 1e-5);

      const noise1 = result1[0].privacyGuarantee.noiseScale;
      const noise2 = result2[0].privacyGuarantee.noiseScale;

      // Larger epsilon should have smaller noise
      expect(noise2).toBeLessThan(noise1);
    });

    it('should verify privacy guarantees', () => {
      const guarantee = {
        epsilon: 1.0,
        delta: 1e-5,
        mechanism: 'gaussian' as const,
        noiseScale: 2.0,
      };

      const isValid = service.verifyPrivacyGuarantee(guarantee, 2.0);
      expect(isValid).toBe(true);

      const isInvalid = service.verifyPrivacyGuarantee(guarantee, 0.5);
      expect(isInvalid).toBe(false);
    });

    it('should handle empty updates', async () => {
      const updates: ModelUpdate[] = [];
      const result = await service.applyGaussianPrivacy(updates, 1.0, 1e-5);

      expect(result).toEqual([]);
    });

    it('should calculate cumulative privacy cost', () => {
      const cumulativeEpsilon = service.calculateCumulativePrivacy(0.5, 10);
      expect(cumulativeEpsilon).toBe(5.0);

      const singleRound = service.calculateCumulativePrivacy(1.0, 1);
      expect(singleRound).toBe(1.0);
    });

    it('should handle multiple organizations in single batch', async () => {
      const updates: ModelUpdate[] = Array.from({ length: 5 }, (_, i) => ({
        orgId: `org${i}`,
        gradients: [[Math.random(), Math.random()]],
        datasetSize: 1000 + i * 100,
        timestamp: new Date(),
      }));

      const result = await service.applyGaussianPrivacy(updates, 1.0, 1e-5);

      expect(result.length).toBe(5);
      expect(new Set(result.map((r) => r.anonymizedId)).size).toBe(5); // All unique
    });
  });
});
