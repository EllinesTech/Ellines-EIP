import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModelRegistryService } from './model-registry.service';
import { EnsembleCombinerService } from './ensemble-combiner.service';
import { ReasoningEngineService } from './reasoning-engine.service';
import { QueryClassifierService } from './query-classifier.service';
import { ModelRouterService } from './model-router.service';
import { EllineaController } from './ellinea.controller';
import { FederatedLearningService } from './federated-learning.service';
import { FederatedLearningController } from './federated-learning.controller';
import { CollaborativeSessionService } from './collaborative-session.service';

/**
 * EllineaModule — houses AI orchestration services and the orchestrate endpoint.
 *
 * Exports:
 *  - ModelRegistryService      : AI model catalogue, performance metrics, decision log.
 *  - EnsembleCombinerService   : weighted-vote + meta-learning result combiner.
 *  - ReasoningEngineService    : multi-hop knowledge graph reasoning (task 4.1).
 *  - QueryClassifierService    : deterministic query → QueryType classification (task 2.2).
 *  - ModelRouterService        : capability-aware model selection (accuracy × 1/latency) (task 2.2).
 *  - FederatedLearningService  : privacy-preserving federated training coordinator (task 8.1).
 *
 * Controllers:
 *  - EllineaController             : POST /api/v1/ellinea/orchestrate — model orchestration
 *                                    called by the Pages Function (task 2.6).
 *  - FederatedLearningController   : /api/v1/federated-learning/* — Super Admin management +
 *                                    org opt-in/out (tasks 8.1, 8.2).
 */
@Module({
  imports: [PrismaModule],
  controllers: [EllineaController, FederatedLearningController],
  providers: [
    ModelRegistryService,
    EnsembleCombinerService,
    ReasoningEngineService,
    QueryClassifierService,
    ModelRouterService,
    FederatedLearningService,
    CollaborativeSessionService,
  ],
  exports: [
    ModelRegistryService,
    EnsembleCombinerService,
    ReasoningEngineService,
    QueryClassifierService,
    ModelRouterService,
    FederatedLearningService,
    CollaborativeSessionService,
  ],
})
export class EllineaModule {}
