import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Public Types ─────────────────────────────────────────────────────────────

/**
 * A pair of entities identified as potential duplicates with the reason
 * and similarity score that triggered the candidate.
 *
 * `sourceEntityId` = lower-confidence entity (will be merged away).
 * `targetEntityId` = higher-confidence entity (the survivor).
 */
export type DuplicateCandidate = {
  sourceEntityId: string; // lower-confidence entity (Postgres PK)
  targetEntityId: string; // higher-confidence entity (Postgres PK)
  similarity: number;     // 0.0 – 1.0
  reason: 'levenshtein_name' | 'exact_source_id';
};

/**
 * The result of a single merge operation.
 */
export type MergeResult = {
  mergedEntityId: string;         // the entity that was merged (syncStatus='merged')
  survivorEntityId: string;       // the surviving entity
  relationshipsRepointed: number; // total relationship records updated
  similarity: number;
};

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * EntityResolverService
 *
 * Performs entity deduplication (entity resolution) on the knowledge graph
 * for a given organisation.
 *
 * Strategy
 * ────────
 * 1. `exact_source_id`  — two entities share the same (sourceSystem,
 *    sourceEntityId) are already deduplicated by a DB UNIQUE constraint, but
 *    entities from *different* source systems can refer to the same real-world
 *    object.  When `sourceEntityId` values match exactly across systems, that
 *    is a strong merge signal (similarity = 1.0).
 *
 * 2. `levenshtein_name` — compute a normalised Levenshtein similarity between
 *    `displayName` strings for entities of the same `entityType`; pairs above
 *    `threshold` (default 0.85) are merge candidates.
 *
 * Only the entity with lower `confidence` is merged into the one with higher
 * `confidence`.  All relationship rows that reference the source entity are
 * repointed to the survivor inside a single Prisma transaction.
 */
@Injectable()
export class EntityResolverService {
  private readonly logger = new Logger(EntityResolverService.name);

