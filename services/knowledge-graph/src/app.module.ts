/**
 * Knowledge Graph Engine App Module
 * 
 * Constructs and maintains enterprise knowledge graph
 * Requirements: 2.1, 2.2, 17.1-17.7
 */

import { Module } from '@nestjs/common';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { EntityExtractionModule } from './entity-extraction/entity-extraction.module';
import { RelationshipDiscoveryModule } from './relationship-discovery/relationship-discovery.module';

@Module({
  imports: [
    KnowledgeGraphModule,
    EntityExtractionModule,
    RelationshipDiscoveryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
