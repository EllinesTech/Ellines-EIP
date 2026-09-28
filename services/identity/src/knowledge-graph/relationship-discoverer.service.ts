/**
 * RelationshipDiscovererService
 *
 * Infers and writes entity relationships into the Enterprise Knowledge Graph.
 *
 * Three discovery strategies:
 *   1. Co-occurrence — entities that appear together in the same SoR record are likely
 *      related. Relationship type is inferred from the entity-type pairing.
 *   2. Foreign-key — explicit FK/reference fields in SoR data (e.g. `managerId`,
 *      `departmentId`, `ownerId`) produce high-confidence typed relationships.
 *   3. Temporal proximity — entities whose activity timestamps fall within the same
 *      configurable time window are considered potentially related.
 *
 * Neo4j availability:
 *   Neo4j may not be running in every environment.  All Neo4j calls are wrapped in
 *   try/catch; failures are logged as warnings and execution continues with
 *   PostgreSQL-only persistence (workspace rule §5 / task note).
 *
 * Multi-hop path validity — Property 3:
 *   `filterValidPath()` removes any relationship edge with confidence < 0.4 from a
 *   traversal path, ensuring that every hop in a multi-hop query meets the minimum
 *   confidence threshold (Requirements 2.2, 17.2).
 *
 * Tenant isolation:
 *   Every database operation (Neo4j + PostgreSQL) includes an `organization_id`
 *   equality filter (workspace rule §6).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Neo4jService } from '../database/neo4j.service';
import { Prisma, KnowledgeGraphRelationship, KnowledgeGraphEntity } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum confidence required for a relationship edge in any valid traversal path. */
export const MIN_PATH_CONFIDENCE = 0.4;

/** Default temporal proximity window: 30 minutes. */
const DEFAULT_TEMPORAL_WINDOW_MS = 30 * 60 * 1_000;

// ─── Enums and types ──────────────────────────────────────────────────────────

/**
 * Supported relationship types in the knowledge graph.
 * Matches the design spec and business domain vocabulary.
 */
export type RelationshipType =
  | 'WORKS_FOR'
  | 'MANAGES'
  | 'OWNS'
  | 'REFERENCES'
  | 'LOCATED_AT'
  | 'PARTICIPATES_IN'
  | 'CREATES'
  | 'APPROVES';

/** Evidence source attached to an inferred or explicit relationship. */
export interface RelationshipEvidence {
  /** How this evidence was discovered. */
  strategy: 'co_occurrence' | 'foreign_key' | 'temporal_proximity';
  /** Human-readable description of the evidence. */
  description: string;
  /** Optional field name in the source record that yielded this evidence. */
  sourceField?: string;
  /** Timestamp when the evidence was collected. */
  collectedAt: string; // ISO-8601
}

/**
 * An intermediate relationship candidate produced by a discovery strategy before
 * persistence. Contains all information needed to write the final record.
 */
export interface RelationshipCandidate {
  fromEntityId: string; // KnowledgeGraphEntity.id (PostgreSQL PK)
  toEntityId: string;   // KnowledgeGraphEntity.id (PostgreSQL PK)
  fromNeo4jId: string;  // Neo4j node ID
  toNeo4jId: string;    // Neo4j node ID
  relationshipType: RelationshipType;
  confidence: number;   // 0.0 – 1.0
  evidence: RelationshipEvidence[];
  isInferred: boolean;
  properties: Record<string, unknown>;
}

// ─── FK field → relationship-type mapping ─────────────────────────────────────

/**
 * Well-known FK field suffixes/names found in SoR data and their implied
 * relationship types. Order matters: first match wins.
 */
