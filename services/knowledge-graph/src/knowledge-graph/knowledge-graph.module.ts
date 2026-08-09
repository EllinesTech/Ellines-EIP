import { Module } from '@nestjs/common';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { KnowledgeGraphController } from './knowledge-graph.controller';
import { Neo4jProvider } from './neo4j.provider';

@Module({
  providers: [KnowledgeGraphService, Neo4jProvider],
  controllers: [KnowledgeGraphController],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
