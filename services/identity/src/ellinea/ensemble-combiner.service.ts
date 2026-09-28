/**
 * EnsembleCombinerService
 *
 * Combines outputs from multiple AI model invocations into a single unified
 * result using weighted voting and conflict-resolution meta-learning.
 *
 * Requirement 1.3: Combine outputs from multiple models using ensemble
 *                  techniques to produce superior results.
 * Requirement 1.7: When model predictions conflict, use weighted voting or
 *                  meta-learning to resolve disagreements.
 *
 * Algorithm overview
 * ──────────────────
 * 1. Fetch accuracy scores for all participating models from ModelRegistryService.
 * 2. Compute weightedConfidence = Σ(result.confidence × weight) / Σ(weights)
 *    where weight = model.accuracyScore (defaults to 0.5 when null).
 * 3. Clamp final confidence to [min(individual), max(individual)]  ← Property 2.
 * 4. If |top1.confidence − top2.confidence| > 0.20 → switch to meta-learning
 *    (majority vote by count), log the conflict.
 * 5. Return a UnifiedResult with full decision audit trail.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModelRegistryService } from './model-registry.service';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ModelResult = {
  /** Identifier matching an entry in the model registry. */
  modelId: string;
  /** Raw model output string. */
  content: string;
  /** Confidence score in the range [0, 1]. */
  confidence: number;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
  /** Optional human-readable justification from the model. */
  explanation?: string;
};

