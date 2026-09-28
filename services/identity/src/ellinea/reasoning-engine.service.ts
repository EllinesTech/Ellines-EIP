/**
 * ReasoningEngineService — Advanced multi-hop reasoning over the EIP knowledge graph.
 *
 * Implements:
 *  - multiHopReasoning: BFS traversal of KnowledgeGraphEntity/Relationship (PostgreSQL),
 *    accumulating ReasoningStep[] across up to `maxHops` levels.
 *  - buildEvidenceChain: validates every step carries ≥ 1 evidence item (Property 4).
 *  - identifyCausalLinks: temporal co-occurrence analysis across EnterpriseSnapshot.timeline events.
 *  - detectPatterns: cross-system KPI degradation detection across ≥ 3 sourceSystem values;
 *    persists results to EnterpriseSnapshot.insights.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.8
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ReasoningStep = {
  /** Zero-based traversal depth (0 = seed entity). */
  hop: number;
  entityId: string;
  entityType: string;
  relationship: string;
  /** Must have >= 1 item for a complete evidence chain (Property 4). */
  evidence: string[];
  confidence: number;
};

export type EvidenceChain = {
  conclusion: string;
  /** true only when every step carries >= 1 evidence item. */
  isComplete: boolean;
  steps: ReasoningStep[];
};

export type ReasoningResult = {
  question: string;
  conclusion: string;
  confidence: number;
  steps: ReasoningStep[];
  evidenceChain: EvidenceChain;
  knowledgeGaps: string[];
  causalLinks: CausalChain[];
};

export type CausalChain = {
  causeEventType: string;
  effectEventType: string;
  avgDelayMs: number;
  confidence: number;
  sampleCount: number;
};

