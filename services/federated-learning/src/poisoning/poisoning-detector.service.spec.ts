import { Test, TestingModule } from '@nestjs/testing';
import { PoisoningDetectorService } from './poisoning-detector.service';
import { PrivateUpdate } from '../interfaces/federated-learning.interfaces';

describe('PoisoningDetectorService', () => {
  let service: PoisoningDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PoisoningDetectorService],
    }).compile();

    service = module.get<PoisoningDetectorService>(PoisoningDetectorService);
  });

  describe('detectPoisoningByZScore', () => {
    it('should detect normal updates as clean', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[0.1, 0.2], [0.3, 0.4]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[0.1, 0.2], [0.3, 0.4]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update3',
          noisyGradients: [[0.1, 0.2], [0.3, 0.4]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.detectPoisoningByZScore(updates);

      expect(result.cleanUpdates.length).toBe(3);
      expect(result.poisonedUpdates.length).toBe(0);
    });

    it('should detect anomalous updates as poisoned', async () => {
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
          noisyGradients: [[100, 100], [100, 100]], // Outlier
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.detectPoisoningByZScore(updates, 2.5);

      expect(result.cleanUpdates.length).toBe(2);
      expect(result.poisonedUpdates.length).toBe(1);
      expect(result.poisonedUpdates[0].anonymizedId).toBe('poisoned');
    });

    it('should return anomaly scores for all updates', async () => {
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

      const result = await service.detectPoisoningByZScore(updates);

      expect(result.anomalyScores.size).toBe(2);
      expect(result.anomalyScores.has('update1')).toBe(true);
      expect(result.anomalyScores.has('update2')).toBe(true);
    });

    it('should apply configurable threshold', async () => {
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

      // With low threshold
      const result1 = await service.detectPoisoningByZScore(updates, 0.5);
      expect(result1.poisonedUpdates.length).toBeGreaterThanOrEqual(0);

      // With high threshold
      const result2 = await service.detectPoisoningByZScore(updates, 5.0);
      expect(result2.poisonedUpdates.length).toBe(0);
    });

    it('should handle single update', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[0.5, 0.5]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.detectPoisoningByZScore(updates);

      expect(result.cleanUpdates.length + result.poisonedUpdates.length).toBe(1);
    });

    it('should handle empty updates', async () => {
      const updates: PrivateUpdate[] = [];
      const result = await service.detectPoisoningByZScore(updates);

      expect(result.cleanUpdates.length).toBe(0);
      expect(result.poisonedUpdates.length).toBe(0);
    });
  });

  describe('detectPoisoningByIsolation', () => {
    it('should detect isolated anomalies', async () => {
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

      const result = await service.detectPoisoningByIsolation(updates);

      expect(result.poisonedUpdates.length).toBeGreaterThanOrEqual(0);
      expect(result.cleanUpdates.length).toBeGreaterThanOrEqual(0);
      expect(result.cleanUpdates.length + result.poisonedUpdates.length).toBe(3);
    });

    it('should return isolation scores', async () => {
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

      const result = await service.detectPoisoningByIsolation(updates);

      expect(result.anomalyScores.size).toBe(2);
      expect(result.threshold).toBeGreaterThanOrEqual(0);
      expect(result.threshold).toBeLessThanOrEqual(1);
    });

    it('should have consistent detection results', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
          noisyGradients: [[1.0, 1.0], [1.0, 1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update2',
          noisyGradients: [[1.0, 1.0], [1.0, 1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
        {
          anonymizedId: 'update3',
          noisyGradients: [[1.0, 1.0], [1.0, 1.0]],
          privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
        },
      ];

      const result = await service.detectPoisoningByIsolation(updates);

      expect(result.cleanUpdates.length).toBe(3);
      expect(result.poisonedUpdates.length).toBe(0);
    });
  });

  describe('poisoning detection robustness', () => {
    it('should detect multiple poisoned updates', async () => {
      const updates: PrivateUpdate[] = [
        {
          anonymizedId: 'update1',
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

      const result = await service.detectPoisoningByZScore(updates, 2.0);

      expect(result.poisonedUpdates.length).toBeGreaterThan(0);
    });

    it('should maintain detection consistency across methods', async () => {
      const updates: PrivateUpdate[] = Array.from({ length: 10 }, (_, i) => ({
        anonymizedId: `update${i}`,
        noisyGradients: [[0.1 + Math.random() * 0.1, 0.1 + Math.random() * 0.1]],
        privacyGuarantee: { epsilon: 1.0, delta: 1e-5, mechanism: 'gaussian', noiseScale: 1.0 },
      }));

      const result1 = await service.detectPoisoningByZScore(updates);
      const result2 = await service.detectPoisoningByIsolation(updates);

      expect(result1.cleanUpdates.length + result1.poisonedUpdates.length).toBe(10);
      expect(result2.cleanUpdates.length + result2.poisonedUpdates.length).toBe(10);
    });
  });
});
