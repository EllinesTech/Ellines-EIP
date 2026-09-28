/**
 * ModelRouterService
 *
 * Given a list of required ModelCapability strings (produced by
 * QueryClassifierService), selects primary, secondary, and fallback models
 * from the AiModelRegistry and returns a ModelRouting decision.
 *
 * Selection algorithm (Requirement 1.2 / 1.5 / 1.7):
 *   score = accuracyScore × (1 / avgLatencyMs)   — higher is better
 *   Sort available models by this score descending.
 *   primary   = models[0]
 *   secondary = models[1..2]
 *   fallback  = look up the primary model's `fallbackModelId`; if absent,
 *               use the first unavailable model that matches the capability
 *               (requirement 1.5 degradation notice).
 *
 * Determinism guarantee (Property 1):
 *   For the same capability list and the same registry snapshot the routing
 *   decision is always identical. The only tie-break is the lexicographic
 *   order of modelId, which is stable.
 *
 * Requirement 1.2: Route query to the most appropriate model.
 * Requirement 1.5: Fall back to a general-purpose model with degradation notice.
 * Requirement 1.7: Weighted selection to resolve multi-model disagreements.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModelRegistryService, AiModelSummary } from './model-registry.service';
import { ModelCapability, QueryType } from './query-classifier.service';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * The result of a routing decision.
 *
 * `primary`       — the best-scoring available model for the required capabilities.
 * `secondary`     — the next two best-scoring models (for ensemble / redundancy).
 * `fallback`      — a safety net model; `null` when none is configured and no
 *                   degraded model is available.
 * `queryType`     — echoes the QueryType so downstream can log it atomically.
 * `routingReason` — human-readable explanation for audit / explainability.
 */
export interface ModelRouting {
  primary: AiModelSummary;
  secondary: AiModelSummary[];
  fallback: AiModelSummary | null;
  queryType: QueryType;
  routingReason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Sentinel latency used when `avgLatencyMs` is null / 0 so the model still
 * participates in scoring but with a conservative estimate.
 */
const DEFAULT_LATENCY_MS = 1000;

/**
 * Sentinel accuracy used when `accuracyScore` is null so the model still
 * participates in scoring but ranks lower than models with known accuracy.
 */
const DEFAULT_ACCURACY = 0.5;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  constructor(private readonly registry: ModelRegistryService) {}

