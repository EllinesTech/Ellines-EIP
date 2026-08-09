/**
 * Relationship Discovery Service
 * 
 * Discovers relationships between entities using co-occurrence and temporal analysis
 * Requirement 2.2, 17.2: Relationship discovery algorithms
 */

import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService, KnowledgeGraphRelationship } from '../knowledge-graph/knowledge-graph.service';

export interface EntityPair {
  entity1Id: string;
  entity2Id: string;
  coOccurrences: number;
  temporalProximity?: number; // milliseconds apart
  context?: string[];
}

@Injectable()
export class RelationshipDiscoveryService {
  private readonly logger = new Logger(RelationshipDiscoveryService.name);

  constructor(private readonly knowledgeGraph: KnowledgeGraphService) {}

  /**
   * Discover relationships between entities using co-occurrence analysis
   * Requirement 17.2: Relationship discovery using co-occurrence
   */
  async discoverRelationships(
    organizationId: string,
    entityPairs: EntityPair[],
  ): Promise<KnowledgeGraphRelationship[]> {
    const relationships: KnowledgeGraphRelationship[] = [];

    for (const pair of entityPairs) {
      const rel = await this.analyzeEntityPair(pair);
      if (rel) {
        relationships.push(rel);
        await this.knowledgeGraph.createRelationship(rel);
      }
    }

    this.logger.log(`Discovered ${relationships.length} relationships from ${entityPairs.length} entity pairs`);
    return relationships;
  }

  /**
   * Analyze entity pair to determine relationship type and confidence
   */
  private async analyzeEntityPair(pair: EntityPair): Promise<KnowledgeGraphRelationship | null> {
    // Co-occurrence threshold: minimum 3 co-occurrences
    if (pair.coOccurrences < 3) {
      return null;
    }

    // Calculate confidence based on co-occurrence frequency and temporal proximity
    let confidence = Math.min(0.5 + (pair.coOccurrences * 0.1), 0.95);
    
    // Boost confidence if temporal proximity is strong
    if (pair.temporalProximity !== undefined) {
      const hoursDiff = pair.temporalProximity / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        confidence = Math.min(confidence + 0.15, 0.98);
      }
    }

    // Infer relationship type from context
    const relType = this.inferRelationshipType(pair.context || []);

    return {
      fromId: pair.entity1Id,
      toId: pair.entity2Id,
      type: relType,
      confidence,
      evidence: [`Co-occurred ${pair.coOccurrences} times`, ...(pair.context || [])],
      properties: {
        coOccurrences: pair.coOccurrences,
        temporalProximity: pair.temporalProximity,
        discoveredAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Infer relationship type from context clues
   */
  private inferRelationshipType(context: string[]): string {
    const contextStr = context.join(' ').toLowerCase();

    // Employment relationships
    if (contextStr.includes('employee') || contextStr.includes('works') || contextStr.includes('employed')) {
      return 'WORKS_FOR';
    }

    // Management relationships
    if (contextStr.includes('manager') || contextStr.includes('reports to') || contextStr.includes('supervises')) {
      return 'MANAGES';
    }

    // Location relationships
    if (contextStr.includes('located') || contextStr.includes('address') || contextStr.includes('office')) {
      return 'LOCATED_AT';
    }

    // Product relationships
    if (contextStr.includes('purchased') || contextStr.includes('bought') || contextStr.includes('ordered')) {
      return 'PURCHASED';
    }

    // Document relationships
    if (contextStr.includes('created') || contextStr.includes('authored') || contextStr.includes('wrote')) {
      return 'CREATED';
    }

    // Collaboration relationships
    if (contextStr.includes('collaborat') || contextStr.includes('partner') || contextStr.includes('worked with')) {
      return 'COLLABORATED_WITH';
    }

    // Default relationship
    return 'RELATED_TO';
  }

  /**
   * Discover temporal relationships using event sequences
   * Requirement 17.2: Temporal analysis for relationship discovery
   */
  async discoverTemporalRelationships(
    events: Array<{
      entityId: string;
      timestamp: Date;
      eventType: string;
    }>,
  ): Promise<KnowledgeGraphRelationship[]> {
    const relationships: KnowledgeGraphRelationship[] = [];
    
    // Sort events by timestamp
    const sortedEvents = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Look for sequential patterns
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const current = sortedEvents[i];
      const next = sortedEvents[i + 1];
      
      // Skip if same entity
      if (current.entityId === next.entityId) {
        continue;
      }

      // Calculate time difference
      const timeDiff = next.timestamp.getTime() - current.timestamp.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      // If events happened within 48 hours, they might be causally related
      if (hoursDiff <= 48) {
        const relType = this.inferTemporalRelationType(current.eventType, next.eventType);
        
        relationships.push({
          fromId: current.entityId,
          toId: next.entityId,
          type: relType,
          confidence: 0.7 - (hoursDiff / 100), // Confidence decreases with time gap
          evidence: [`${current.eventType} followed by ${next.eventType} within ${Math.round(hoursDiff)}h`],
          properties: {
            temporalGap: timeDiff,
            sequenceOrder: i,
          },
        });
      }
    }

    for (const rel of relationships) {
      await this.knowledgeGraph.createRelationship(rel);
    }

    return relationships;
  }

  /**
   * Infer relationship type from temporal event sequence
   */
  private inferTemporalRelationType(eventType1: string, eventType2: string): string {
    const e1 = eventType1.toLowerCase();
    const e2 = eventType2.toLowerCase();

    if (e1.includes('order') && e2.includes('payment')) {
      return 'PAID_FOR';
    }

    if (e1.includes('create') && e2.includes('approve')) {
      return 'APPROVED';
    }

    if (e1.includes('request') && e2.includes('fulfill')) {
      return 'FULFILLED';
    }

    if (e1.includes('login') && e2.includes('access')) {
      return 'ACCESSED';
    }

    return 'PRECEDED';
  }

  /**
   * Enrich existing relationships with additional evidence
   */
  async enrichRelationship(
    fromId: string,
    toId: string,
    relType: string,
    additionalEvidence: string[],
  ): Promise<void> {
    // In a real implementation, this would update the existing relationship
    // For now, we'll create it if it doesn't exist
    await this.knowledgeGraph.createRelationship({
      fromId,
      toId,
      type: relType,
      confidence: 0.85,
      evidence: additionalEvidence,
    });
  }
}
