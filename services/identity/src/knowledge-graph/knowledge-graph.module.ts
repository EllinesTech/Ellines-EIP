/**
 * KnowledgeGraphModule
 *
 * Feature module for the Enterprise Knowledge Graph subsystem.
 *
 * Provides:
 *   - EntityExtractorService:      extracts entities from connector payloads.
 *   - RelationshipDiscovererService: discovers and persists entity relationships.
 *   - EntityResolverService:       deduplicates entities (merge/resolution).
 *   - KnowledgeGraphService:       graph query, traversal, and updateGraph.
 *   - KnowledgeGraphController:    HTTP surface (entities / query / subgraph).
 *
 * Dependencies:
 *   - PrismaModule is @Global so it is available without explicit import.
 *   - DatabaseModule exports Neo4jService; imported here to provide graph writes.
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RelationshipDiscovererService } from './relationship-discoverer.service';
import { EntityResolverService } from './entity-resolver.service';
import { EntityExtractorService } from './entity-extractor.service';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { KnowledgeGraphController } from './knowledge-graph.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [KnowledgeGraphController],
  providers: [
    EntityExtractorService,
    RelationshipDiscovererService,
    EntityResolverService,
    KnowledgeGraphService,
  ],
  exports: [
    EntityExtractorService,
    RelationshipDiscovererService,
    EntityResolverService,
    KnowledgeGraphService,
  ],
})
export class KnowledgeGraphModule {}