  /** Default similarity threshold for `levenshtein_name` strategy. */
  static readonly DEFAULT_THRESHOLD = 0.85;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Run the full deduplication pipeline for `orgId`.
   *
   * 1. Find all duplicate candidates above `threshold`.
   * 2. Merge each candidate pair (lower-confidence → higher-confidence).
   * 3. Return the list of `MergeResult` records.
   */
  async resolveEntities(
    orgId: string,
    threshold = EntityResolverService.DEFAULT_THRESHOLD,
  ): Promise<MergeResult[]> {
    this.logger.log(`resolveEntities: start org=${orgId} threshold=${threshold}`);

    const candidates = await this.findDuplicates(orgId, threshold);

    this.logger.log(`resolveEntities: found ${candidates.length} candidate pair(s)`);

    const results: MergeResult[] = [];
    // Track merged entity IDs so we don't attempt to merge an already-merged entity
    const alreadyMerged = new Set<string>();

    for (const candidate of candidates) {
      if (
        alreadyMerged.has(candidate.sourceEntityId) ||
        alreadyMerged.has(candidate.targetEntityId)
      ) {
        this.logger.debug(
          `Skipping candidate (${candidate.sourceEntityId} → ${candidate.targetEntityId}): already merged in this run`,
        );
        continue;
      }

      try {
        const result = await this.mergeEntities(
          candidate.sourceEntityId,
          candidate.targetEntityId,
          orgId,
        );
        results.push({ ...result, similarity: candidate.similarity });
        alreadyMerged.add(result.mergedEntityId);
      } catch (err) {
        this.logger.error(
          `Failed to merge ${candidate.sourceEntityId} → ${candidate.targetEntityId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`resolveEntities: completed ${results.length} merge(s) for org=${orgId}`);
    return results;
  }

  /**
   * Compute normalised Levenshtein similarity between two strings.
   *
   * Returns a value in [0.0, 1.0] where 1.0 means identical strings.
   * Empty strings: both empty → 1.0; one empty → 0.0.
   */
  computeSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const dist = levenshteinDistance(a, b);
    return 1 - dist / maxLen;
  }

  /**
   * Scan all active entities for `orgId` and return pairs that exceed the
   * similarity threshold.
   *
   * Comparison rules:
   * - Entities are only compared within the same `entityType`.
   * - An `exact_source_id` match (same `sourceEntityId` across different source
   *   systems) immediately yields a candidate at similarity 1.0.
   * - Otherwise, `displayName` strings are compared using Levenshtein.
   * - In each pair, the entity with *lower* `confidence` becomes `sourceEntityId`
   *   (will be merged away) and the one with *higher* confidence becomes
   *   `targetEntityId` (the survivor).
   * - If confidence is equal, the entity created earlier survives.
   */
  async findDuplicates(
    orgId: string,
    threshold = EntityResolverService.DEFAULT_THRESHOLD,
  ): Promise<DuplicateCandidate[]> {
    // Load all active entities for this org
    const entities = await this.prisma.knowledgeGraphEntity.findMany({
      where: {
        organizationId: orgId,
        syncStatus: 'active',
      },
      orderBy: { createdAt: 'asc' },
    });

    const candidates: DuplicateCandidate[] = [];

    // Group by entityType for O(n²) within each type group
    const byType = groupBy(entities, (e) => e.entityType);

    for (const group of Object.values(byType)) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];

          // ── exact_source_id: same sourceEntityId across different source systems ──
          if (
            a.sourceEntityId === b.sourceEntityId &&
            a.sourceSystem !== b.sourceSystem
          ) {
            const [source, target] = pickSourceAndTarget(a, b);
            candidates.push({
              sourceEntityId: source.id,
              targetEntityId: target.id,
              similarity: 1.0,
              reason: 'exact_source_id',
            });
            continue;
          }

          // ── levenshtein_name: compare displayName strings ──────────────────
          const sim = this.computeSimilarity(
            a.displayName.toLowerCase().trim(),
            b.displayName.toLowerCase().trim(),
          );
          if (sim >= threshold) {
            const [source, target] = pickSourceAndTarget(a, b);
            candidates.push({
              sourceEntityId: source.id,
              targetEntityId: target.id,
              similarity: sim,
              reason: 'levenshtein_name',
            });
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Merge `sourceId` into `targetId` inside a single Prisma transaction:
   *
   * 1. Verify both entities belong to `orgId`.
   * 2. Repoint all `KnowledgeGraphRelationship` rows that reference `sourceId`.
   * 3. Mark the source entity as `syncStatus='merged'`, set `mergedIntoId`.
   *
   * Returns a `MergeResult` (caller fills in the `similarity` field).
   */
  async mergeEntities(
    sourceId: string,
    targetId: string,
    orgId: string,
  ): Promise<MergeResult> {
    // Load both entities outside the transaction so we can throw early
    const [source, target] = await Promise.all([
      this.prisma.knowledgeGraphEntity.findFirst({
        where: { id: sourceId, organizationId: orgId },
      }),
      this.prisma.knowledgeGraphEntity.findFirst({
        where: { id: targetId, organizationId: orgId },
      }),
    ]);

    if (!source) {
      throw new NotFoundException(
        `Source entity ${sourceId} not found in org ${orgId}`,
      );
    }
    if (!target) {
      throw new NotFoundException(
        `Target entity ${targetId} not found in org ${orgId}`,
      );
    }

    // Perform all writes atomically
    const { fromUpdated, toUpdated } = await this.prisma.$transaction(async (tx) => {
      // 3. Repoint relationships where source is the "from" end
      const fromResult = await tx.knowledgeGraphRelationship.updateMany({
        where: {
          organizationId: orgId,
          fromEntityId: sourceId,
        },
        data: { fromEntityId: targetId },
      });

      // 4. Repoint relationships where source is the "to" end
      const toResult = await tx.knowledgeGraphRelationship.updateMany({
        where: {
          organizationId: orgId,
          toEntityId: sourceId,
        },
        data: { toEntityId: targetId },
      });

      // 5. Mark the source entity as merged
      await tx.knowledgeGraphEntity.update({
        where: { id: sourceId },
        data: {
          syncStatus: 'merged',
          mergedIntoId: targetId,
        },
      });

      return { fromUpdated: fromResult.count, toUpdated: toResult.count };
    });

    const relationshipsRepointed = fromUpdated + toUpdated;

    this.logger.log(
      `mergeEntities: merged ${sourceId} → ${targetId} (${relationshipsRepointed} relationship(s) repointed)`,
    );

    return {
      mergedEntityId: sourceId,
      survivorEntityId: targetId,
      relationshipsRepointed,
      similarity: 0, // caller sets the actual similarity value
    };
  }
}

// ─── Pure utility functions ───────────────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * Uses the standard Wagner–Fischer dynamic programming algorithm with a
 * two-row optimisation (O(min(m,n)) space).
 */
function levenshteinDistance(a: string, b: string): number {
  // Ensure `a` is the shorter string to minimise memory usage
  if (a.length > b.length) return levenshteinDistance(b, a);

  const m = a.length;
  const n = b.length;

  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array<number>(m + 1);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      if (a[i - 1] === b[j - 1]) {
        curr[i] = prev[i - 1];
      } else {
        curr[i] = 1 + Math.min(prev[i - 1], prev[i], curr[i - 1]);
      }
    }
    // Swap rows without allocation
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}

/**
 * Given two entities, determine which is the "source" (to be merged away, i.e.
 * lower confidence) and which is the "target" (the survivor, i.e. higher
 * confidence).
 *
 * Tie-breaking: the entity created *earlier* survives.
 */
function pickSourceAndTarget<
  T extends { id: string; confidence: number; createdAt: Date },
>(a: T, b: T): [T, T] {
  if (a.confidence < b.confidence) return [a, b];
  if (b.confidence < a.confidence) return [b, a];
  // Confidence equal → older entity survives
  return a.createdAt <= b.createdAt ? [b, a] : [a, b];
}

/**
 * Group an array of items by a key function.
 */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
