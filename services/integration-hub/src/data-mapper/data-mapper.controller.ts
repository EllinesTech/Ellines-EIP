/**
 * DataMapperController
 * REST endpoints for the Intelligent Data Mapper.
 *
 * POST  /data-mapper/detect-schema     — detect schema from records
 * POST  /data-mapper/suggest-mappings  — suggest field mappings
 * POST  /data-mapper/resolve-conflict  — resolve a data conflict
 * GET   /data-mapper/conflicts         — list queued conflicts
 * PATCH /data-mapper/conflicts/:id     — manually resolve a conflict
 *
 * Requirements: 22.4, 22.5, 22.6
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IntelligentDataMapperService,
  ConnectorSyncConfig,
  MappingHint,
  ConflictStrategy,
  DataRecord,
} from './intelligent-data-mapper.service';

// -------------------------------------------------------------------------
// Request / Response DTOs (plain interfaces — no class-validator dependency)
// -------------------------------------------------------------------------

interface DetectSchemaDto {
  records: Record<string, unknown>[];
}

interface SuggestMappingsDto {
  sourceRecords: Record<string, unknown>[];
  targetRecords: Record<string, unknown>[];
  hints?: MappingHint[];
}

interface RegisterConnectorDto extends ConnectorSyncConfig {}

interface ResolveConflictDto {
  local: DataRecord;
  remote: DataRecord;
  strategy: ConflictStrategy;
}

interface ManualResolveDto {
  winner: 'local' | 'remote';
  resolvedBy: string;
}

// -------------------------------------------------------------------------
// Controller
// -------------------------------------------------------------------------

@Controller('data-mapper')
export class DataMapperController {
  constructor(private readonly mapper: IntelligentDataMapperService) {}

  /**
   * Detect schema from a sample of records.
   * Requirement 22.4
   */
  @Post('detect-schema')
  detectSchema(@Body() dto: DetectSchemaDto) {
    const schema = this.mapper.detectSchema(dto.records ?? []);
    return { ok: true, schema };
  }

  /**
   * Suggest field mappings from source → target schema.
   * Requirement 22.4
   */
  @Post('suggest-mappings')
  suggestMappings(@Body() dto: SuggestMappingsDto) {
    const result = this.mapper.suggestMappings(
      dto.sourceRecords ?? [],
      dto.targetRecords ?? [],
      dto.hints,
    );
    return { ok: true, ...result };
  }

  /**
   * Register or update a connector's sync direction.
   * Requirement 22.5
   */
  @Post('connectors')
  registerConnector(@Body() dto: RegisterConnectorDto) {
    this.mapper.registerConnector(dto);
    return { ok: true, message: `Connector "${dto.connectorId}" registered.` };
  }

  /**
   * List registered connectors.
   * Requirement 22.5
   */
  @Get('connectors')
  listConnectors() {
    return { ok: true, connectors: this.mapper.listConnectors() };
  }

  /**
   * Resolve a data conflict using the specified strategy.
   * Requirement 22.6
   */
  @Post('resolve-conflict')
  resolveConflict(@Body() dto: ResolveConflictDto) {
    const result = this.mapper.resolveConflict(dto.local, dto.remote, dto.strategy);
    return { ok: true, result };
  }

  /**
   * List queued conflicts (optionally filtered by status).
   * Requirement 22.6
   */
  @Get('conflicts')
  listConflicts(@Query('status') status?: 'pending' | 'resolved') {
    const conflicts = this.mapper.listConflicts(status);
    return { ok: true, conflicts };
  }

  /**
   * Manually resolve a queued conflict.
   * Requirement 22.6
   */
  @Patch('conflicts/:id')
  manualResolve(@Param('id') id: string, @Body() dto: ManualResolveDto) {
    const conflict = this.mapper.manualResolveConflict(id, dto.winner, dto.resolvedBy);
    return { ok: true, conflict };
  }
}
