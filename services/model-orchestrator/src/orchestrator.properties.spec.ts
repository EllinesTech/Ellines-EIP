/**
 * Property-Based Tests for Model Orchestrator
 *
 * Property 1: Model routing consistency
 *   Same query content always produces the same query type classification
 *   given the same query structure (no mutable external state involved).
 *   Validates: Requirements 1.2
 *
 * Property 2: Ensemble result confidence bounds
 *   The combined confidence produced by the EnsembleCombinerService is
 *   always within the range [min(constituent), max(constituent)] — i.e., it
 *   never exceeds the most confident model or falls below the least confident.
 *   Validates: Requirements 1.3
 */

import * as fc from 'fast-check';
import { QueryAnalyzerService } from './query-analyzer/query-analyzer.service';
import { EnsembleCombinerService } from './ensemble/ensemble-combiner.service';
import { Query, QueryType, ModelCapability } from './interfaces/query.interface';
import { ModelOutput, ModelResults, EnsembleStrategy } from './interfaces/model.interface';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Query from raw content. */
function buildQuery(content: string, type?: QueryType): Query {
  return {
    id: 'q-test',
    content,
    type,
    context: { timestamp: new Date() },
    requiredCapabilities: [],
  };
}

/** Build a ModelResults map from an array of (modelId, confidence) pairs. */
function buildModelResults(
  entries: Array<{ modelId: string; confidence: number; result?: string }>,
): ModelResults {
  const results = new Map<string, ModelOutput>();
  const latencies = new Map<string, number>();
  const confidences = new Map<string, number>();

  for (const entry of entries) {
    const output: ModelOutput = {
      modelId: entry.modelId,
      result: entry.result ?? `Answer from ${entry.modelId}`,
      confidence: entry.confidence,
      latency: 100,
    };
    results.set(entry.modelId, output);
    latencies.set(entry.modelId, 100);
    confidences.set(entry.modelId, entry.confidence);
  }

  return { results, latencies, confidences };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Generate arbitrary query content strings that contain at least one keyword
 * from one of the recognized categories, ensuring deterministic classification.
 * We use representative trigger words rather than fully random strings so the
 * test exercises the real routing logic (not meaningless gibberish).
 */
const timeSeriesContents = [
  'forecast revenue for next quarter',
  'predict sales trend for next year',
  'what will be the profit next month',
  'anticipate demand in the future',
  'project growth timeline',
];

const anomalyContents = [
  'detect anomaly in transaction data',
  'find unusual patterns in logs',
  'identify outlier in expenses',
  'check for abnormal activity',
  'suspicious login detected',
];

const visionContents = [
  'analyze this image',
  'describe the photo',
  'what is in the picture',
  'scan the document image',
  'read the visual diagram',
];

const reasoningContents = [
  'why did something go wrong',
  'how does this impact revenue',
  'explain the cause of the error',
  'analyze the relationship between departments',
  'evaluate the connection between data sources',
];

const textContents = [
  'total staff count in the organization',
  'list all products in the catalog',
  'fetch all open support tickets',
  'get the current inventory levels',
  'display active subscriptions',
];

/** Pick a random string from a fixed array. */
const arbitraryFrom = (arr: string[]) =>
  fc.integer({ min: 0, max: arr.length - 1 }).map((i) => arr[i]);

/** Arbitrary query content with its expected QueryType. */
const arbitraryTypedContent = fc.oneof(
  arbitraryFrom(timeSeriesContents).map((c) => ({ content: c, expected: 'time-series' as QueryType })),
  arbitraryFrom(anomalyContents).map((c) => ({ content: c, expected: 'anomaly' as QueryType })),
  arbitraryFrom(visionContents).map((c) => ({ content: c, expected: 'vision' as QueryType })),
  arbitraryFrom(reasoningContents).map((c) => ({ content: c, expected: 'reasoning' as QueryType })),
  arbitraryFrom(textContents).map((c) => ({ content: c, expected: 'text' as QueryType })),
);

/** Arbitrary model output list: 1–5 models with confidence in (0, 1]. */
const arbitraryModelOutputs = fc.array(
  fc.record({
    modelId: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    // fc.float requires 32-bit float boundaries; use Math.fround to comply
    confidence: fc.float({ min: Math.fround(0.01), max: Math.fround(1.0), noNaN: true }),
  }),
  { minLength: 1, maxLength: 5 },
);

/** Arbitrary ensemble strategy. */
const arbitraryStrategy = fc.constantFrom<EnsembleStrategy>(
  'weighted_vote',
  'meta_learning',
  'cascade',
);

/** Arbitrary model accuracies map aligned with model IDs. */
function buildAccuracies(
  modelIds: string[],
  accuracy: number,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of modelIds) {
    m.set(id, accuracy);
  }
  return m;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Model Orchestrator — Property-Based Tests', () => {
  let queryAnalyzer: QueryAnalyzerService;
  let ensembleCombiner: EnsembleCombinerService;

  beforeEach(() => {
    queryAnalyzer = new QueryAnalyzerService();
    ensembleCombiner = new EnsembleCombinerService();
  });

  // ─── Property 1: Model Routing Consistency ─────────────────────────────────
  /**
   * **Validates: Requirements 1.2**
   *
   * WHEN the same query content is submitted twice to the query analyzer,
   * the resulting QueryType MUST be identical on both calls.
   * This guarantees deterministic routing — the same content always reaches
   * the same model family regardless of call order or timing.
   */
  describe('Property 1: Model routing consistency', () => {
    it('classifies the same query content to the same type on repeated calls', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryTypedContent, async ({ content }) => {
          const query = buildQuery(content);

          const classification1 = await queryAnalyzer.analyzeQuery(query);
          const classification2 = await queryAnalyzer.analyzeQuery(query);

          // Both calls must produce the same type
          expect(classification1.type).toBe(classification2.type);
        }),
        { numRuns: 50, seed: 42 },
      );
    });

    it('routes well-known keyword phrases to their expected query types', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryTypedContent, async ({ content, expected }) => {
          const query = buildQuery(content);
          const classification = await queryAnalyzer.analyzeQuery(query);

          expect(classification.type).toBe(expected);
        }),
        { numRuns: 50, seed: 42 },
      );
    });

    it('respects an explicit type override regardless of content keywords', async () => {
      const explicitTypes: QueryType[] = [
        'text', 'time-series', 'anomaly', 'vision', 'reasoning', 'hybrid',
      ];

      await fc.assert(
        fc.asyncProperty(
          arbitraryFrom(timeSeriesContents), // content has time-series keywords
          fc.constantFrom(...explicitTypes),  // but caller passes an explicit type
          async (content, explicitType) => {
            const query = buildQuery(content, explicitType);
            const classification = await queryAnalyzer.analyzeQuery(query);

            // Explicit type must take precedence over keyword scanning
            expect(classification.type).toBe(explicitType);
          },
        ),
        { numRuns: 50, seed: 99 },
      );
    });

    it('produces confidence in the valid range [0, 100] for any query', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryTypedContent, async ({ content }) => {
          const query = buildQuery(content);
          const classification = await queryAnalyzer.analyzeQuery(query);

          expect(classification.confidence).toBeGreaterThanOrEqual(0);
          expect(classification.confidence).toBeLessThanOrEqual(100);
        }),
        { numRuns: 50, seed: 42 },
      );
    });
  });

  // ─── Property 2: Ensemble Result Confidence Bounds ─────────────────────────
  /**
   * **Validates: Requirements 1.3**
   *
   * The unified confidence produced by the EnsembleCombinerService MUST
   * satisfy:
   *   min(constituent confidences) <= combined_confidence <= max(constituent confidences)
   *
   * This ensures ensemble techniques cannot manufacture spurious certainty
   * (combined confidence > most confident constituent) or introduce artificial
   * doubt (combined confidence < least confident constituent).
   *
   * Note: weighted_vote applies a weighted average formula, which by the
   * properties of convex combinations always stays within [min, max] of the
   * weights.  Meta-learning picks the max.  Cascade picks from the sorted
   * list.  All three strategies therefore satisfy the bounds property.
   */
  describe('Property 2: Ensemble result confidence within constituent bounds', () => {
    it('combined confidence is within [min, max] of constituent confidences for all strategies', () => {
      fc.assert(
        fc.property(
          arbitraryModelOutputs,
          arbitraryStrategy,
          (modelOutputs, strategy) => {
            // Deduplicate model IDs (fast-check may generate duplicates)
            const seen = new Set<string>();
            const unique = modelOutputs.filter((o) => {
              if (seen.has(o.modelId)) return false;
              seen.add(o.modelId);
              return true;
            });

            if (unique.length === 0) return; // skip degenerate case

            const modelResults = buildModelResults(unique);
            const accuracies = buildAccuracies(
              unique.map((o) => o.modelId),
              0.85,
            );

            const unified = ensembleCombiner.combine(modelResults, strategy, accuracies);

            const constituents = unique.map((o) => o.confidence);
            const minConf = Math.min(...constituents);
            const maxConf = Math.max(...constituents);

            // The weighted_vote strategy applies a 0.99 ceiling to avoid
            // returning exactly 1.0. Account for that cap in both bounds.
            // The cap cannot push confidence below minConf unless minConf > 0.99,
            // but it also cannot raise confidence above 0.99.
            const effectiveMax = strategy === 'weighted_vote' ? Math.min(maxConf, 0.99) : maxConf;
            // For weighted_vote, when all confidences > 0.99 the cap reduces
            // the output to 0.99 which is still within [0, 1]
            const effectiveMin = strategy === 'weighted_vote' ? Math.min(minConf, 0.99) : minConf;

            // Allow a small floating-point tolerance
            const EPS = 1e-6;
            expect(unified.confidence).toBeGreaterThanOrEqual(effectiveMin - EPS);
            expect(unified.confidence).toBeLessThanOrEqual(effectiveMax + EPS);
          },
        ),
        { numRuns: 200, seed: 7 },
      );
    });

    it('combined confidence is never negative', () => {
      fc.assert(
        fc.property(arbitraryModelOutputs, arbitraryStrategy, (modelOutputs, strategy) => {
          const seen = new Set<string>();
          const unique = modelOutputs.filter((o) => {
            if (seen.has(o.modelId)) return false;
            seen.add(o.modelId);
            return true;
          });
          if (unique.length === 0) return;

          const modelResults = buildModelResults(unique);
          const accuracies = buildAccuracies(unique.map((o) => o.modelId), 0.85);

          const unified = ensembleCombiner.combine(modelResults, strategy, accuracies);

          expect(unified.confidence).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 200, seed: 7 },
      );
    });

    it('combined confidence never exceeds 1.0 (probability ceiling)', () => {
      fc.assert(
        fc.property(arbitraryModelOutputs, arbitraryStrategy, (modelOutputs, strategy) => {
          const seen = new Set<string>();
          const unique = modelOutputs.filter((o) => {
            if (seen.has(o.modelId)) return false;
            seen.add(o.modelId);
            return true;
          });
          if (unique.length === 0) return;

          const modelResults = buildModelResults(unique);
          const accuracies = buildAccuracies(unique.map((o) => o.modelId), 0.85);

          const unified = ensembleCombiner.combine(modelResults, strategy, accuracies);

          expect(unified.confidence).toBeLessThanOrEqual(1.0);
        }),
        { numRuns: 200, seed: 7 },
      );
    });

    it('combining a single model always returns that model confidence unchanged', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1.0), noNaN: true }),
          arbitraryStrategy,
          (singleConfidence, strategy) => {
            const single = [{ modelId: 'only-model', confidence: singleConfidence }];
            const modelResults = buildModelResults(single);
            const accuracies = buildAccuracies(['only-model'], 1.0);

            const unified = ensembleCombiner.combine(modelResults, strategy, accuracies);

            // For a single constituent the combined confidence must be close
            // to the original.  weighted_vote applies a 0.99 ceiling, so we
            // check the effective expected value per strategy.
            const expected =
              strategy === 'weighted_vote'
                ? Math.min(singleConfidence, 0.99)
                : singleConfidence;

            const EPS = 1e-6;
            expect(unified.confidence).toBeGreaterThanOrEqual(expected - EPS);
            expect(unified.confidence).toBeLessThanOrEqual(expected + EPS);
          },
        ),
        { numRuns: 100, seed: 13 },
      );
    });

    it('meta_learning always selects the highest-confidence constituent', () => {
      fc.assert(
        fc.property(arbitraryModelOutputs, (modelOutputs) => {
          const seen = new Set<string>();
          const unique = modelOutputs.filter((o) => {
            if (seen.has(o.modelId)) return false;
            seen.add(o.modelId);
            return true;
          });
          if (unique.length === 0) return;

          const modelResults = buildModelResults(unique);
          const accuracies = buildAccuracies(unique.map((o) => o.modelId), 0.85);

          const unified = ensembleCombiner.combine(modelResults, 'meta_learning', accuracies);

          const maxConf = Math.max(...unique.map((o) => o.confidence));
          const EPS = 1e-9;
          expect(unified.confidence).toBeGreaterThanOrEqual(maxConf - EPS);
          expect(unified.confidence).toBeLessThanOrEqual(maxConf + EPS);
        }),
        { numRuns: 200, seed: 7 },
      );
    });
  });
});
