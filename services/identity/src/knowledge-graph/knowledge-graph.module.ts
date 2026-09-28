/**
 * KnowledgeGraphModule
 *
 * Feature module for the Enterprise Knowledge Graph subsystem.
 *
 * Provides:
 *   - RelationshipDiscovererService: discovers and persists entity relationships
 *     in Neo4j and PostgreSQL.
 *
 * Dependencies:
 *   - PrismaModule is @Global so it is available without explicit import.
 *   - DatabaseModule exports Neo4jService; imported here to provide graph writes.
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RelationshipDiscovererService } from './relationship-discoverer.service';
import { EntityResolverService } from './entity-resolver.service';

@Module({
  imports: [DatabaseModule],
  providers: [RelationshipDiscovererService, EntityResolverService],
  exports: [RelationshipDiscovererService, EntityResolverService],
})
export class KnowledgeGraphModule {}
