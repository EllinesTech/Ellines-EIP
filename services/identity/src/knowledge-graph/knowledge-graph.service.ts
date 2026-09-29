/**
 * KnowledgeGraphService
 *
 * Provides graph traversal and query operations against the PostgreSQL
 * knowledge-graph tables.  Acts as the backing service for
 * KnowledgeGraphController routes and is also called by connector sync
 * jobs via `updateGraph`.
 *
 * Tenant isolation: every query includes a mandatory `organizationId`
 * equality filter.  No cross-tenant reads (workspace rule §6).
 *
 * Neo4j is used as the authoritative graph store when available; all
 * heavy traversal falls back to PostgreSQL relationship joins if Neo4j
 * is unreachable.
 *
 * Requirements: 17.3, 17.6, 17.7, 17.8
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeGraphEntity, KnowledgeGraphRelationship } from '@prisma/client';
import { EntityExtractorService, EntityCandidate } from './entity-extractor.service';

// ─── Public response types ────────────────────────────────────────────────────

/**
 * Input for a graph traversal query.
 */
export interface GraphQuery {
  startNodeId: string;
  maxDepth?: number;
  filters?: {
    entityType?: string;
    minConfidence?: number;
  };
}

/**
 * Raw graph traversal result — nodes and edges from a BFS walk.
 */
export interface GraphResult {
  nodes: KnowledgeGraphEntity[];
  edges: KnowledgeGraphRelationship[];
  totalNodes: number;
  totalEdges: number;
}

/**
 * A single node formatted for the UI graph renderer.
 */
export interface VisNode {
  id: string;
  label: string;
  type: string;
  confidence: number;
}

/**
 * A single edge formatted for the UI graph renderer.
 */
export interface VisEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  confidence: number;
}

/**
 * Subgraph visualisation payload consumed by the front-end.
 */
