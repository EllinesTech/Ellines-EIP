import { Module } from '@nestjs/common';
import { RelationshipDiscoveryService } from './relationship-discovery.service';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';

@Module({
  imports: [KnowledgeGraphModule],
  providers: [RelationshipDiscoveryService],
  exports: [RelationshipDiscoveryService],
})
export class RelationshipDiscoveryModule {}
