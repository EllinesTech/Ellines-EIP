/**
 * KnowledgeGraphController
 *
 * HTTP surface for the Enterprise Knowledge Graph subsystem.
 *
 * All routes:
 *   - Require a valid JWT (JwtAuthGuard).
 *   - Extract `organizationId` from the JWT payload — never from the request
 *     body or path parameter (tenant isolation, workspace rule §6).
 *   - Delegate all persistence and traversal logic to KnowledgeGraphService.
 *
 * Routes
 * ──────
 *   GET  /knowledge-graph/entities         — list entities (optional ?type= filter)
 *   POST /knowledge-graph/query            — BFS graph traversal from a start node
 *   GET  /knowledge-graph/subgraph         — visualisation payload (?entityId=&depth=)
 *
 * Requirements: 17.3, 17.6, 17.7, 17.8
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeGraphService, GraphQuery } from './knowledge-graph.service';

// ─── Request user shape (from JWT payload) ────────────────────────────────────

interface AuthRequest {
  user: {
    userId: string;
    organizationId: string;
    role: string;
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('knowledge-graph')
@UseGuards(JwtAuthGuard)
export class KnowledgeGraphController {
  constructor(private readonly graphService: KnowledgeGraphService) {}

  // ── GET /knowledge-graph/entities ──────────────────────────────────────────

  /**
   * List knowledge-graph entities for the authenticated user's organisation.
   *
   * Query params:
   *   - `type` (optional) — filter by entity type
   *     (`person | product | location | event | document`).
   *
   * Returns only entities whose `syncStatus != 'merged'`.
   *
   * Requirement 17.3.
   */
  @Get('entities')
  listEntities(
    @Request() req: AuthRequest,
    @Query('type') entityType?: string,
  ) {
    return this.graphService.listEntities(req.user.organizationId, entityType);
  }

  // ── POST /knowledge-graph/query ────────────────────────────────────────────

  /**
   * Traverse the knowledge graph from a start node.
   *
   * Body: `GraphQuery`
   * ```json
   * {
   *   "startNodeId": "<entity-id>",
   *   "maxDepth": 2,
   *   "filters": {
   *     "entityType": "person",
   *     "minConfidence": 0.6
   *   }
   * }
   * ```
   *
   * Returns `GraphResult { nodes, edges, totalNodes, totalEdges }`.
   *
   * Requirement 17.6, 17.7.
   */
  @Post('query')
  queryGraph(
    @Request() req: AuthRequest,
    @Body() body: GraphQuery,
  ) {
    if (!body?.startNodeId) {
      throw new BadRequestException('startNodeId is required');
    }
    return this.graphService.queryGraph(req.user.organizationId, body);
  }

  // ── GET /knowledge-graph/subgraph ──────────────────────────────────────────

  /**
   * Return a `GraphVisualization` payload centered on `entityId` for the
   * front-end graph renderer.
   *
   * Query params:
   *   - `entityId` (required) — the center node.
   *   - `depth`    (optional) — hop depth (default 2, max 6).
   *
   * Returns `GraphVisualization { nodes: VisNode[], edges: VisEdge[], centerEntityId }`.
   *
   * Requirement 17.8.
   */
  @Get('subgraph')
  getSubgraph(
    @Request() req: AuthRequest,
    @Query('entityId') entityId: string,
    @Query('depth') depthStr?: string,
  ) {
    if (!entityId) {
      throw new BadRequestException('entityId query parameter is required');
    }

    const depth = depthStr !== undefined ? parseInt(depthStr, 10) : 2;
    if (isNaN(depth) || depth < 1) {
      throw new BadRequestException('depth must be a positive integer');
    }

    return this.graphService.getSubgraph(req.user.organizationId, entityId, depth);
  }
}
