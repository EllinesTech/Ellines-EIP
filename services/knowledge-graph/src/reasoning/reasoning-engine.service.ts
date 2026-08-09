/**
 * Reasoning Engine Service
 *
 * Facade that exposes the full Advanced Reasoning Engine interface.
 * Delegates to specialised sub-services:
 *   - MultiHopTraversalService  (Req 2.2)
 *   - CausalAnalysisService     (Req 2.3)
 *   - PatternDetectorService    (Req 2.4)
 *   - HypothesisGeneratorService(Req 2.5)
 *   - EvidenceChainService      (Req 2.6)
 *   - KnowledgeGapService       (Req 2.8)
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
 */

import { Injectable, Logger } from '@nestjs/common';
import { MultiHopTraversalService } from './multi-hop-traversal.service';
import { CausalAnalysisService } from './causal-analysis.service';
import { PatternDetectorService } from './pattern-detector.service';
import { HypothesisGeneratorService } from './hypothesis-generator.service';
import { EvidenceChainService } from './evidence-chain.service';
import { KnowledgeGapService } from './knowledge-gap.service';
import {
  Question,
  ReasoningResult,
  Event,
  CausalChain,
  DataSource,
  Pattern,
  Observation,
  Hypothesis,
  Conclusion,
  EvidenceChain,
} from './reasoning.interfaces';

@Injectable()
export class ReasoningEngineService {
  private readonly logger = new Logger(ReasoningEngineService.name);

  constructor(
    private readonly multiHop: MultiHopTraversalService,
    private readonly causal: CausalAnalysisService,
    private readonly patterns: PatternDetectorService,
    private readonly hypotheses: HypothesisGeneratorService,
    private readonly evidence: EvidenceChainService,
    private readonly gaps: KnowledgeGapService,
  ) {}

  /**
   * Perform multi-hop reasoning across the knowledge graph.
   *
   * Requirement 2.2: Traverse at least 3 relationship levels.
   */
  async multiHopReasoning(
    question: Question,
    maxHops: number,
  ): Promise<ReasoningResult> {
    this.logger.log(`multiHopReasoning: "${question.text}" maxHops=${maxHops}`);

    const result = await this.multiHop.reason(question, maxHops);

    // Augment with structural gap analysis (Req 2.8)
    const augmentedGaps = await this.gaps.analyseResult(result, question.organizationId);

    return { ...result, knowledgeGaps: augmentedGaps };
  }

  /**
   * Identify causal relationships between events via temporal analysis.
   *
   * Requirement 2.3
   */
  async identifyCausalLinks(events: Event[]): Promise<CausalChain[]> {
    this.logger.log(`identifyCausalLinks: ${events.length} events`);
    return this.causal.identifyCausalLinks(events);
  }

  /**
   * Detect hidden patterns by combining data from 3+ System of Record sources.
   *
   * Requirement 2.4
   */
  async detectPatterns(dataSources: DataSource[]): Promise<Pattern[]> {
    this.logger.log(`detectPatterns: ${dataSources.length} data sources`);
    return this.patterns.detectPatterns(dataSources);
  }

  /**
   * Generate hypotheses about business trends and test against historical data.
   *
   * Requirement 2.5
   */
  async generateHypotheses(observation: Observation): Promise<Hypothesis[]> {
    this.logger.log(`generateHypotheses: observation="${observation.id}"`);
    return this.hypotheses.generateHypotheses(observation);
  }

  /**
   * Build a confidence-scored evidence chain for a conclusion.
   *
   * Requirement 2.6
   */
  async buildEvidenceChain(conclusion: Conclusion): Promise<EvidenceChain> {
    this.logger.log(`buildEvidenceChain: "${conclusion.statement.substring(0, 60)}..."`);
    return this.evidence.build(conclusion);
  }

  /**
   * Detect knowledge gaps in the graph for a given organisation.
   *
   * Requirement 2.8
   */
  async detectKnowledgeGaps(organizationId: string): Promise<import('./reasoning.interfaces').KnowledgeGap[]> {
    this.logger.log(`detectKnowledgeGaps: org=${organizationId}`);
    return this.gaps.detectStructuralGaps(organizationId);
  }
}
