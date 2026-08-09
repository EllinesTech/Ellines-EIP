/**
 * Reasoning Module
 *
 * Registers all services that make up the Advanced Reasoning Engine.
 * Exports ReasoningEngineService so other modules (e.g. knowledge-graph)
 * can consume it.
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
 */

import { Module } from '@nestjs/common';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { ReasoningEngineService } from './reasoning-engine.service';
import { ReasoningController } from './reasoning.controller';
import { MultiHopTraversalService } from './multi-hop-traversal.service';
import { CausalAnalysisService } from './causal-analysis.service';
import { PatternDetectorService } from './pattern-detector.service';
import { HypothesisGeneratorService } from './hypothesis-generator.service';
import { EvidenceChainService } from './evidence-chain.service';
import { KnowledgeGapService } from './knowledge-gap.service';
import { Neo4jProvider } from '../knowledge-graph/neo4j.provider';

@Module({
  imports: [KnowledgeGraphModule],
  controllers: [ReasoningController],
  providers: [
    Neo4jProvider,
    ReasoningEngineService,
    MultiHopTraversalService,
    CausalAnalysisService,
    PatternDetectorService,
    HypothesisGeneratorService,
    EvidenceChainService,
    KnowledgeGapService,
  ],
  exports: [ReasoningEngineService],
})
export class ReasoningModule {}
