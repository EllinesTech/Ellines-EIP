/**
 * IntelligentDataMapperService
 * Requirement 22.4 – 22.6: Intelligent data mapping, bidirectional sync, conflict resolution
 *
 * Facade that composes SchemaDetector, FieldSuggestionEngine,
 * BidirectionalSyncManager, and ConflictResolver.
 */

import { Injectable } from '@nestjs/common';
import { SchemaDetector, DetectedSchema } from './schema-detector';
import { FieldSuggestionEngine, SuggestMappingsResult, MappingHint } from './field-suggestion-engine';
import {
  BidirectionalSyncManager,
  ConnectorSyncConfig,
  SyncOperation,
  SyncAuthorizationResult,
} from './bidirectional-sync-manager';
import {
  ConflictResolver,
  ConflictStrategy,
  ConflictResolutionResult,
  DataRecord,
  QueuedConflict,
} from './conflict-resolver';

export {
  DetectedSchema,
  SuggestMappingsResult,
  MappingHint,
  ConnectorSyncConfig,
  SyncOperation,
  SyncAuthorizationResult,
  ConflictStrategy,
  ConflictResolutionResult,
  DataRecord,
  QueuedConflict,
};

@Injectable()
export class IntelligentDataMapperService {
  constructor(
    private readonly schemaDetector: SchemaDetector,
    private readonly fieldSuggestionEngine: FieldSuggestionEngine,
    private readonly bidirectionalSyncManager: BidirectionalSyncManager,
    private readonly conflictResolver: ConflictResolver,
  ) {}

  // -----------------------------------------------------------------------
  // Schema detection
  // -----------------------------------------------------------------------

  detectSchema(records: Record<string, unknown>[]): DetectedSchema {
    return this.schemaDetector.detectSchema(records);
  }

  // -----------------------------------------------------------------------
  // Field mapping suggestions
  // -----------------------------------------------------------------------

  suggestMappings(
    sourceRecords: Record<string, unknown>[],
    targetRecords: Record<string, unknown>[],
    hints?: MappingHint[],
  ): SuggestMappingsResult {
    const sourceSchema = this.schemaDetector.detectSchema(sourceRecords);
    const targetSchema = this.schemaDetector.detectSchema(targetRecords);
    return this.fieldSuggestionEngine.suggestMappings(
      sourceSchema.fields,
      targetSchema.fields,
      hints,
    );
  }

  // -----------------------------------------------------------------------
  // Bidirectional sync management
  // -----------------------------------------------------------------------

  registerConnector(config: ConnectorSyncConfig): void {
    this.bidirectionalSyncManager.registerConnector(config);
  }

  checkSyncAuthorization(operation: SyncOperation): SyncAuthorizationResult {
    return this.bidirectionalSyncManager.checkAuthorization(operation);
  }

  listConnectors(): ConnectorSyncConfig[] {
    return this.bidirectionalSyncManager.listConnectors();
  }

  // -----------------------------------------------------------------------
  // Conflict resolution
  // -----------------------------------------------------------------------

  resolveConflict(
    local: DataRecord,
    remote: DataRecord,
    strategy: ConflictStrategy,
  ): ConflictResolutionResult {
    return this.conflictResolver.resolve(local, remote, strategy);
  }

  listConflicts(status?: 'pending' | 'resolved'): QueuedConflict[] {
    return this.conflictResolver.listConflicts(status);
  }

  manualResolveConflict(
    conflictId: string,
    winner: 'local' | 'remote',
    resolvedBy: string,
  ): QueuedConflict {
    return this.conflictResolver.manualResolve(conflictId, winner, resolvedBy);
  }
}
