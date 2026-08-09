import { Module } from '@nestjs/common';
import { EntityExtractionService } from './entity-extraction.service';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';

@Module({
  imports: [KnowledgeGraphModule],
  providers: [EntityExtractionService],
  exports: [EntityExtractionService],
})
export class EntityExtractionModule {}
