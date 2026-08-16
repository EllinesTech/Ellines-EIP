import { Injectable, Logger } from '@nestjs/common';

export interface EntityNode {
  id: string;
  type: 'person' | 'organization' | 'product' | 'project' | 'location' | 'event';
  name: string;
  metadata: Record<string, unknown>;
  confidence: number;
  extractedAt: Date;
}

export interface EntityRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string; // 'mentions', 'references', 'works_at', 'manages', etc.
  confidence: number;
  evidence: string[];
  extractedAt: Date;
}

export interface KnowledgeGraphUpdate {
  nodes: EntityNode[];
  relationships: EntityRelationship[];
  emailId: string;
  timestamp: Date;
}

@Injectable()
export class KnowledgeGraphIntegration {
  private readonly logger = new Logger(KnowledgeGraphIntegration.name);

  // In-memory storage (in production, integrate with Neo4j or similar)
  private nodes: Map<string, EntityNode> = new Map();
  private relationships: Map<string, EntityRelationship> = new Map();
  private nodeIndex: Map<string, string> = new Map(); // name -> id mapping
  private relationshipCounter: number = 0;

  private readonly entityPatterns = {
    person: [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, // "John Smith", "Jane Doe"
      /(?:Mr\.|Ms\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    ],
    organization: [
      /\b([A-Z][A-Za-z0-9\s&,.'-]+(?:Inc|Corp|LLC|Ltd|Company|Group|Ltd\.|Co\.))\b/g,
      /at\s+([A-Z][A-Za-z0-9\s]+)\b/g,
    ],
    product: [
      /(?:product|software|app|service|platform)?\s*(?:called|named|is)\s+([A-Z][A-Za-z0-9\s]+)/gi,
    ],
    project: [
      /(?:project|initiative|program)\s+([A-Z][A-Za-z0-9\s]+)/gi,
      /Project\s+([A-Z][a-z]+)/g,
    ],
    location: [
      /(?:in|at|from|based in|located at)\s+([A-Z][A-Za-z\s]+)(?:,|\s|$)/g,
      /([A-Z][a-z]+),\s*([A-Z]{2})\b/g, // "City, ST"
    ],
    event: [
      /(?:meeting|conference|summit|event|symposium)\s+(?:called\s+)?([A-Z][A-Za-z0-9\s]+)/gi,
    ],
  };

  private readonly relationshipPatterns = [
    {
      pattern: /([A-Za-z\s]+)\s+(?:works at|works for|employed by|is at)\s+([A-Za-z\s&]+)/gi,
      type: 'works_at',
    },
    {
      pattern: /([A-Za-z\s]+)\s+(?:manages|leads|oversees)\s+([A-Za-z\s]+)/gi,
      type: 'manages',
    },
    {
      pattern: /([A-Za-z\s]+)\s+(?:mentions|references|discussed|involves)\s+([A-Za-z\s]+)/gi,
      type: 'mentions',
    },
    {
      pattern: /([A-Za-z\s]+)\s+(?:contacted|emailed|communicated with)\s+([A-Za-z\s]+)/gi,
      type: 'communicates_with',
    },
    {
      pattern: /(?:project|initiative).*?(?:involves|includes|spans)\s+([A-Za-z\s]+)\s+and\s+([A-Za-z\s]+)/gi,
      type: 'includes',
    },
  ];

  /**
   * Extract entities from email text
   */
  extractEntities(emailText: string, emailMetadata?: { from: string; to: string[] }): EntityNode[] {
    const entities: EntityNode[] = [];
    const processedEntities = new Set<string>();

    // Extract from email metadata
    if (emailMetadata?.from) {
      const entity = this.createEntityNode('person', emailMetadata.from, 0.95);
      if (!processedEntities.has(entity.name)) {
        entities.push(entity);
        processedEntities.add(entity.name);
      }
    }

    if (emailMetadata?.to) {
      for (const recipient of emailMetadata.to) {
        const entity = this.createEntityNode('person', recipient, 0.95);
        if (!processedEntities.has(entity.name)) {
          entities.push(entity);
          processedEntities.add(entity.name);
        }
      }
    }

    // Extract from text patterns
    for (const [entityType, patterns] of Object.entries(this.entityPatterns)) {
      for (const pattern of patterns) {
        const matches = emailText.matchAll(pattern);

        for (const match of matches) {
          const name = match[1]?.trim();
          if (!name || name.length < 2 || processedEntities.has(name)) {
            continue;
          }

          const entity = this.createEntityNode(
            entityType as EntityNode['type'],
            name,
            0.7,
          );
          entities.push(entity);
          processedEntities.add(name);

          if (entities.length >= 20) {
            return entities; // Limit to 20 entities per email
          }
        }
      }
    }

    return entities;
  }

  /**
   * Create entity node
   */
  private createEntityNode(
    type: EntityNode['type'],
    name: string,
    confidence: number,
  ): EntityNode {
    const normalizedName = name.toLowerCase();
    let entityId = this.nodeIndex.get(normalizedName);

    if (!entityId) {
      entityId = `entity_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.nodeIndex.set(normalizedName, entityId);
    }

    const node: EntityNode = {
      id: entityId,
      type,
      name,
      metadata: {
        normalized: normalizedName,
        firstSeen: new Date(),
      },
      confidence,
      extractedAt: new Date(),
    };

    // Update or create node
    const existingNode = this.nodes.get(entityId);
    if (existingNode) {
      existingNode.confidence = Math.max(existingNode.confidence, confidence);
      existingNode.extractedAt = new Date();
    } else {
      this.nodes.set(entityId, node);
    }

    return node;
  }

  /**
   * Extract relationships from email text
   */
  extractRelationships(
    emailText: string,
    entities: EntityNode[],
  ): EntityRelationship[] {
    const relationships: EntityRelationship[] = [];
    const entityMap = new Map<string, EntityNode>();

    // Build map of entity names to their nodes
    for (const entity of entities) {
      entityMap.set(entity.name.toLowerCase(), entity);
    }

    // Extract relationships
    for (const { pattern, type } of this.relationshipPatterns) {
      const matches = emailText.matchAll(pattern);

      for (const match of matches) {
        const source = match[1]?.trim().toLowerCase();
        const target = match[2]?.trim().toLowerCase();

        if (!source || !target) {
          continue;
        }

        const sourceEntity = Array.from(entities).find(
          (e) => e.name.toLowerCase().includes(source) || source.includes(e.name.toLowerCase()),
        );
        const targetEntity = Array.from(entities).find(
          (e) => e.name.toLowerCase().includes(target) || target.includes(e.name.toLowerCase()),
        );

        if (sourceEntity && targetEntity && sourceEntity.id !== targetEntity.id) {
          const relationship: EntityRelationship = {
            id: `rel_${this.relationshipCounter++}`,
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type,
            confidence: 0.75,
            evidence: [match[0].substring(0, 100)],
            extractedAt: new Date(),
          };

          relationships.push(relationship);
          this.relationships.set(relationship.id, relationship);
        }
      }
    }

    return relationships;
  }

  /**
   * Create knowledge graph update from email
   */
  createGraphUpdate(
    emailId: string,
    emailText: string,
    emailMetadata?: { from: string; to: string[] },
  ): KnowledgeGraphUpdate {
    const nodes = this.extractEntities(emailText, emailMetadata);
    const relationships = this.extractRelationships(emailText, nodes);

    return {
      nodes,
      relationships,
      emailId,
      timestamp: new Date(),
    };
  }

  /**
   * Get entity by ID
   */
  getEntity(entityId: string): EntityNode | undefined {
    return this.nodes.get(entityId);
  }

  /**
   * Get entity by name
   */
  getEntityByName(name: string): EntityNode | undefined {
    const normalizedName = name.toLowerCase();
    const entityId = this.nodeIndex.get(normalizedName);
    if (entityId) {
      return this.nodes.get(entityId);
    }
    return undefined;
  }

  /**
   * Get relationships for entity
   */
  getEntityRelationships(entityId: string): EntityRelationship[] {
    const relationships: EntityRelationship[] = [];

    for (const [, rel] of this.relationships) {
      if (rel.sourceId === entityId || rel.targetId === entityId) {
        relationships.push(rel);
      }
    }

    return relationships;
  }

  /**
   * Find entities connected to target entity
   */
  findConnectedEntities(entityId: string, depth: number = 1): EntityNode[] {
    const connected = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: entityId, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, depth: currentDepth } = queue.shift()!;

      if (visited.has(id) || currentDepth >= depth) {
        continue;
      }

      visited.add(id);

      for (const rel of this.relationships.values()) {
        if (rel.sourceId === id && !connected.has(rel.targetId)) {
          connected.add(rel.targetId);
          queue.push({ id: rel.targetId, depth: currentDepth + 1 });
        }
        if (rel.targetId === id && !connected.has(rel.sourceId)) {
          connected.add(rel.sourceId);
          queue.push({ id: rel.sourceId, depth: currentDepth + 1 });
        }
      }
    }

    const result: EntityNode[] = [];
    for (const id of connected) {
      const entity = this.nodes.get(id);
      if (entity) {
        result.push(entity);
      }
    }

    return result;
  }

  /**
   * Find path between two entities
   */
  findPath(sourceId: string, targetId: string, maxDepth: number = 3): EntityNode[][] {
    const paths: EntityNode[][] = [];
    const queue: { currentPath: string[]; depth: number }[] = [
      { currentPath: [sourceId], depth: 0 },
    ];

    while (queue.length > 0) {
      const { currentPath, depth } = queue.shift()!;

      if (depth >= maxDepth) {
        continue;
      }

      const lastId = currentPath[currentPath.length - 1];

      if (lastId === targetId) {
        // Found a path
        const path = currentPath.map((id) => this.nodes.get(id)!).filter(Boolean);
        paths.push(path);
        continue;
      }

      for (const rel of this.relationships.values()) {
        if (rel.sourceId === lastId && !currentPath.includes(rel.targetId)) {
          queue.push({
            currentPath: [...currentPath, rel.targetId],
            depth: depth + 1,
          });
        } else if (rel.targetId === lastId && !currentPath.includes(rel.sourceId)) {
          queue.push({
            currentPath: [...currentPath, rel.sourceId],
            depth: depth + 1,
          });
        }
      }
    }

    return paths;
  }

  /**
   * Search entities
   */
  searchEntities(query: string, type?: EntityNode['type']): EntityNode[] {
    const results: EntityNode[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [, entity] of this.nodes) {
      if (type && entity.type !== type) {
        continue;
      }

      if (
        entity.name.toLowerCase().includes(lowerQuery) ||
        String(entity.metadata.normalized).includes(lowerQuery)
      ) {
        results.push(entity);
      }
    }

    return results;
  }

  /**
   * Get graph statistics
   */
  getGraphStats() {
    return {
      totalNodes: this.nodes.size,
      totalRelationships: this.relationships.size,
      nodesByType: this.getNodesByType(),
      relationshipsByType: this.getRelationshipsByType(),
    };
  }

  /**
   * Get nodes grouped by type
   */
  private getNodesByType(): Record<EntityNode['type'], number> {
    const counts: Record<EntityNode['type'], number> = {
      person: 0,
      organization: 0,
      product: 0,
      project: 0,
      location: 0,
      event: 0,
    };

    for (const [, node] of this.nodes) {
      counts[node.type]++;
    }

    return counts;
  }

  /**
   * Get relationships grouped by type
   */
  private getRelationshipsByType(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const [, rel] of this.relationships) {
      counts[rel.type] = (counts[rel.type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Export graph to JSON format
   */
  exportGraph() {
    return {
      nodes: Array.from(this.nodes.values()),
      relationships: Array.from(this.relationships.values()),
    };
  }

  /**
   * Clear graph (for testing)
   */
  clearGraph(): void {
    this.nodes.clear();
    this.relationships.clear();
    this.nodeIndex.clear();
    this.relationshipCounter = 0;
  }
}
