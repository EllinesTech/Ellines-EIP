/**
 * EnsembleCombinerService — property tests
 *
 * Property 2 (Req 1.3): Combined confidence is always within
 *   [min(individual), max(individual)].
 *
 * Tests use a lightweight mock of ModelRegistryService so no DB connection
 * is required (same pattern as agents.service.spec.ts).
 */

import { EnsembleCombinerService, ModelResult } from './ensemble-combiner.service';
import { ModelRegistryService } from './model-registry.service';

// ─── Registry mock ────────────────────────────────────────────────────────────

function makeRegistry(accuracyMap: Record<string, number> = {}) {
  return {
    getModels: jest.fn().mockResolvedValue(
      Object.entries(accuracyMap).map(([modelId, acc]) => ({
        modelId,
        accuracyScore: acc,
      })),
    ),
    getModelById: jest.fn().mockResolvedValue(null),
  } as unknown as ModelRegistryService;
}

function makeSvc(accuracyMap: Record<string, number> = {}) {
  return new EnsembleCombinerService(makeRegistry(accuracyMap));
}

function makeResult(modelId: string, confidence: number, content = 'response'): ModelResult {
  return { modelId, content, confidence, latencyMs: 100 };
}

// ─── Property 2: confidence clamp ─────────────────────────────────────────────

describe('EnsembleCombinerService — Property 2: confidence clamp', () => {
  it('single result: combined confidence equals the individual confidence', async () => {
    const svc = makeSvc({ 'model-a': 0.9 });
    const result = await svc.combine([makeResult('model-a', 0.75)]);
    expect(result.confidence).toBe(0.75);
  });

  it('two equal confidences: combined confidence equals that value', async () => {
    const svc = makeSvc({ 'model-a': 0.8, 'model-b': 0.8 });
    const result = await svc.combine([
      makeResult('model-a', 0.6),
      makeResult('model-b', 0.6),
    ]);
    expect(result.confidence).toBeCloseTo(0.6, 5);
  });

  it('combined confidence is >= min of inputs (low variance)', async () => {
    const svc = makeSvc({ 'model-a': 0.9, 'model-b': 0.8 });
    const inputs = [makeResult('model-a', 0.5), makeResult('model-b', 0.8)];
    const result = await svc.combine(inputs);
    const minConf = Math.min(...inputs.map((r) => r.confidence));
    const maxConf = Math.max(...inputs.map((r) => r.confidence));
    expect(result.confidence).toBeGreaterThanOrEqual(minConf);
    expect(result.confidence).toBeLessThanOrEqual(maxConf);
  });

  it('combined confidence is <= max of inputs (high variance)', async () => {
    const svc = makeSvc({ 'model-a': 0.9, 'model-b': 0.4 });
    const inputs = [makeResult('model-a', 0.95), makeResult('model-b', 0.3)];
    const result = await svc.combine(inputs);
    const minConf = Math.min(...inputs.map((r) => r.confidence));
    const maxConf = Math.max(...inputs.map((r) => r.confidence));
    expect(result.confidence).toBeGreaterThanOrEqual(minConf);
    expect(result.confidence).toBeLessThanOrEqual(maxConf);
  });

  it('property holds for 5 models with random-like confidence spread', async () => {
    const confidences = [0.1, 0.4, 0.55, 0.78, 0.99];
    const accuracyMap = Object.fromEntries(
      confidences.map((_, i) => [`model-${i}`, 0.7]),
    );
    const svc = makeSvc(accuracyMap);
    const inputs = confidences.map((c, i) => makeResult(`model-${i}`, c));
    const result = await svc.combine(inputs);
    const minConf = Math.min(...confidences);
    const maxConf = Math.max(...confidences);
    expect(result.confidence).toBeGreaterThanOrEqual(minConf);
    expect(result.confidence).toBeLessThanOrEqual(maxConf);
  });

  it('property holds when confidence gap triggers conflict resolution (meta-learning path)', async () => {
    const svc = makeSvc({ 'model-high': 0.9, 'model-low': 0.5 });
    // Gap = 0.95 - 0.4 = 0.55 > CONFLICT_THRESHOLD (0.20) → meta-learning
    const inputs = [makeResult('model-high', 0.95), makeResult('model-low', 0.4)];
    const result = await svc.combine(inputs);
    expect(result.conflictDetected).toBe(true);
    expect(result.ensembleStrategy).toBe('meta_learning');
    const minConf = Math.min(...inputs.map((r) => r.confidence));
    const maxConf = Math.max(...inputs.map((r) => r.confidence));
    expect(result.confidence).toBeGreaterThanOrEqual(minConf);
    expect(result.confidence).toBeLessThanOrEqual(maxConf);
  });

  it('property holds when confidence gap is just below conflict threshold', async () => {
    const svc = makeSvc({ 'model-a': 0.7, 'model-b': 0.7 });
    // Gap = 0.19 < CONFLICT_THRESHOLD (0.20) → weighted vote
    const inputs = [makeResult('model-a', 0.79), makeResult('model-b', 0.60)];
    const result = await svc.combine(inputs);
    expect(result.conflictDetected).toBe(false);
    expect(result.ensembleStrategy).toBe('weighted_vote');
    const minConf = Math.min(...inputs.map((r) => r.confidence));
    const maxConf = Math.max(...inputs.map((r) => r.confidence));
    expect(result.confidence).toBeGreaterThanOrEqual(minConf);
    expect(result.confidence).toBeLessThanOrEqual(maxConf);
  });

  it('throws when results array is empty', async () => {
    const svc = makeSvc();
    await expect(svc.combine([])).rejects.toThrow();
  });

  it('returns correct sources list', async () => {
    const svc = makeSvc({ 'model-a': 0.9, 'model-b': 0.8 });
    const result = await svc.combine([
      makeResult('model-a', 0.7),
      makeResult('model-b', 0.6),
    ]);
    expect(result.sources).toContain('model-a');
    expect(result.sources).toContain('model-b');
    expect(result.modelDecisions).toHaveLength(2);
  });
});
