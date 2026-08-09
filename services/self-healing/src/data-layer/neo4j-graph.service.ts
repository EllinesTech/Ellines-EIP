/**
 * Neo4j Knowledge Graph Service
 *
 * Thin wrapper around the Neo4j driver for knowledge graph operations.
 * Requirements: 2.1, 17.1, 17.2, 17.3
 */

export interface Neo4jDriver {
  session(config?: { database?: string }): Neo4jSession;
  close(): Promise<void>;
}

export interface Neo4jSession {
  run(query: string, params?: Record<string, unknown>): Promise<Neo4jQueryResult>;
  close(): Promise<void>;
}

export interface Neo4jQueryResult {
  records: Neo4jRecord[];
  summary: {
    counters: {
      nodesCreated(): number;
      nodesDeleted(): number;
      relationshipsCreated(): number;
      propertiesSet(): number;
    };
    resultAvailableAfter?: { toNumber(): number };
  };
}

export interface Neo4jRecord {
  get(key: string): unknown;
  keys: string[];
  toObject(): Record<string, unknown>;
}

export interface KnowledgeGraphEntity {
  id: string;
  organizationId: string;
  type: 'Person' | 'Product' | 'Location' | 'Event' | 'Document';
  sourceSystem: string;
  sourceEntityId: string;
  displayName: string;
  confidence: number;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraphRelationship {
  fromId: string;
  toId: string;
  type: string;
  confidence: number;
  properties?: Record<string, unknown>;
}

export class Neo4jGraphService {
  constructor(private readonly driver: Neo4jDriver) {}

  /**
   * Create or update an entity node in the knowledge graph.
   * Requirement 17.1: Extract entities from System of Record sources.
   */
  async upsertEntity(entity: KnowledgeGraphEntity): Promise<{ nodeId: string }> {
    const session = this.driver.session();
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
      const record = result.records[0];
      return { nodeId: String(record.get('nodeId')) };
    } finally {
      await session.close();
    }
  }

  /**
   * Create a relationship between two entities.
   * Requirement 17.2: Identify relationships between entities.
   */
  async createRelationship(rel: KnowledgeGraphRelationship): Promise<void> {
    const session = this.driver.session();
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
            ...rel.properties,
          },
        },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Query entities by type and organization.
   * Requirement 17.7: Provide graph query interface.
   */
  async queryEntitiesByType(
    entityType: string,
    organizationId: string,
    limit = 100,
  ): Promise<KnowledgeGraphEntity[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:${entityType} {organizationId: $orgId})
         RETURN e
         ORDER BY e.confidence DESC
         LIMIT $limit`,
        { orgId: organizationId, limit },
      );
      return result.records.map((r) => {
        const node = r.get('e') as Record<string, unknown>;
        return {
          id: String(node['id'] ?? ''),
          organizationId: String(node['organizationId'] ?? ''),
          type: entityType as KnowledgeGraphEntity['type'],
          sourceSystem: String(node['sourceSystem'] ?? ''),
          sourceEntityId: String(node['sourceEntityId'] ?? ''),
          displayName: String(node['displayName'] ?? ''),
          confidence: Number(node['confidence'] ?? 0),
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Traverse relationships from a starting entity up to N hops.
   * Requirement 2.2: Multi-hop reasoning (3+ levels).
   */
  async traverseRelationships(
    startEntityId: string,
    maxHops: number,
  ): Promise<{ paths: Array<{ nodes: string[]; relationships: string[] }> }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (start {id: $startId})-[*1..${maxHops}]->(end)
         RETURN [node IN nodes(path) | node.id] AS nodeIds,
                [rel IN relationships(path) | type(rel)] AS relTypes
         LIMIT 50`,
        { startId: startEntityId },
      );
      const paths = result.records.map((r) => ({
        nodes: r.get('nodeIds') as string[],
        relationships: r.get('relTypes') as string[],
      }));
      return { paths };
    } finally {
      await session.close();
    }
  }

  /**
   * Get connection query latency (ms) for health monitoring.
   * Requirement 17.1: Maintain unified Knowledge Graph.
   */
  async ping(): Promise<{ latencyMs: number }> {
    const session = this.driver.session();
    const start = Date.now();
    try {
      await session.run('RETURN 1 AS ping');
      return { latencyMs: Date.now() - start };
    } finally {
      await session.close();
    }
  }
}
