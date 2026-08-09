/**
 * Reasoning Controller
 *
 * REST endpoints for the Advanced Reasoning Engine.
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReasoningEngineService } from './reasoning-engine.service';
import {
  Question,
  Event,
  DataSource,
  Observation,
  Conclusion,
} from './reasoning.interfaces';

@Controller('reasoning')
export class ReasoningController {
  constructor(private readonly engine: ReasoningEngineService) {}

  /**
   * POST /reasoning/multi-hop
   * Requirement 2.2 — Multi-hop graph traversal (minimum 3 hops)
   */
  @Post('multi-hop')
  @HttpCode(HttpStatus.OK)
  async multiHop(
    @Body() body: { question: Question; maxHops?: number },
  ) {
    const maxHops = body.maxHops ?? 3;
    return this.engine.multiHopReasoning(body.question, maxHops);
  }

  /**
   * POST /reasoning/causal-links
   * Requirement 2.3 — Identify causal relationships between events
   */
  @Post('causal-links')
  @HttpCode(HttpStatus.OK)
  async causalLinks(@Body() body: { events: Event[] }) {
    return this.engine.identifyCausalLinks(body.events);
  }

  /**
   * POST /reasoning/patterns
   * Requirement 2.4 — Detect hidden patterns across 3+ data sources
   */
  @Post('patterns')
  @HttpCode(HttpStatus.OK)
  async detectPatterns(@Body() body: { dataSources: DataSource[] }) {
    return this.engine.detectPatterns(body.dataSources);
  }

  /**
   * POST /reasoning/hypotheses
   * Requirement 2.5 — Generate and validate business trend hypotheses
   */
  @Post('hypotheses')
  @HttpCode(HttpStatus.OK)
  async hypotheses(@Body() body: { observation: Observation }) {
    return this.engine.generateHypotheses(body.observation);
  }

  /**
   * POST /reasoning/evidence-chain
   * Requirement 2.6 — Build evidence chain with confidence scores
   */
  @Post('evidence-chain')
  @HttpCode(HttpStatus.OK)
  async evidenceChain(@Body() body: { conclusion: Conclusion }) {
    return this.engine.buildEvidenceChain(body.conclusion);
  }

  /**
   * GET /reasoning/knowledge-gaps/:orgId
   * Requirement 2.8 — Explain knowledge gaps when reasoning confidence is low
   */
  @Get('knowledge-gaps/:orgId')
  async knowledgeGaps(@Param('orgId') orgId: string) {
    return this.engine.detectKnowledgeGaps(orgId);
  }
}
