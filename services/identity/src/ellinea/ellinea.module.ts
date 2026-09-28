import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModelRegistryService } from './model-registry.service';
import { EnsembleCombinerService } from './ensemble-combiner.service';
import { ReasoningEngineService } from './reasoning-engine.service';
import { QueryClassifierService } from './query-classifier.service';
import { ModelRouterService } from './model-router.service';
import { EllineaController } from './ellinea.controller';

/**
 * EllineaModule — houses AI orchestration services and the orchestrate endpoint.
 *
 * Exports:
 *  - ModelRegistryService    : AI model catalogue, performance metrics, decision log.
 *  - EnsembleCombinerService : weighted-vote + meta-learning result combiner.
 *  - ReasoningEngineService  : multi-hop knowledge graph reasoning (task 4.1).
 *  - QueryClassifierService  : deterministic query → QueryType classification (task 2.2).
 *  - ModelRouterService      : capability-aware model selection (accuracy × 1/latency) (task 2.2).
 *
 * Controller:
 *  - EllineaController       : POST /api/v1/ellinea/orchestrate — model orchestration endpoint
 *                              called by the Pages Function (task 2.6).
 */
@Module({
  imports: [PrismaModule],
  controllers: [EllineaController],
  providers: [
    ModelRegistryService,
    EnsembleCombinerService,
    ReasoningEngineService,
    QueryClassifierService,
    ModelRouterService,
  ],
  exports: [
    ModelRegistryService,
    EnsembleCombinerService,
    ReasoningEngineService,
    QueryClassifierService,
    ModelRouterService,
  ],
})
export class EllineaModule {}