export type EventRecord = {
  eventType: string;
  occurredAt: Date;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * A pattern detected by detectPatterns() across multiple source systems.
 * Requirements: 2.4, 2.5
 */
export type DetectedPattern = {
  /** Stable, deterministic identifier derived from affected systems + metric. */
  patternId: string;
  type: 'cross_system_kpi_degradation' | 'correlated_anomaly' | 'temporal_cascade';
  description: string;
  /** Must have >= 3 entries for cross-system patterns (Requirement 2.4). */
  affectedSystems: string[];
  /** Composite confidence score 0.0–1.0. */
  confidence: number;
  kpiMetric?: string;
  /** Entity IDs whose low-confidence readings contributed to the pattern. */
  entityIds: string[];
  detectedAt: Date;
  /** Time window used when the pattern was detected (milliseconds). */
  windowMs: number;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Minimum relationship confidence for a hop to be included in a traversal path (Property 3). */
const MIN_RELATIONSHIP_CONFIDENCE = 0.4;

/** Default maximum traversal depth (Requirement 2.2). */
const DEFAULT_MAX_HOPS = 3;

/**
 * Default causal-link detection window in milliseconds (5 minutes).
 * Configurable via the `identifyCausalLinks` options.
 */
const DEFAULT_CAUSAL_WINDOW_MS = 5 * 60 * 1000;

/**
 * Minimum occurrence count for a co-occurrence pair to be considered causal.
 */
const MIN_CAUSAL_SAMPLE_COUNT = 2;

/**
 * Confidence threshold below which an entity KPI is considered degraded.
 * Requirement 2.4: entities with confidence < 0.6 are flagged.
 */
const KPI_DEGRADATION_THRESHOLD = 0.6;

/**
 * Default time window for cross-system pattern detection (60 minutes).
 * Requirement 2.4: entities must share lastSyncedAt within the same window.
 */
const DEFAULT_PATTERN_WINDOW_MS = 60 * 60 * 1_000;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReasoningEngineService {
  private readonly logger = new Logger(ReasoningEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Traverse the knowledge graph from seed entities that match `question`
   * keywords up to `maxHops` relationship levels, accumulating ReasoningStep[]
   * at each hop.
   *
   * Tenant isolation: all queries include `organizationId` equality filter.
   *
   * @param question  Natural-language question used to seed the traversal.
   * @param orgId     Organization whose graph is queried (mandatory).
   * @param maxHops   Maximum relationship hops (default 3 per Requirement 2.2).
   */
  async multiHopReasoning(
    question: string,
    orgId: string,
    maxHops: number = DEFAULT_MAX_HOPS,
  ): Promise<ReasoningResult> {
    this.logger.debug(
      `multiHopReasoning orgId=${orgId} maxHops=${maxHops} q="${question}"`,
    );

    const steps: ReasoningStep[] = [];
    const knowledgeGaps: string[] = [];
    const visitedIds = new Set<string>();

    // ── 1. Seed entities: full-text match on displayName against the question ─
    const keywords = extractKeywords(question);
    const seedEntities = await this.prisma.knowledgeGraphEntity.findMany({
      where: {
        organizationId: orgId,
        syncStatus: { not: 'merged' },
        displayName: {
          contains: keywords[0] ?? '',
          mode: 'insensitive',
        },
      },
      take: 5,
    });

    if (seedEntities.length === 0) {
      knowledgeGaps.push(
        `No knowledge graph entities found matching "${question}" for this organisation.`,
      );
    }

    // BFS queue: each item carries the current entity id and hop depth
    const queue: Array<{ entityId: string; hop: number }> = seedEntities.map(
      (e) => ({ entityId: e.id, hop: 0 }),
    );

    // ── 2. BFS traversal up to maxHops ────────────────────────────────────────
    while (queue.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { entityId, hop } = queue.shift()!;

      if (visitedIds.has(entityId) || hop > maxHops) continue;
      visitedIds.add(entityId);

      // Load entity metadata
      const entity = await this.prisma.knowledgeGraphEntity.findFirst({
        where: { id: entityId, organizationId: orgId },
      });

      if (!entity) {
        knowledgeGaps.push(`Entity ${entityId} not found in organisation graph.`);
        continue;
      }

      // Find outgoing relationships with confidence >= threshold (Property 3)
      const relationships = await this.prisma.knowledgeGraphRelationship.findMany({
        where: {
          organizationId: orgId,
          fromEntityId: entityId,
          confidence: { gte: MIN_RELATIONSHIP_CONFIDENCE },
        },
      });

      if (relationships.length === 0 && hop < maxHops) {
        knowledgeGaps.push(
          `No qualifying relationships from entity "${entity.displayName}" (${entity.entityType}).`,
        );
      }

      for (const rel of relationships) {
        // Build evidence array from the stored JSON field
        const rawEvidence = rel.evidence;
        const evidenceArr: string[] = Array.isArray(rawEvidence)
          ? (rawEvidence as string[]).filter((e) => typeof e === 'string')
          : typeof rawEvidence === 'string'
          ? [rawEvidence]
          : [`${rel.relationshipType} from ${entity.displayName}`];

        // Guarantee at least one evidence item
        if (evidenceArr.length === 0) {
          evidenceArr.push(
            `Relationship ${rel.relationshipType} between ${entity.sourceEntityId} and ${rel.toEntityId}`,
          );
        }

        const step: ReasoningStep = {
          hop,
          entityId: entity.id,
          entityType: entity.entityType,
          relationship: rel.relationshipType,
          evidence: evidenceArr,
          confidence: rel.confidence,
        };

        steps.push(step);

        // Enqueue target entity for next hop if we haven't reached the limit
        if (hop + 1 <= maxHops && !visitedIds.has(rel.toEntityId)) {
          queue.push({ entityId: rel.toEntityId, hop: hop + 1 });
        }
      }
    }

    // ── 3. Derive conclusion and overall confidence ───────────────────────────
    const overallConfidence = computeOverallConfidence(steps);
    const conclusion = deriveConclusion(question, steps, knowledgeGaps);

    // ── 4. Build evidence chain ───────────────────────────────────────────────
    const evidenceChain = this.buildEvidenceChain(conclusion, steps);

    // ── 5. Identify causal links from org snapshot events ────────────────────
    const causalLinks = await this.loadAndAnalyseOrgEvents(orgId);

    return {
      question,
      conclusion,
      confidence: overallConfidence,
      steps,
      evidenceChain,
      knowledgeGaps,
      causalLinks,
    };
  }

  /**
   * Validates that every reasoning step has ≥ 1 evidence item and assembles
   * the EvidenceChain.
   *
   * Property 4: isComplete is false when any step has an empty evidence array.
   *
   * @param conclusion  Human-readable conclusion string.
   * @param steps       Accumulated reasoning steps from multiHopReasoning.
   */
  buildEvidenceChain(conclusion: string, steps: ReasoningStep[]): EvidenceChain {
    const isComplete =
      steps.length > 0 && steps.every((s) => s.evidence.length >= 1);

    return {
      conclusion,
      isComplete,
      steps,
    };
  }

  /**
   * Temporal causal-link analysis.
   *
   * Scans `EventRecord[]` for pairs where event B of type T2 consistently
   * follows event A of type T1 within `windowMs` milliseconds.
   *
   * A causal pair is emitted when:
   *  - At least MIN_CAUSAL_SAMPLE_COUNT occurrences are found.
   *  - confidence = sampleCount / totalOccurrencesOfCause (capped at 1.0).
   *
   * @param events    Time-ordered (or unordered) event records.
   * @param windowMs  Co-occurrence window (default 5 min).
   */
  identifyCausalLinks(
    events: EventRecord[],
    windowMs: number = DEFAULT_CAUSAL_WINDOW_MS,
  ): CausalChain[] {
    if (events.length < 2) return [];

    // Sort chronologically
    const sorted = [...events].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );

    // Map: causeType → effectType → { totalDelayMs, count }
    const pairStats = new Map<
      string,
      Map<string, { totalDelayMs: number; count: number }>
    >();

    // Count total occurrences per event type (denominator for confidence)
    const causeOccurrences = new Map<string, number>();

    for (let i = 0; i < sorted.length; i++) {
      const cause = sorted[i];
      causeOccurrences.set(
        cause.eventType,
        (causeOccurrences.get(cause.eventType) ?? 0) + 1,
      );

      // Look ahead within the window
      for (let j = i + 1; j < sorted.length; j++) {
        const effect = sorted[j];
        const delayMs =
          effect.occurredAt.getTime() - cause.occurredAt.getTime();

        if (delayMs > windowMs) break; // beyond window; sorted so no need to continue

        if (effect.eventType === cause.eventType) continue; // same type = not causal

        // Record the pair
        if (!pairStats.has(cause.eventType)) {
          pairStats.set(cause.eventType, new Map());
        }
        const effectMap = pairStats.get(cause.eventType)!;
        const existing = effectMap.get(effect.eventType);
        if (existing) {
          existing.totalDelayMs += delayMs;
          existing.count += 1;
        } else {
          effectMap.set(effect.eventType, { totalDelayMs: delayMs, count: 1 });
        }
      }
    }

    // Emit CausalChain for pairs above the minimum sample threshold
    const chains: CausalChain[] = [];

    for (const [causeType, effectMap] of pairStats) {
      const totalCause = causeOccurrences.get(causeType) ?? 1;
      for (const [effectType, stats] of effectMap) {
        if (stats.count < MIN_CAUSAL_SAMPLE_COUNT) continue;

        chains.push({
          causeEventType: causeType,
          effectEventType: effectType,
          avgDelayMs: Math.round(stats.totalDelayMs / stats.count),
          confidence: Math.min(stats.count / totalCause, 1.0),
          sampleCount: stats.count,
        });
      }
    }

    // Sort by confidence descending
    return chains.sort((a, b) => b.confidence - a.confidence);
  }

  // ── Traversal path check (used by Property 3 test) ────────────────────────

  /**
   * Validates that a given list of steps forms a valid traversal path —
   * i.e. every step's confidence is >= MIN_RELATIONSHIP_CONFIDENCE.
   *
   * Exposed for unit / property testing (Property 3).
   */
  traversePath(steps: ReasoningStep[]): boolean {
    return steps.every((s) => s.confidence >= MIN_RELATIONSHIP_CONFIDENCE);
  }

  // ── Cross-system pattern detection (Requirement 2.4, 2.5) ─────────────────

  /**
   * Detects cross-system KPI degradation patterns by correlating entities whose
   * `confidence` has fallen below the degradation threshold and whose
   * `lastSyncedAt` timestamps fall within the same time window.
   *
   * Detection rules (Requirement 2.4):
   *  - Only proceeds when ≥ 3 distinct `sourceSystem` values exist for the org.
   *  - Entity A (sourceSystem=X) has confidence < 0.6.
   *  - Entity B (sourceSystem=Y, Y≠X) has confidence < 0.6.
   *  - Both entities have `lastSyncedAt` within `windowMs` of each other.
   *  - The pattern spans ≥ 3 systems.
   *
   * Persists all detected patterns to `EnterpriseSnapshot.insights` (Requirement 2.5).
   * Uses an upsert so the snapshot row is created if absent, and insights are
   * merged with any pre-existing ones (deduplication by patternId).
   *
   * Tenant isolation: all queries include `organizationId` equality filter.
   *
   * @param orgId       Organisation whose entities are analysed (mandatory).
   * @param dataSources Optional allow-list of `sourceSystem` values to include.
   *                    When omitted all systems for the org are analysed.
   * @param windowMs    Co-occurrence window in milliseconds (default 60 min).
   */
  async detectPatterns(
    orgId: string,
    dataSources?: string[],
    windowMs: number = DEFAULT_PATTERN_WINDOW_MS,
  ): Promise<DetectedPattern[]> {
    this.logger.debug(
      `detectPatterns orgId=${orgId} windowMs=${windowMs} dataSources=${dataSources?.join(',') ?? 'all'}`,
    );

    // ── 1. Load active entities for the org ───────────────────────────────────
    const entities = await this.prisma.knowledgeGraphEntity.findMany({
      where: {
        organizationId: orgId,
        syncStatus: { not: 'merged' },
        ...(dataSources && dataSources.length > 0
          ? { sourceSystem: { in: dataSources } }
          : {}),
      },
      select: {
        id: true,
        sourceSystem: true,
        displayName: true,
        entityType: true,
        confidence: true,
        lastSyncedAt: true,
      },
    });

    // ── 2. Group by sourceSystem ───────────────────────────────────────────────
    const bySystem = new Map<string, typeof entities>();
    for (const entity of entities) {
      const bucket = bySystem.get(entity.sourceSystem) ?? [];
      bucket.push(entity);
      bySystem.set(entity.sourceSystem, bucket);
    }

    const distinctSystems = [...bySystem.keys()];

    // Requirement 2.4: bail out early if fewer than 3 distinct source systems
    if (distinctSystems.length < 3) {
      this.logger.debug(
        `detectPatterns: only ${distinctSystems.length} distinct sourceSystem(s) — skipping cross-system analysis`,
      );
      return [];
    }

    // ── 3. Identify degraded entities per system ───────────────────────────────
    // An entity is degraded when confidence < KPI_DEGRADATION_THRESHOLD.
    const degradedBySystem = new Map<
      string,
      Array<{ id: string; confidence: number; lastSyncedAt: Date; displayName: string; entityType: string }>
    >();

    for (const [system, systemEntities] of bySystem) {
      const degraded = systemEntities.filter(
        (e) => e.confidence < KPI_DEGRADATION_THRESHOLD,
      );
      if (degraded.length > 0) {
        degradedBySystem.set(system, degraded);
      }
    }

    const degradedSystems = [...degradedBySystem.keys()];

    // Need degradation in ≥ 3 systems to flag a cross-system pattern
    if (degradedSystems.length < 3) {
      this.logger.debug(
        `detectPatterns: degradation found in only ${degradedSystems.length} system(s) — no cross-system pattern`,
      );
      return [];
    }

    // ── 4. Find temporal co-occurrence across systems ──────────────────────────
    // Collect all degraded entities as a flat list with their system labels.
    const allDegraded: Array<{
      id: string;
      system: string;
      confidence: number;
      lastSyncedAt: Date;
      displayName: string;
      entityType: string;
    }> = [];

    for (const [system, degraded] of degradedBySystem) {
      for (const e of degraded) {
        allDegraded.push({ ...e, system });
      }
    }

    // Sort by lastSyncedAt ascending for sliding-window scan
    allDegraded.sort((a, b) => a.lastSyncedAt.getTime() - b.lastSyncedAt.getTime());

    // Sliding window: for each entity A, find all entities B (different system)
    // whose lastSyncedAt falls within ±windowMs/2 of A's lastSyncedAt.
    // We look forward-only (B.lastSyncedAt >= A.lastSyncedAt) to avoid double-counting.
    //
    // A pattern cluster is a set of (entity, system) pairs co-occurring in the window.
    const detectedPatterns: DetectedPattern[] = [];

    // Track pattern signatures we've already emitted (avoid duplicates per run)
    const emittedSignatures = new Set<string>();

    for (let i = 0; i < allDegraded.length; i++) {
      const anchor = allDegraded[i];
      const windowStart = anchor.lastSyncedAt.getTime();
      const windowEnd = windowStart + windowMs;

      // Collect all co-occurring degraded entities within the window
      const coOccurring: typeof allDegraded = [anchor];

      for (let j = i + 1; j < allDegraded.length; j++) {
        const candidate = allDegraded[j];
        if (candidate.lastSyncedAt.getTime() > windowEnd) break;
        if (candidate.system !== anchor.system) {
          coOccurring.push(candidate);
        }
      }

      // Gather distinct systems involved
      const involvedSystems = [...new Set(coOccurring.map((e) => e.system))];

      // Only emit a pattern when ≥ 3 distinct systems are represented
      if (involvedSystems.length < 3) continue;

      // Deduplicate: use sorted system list as signature
      const signature = involvedSystems.sort().join('|');
      if (emittedSignatures.has(signature)) continue;
      emittedSignatures.add(signature);

      // Build deterministic patternId from orgId + signature + window start
      const patternId = buildPatternId(orgId, signature, windowStart);

      // Compute composite confidence: average of individual entity confidences
      const avgConfidence =
        coOccurring.reduce((sum, e) => sum + e.confidence, 0) / coOccurring.length;

      // Derive a representative KPI metric from entity types
      const entityTypes = [...new Set(coOccurring.map((e) => e.entityType))];
      const kpiMetric = `confidence_degradation:${entityTypes.join(',')}`;

      const description =
        `Cross-system KPI degradation detected across ${involvedSystems.length} systems ` +
        `(${involvedSystems.join(', ')}). ` +
        `${coOccurring.length} entities showed confidence below ${KPI_DEGRADATION_THRESHOLD} ` +
        `within a ${Math.round(windowMs / 60_000)}-minute window.`;

      detectedPatterns.push({
        patternId,
        type: 'cross_system_kpi_degradation',
        description,
        affectedSystems: involvedSystems,
        confidence: parseFloat(avgConfidence.toFixed(4)),
        kpiMetric,
        entityIds: coOccurring.map((e) => e.id),
        detectedAt: new Date(),
        windowMs,
      });
    }

    // ── 5. Persist patterns to EnterpriseSnapshot.insights ────────────────────
    if (detectedPatterns.length > 0) {
      await this.persistInsights(orgId, detectedPatterns);
    }

    this.logger.log(
      `detectPatterns orgId=${orgId}: detected ${detectedPatterns.length} pattern(s) across ${degradedSystems.length} degraded system(s)`,
    );

    return detectedPatterns;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Loads EnterpriseSnapshot.timeline JSON for the org and converts it to
   * EventRecord[] for causal analysis.
   */
  private async loadAndAnalyseOrgEvents(orgId: string): Promise<CausalChain[]> {
    try {
      const snapshot = await this.prisma.enterpriseSnapshot.findUnique({
        where: { organizationId: orgId },
        select: { timeline: true },
      });

      if (!snapshot?.timeline) return [];

      const raw = snapshot.timeline as unknown;
      if (!Array.isArray(raw)) return [];

      const events: EventRecord[] = (raw as Record<string, unknown>[])
        .filter((item) => typeof item === 'object' && item !== null)
        .map((item) => ({
          eventType: String(item['type'] ?? item['eventType'] ?? 'unknown'),
          occurredAt: item['date']
            ? new Date(String(item['date']))
            : item['occurredAt']
            ? new Date(String(item['occurredAt']))
            : new Date(0),
          entityId: item['entityId'] ? String(item['entityId']) : undefined,
          metadata: (item['metadata'] as Record<string, unknown>) ?? {},
        }))
        .filter((e) => !isNaN(e.occurredAt.getTime()));

      return this.identifyCausalLinks(events);
    } catch (err) {
      this.logger.warn(`Failed to analyse org events for ${orgId}: ${err}`);
      return [];
    }
  }

  /**
   * Upserts detected patterns into `EnterpriseSnapshot.insights` for the org.
   *
   * Merges new patterns with existing ones (deduplicated by patternId).
   * If the snapshot row does not exist it is created with sensible defaults so
   * that pattern data is never lost.
   *
   * Requirement 2.5: insights must be persisted for dashboard surfacing.
   */
  private async persistInsights(
    orgId: string,
    newPatterns: DetectedPattern[],
  ): Promise<void> {
    try {
      // Load current insights so we can merge without overwriting unrelated entries
      const existing = await this.prisma.enterpriseSnapshot.findUnique({
        where: { organizationId: orgId },
        select: { insights: true },
      });

      let currentInsights: DetectedPattern[] = [];
      if (existing?.insights) {
        const raw = existing.insights as unknown;
        if (Array.isArray(raw)) {
          currentInsights = raw as DetectedPattern[];
        }
      }

      // Merge: replace existing pattern if same patternId, append otherwise
      const patternMap = new Map<string, DetectedPattern>(
        currentInsights.map((p) => [p.patternId, p]),
      );
      for (const pattern of newPatterns) {
        patternMap.set(pattern.patternId, pattern);
      }

      const mergedInsights = [...patternMap.values()];

      await this.prisma.enterpriseSnapshot.upsert({
        where: { organizationId: orgId },
        update: {
          insights: mergedInsights as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
        create: {
          organizationId: orgId,
          connectorId: 'reasoning-engine',
          connectorName: 'Reasoning Engine',
          healthScore: 100,
          connectedSystems: 0,
          recordCount: 0,
          openAlerts: 0,
          openDecisions: 0,
          briefHighlight: 'Pattern detection initialised',
          timeline: [],
          insights: mergedInsights as unknown as import('@prisma/client').Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      });

      this.logger.debug(
        `persistInsights orgId=${orgId}: upserted ${newPatterns.length} new pattern(s), total=${mergedInsights.length}`,
      );
    } catch (err) {
      this.logger.error(`persistInsights failed for orgId=${orgId}: ${err}`);
      // Do not re-throw — persistence failure must not surface to the caller.
    }
  }
}

// ─── Module-level pure helpers (no DB dependency) ────────────────────────────

/**
 * Extracts meaningful keywords from a question string.
 * Strips common stop words and returns the remaining tokens.
 */
function extractKeywords(question: string): string[] {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'shall', 'can',
    'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about',
    'that', 'this', 'which', 'what', 'who', 'how', 'why', 'when',
    'where', 'and', 'or', 'not', 'no', 'nor',
  ]);

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Computes an overall confidence score as the weighted average of all steps,
 * weighted by hop depth (earlier hops are more reliable).
 *
 * Falls back to 0.5 when no steps are available.
 */
function computeOverallConfidence(steps: ReasoningStep[]): number {
  if (steps.length === 0) return 0.5;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const step of steps) {
    const weight = 1 / (step.hop + 1); // hop 0 weight=1, hop 1 weight=0.5, …
    weightedSum += step.confidence * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

/**
 * Produces a human-readable conclusion from the traversal result.
 */
function deriveConclusion(
  question: string,
  steps: ReasoningStep[],
  knowledgeGaps: string[],
): string {
  if (steps.length === 0) {
    return `Unable to answer "${question}" — no connected knowledge graph entities found.`;
  }

  if (knowledgeGaps.length > 0 && steps.length < 3) {
    return (
      `Partial answer to "${question}": ${steps.length} relationship(s) found ` +
      `but traversal was incomplete due to missing data.`
    );
  }

  const uniqueTypes = [...new Set(steps.map((s) => s.entityType))].join(', ');
  const hopsReached = Math.max(...steps.map((s) => s.hop));

  return (
    `Reasoning for "${question}" traversed ${steps.length} relationship(s) ` +
    `across ${hopsReached + 1} hop(s) involving entity types: ${uniqueTypes}.`
  );
}