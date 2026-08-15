/**
 * DataMapperModule
 * NestJS module encapsulating all Intelligent Data Mapper providers.
 */

import { Module } from '@nestjs/common';
import { SchemaDetector } from './schema-detector';
import { FieldSuggestionEngine } from './field-suggestion-engine';
import { BidirectionalSyncManager } from './bidirectional-sync-manager';
import { ConflictResolver } from './conflict-resolver';
import { IntelligentDataMapperService } from './intelligent-data-mapper.service';
import { DataMapperController } from './data-mapper.controller';

@Module({
  providers: [
    SchemaDetector,
    FieldSuggestionEngine,
    BidirectionalSyncManager,
    ConflictResolver,
    IntelligentDataMapperService,
  ],
  controllers: [DataMapperController],
  exports: [IntelligentDataMapperService],
})
export class DataMapperModule {}
