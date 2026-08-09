/**
 * Knowledge Graph Engine App Module
 *
 * Constructs and maintains enterprise knowledge graph with advanced reasoning.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 17.1-17.7
 */

import { Module } from '@nestjs/common';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { EntityExtractionModule } from './entity-extraction/entity-extraction.module';
import { RelationshipDiscoveryModule } from './relationship-discovery/relationship-discovery.module';
import { ReasoningModule } from './reasoning/reasoning.module';

@Module({
  imports: [
    KnowledgeGraphModule,
    EntityExtractionModule,
    RelationshipDiscoveryModule,
    ReasoningModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
