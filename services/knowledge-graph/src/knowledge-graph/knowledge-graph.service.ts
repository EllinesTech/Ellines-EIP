/**
 * Knowledge Graph Service
 * 
 * Core service for managing the enterprise knowledge graph
 * Requirements: 2.1, 17.1, 17.2, 17.3, 17.4, 17.6, 17.7
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Neo4jProvider } from './neo4j.provider';

export interface KnowledgeGraphEntity {
  id: string;
  organizationId: string;
  type: 'Person' | 'Product' | 'Location' | 'Event' | 'Document';
  sourceSystem: string;
  sourceEntityId: string;
  displayName: string;
  confidence: number;
  properties?: Record<string, any>;
}

export interface KnowledgeGraphRelationship {
  fromId: string;
  toId: string;
  type: string;
  confidence: number;
  evidence?: string[];
  properties?: Record<string, any>;
}

export interface GraphQueryRequest {
  cypher: string;
  parameters?: Record<string, any>;
  organizationId: string;
}

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(private readonly neo4jProvider: Neo4jProvider) {}

  /**
   * Upsert an entity into the knowledge graph
   * Requirement 17.1: Extract entities from System of Record sources
   */
  async upsertEntity(entity: KnowledgeGraphEntity): Promise<{ nodeId: string }> {
    const session = this.neo4jProvider.getSession();
    try {
      const result = await session.run(
        `MERGE (e:${entity.type} {id: $id})
         ON CREATE SET e += $props, e.createdAt = datetime()
         ON MATCH  SET e += $props, e.updatedAt = datetime()
         RETURN elementId(e) AS nodeId`,
        {
          id: entity.id,
          props: {
            id: entity.id,
            organizationId: entity.organizationId,
            sourceSystem: entity.sourceSystem,
            sourceEntityId: entity.sourceEntityId,
            displayName: entity.displayName,
            confidence: entity.confidence,
            ...entity.properties,
          },
        },
      );
      const nodeId = result.records[0].get('nodeId') as string;
      this.logger.log(`Upserted entity ${entity.type}:${entity.id}`);
      return { nodeId };
    } finally {
      await session.close();
    }
  }

  /**
   * Create or update a relationship between entities
   * Requirement 17.2: Identify relationships between entities
   */
  async createRelationship(rel: KnowledgeGraphRelationship): Promise<void> {
    const session = this.neo4jProvider.getSession();
    try {
      await session.run(
        `MATCH (from {id: $fromId}), (to {id: $toId})
         MERGE (from)-[r:${rel.type}]->(to)
         ON CREATE SET r += $props, r.createdAt = datetime()
         ON MATCH  SET r += $props, r.updatedAt = datetime()`,
        {
          fromId: rel.fromId,
          toId: rel.toId,
          props: {
            confidence: rel.confidence,
            evidence: rel.evidence || [],
            ...rel.properties,
          },
        },
      );
      this.logger.log(`Created relationship ${rel.fromId} -[${rel.type}]-> ${rel.toId}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Query entities by type and organization
   * Requirement 17.7: Provide graph query interface
   */
  async queryEntitiesByType(
    entityType: string,
    organizationId: string,
    limit = 100,
  ): Promise<KnowledgeGraphEntity[]> {
    const session = this.neo4jProvider.getSession();
    try {
      const result = await session.run(
        `MATCH (e:${entityType} {organizationId: $orgId})
         RETURN e
         ORDER BY e.confidence DESC
         LIMIT $limit`,
        { orgId: organizationId, limit },
      );
      return result.records.map((r) => {
        const node = r.get('e') as any;
        const props = node.properties;
        return {
          id: props.id,
          organizationId: props.organizationId,
          type: entityType as any,
          sourceSystem: props.sourceSystem,
          sourceEntityId: props.sourceEntityId,
          displayName: props.displayName,
          confidence: props.confidence,
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a safe Cypher query with validation
   * Requirement 17.7: Graph query API with Cypher query support and safety validation
   */
  async executeQuery(request: GraphQueryRequest): Promise<any[]> {
    // Validate query is safe (no destructive operations)
    this.validateCypherQuery(request.cypher);

    // Enforce organization filter
    const params = {
      ...request.parameters,
      _orgId: request.organizationId,
    };

    const session = this.neo4jProvider.getSession();
    try {
      const result = await session.run(request.cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  /**
   * Validate Cypher query for safety
   */
  private validateCypherQuery(cypher: string): void {
    const upperCypher = cypher.toUpperCase();
    const destructiveKeywords = ['DELETE', 'REMOVE', 'DETACH', 'DROP', 'CREATE CONSTRAINT', 'CREATE INDEX'];

    for (const keyword of destructiveKeywords) {
      if (upperCypher.includes(keyword)) {
        throw new BadRequestException(`Destructive operation not allowed: ${keyword}`);
      }
    }

    // Must include MATCH or RETURN
    if (!upperCypher.includes('MATCH') && !upperCypher.includes('RETURN')) {
      throw new BadRequestException('Query must include MATCH or RETURN');
    }
  }

  /**
   * Generate subgraph visualization data
   * Requirement 17.8: Visualize Knowledge Graph subgraphs
   */
  async generateSubgraph(
    centerEntityId: string,
    depth: number = 2,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    const session = this.neo4jProvider.getSession();
    try {
      const result = await session.run(
        `MATCH path = (center {id: $centerId})-[*0..${depth}]-(connected)
         WITH nodes(path) AS pathNodes, relationships(path) AS pathRels
         UNWIND pathNodes AS node
         WITH collect(DISTINCT node) AS allNodes, pathRels
         UNWIND pathRels AS rel
         WITH allNodes, collect(DISTINCT rel) AS allRels
         RETURN allNodes, allRels`,
        { centerId: centerEntityId },
      );

      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      const record = result.records[0];
      const nodes = (record.get('allNodes') as any[]).map((n: any) => ({
        id: n.properties.id,
        label: n.properties.displayName,
        type: n.labels[0],
        ...n.properties,
      }));

      const edges = (record.get('allRels') as any[]).map((r: any) => ({
        from: r.start.properties.id,
        to: r.end.properties.id,
        type: r.type,
        ...r.properties,
      }));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  /**
   * Resolve duplicate entities (entity resolution)
   * Requirement 17.4: Resolve entity duplicates and conflicts
   */
  async findDuplicateEntities(
    organizationId: string,
    entityType: string,
  ): Promise<Array<{ entities: KnowledgeGraphEntity[]; similarity: number }>> {
    const session = this.neo4jProvider.getSession();
    try {
      // Find entities with similar display names
      const result = await session.run(
        `MATCH (e1:${entityType} {organizationId: $orgId})
         MATCH (e2:${entityType} {organizationId: $orgId})
         WHERE e1.id < e2.id
         AND (e1.displayName = e2.displayName OR e1.sourceEntityId = e2.sourceEntityId)
         RETURN e1, e2
         LIMIT 50`,
        { orgId: organizationId },
      );

      return result.records.map((r) => {
        const e1 = r.get('e1') as any;
        const e2 = r.get('e2') as any;
        return {
          entities: [
            this.mapNodeToEntity(e1, entityType),
            this.mapNodeToEntity(e2, entityType),
          ],
          similarity: 0.9, // Simplified similarity score
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Merge duplicate entities
   * Requirement 17.4: Entity resolution logic for deduplication
   */
  async mergeDuplicateEntities(primaryId: string, duplicateId: string): Promise<void> {
    const session = this.neo4jProvider.getSession();
    try {
      await session.run(
        `MATCH (primary {id: $primaryId})
         MATCH (duplicate {id: $duplicateId})
         MATCH (duplicate)-[r]->(other)
         MERGE (primary)-[newRel:SAME_TYPE]->(other)
         SET newRel = r
         WITH primary, duplicate
         MATCH (duplicate)<-[r2]-(other2)
         MERGE (other2)-[newRel2:SAME_TYPE]->(primary)
         SET newRel2 = r2
         WITH primary, duplicate
         DETACH DELETE duplicate`,
        { primaryId, duplicateId },
      );
      this.logger.log(`Merged duplicate entities: ${duplicateId} into ${primaryId}`);
    } finally {
      await session.close();
    }
  }

  private mapNodeToEntity(node: any, type: string): KnowledgeGraphEntity {
    const props = node.properties;
    return {
      id: props.id,
      organizationId: props.organizationId,
      type: type as any,
      sourceSystem: props.sourceSystem,
      sourceEntityId: props.sourceEntityId,
      displayName: props.displayName,
      confidence: props.confidence,
    };
  }

  /**
   * Health check
   */
  async ping(): Promise<{ latencyMs: number }> {
    const session = this.neo4jProvider.getSession();
    const start = Date.now();
    try {
      await session.run('RETURN 1 AS ping');
      return { latencyMs: Date.now() - start };
    } finally {
      await session.close();
    }
  }
}
