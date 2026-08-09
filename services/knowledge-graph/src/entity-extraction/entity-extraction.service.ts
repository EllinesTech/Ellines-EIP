/**
 * Entity Extraction Service
 * 
 * Extracts entities from System of Record data sources
 * Requirement 2.1: Extract entities from all connected System of Record sources
 */

import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService, KnowledgeGraphEntity } from '../knowledge-graph/knowledge-graph.service';

export interface DataSourceRecord {
  id: string;
  organizationId: string;
  sourceSystem: string;
  recordType: string;
  data: Record<string, any>;
}

@Injectable()
export class EntityExtractionService {
  private readonly logger = new Logger(EntityExtractionService.name);

  constructor(private readonly knowledgeGraph: KnowledgeGraphService) {}

  /**
   * Extract entities from a data source record
   */
  async extractEntities(record: DataSourceRecord): Promise<KnowledgeGraphEntity[]> {
    const entities: KnowledgeGraphEntity[] = [];

    // Route to appropriate extractor based on record type
    switch (record.recordType.toLowerCase()) {
      case 'person':
      case 'employee':
      case 'customer':
      case 'contact':
        entities.push(...this.extractPersonEntities(record));
        break;

      case 'product':
      case 'item':
      case 'sku':
        entities.push(...this.extractProductEntities(record));
        break;

      case 'location':
      case 'address':
      case 'site':
        entities.push(...this.extractLocationEntities(record));
        break;

      case 'event':
      case 'transaction':
      case 'order':
        entities.push(...this.extractEventEntities(record));
        break;

      case 'document':
      case 'file':
      case 'note':
        entities.push(...this.extractDocumentEntities(record));
        break;

      default:
        this.logger.warn(`Unknown record type: ${record.recordType}`);
    }

    // Upsert extracted entities to knowledge graph
    for (const entity of entities) {
      await this.knowledgeGraph.upsertEntity(entity);
    }

    return entities;
  }

  /**
   * Extract Person entities
   */
  private extractPersonEntities(record: DataSourceRecord): KnowledgeGraphEntity[] {
    const { data, organizationId, sourceSystem, id } = record;
    const entities: KnowledgeGraphEntity[] = [];

    // Main person entity
    const displayName = data.fullName || data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim();
    if (displayName) {
      entities.push({
        id: `person_${sourceSystem}_${id}`,
        organizationId,
        type: 'Person',
        sourceSystem,
        sourceEntityId: id,
        displayName,
        confidence: 0.9,
        properties: {
          email: data.email,
          phone: data.phone,
          department: data.department,
          title: data.title || data.position,
          status: data.status,
        },
      });
    }

    return entities;
  }

  /**
   * Extract Product entities
   */
  private extractProductEntities(record: DataSourceRecord): KnowledgeGraphEntity[] {
    const { data, organizationId, sourceSystem, id } = record;
    const entities: KnowledgeGraphEntity[] = [];

    const displayName = data.name || data.productName || data.title;
    if (displayName) {
      entities.push({
        id: `product_${sourceSystem}_${id}`,
        organizationId,
        type: 'Product',
        sourceSystem,
        sourceEntityId: id,
        displayName,
        confidence: 0.85,
        properties: {
          sku: data.sku || data.productCode,
          category: data.category,
          price: data.price,
          description: data.description,
          status: data.status,
        },
      });
    }

    return entities;
  }

  /**
   * Extract Location entities
   */
  private extractLocationEntities(record: DataSourceRecord): KnowledgeGraphEntity[] {
    const { data, organizationId, sourceSystem, id } = record;
    const entities: KnowledgeGraphEntity[] = [];

    const displayName = data.name || data.locationName || `${data.city}, ${data.country}`;
    if (displayName) {
      entities.push({
        id: `location_${sourceSystem}_${id}`,
        organizationId,
        type: 'Location',
        sourceSystem,
        sourceEntityId: id,
        displayName,
        confidence: 0.8,
        properties: {
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode || data.zipCode,
          lat: data.latitude,
          lon: data.longitude,
        },
      });
    }

    return entities;
  }

  /**
   * Extract Event entities
   */
  private extractEventEntities(record: DataSourceRecord): KnowledgeGraphEntity[] {
    const { data, organizationId, sourceSystem, id } = record;
    const entities: KnowledgeGraphEntity[] = [];

    const displayName = data.name || data.eventName || data.title || `Event ${id}`;
    entities.push({
      id: `event_${sourceSystem}_${id}`,
      organizationId,
      type: 'Event',
      sourceSystem,
      sourceEntityId: id,
      displayName,
      confidence: 0.75,
      properties: {
        eventType: data.type || data.eventType,
        startDate: data.startDate || data.date,
        endDate: data.endDate,
        status: data.status,
        amount: data.amount,
        participants: data.participants,
      },
    });

    return entities;
  }

  /**
   * Extract Document entities
   */
  private extractDocumentEntities(record: DataSourceRecord): KnowledgeGraphEntity[] {
    const { data, organizationId, sourceSystem, id } = record;
    const entities: KnowledgeGraphEntity[] = [];

    const displayName = data.title || data.fileName || data.name || `Document ${id}`;
    entities.push({
      id: `document_${sourceSystem}_${id}`,
      organizationId,
      type: 'Document',
      sourceSystem,
      sourceEntityId: id,
      displayName,
      confidence: 0.8,
      properties: {
        documentType: data.type || data.documentType,
        createdBy: data.createdBy || data.author,
        createdAt: data.createdAt || data.date,
        url: data.url || data.link,
        content: data.content || data.summary,
      },
    });

    return entities;
  }

  /**
   * Batch extract entities from multiple records
   */
  async batchExtract(records: DataSourceRecord[]): Promise<number> {
    let totalEntities = 0;
    for (const record of records) {
      const entities = await this.extractEntities(record);
      totalEntities += entities.length;
    }
    this.logger.log(`Extracted ${totalEntities} entities from ${records.length} records`);
    return totalEntities;
  }
}