export type UnifiedResult = {
  /** The winning model's content string (or majority-vote winner). */
  content: string;
  /** Final combined confidence, clamped to [min(individual), max(individual)]. */
  confidence: number;
  /** Human-readable explanation of how the result was produced. */
  explanation: string;
  /** IDs of models that contributed to this result. */
  sources: string[];
  /** Per-model decision audit trail. */
  modelDecisions: Array<{
    modelId: string;
    confidence: number;
    weight: number;
  }>;
  /** True when the top-2 models disagreed by > 20 % confidence. */
  conflictDetected: boolean;
  /** Strategy used to produce the final result. */
  ensembleStrategy: 'weighted_vote' | 'meta_learning';
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class EnsembleCombinerService {
  private readonly logger = new Logger(EnsembleCombinerService.name);

  /** Threshold above which the top-2 confidence gap triggers conflict resolution. */
  private static readonly CONFLICT_THRESHOLD = 0.20;

  /** Fallback accuracy weight when a model has no score in the registry. */
  private static readonly DEFAULT_WEIGHT = 0.5;

  constructor(private readonly modelRegistry: ModelRegistryService) {}

  // ---------------------------------------------------------------------------
  // combine
  // ---------------------------------------------------------------------------

  /**
   * Combine one or more model results into a single UnifiedResult.
   *
   * @param results - Array of individual model outputs. Must be non-empty.
   * @returns A UnifiedResult whose confidence satisfies Property 2:
   *          min(individual) ≤ combined ≤ max(individual).
   */
  async combine(results: ModelResult[]): Promise<UnifiedResult> {
    if (results.length === 0) {
      throw new Error('EnsembleCombinerService.combine: results array must not be empty.');
    }

    // Single result — no combination needed.
    if (results.length === 1) {
      return this.singleModelResult(results[0]);
    }

    // Fetch registry weights for all participating models in one call.
    const registryModels = await this.modelRegistry.getModels();
    const weightMap = this.buildWeightMap(registryModels.map((m) => ({
      modelId: m.modelId,
      accuracyScore: m.accuracyScore,
    })));

    // Derive per-model weights and sort by confidence descending for conflict check.
    const weighted = results
      .map((r) => ({
        result: r,
        weight: weightMap.get(r.modelId) ?? EnsembleCombinerService.DEFAULT_WEIGHT,
      }))
      .sort((a, b) => b.result.confidence - a.result.confidence);

    // Confidence bounds — needed for Property 2 clamp.
    const confidences = results.map((r) => r.confidence);
    const minConf = Math.min(...confidences);
    const maxConf = Math.max(...confidences);

    // Conflict detection: top-2 gap > 20 %.
    const conflictDetected =
      weighted.length >= 2 &&
      weighted[0].result.confidence - weighted[1].result.confidence >
        EnsembleCombinerService.CONFLICT_THRESHOLD;

    let ensembleStrategy: 'weighted_vote' | 'meta_learning';
    let finalContent: string;
    let rawConfidence: number;
    let explanation: string;

    if (conflictDetected) {
      // ── Meta-learning branch: majority vote by count ──────────────────────
      this.logger.warn(
        `Conflict detected: top model "${weighted[0].result.modelId}" confidence ` +
        `${weighted[0].result.confidence.toFixed(3)} vs ` +
        `"${weighted[1].result.modelId}" ${weighted[1].result.confidence.toFixed(3)}. ` +
        `Switching to meta-learning majority vote.`,
      );

      ensembleStrategy = 'meta_learning';
      const winner = this.majorityVote(results);
      finalContent = winner.content;
      rawConfidence = winner.confidence;
      explanation =
        `Conflict detected between top models (gap > ${(EnsembleCombinerService.CONFLICT_THRESHOLD * 100).toFixed(0)}%). ` +
        `Meta-learning majority vote selected model "${winner.modelId}" ` +
        `(${results.length} participants). ` +
        (winner.explanation ? `Model explanation: ${winner.explanation}` : '');
    } else {
      // ── Weighted voting branch ────────────────────────────────────────────
      ensembleStrategy = 'weighted_vote';

      const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
      rawConfidence = totalWeight > 0
        ? weighted.reduce((sum, w) => sum + w.result.confidence * w.weight, 0) / totalWeight
        : weighted[0].result.confidence;

      // Select highest-confidence model's content as the primary response.
      finalContent = weighted[0].result.content;

      explanation =
        `Weighted voting across ${results.length} model(s). ` +
        `Selected "${weighted[0].result.modelId}" (highest confidence). ` +
        (weighted[0].result.explanation
          ? `Model explanation: ${weighted[0].result.explanation}`
          : '');
    }

    // Property 2: clamp combined confidence to [min(individual), max(individual)].
    const finalConfidence = Math.min(Math.max(rawConfidence, minConf), maxConf);

    const modelDecisions = weighted.map((w) => ({
      modelId: w.result.modelId,
      confidence: w.result.confidence,
      weight: w.weight,
    }));

    const sources = results.map((r) => r.modelId);

    return {
      content: finalContent,
      confidence: finalConfidence,
      explanation,
      sources,
      modelDecisions,
      conflictDetected,
      ensembleStrategy,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Wrap a single model result in a UnifiedResult without combination logic.
   * Confidence is passed through unchanged (trivially satisfies Property 2).
   */
  private singleModelResult(result: ModelResult): UnifiedResult {
    return {
      content: result.content,
      confidence: result.confidence,
      explanation:
        `Single model result from "${result.modelId}". ` +
        (result.explanation ? `Model explanation: ${result.explanation}` : ''),
      sources: [result.modelId],
      modelDecisions: [{
        modelId: result.modelId,
        confidence: result.confidence,
        weight: EnsembleCombinerService.DEFAULT_WEIGHT,
      }],
      conflictDetected: false,
      ensembleStrategy: 'weighted_vote',
    };
  }

  /**
   * Build a modelId → weight lookup from registry data.
   * Weight = accuracyScore when present, otherwise DEFAULT_WEIGHT.
   */
  private buildWeightMap(
    entries: Array<{ modelId: string; accuracyScore: number | null }>,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(
        entry.modelId,
        entry.accuracyScore ?? EnsembleCombinerService.DEFAULT_WEIGHT,
      );
    }
    return map;
  }

  /**
   * Majority vote by raw count: the content value that appears most often wins.
   * Ties are broken by highest confidence among the tied values.
   *
   * Implements the meta-learning conflict-resolution branch (Requirement 1.7).
   */
  private majorityVote(results: ModelResult[]): ModelResult {
    // Group results by content.
    const contentGroups = new Map<string, ModelResult[]>();
    for (const r of results) {
      const group = contentGroups.get(r.content) ?? [];
      group.push(r);
      contentGroups.set(r.content, group);
    }

    // Find the largest group; break ties by highest confidence within the group.
    let winner: ModelResult | null = null;
    let maxCount = 0;
    let maxConfidenceInGroup = -1;

    for (const group of contentGroups.values()) {
      const groupConfidence = Math.max(...group.map((r) => r.confidence));
      if (
        group.length > maxCount ||
        (group.length === maxCount && groupConfidence > maxConfidenceInGroup)
      ) {
        maxCount = group.length;
        maxConfidenceInGroup = groupConfidence;
        // Pick the highest-confidence representative from this group.
        winner = group.reduce(
          (best, r) => (r.confidence > best.confidence ? r : best),
          group[0],
        );
      }
    }

    // Guaranteed non-null because results.length >= 2 at call site.
    return winner!;
  }
}