export interface GraphVisualization {
  nodes: VisNode[];
  edges: VisEdge[];
  centerEntityId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 2;
const ABSOLUTE_MAX_DEPTH = 6; // Guard against expensive traversals
const MIN_CONFIDENCE = 0;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityExtractor: EntityExtractorService,
  ) {}

  // ─── GET /knowledge-graph/entities ─────────────────────────────────────────

  /**
   * List all active (non-merged) entities for `orgId`.
   * Optional `entityType` filter narrows by entity category.
   *
   * Requirement 17.3 — graph query returns only entities in this org.
   */
  async listEntities(
    orgId: string,
    entityType?: string,
  ): Promise<KnowledgeGraphEntity[]> {
    return this.prisma.knowledgeGraphEntity.findMany({
      where: {
        organizationId: orgId,
        syncStatus: { not: 'merged' },
        ...(entityType ? { entityType } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { displayName: 'asc' }],
    });
  }

  // ─── POST /knowledge-graph/query ───────────────────────────────────────────

  /**
   * BFS graph traversal starting from `startNodeId` up to `maxDepth` hops.
   *
   * Visits nodes reachable via KnowledgeGraphRelationship edges whose
   * `confidence >= minConfidence`.  Applies optional `entityType` filter to
   * nodes included in the result.
   *
   * Tenant isolation: `startNodeId` is verified to belong to `orgId` before
   * traversal begins.
   *
   * Requirement 17.6, 17.7.
   */
  async queryGraph(orgId: string, query: GraphQuery): Promise<GraphResult> {
    const maxDepth = Math.min(
      query.maxDepth ?? DEFAULT_MAX_DEPTH,
      ABSOLUTE_MAX_DEPTH,
    );
    const minConfidence = query.filters?.minConfidence ?? MIN_CONFIDENCE;
    const entityTypeFilter = query.filters?.entityType;

    // Verify start entity belongs to this org (tenant isolation)
    const startEntity = await this.prisma.knowledgeGraphEntity.findFirst({
      where: { id: query.startNodeId, organizationId: orgId },
    });

    if (!startEntity) {
      throw new NotFoundException(
        `Entity ${query.startNodeId} not found in organisation ${orgId}`,
      );
    }

    const visitedNodeIds = new Set<string>();
    const collectedNodes: KnowledgeGraphEntity[] = [];
    const collectedEdges: KnowledgeGraphRelationship[] = [];

    // BFS queue: { entityId, depth }
    const queue: Array<{ entityId: string; depth: number }> = [
      { entityId: startEntity.id, depth: 0 },
    ];

    while (queue.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { entityId, depth } = queue.shift()!;

      if (visitedNodeIds.has(entityId) || depth > maxDepth) continue;
      visitedNodeIds.add(entityId);

      // Load the entity
      const entity = await this.prisma.knowledgeGraphEntity.findFirst({
        where: {
          id: entityId,
          organizationId: orgId,
          syncStatus: { not: 'merged' },
        },
      });

      if (!entity) continue;

      // Apply optional entity-type filter at node level
      if (!entityTypeFilter || entity.entityType === entityTypeFilter) {
        collectedNodes.push(entity);
      }

      if (depth >= maxDepth) continue;

      // Outgoing relationships from this entity
      const outgoing = await this.prisma.knowledgeGraphRelationship.findMany({
        where: {
          organizationId: orgId,
          fromEntityId: entityId,
          confidence: { gte: minConfidence },
        },
      });

      // Incoming relationships to this entity (bidirectional traversal)
      const incoming = await this.prisma.knowledgeGraphRelationship.findMany({
        where: {
          organizationId: orgId,
          toEntityId: entityId,
          confidence: { gte: minConfidence },
        },
      });

      const newEdges = [...outgoing, ...incoming].filter(
        (rel) =>
          !collectedEdges.some((e) => e.id === rel.id),
      );
      collectedEdges.push(...newEdges);

      // Enqueue unvisited neighbours
      for (const rel of outgoing) {
        if (!visitedNodeIds.has(rel.toEntityId)) {
          queue.push({ entityId: rel.toEntityId, depth: depth + 1 });
        }
      }
      for (const rel of incoming) {
        if (!visitedNodeIds.has(rel.fromEntityId)) {
          queue.push({ entityId: rel.fromEntityId, depth: depth + 1 });
        }
      }
    }

    return {
      nodes: collectedNodes,
      edges: collectedEdges,
      totalNodes: collectedNodes.length,
      totalEdges: collectedEdges.length,
    };
  }

  // ─── GET /knowledge-graph/subgraph ─────────────────────────────────────────

  /**
   * Build a `GraphVisualization` payload for the UI renderer centered on
   * `entityId` up to `depth` hops.
   *
   * Shapes all nodes into `VisNode` and all edges into `VisEdge` objects
   * expected by the front-end graph component.
   *
   * Requirement 17.8.
   */
  async getSubgraph(
    orgId: string,
    entityId: string,
    depth: number,
  ): Promise<GraphVisualization> {
    const result = await this.queryGraph(orgId, {
      startNodeId: entityId,
      maxDepth: Math.min(depth, ABSOLUTE_MAX_DEPTH),
    });

    const nodes: VisNode[] = result.nodes.map((n) => ({
      id: n.id,
      label: n.displayName,
      type: n.entityType,
      confidence: n.confidence,
    }));

    const edges: VisEdge[] = result.edges.map((e) => ({
      id: e.id,
      from: e.fromEntityId,
      to: e.toEntityId,
      label: e.relationshipType,
      confidence: e.confidence,
    }));

    return {
      nodes,
      edges,
      centerEntityId: entityId,
    };
  }

  // ─── updateGraph (called by connector sync) ─────────────────────────────────

  /**
   * Upsert entity updates into the knowledge graph.  Called by connector sync
   * jobs after each data-window ingest.
   *
   * Each item in `updates` provides a partial `KnowledgeGraphEntity`; at
   * minimum it must supply `entityType`, `sourceSystem`, `sourceEntityId`,
   * and `displayName` so an `EntityCandidate` can be derived.
   *
   * Items missing the required fields are skipped with a warning.
   *
   * Requirement 17.6 — real-time graph update on connector sync.
   */
  async updateGraph(
    orgId: string,
    updates: Array<{ entity: Partial<KnowledgeGraphEntity> }>,
  ): Promise<void> {
    const candidates: EntityCandidate[] = [];

    for (const { entity } of updates) {
      if (
        !entity.entityType ||
        !entity.sourceSystem ||
        !entity.sourceEntityId ||
        !entity.displayName
      ) {
        this.logger.warn(
          `updateGraph: skipping update missing required fields — ${JSON.stringify(entity)}`,
        );
        continue;
      }

      // Validate entityType is one of the known values
      const validTypes = ['person', 'product', 'location', 'event', 'document'] as const;
      const entityType = validTypes.find((t) => t === entity.entityType);
      if (!entityType) {
        this.logger.warn(
          `updateGraph: unknown entityType '${entity.entityType}' — skipping`,
        );
        continue;
      }

      candidates.push({
        entityType,
        sourceSystem: entity.sourceSystem,
        sourceEntityId: entity.sourceEntityId,
        displayName: entity.displayName,
        confidence: entity.confidence ?? 0.8,
        properties: {},
      });
    }

    if (candidates.length === 0) return;

    this.logger.log(
      `updateGraph: upserting ${candidates.length} entity/entities for org=${orgId}`,
    );

    await this.entityExtractor.upsertToGraph(candidates, orgId);
  }
}
