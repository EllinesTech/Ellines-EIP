/**
 * Orchestrator Module
 *
 * Wires together:
 *  - QueryAnalyzerService (query classification)
 *  - ModelRegistryRepository (performance-based model selection)
 *  - EnsembleCombinerService (multi-model result combination)
 *  - OrchestratorService (top-level coordination)
 *  - OrchestratorController (HTTP API)
 *
 * Requirements: 1.1 – 1.8
 */

import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { OrchestratorController } from './orchestrator.controller';
import { QueryAnalyzerService } from './query-analyzer/query-analyzer.service';
import { ModelRegistryRepository } from './model-registry/model-registry.repository';
import { EnsembleCombinerService } from './ensemble/ensemble-combiner.service';
import { ModelsModule } from './models/models.module';

@Module({
  imports: [ModelsModule],
  controllers: [OrchestratorController],
  providers: [
    QueryAnalyzerService,
    ModelRegistryRepository,
    EnsembleCombinerService,
    OrchestratorService,
  ],
  exports: [OrchestratorService, ModelRegistryRepository],
})
export class OrchestratorModule {}