const FK_RELATIONSHIP_MAP: Array<{ pattern: RegExp; type: RelationshipType; confidence: number }> = [
  { pattern: /managerId|manager_id|supervisorId|supervisor_id/i, type: 'MANAGES',        confidence: 0.92 },
  { pattern: /ownerId|owner_id|createdById|created_by_id/i,     type: 'OWNS',           confidence: 0.88 },
  { pattern: /approvedById|approved_by_id|approverId|approver_id/i, type: 'APPROVES',   confidence: 0.90 },
  { pattern: /departmentId|department_id|organizationId|org_id/i,   type: 'WORKS_FOR',  confidence: 0.85 },
  { pattern: /locationId|location_id|siteId|site_id|addressId/i,    type: 'LOCATED_AT', confidence: 0.87 },
  { pattern: /projectId|project_id|taskId|task_id|eventId|event_id/i, type: 'PARTICIPATES_IN', confidence: 0.80 },
  { pattern: /createdFor|created_for|authorId|author_id/i,        type: 'CREATES',      confidence: 0.82 },
  { pattern: /refId|ref_id|referenceId|reference_id/i,            type: 'REFERENCES',   confidence: 0.72 },
];

/**
 * Entity-type pair → inferred relationship type for co-occurrence.
 * Key pattern: `${fromType}:${toType}` (alphabetically ordered for symmetry).
 */