  /**
   * Select primary, secondary, and fallback models for the given capabilities.
   *
   * Throws if no available model supports *any* of the requested capabilities.
   *
   * @param capabilities  One or more capability strings from QueryClassifierService.
   * @param queryType     The originating QueryType (echoed into the result).
   */
  async route(
    capabilities: ModelCapability[],
    queryType: QueryType,
  ): Promise<ModelRouting> {
    if (!capabilities || capabilities.length === 0) {
      throw new Error('ModelRouterService.route: capabilities list must not be empty');
    }

    // 1. Fetch all models that support at least one requested capability.
    const candidates = await this.fetchCandidates(capabilities);

    // 2. Partition into available and unavailable.
    const available   = candidates.filter((m) => m.isAvailable);
    const unavailable = candidates.filter((m) => !m.isAvailable);

    if (available.length === 0) {
      // Requirement 1.5: fall back to general-purpose language model.
      this.logger.warn(
        `No available model for capabilities [${capabilities.join(', ')}]; ` +
          'attempting general-purpose fallback.',
      );
      return this.buildDegradedRouting(capabilities, queryType, unavailable);
    }

    // 3. Sort by routing score descending; ties broken by modelId (lexicographic).
    const sorted = [...available].sort((a, b) => {
      const diff = this.score(b) - this.score(a);
      return diff !== 0 ? diff : a.modelId.localeCompare(b.modelId);
    });

    const primary   = sorted[0];
    const secondary = sorted.slice(1, 3);

    // 4. Resolve fallback via primary's `fallbackModelId` field.
    const fallback = await this.resolveFallback(primary, candidates);

    const routingReason = this.buildReason(primary, capabilities, queryType);

    this.logger.debug(
      `Routed queryType=${queryType} → primary=${primary.modelId} ` +
        `secondary=[${secondary.map((m) => m.modelId).join(', ')}] ` +
        `fallback=${fallback?.modelId ?? 'none'}`,
    );

    return { primary, secondary, fallback, queryType, routingReason };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch every model that matches *any* capability in the list.
   * Union-style: if capabilities = ['a', 'b'], we return models that have 'a' OR 'b'.
   */
  private async fetchCandidates(capabilities: ModelCapability[]): Promise<AiModelSummary[]> {
    const sets = await Promise.all(
      capabilities.map((cap) => this.registry.getModels(cap)),
    );

    // Merge and deduplicate by modelId.
    const seen = new Set<string>();
    const merged: AiModelSummary[] = [];
    for (const list of sets) {
      for (const model of list) {
        if (!seen.has(model.modelId)) {
          seen.add(model.modelId);
          merged.push(model);
        }
      }
    }

    return merged;
  }

  /**
   * Routing score formula: accuracyScore × (1 / avgLatencyMs)
   * Higher is better (more accurate and/or lower latency).
   */
  private score(model: AiModelSummary): number {
    const accuracy = model.accuracyScore ?? DEFAULT_ACCURACY;
    const latency  = model.avgLatencyMs && model.avgLatencyMs > 0
      ? model.avgLatencyMs
      : DEFAULT_LATENCY_MS;

    return accuracy * (1 / latency);
  }

  /**
   * Resolve the fallback model:
   * 1. Look up primary.fallbackModelId in the registry (may be a different capability).
   * 2. If absent, try to find any available general-purpose model.
   * 3. Returns null when nothing is available.
   *
   * Requirement 1.5: fall back to general-purpose model with degradation notice.
   */
  private async resolveFallback(
    primary: AiModelSummary,
    candidates: AiModelSummary[],
  ): Promise<AiModelSummary | null> {
    // Strategy 1: use explicit fallbackModelId from the registry record.
    const fullRecord = await this.registry.getModelById(primary.modelId).catch(() => null);
    if (fullRecord?.fallbackModelId) {
      const fallbackRecord = await this.registry
        .getModelById(fullRecord.fallbackModelId)
        .catch(() => null);

      if (fallbackRecord) {
        return {
          modelId:      fallbackRecord.modelId,
          displayName:  fallbackRecord.displayName,
          provider:     fallbackRecord.provider,
          modelType:    fallbackRecord.modelType,
          capabilities: fallbackRecord.capabilities,
          isAvailable:  fallbackRecord.isAvailable,
          priority:     fallbackRecord.priority,
          accuracyScore: fallbackRecord.accuracyScore,
          avgLatencyMs:  fallbackRecord.avgLatencyMs,
          costPerMToken: fallbackRecord.costPerMToken,
        };
      }
    }

    // Strategy 2: pick the highest-scoring candidate that is NOT the primary.
    const others = candidates.filter(
      (m) => m.modelId !== primary.modelId && m.isAvailable,
    );

    if (others.length === 0) return null;

    return others.sort((a, b) => {
      const diff = this.score(b) - this.score(a);
      return diff !== 0 ? diff : a.modelId.localeCompare(b.modelId);
    })[0];
  }

  /**
   * Build a degraded routing when *no* available model exists.
   * Tries to find a general-purpose language model as a last resort.
   *
   * Requirement 1.5: fall back to general-purpose model with degradation notice.
   */
  private async buildDegradedRouting(
    capabilities: ModelCapability[],
    queryType: QueryType,
    unavailable: AiModelSummary[],
  ): Promise<ModelRouting> {
    // Try to find any available model in the registry (uncapability-filtered).
    const allModels = await this.registry.getModels();
    const available = allModels.filter((m) => m.isAvailable);

    if (available.length === 0) {
      throw new Error(
        `No available model in registry for capabilities [${capabilities.join(', ')}]. ` +
          'Ensure at least one model is registered and available.',
      );
    }

    // Pick highest-scoring general-purpose fallback.
    const sorted = [...available].sort((a, b) => {
      const diff = this.score(b) - this.score(a);
      return diff !== 0 ? diff : a.modelId.localeCompare(b.modelId);
    });

    const primary = sorted[0];
    const secondary = sorted.slice(1, 3);
    const fallback = sorted[3] ?? null;

    const reason =
      `[DEGRADED] No available model supports [${capabilities.join(', ')}]. ` +
      `Using general-purpose model '${primary.modelId}' (${primary.provider}) ` +
      `as fallback. Accuracy may be reduced.`;

    this.logger.warn(reason);

    return {
      primary,
      secondary,
      fallback,
      queryType,
      routingReason: reason,
    };
  }

  /**
   * Build a human-readable routing reason string for audit logs.
   */
  private buildReason(
    primary: AiModelSummary,
    capabilities: ModelCapability[],
    queryType: QueryType,
  ): string {
    const accuracy = (primary.accuracyScore ?? DEFAULT_ACCURACY).toFixed(3);
    const latency  = primary.avgLatencyMs ?? DEFAULT_LATENCY_MS;
    const routeScore = this.score(primary).toExponential(4);

    return (
      `Selected '${primary.modelId}' (${primary.provider}) ` +
      `for queryType='${queryType}' ` +
      `[capabilities: ${capabilities.join(', ')}]. ` +
      `Routing score: ${routeScore} ` +
      `(accuracy=${accuracy}, latency=${latency}ms).`
    );
  }
}