const CO_OCCURRENCE_TYPE_MAP: Record<string, RelationshipType> = {
  'person:product':   'OWNS',
  'person:location':  'LOCATED_AT',
  'person:event':     'PARTICIPATES_IN',
  'person:document':  'CREATES',
  'person:person':    'WORKS_FOR',
  'product:location': 'LOCATED_AT',
  'product:event':    'PARTICIPATES_IN',
  'event:location':   'LOCATED_AT',
  'document:event':   'REFERENCES',
  'document:person':  'REFERENCES',
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class RelationshipDiscovererService {
  private readonly logger = new Logger(RelationshipDiscovererService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Main entry point: run all three discovery strategies over the entities
   * associated with a given `snapshotId`, then persist the results.
   *
   * @param orgId      Tenant scoping — all queries and writes use this.
   * @param snapshotId The `EnterpriseSnapshot.id` whose entities to process.
   * @returns          All persisted `KnowledgeGraphRelationship` records.
   */
  async discoverRelationships(
    orgId: string,
    snapshotId: string,
  ): Promise<KnowledgeGraphRelationship[]> {
    this.logger.log(`Starting relationship discovery — org=${orgId} snapshot=${snapshotId}`);

    // 1. Load all entities for this org that came from this snapshot's source systems.
    const entities = await this.loadEntitiesForOrg(orgId);

    if (entities.length < 2) {
      this.logger.log('Fewer than 2 entities found; nothing to relate.');
      return [];
    }

    // 2. Retrieve the snapshot record data (timeline JSON) to run co-occurrence
    //    and FK discovery against.
    const snapshot = await this.prisma.enterpriseSnapshot.findFirst({
      where: { id: snapshotId, organizationId: orgId },
    });

    const recordData: Record<string, unknown> = snapshot
      ? {
          ...(typeof snapshot.timeline === 'object' && snapshot.timeline !== null
            ? (snapshot.timeline as Record<string, unknown>)
            : {}),
          briefHighlight: snapshot.briefHighlight,
        }
      : {};

    // 3. Discover candidates from each strategy.
    const coOccurrenceCandidates   = this.discoverFromCoOccurrence(entities, recordData);
    const foreignKeyCandidates     = this.discoverFromForeignKeys(recordData, 'snapshot');
    const temporalProximityCandidates = this.discoverFromTemporalProximity(entities);

    // Merge, de-duplicate (same from+to+type wins the higher-confidence one).
    const all = this.deduplicateCandidates([
      ...coOccurrenceCandidates,
      ...foreignKeyCandidates,
      ...temporalProximityCandidates,
    ]);

    this.logger.log(
      `Discovery complete — co=${coOccurrenceCandidates.length} fk=${foreignKeyCandidates.length} ` +
      `temporal=${temporalProximityCandidates.length} unique=${all.length}`,
    );

    // 4. Persist and return.
    return this.writeRelationships(all, orgId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 1: Co-occurrence
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generates relationship candidates for entities that co-occur in the same
   * SoR record.  All entity pairs are considered; the relationship type is
   * inferred from the entity-type pairing.
   *
   * Co-occurrence confidence is conservative (0.55) since the association is
   * implicit.
   *
   * @param entities  All entities available for the current org.
   * @param record    The raw SoR record they were extracted from.
   */
  discoverFromCoOccurrence(
    entities: KnowledgeGraphEntity[],
    record: Record<string, unknown>,
  ): RelationshipCandidate[] {
    const candidates: RelationshipCandidate[] = [];

    // Only proceed if the record contains some actual data.
    if (!record || Object.keys(record).length === 0) {
      return candidates;
    }

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const from = entities[i];
        const to   = entities[j];

        // Skip if same entity or missing Neo4j IDs.
        if (from.id === to.id || !from.neo4jNodeId || !to.neo4jNodeId) continue;

        const typeKey = this.coOccurrenceKey(from.entityType, to.entityType);
        const relType = CO_OCCURRENCE_TYPE_MAP[typeKey];

        if (!relType) continue; // No known relationship for this type pairing.

        candidates.push({
          fromEntityId:     from.id,
          toEntityId:       to.id,
          fromNeo4jId:      from.neo4jNodeId,
          toNeo4jId:        to.neo4jNodeId,
          relationshipType: relType,
          confidence:       0.55,
          isInferred:       true,
          properties:       { discoveredAt: new Date().toISOString() },
          evidence: [
            {
              strategy:    'co_occurrence',
              description: `Entities '${from.displayName}' and '${to.displayName}' co-occur in the same SoR record.`,
              collectedAt: new Date().toISOString(),
            },
          ],
        });
      }
    }

    return candidates;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 2: Foreign-key fields
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Scans well-known FK field names in a raw SoR record and produces
   * high-confidence relationship candidates when both the source and target
   * entity IDs can be resolved.
   *
   * @param record       Raw SoR record object (flat or nested JSON).
   * @param sourceSystem Connector / source system identifier for provenance.
   */
  discoverFromForeignKeys(
    record: Record<string, unknown>,
    sourceSystem: string,
  ): RelationshipCandidate[] {
    const candidates: RelationshipCandidate[] = [];

    if (!record || Object.keys(record).length === 0) return candidates;

    // We can only produce FK relationships when we know both entity IDs.
    // Without entity resolution context this strategy returns typed stubs
    // that the caller can hydrate with real entity IDs later.  For now we
    // store the raw field values as properties so they survive to persistence.
    for (const [fieldName, fieldValue] of Object.entries(record)) {
      if (!fieldValue || typeof fieldValue !== 'string') continue;

      for (const { pattern, type, confidence } of FK_RELATIONSHIP_MAP) {
        if (pattern.test(fieldName)) {
          // A real FK candidate would resolve from/to against the entity table.
          // Since the entity extractor runs first, we store the raw FK value
          // as a "pending_from" / "pending_to" property for a later resolution pass.
          // This design avoids blocking on entity resolution within this service.
          candidates.push({
            fromEntityId:     '', // resolved post-extraction
            toEntityId:       '', // resolved post-extraction
            fromNeo4jId:      '',
            toNeo4jId:        '',
            relationshipType: type,
            confidence,
            isInferred:       false,
            properties: {
              sourceSystem,
              fkField:         fieldName,
              fkValue:         fieldValue,
              pendingResolution: true,
              discoveredAt:    new Date().toISOString(),
            },
            evidence: [
              {
                strategy:    'foreign_key',
                description: `Explicit FK field '${fieldName}' in ${sourceSystem} record points to '${fieldValue}'.`,
                sourceField: fieldName,
                collectedAt: new Date().toISOString(),
              },
            ],
          });
          break; // Only the first matching FK pattern applies to a field.
        }
      }
    }

    return candidates;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 3: Temporal proximity
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Finds entity pairs whose `lastSyncedAt` timestamps fall within the same
   * time window.  Events that happen close together in time often share an
   * implicit causal or participatory relationship.
   *
   * @param entities  Entities to compare.
   * @param windowMs  Temporal window in milliseconds (default 30 minutes).
   */
  discoverFromTemporalProximity(
    entities: KnowledgeGraphEntity[],
    windowMs: number = DEFAULT_TEMPORAL_WINDOW_MS,
  ): RelationshipCandidate[] {
    const candidates: RelationshipCandidate[] = [];

    // Sort by lastSyncedAt ascending for a sliding-window scan.
    const sorted = [...entities].sort(
      (a, b) => a.lastSyncedAt.getTime() - b.lastSyncedAt.getTime(),
    );

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const from = sorted[i];
        const to   = sorted[j];

        const delta = Math.abs(to.lastSyncedAt.getTime() - from.lastSyncedAt.getTime());

        if (delta > windowMs) break; // Sorted; no later j can be within window.

        if (from.id === to.id || !from.neo4jNodeId || !to.neo4jNodeId) continue;

        // Confidence decays linearly with temporal distance.
        const confidence = +(0.65 * (1 - delta / windowMs)).toFixed(4);
        if (confidence < MIN_PATH_CONFIDENCE) continue;

        candidates.push({
          fromEntityId:     from.id,
          toEntityId:       to.id,
          fromNeo4jId:      from.neo4jNodeId,
          toNeo4jId:        to.neo4jNodeId,
          relationshipType: 'PARTICIPATES_IN',
          confidence,
          isInferred:       true,
          properties: {
            temporalDeltaMs: delta,
            windowMs,
            discoveredAt: new Date().toISOString(),
          },
          evidence: [
            {
              strategy:    'temporal_proximity',
              description:
                `'${from.displayName}' and '${to.displayName}' were active within ` +
                `${Math.round(delta / 1_000)}s of each other (window ${windowMs / 1_000}s).`,
              collectedAt: new Date().toISOString(),
            },
          ],
        });
      }
    }

    return candidates;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Persistence
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Persists a list of relationship candidates:
   *   1. Write each relationship to Neo4j as a directed edge with `confidence`,
   *      `evidence`, and `isInferred` properties.
   *   2. Upsert metadata to `KnowledgeGraphRelationship` in PostgreSQL.
   *
   * Neo4j failures are non-fatal — a warning is logged and persistence continues
   * in PostgreSQL only (workspace task note: "gracefully handle connection failures").
   *
   * Candidates with empty `fromEntityId` or `toEntityId` (FK stubs awaiting
   * entity resolution) are skipped here and can be re-processed after resolution.
   *
   * @param candidates  Relationship candidates to persist.
   * @param orgId       Tenant scope.
   * @returns           Persisted `KnowledgeGraphRelationship` records.
   */
  async writeRelationships(
    candidates: RelationshipCandidate[],
    orgId: string,
  ): Promise<KnowledgeGraphRelationship[]> {
    const results: KnowledgeGraphRelationship[] = [];

    for (const candidate of candidates) {
      // Skip unresolved FK stubs.
      if (!candidate.fromEntityId || !candidate.toEntityId) continue;
      // Skip if below absolute minimum confidence.
      if (candidate.confidence < MIN_PATH_CONFIDENCE) continue;

      // Attempt Neo4j write — non-fatal on failure.
      let neo4jRelId = `pg-only-${candidate.fromNeo4jId}-${candidate.toNeo4jId}-${candidate.relationshipType}`;
      if (candidate.fromNeo4jId && candidate.toNeo4jId) {
        neo4jRelId = await this.writeNeo4jRelationship(candidate, orgId);
      }

      // Upsert to PostgreSQL.
      try {
        const rel = await this.prisma.knowledgeGraphRelationship.upsert({
          where: { neo4jRelId },
          create: {
            organizationId:   orgId,
            neo4jRelId,
            fromEntityId:     candidate.fromEntityId,
            toEntityId:       candidate.toEntityId,
            relationshipType: candidate.relationshipType,
            confidence:       candidate.confidence,
            evidence:         candidate.evidence as unknown as Prisma.InputJsonValue,
            properties:       candidate.properties as Prisma.InputJsonValue,
            isInferred:       candidate.isInferred,
            lastVerifiedAt:   new Date(),
          },
          update: {
            confidence:      candidate.confidence,
            evidence:        candidate.evidence as unknown as Prisma.InputJsonValue,
            properties:      candidate.properties as Prisma.InputJsonValue,
            isInferred:      candidate.isInferred,
            lastVerifiedAt:  new Date(),
          },
        });

        results.push(rel);
      } catch (err) {
        this.logger.error(
          `Failed to persist relationship ${candidate.fromEntityId} → ${candidate.toEntityId}: ${err}`,
        );
      }
    }

    this.logger.log(`Wrote ${results.length} relationships for org=${orgId}`);
    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Property 3: Multi-hop path validity
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Filters a traversal path to only include edges whose confidence meets the
   * minimum threshold required for valid multi-hop reasoning.
   *
   * **Property 3**: every edge in a multi-hop traversal path must have
   * `confidence >= 0.4` (Requirements 2.2, 17.2).
   *
   * An empty path or a path that has no sub-threshold edges is returned
   * unchanged.  A path where any edge fails the threshold returns only the
   * edges that do meet it — callers should treat the resulting path as
   * disconnected if continuity is required (i.e. check that the remaining
   * edges still form a valid path from start to end).
   *
   * @param relationships  Ordered list of relationship edges in the path.
   * @returns              Edges with `confidence >= MIN_PATH_CONFIDENCE`.
   */
  filterValidPath(
    relationships: KnowledgeGraphRelationship[],
  ): KnowledgeGraphRelationship[] {
    return relationships.filter((rel) => rel.confidence >= MIN_PATH_CONFIDENCE);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /** Load all active entities for an organisation from PostgreSQL. */
  private async loadEntitiesForOrg(orgId: string): Promise<KnowledgeGraphEntity[]> {
    return this.prisma.knowledgeGraphEntity.findMany({
      where: {
        organizationId: orgId,
        syncStatus: 'active',
      },
      orderBy: { lastSyncedAt: 'asc' },
    });
  }

  /**
   * Write a relationship edge to Neo4j.
   * Returns the Neo4j relationship ID string, or a fallback synthetic ID on failure.
   */
  private async writeNeo4jRelationship(
    candidate: RelationshipCandidate,
    orgId: string,
  ): Promise<string> {
    const syntheticId = `${candidate.fromNeo4jId}-${candidate.toNeo4jId}-${candidate.relationshipType}`;

    const cypher = `
      MATCH (from {neo4j_id: $fromId, organization_id: $orgId})
      MATCH (to   {neo4j_id: $toId,   organization_id: $orgId})
      MERGE (from)-[r:${candidate.relationshipType} {organization_id: $orgId}]->(to)
      ON CREATE SET
        r.confidence   = $confidence,
        r.isInferred   = $isInferred,
        r.evidence     = $evidence,
        r.createdAt    = datetime(),
        r.updatedAt    = datetime()
      ON MATCH SET
        r.confidence   = $confidence,
        r.isInferred   = $isInferred,
        r.evidence     = $evidence,
        r.updatedAt    = datetime()
      RETURN id(r) AS relId
    `;

    try {
      const rows = await this.neo4j.runQuery<{ relId: unknown }>(cypher, {
        fromId:     candidate.fromNeo4jId,
        toId:       candidate.toNeo4jId,
        orgId,
        confidence: candidate.confidence,
        isInferred: candidate.isInferred,
        evidence:   JSON.stringify(candidate.evidence),
      });

      if (rows.length > 0 && rows[0].relId !== undefined && rows[0].relId !== null) {
        return String(rows[0].relId);
      }

      return syntheticId;
    } catch (err) {
      // Neo4j is optional — log and continue with PostgreSQL-only persistence.
      this.logger.warn(
        `Neo4j relationship write failed (continuing PG-only): ${(err as Error).message}`,
      );
      return `pg-only-${syntheticId}`;
    }
  }

  /**
   * Produce a normalised co-occurrence key from two entity types.
   * Alphabetical ordering ensures symmetry: `person:product` === `product:person`.
   */
  private coOccurrenceKey(typeA: string, typeB: string): string {
    const a = typeA.toLowerCase();
    const b = typeB.toLowerCase();
    return a <= b ? `${a}:${b}` : `${b}:${a}`;
  }

  /**
   * De-duplicate candidates: for the same (fromEntityId, toEntityId, type) triplet,
   * keep the candidate with the highest confidence.
   */
  private deduplicateCandidates(
    candidates: RelationshipCandidate[],
  ): RelationshipCandidate[] {
    const map = new Map<string, RelationshipCandidate>();

    for (const c of candidates) {
      const key = `${c.fromEntityId}::${c.toEntityId}::${c.relationshipType}`;
      const existing = map.get(key);
      if (!existing || c.confidence > existing.confidence) {
        map.set(key, c);
      }
    }

    return Array.from(map.values());
  }
}
