/**
 * EllineaController
 *
 * Exposes the multi-model orchestration pipeline as an HTTP endpoint that the
 * Cloudflare Pages Function (apps/web/functions/api/v1/ellinea/ask.ts) can
 * call internally.
 *
 * POST /api/v1/ellinea/orchestrate
 *   Body: { query: string; orgId: string }
 *   Auth: JWT (any authenticated user — permission gate is enforced in the
 *         Pages Function before reaching this endpoint)
 *
 * Pipeline: QueryClassifierService → ModelRouterService → EnsembleCombinerService
 *
 * Requirement 1.2: Analyse query type and route to the most appropriate model.
 * Requirement 1.6: Support pluggable model architecture.
 * Requirement 1.8: Log model selection decisions and reasoning for audit.
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueryClassifierService } from './query-classifier.service';
import { ModelRouterService } from './model-router.service';
import { EnsembleCombinerService, ModelResult, UnifiedResult } from './ensemble-combiner.service';
import { ModelRegistryService } from './model-registry.service';
import { OrchestrateDto } from './dto/orchestrate.dto';
import { ReasoningEngineService, Hypothesis } from './reasoning-engine.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthReq = {
  user: {
    userId: string;
    organizationId: string;
    role: string;
    email: string;
  };
};

// ─── Response shape sent to the Pages Function ────────────────────────────────

export interface OrchestrateResponse {
  /** Unified answer from the ensemble (content field from UnifiedResult). */
  answer: string;
  /** Combined confidence score [0, 1]. */
  confidence: number;
  /** Human-readable explanation of how the answer was produced. */
  explanation: string;
  /** IDs of models that contributed to the result. */
  sources: string[];
  /**
   * Per-model audit trail.
   * Requirement 1.8: All model selection decisions must be logged and returned
   * so the Pages Function can include them in the response for audit.
   */
  modelDecisions: Array<{
    modelId: string;
    confidence: number;
    weight: number;
  }>;
  /** Whether ensemble conflict resolution was triggered. */
  conflictDetected: boolean;
  /** Ensemble strategy used. */
  ensembleStrategy: 'weighted_vote' | 'meta_learning';
  /** Query classification details. */
  queryType: string;
  /** Routing reason for audit / explainability. */
  routingReason: string;
  /**
   * Degradation notice when the primary model was unavailable and the
   * orchestrator fell back to a general-purpose model (Requirement 1.5).
   */
  degradationNotice?: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('ellinea')
@UseGuards(JwtAuthGuard)
export class EllineaController {
  private readonly logger = new Logger(EllineaController.name);

  constructor(
    private readonly classifier: QueryClassifierService,
    private readonly router: ModelRouterService,
    private readonly combiner: EnsembleCombinerService,
    private readonly registry: ModelRegistryService,
    private readonly reasoningEngine: ReasoningEngineService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/v1/ellinea/orchestrate
   *
   * Runs the full multi-model orchestration pipeline and returns a
   * UnifiedResult-shaped response including the `modelDecisions` audit array.
   *
   * Requirement 1.2: Route query to the most appropriate AI model / combination.
   * Requirement 1.6: Log pluggable model selection (models added without restart).
   * Requirement 1.8: Return modelDecisions for every request for audit trail.
   */
  @Post('orchestrate')
  @HttpCode(HttpStatus.OK)
  async orchestrate(
    @Body() dto: OrchestrateDto,
    @Request() req: AuthReq,
  ): Promise<OrchestrateResponse> {
    const { query, orgId } = dto;
    const { userId } = req.user;
    const startMs = Date.now();

    if (!query || query.trim().length === 0) {
      // Return a safe fallback rather than throwing — Pages Function handles error shape.
      return this.emptyQueryFallback();
    }

    // ── Step 1: Classify the query ────────────────────────────────────────────
    const classification = this.classifier.classify(query);
    this.logger.debug(
      `[orchestrate] userId=${userId} orgId=${orgId} ` +
      `queryType=${classification.queryType} confidence=${classification.confidence.toFixed(2)}`,
    );

    // ── Step 2: Route to the best model(s) ───────────────────────────────────
    let routing;
    let degradationNotice: string | undefined;
    try {
      routing = await this.router.route(classification.capabilities, classification.queryType);

      // Detect if we ended up in a degraded route (primary not available for
      // the requested capabilities → Requirement 1.5).
      if (routing.primary.capabilities.length === 0 ||
          !routing.primary.capabilities.some((c) =>
            classification.capabilities.includes(c),
          )) {
        degradationNotice =
          `Specialised model for query type "${classification.queryType}" was unavailable. ` +
          `Fell back to general-purpose model "${routing.primary.modelId}".`;
        this.logger.warn(`[orchestrate] Degradation: ${degradationNotice}`);
      }
    } catch (err) {
      // No models at all — return a graceful shell with no model decisions.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[orchestrate] Routing failed: ${msg}`);
      return this.noModelsFallback(classification.queryType, msg);
    }

    // ── Step 3: Build ModelResult entries for each model in the routing ───────
    //
    // In production these would be real model invocations. The orchestrator's
    // job here is coordination and ensemble combining; the LLM call itself
    // stays in the Pages Function (ask.ts) where the API key is held.
    // We therefore build synthetic ModelResult objects from registry metadata
    // to drive ensemble logic and produce the modelDecisions audit trail.
    //
    // When a real model invocation layer is added (Task 2.7+), replace the
    // synthetic entries with actual model responses here.
    const modelsToConsult = [
      routing.primary,
      ...routing.secondary,
    ];

    const modelResults: ModelResult[] = modelsToConsult.map((m) => ({
      modelId: m.modelId,
      // Placeholder content — will be replaced by real model output in Task 2.7.
      content: query,
      confidence: m.accuracyScore ?? 0.5,
      latencyMs: m.avgLatencyMs ?? 500,
      explanation: `Model "${m.modelId}" selected for capability "${m.capabilities.join(', ')}"`,
    }));

    // If fallback exists and no models gave confident results, include it.
    if (routing.fallback && modelResults.every((r) => r.confidence < 0.6)) {
      modelResults.push({
        modelId: routing.fallback.modelId,
        content: query,
        confidence: routing.fallback.accuracyScore ?? 0.3,
        latencyMs: routing.fallback.avgLatencyMs ?? 800,
        explanation: `Fallback model "${routing.fallback.modelId}" included due to low ensemble confidence`,
      });
    }

    // ── Step 4: Combine via ensemble ──────────────────────────────────────────
    const unified: UnifiedResult = await this.combiner.combine(modelResults);

    // ── Step 5: Persist the model decision for audit (Requirement 1.8) ───────
    const latencyMs = Date.now() - startMs;
    try {
      await this.registry.recordDecision({
        queryId: `${userId}-${Date.now()}`,
        queryType: classification.queryType,
        selectedModelId: routing.primary.modelId,
        secondaryModels: routing.secondary.map((m) => m.modelId),
        routingReason: routing.routingReason,
        ensembleStrategy: unified.ensembleStrategy,
        confidence: unified.confidence,
        latencyMs,
        success: true,
        organizationId: orgId,
      });
    } catch (auditErr) {
      // Non-fatal — never block the response for an audit failure.
      this.logger.warn(
        `[orchestrate] Decision audit log failed (non-fatal): ` +
        `${auditErr instanceof Error ? auditErr.message : String(auditErr)}`,
      );
    }

    return {
      answer: unified.content,
      confidence: unified.confidence,
      explanation: unified.explanation,
      sources: unified.sources,
      modelDecisions: unified.modelDecisions,
      conflictDetected: unified.conflictDetected,
      ensembleStrategy: unified.ensembleStrategy,
      queryType: classification.queryType,
      routingReason: routing.routingReason,
      ...(degradationNotice ? { degradationNotice } : {}),
    };
  }

  /**
   * POST /api/v1/ellinea/reason
   *
   * Generates candidate hypotheses for a given observation by running
   * multi-hop reasoning over the organisation's knowledge graph.
   *
   * Body: { observation: string; orgId?: string }
   * Auth: JWT (JwtAuthGuard — applied at class level)
   *
   * Falls back to `req.user.organizationId` when `orgId` is not supplied.
   *
   * Requirement 2.5: Generate hypotheses from reasoning traversal.
   * Requirement 2.6: Rank hypotheses by confidence.
   * Requirement 2.7: Every hypothesis must reference evidence from the steps.
   */
  @Post('reason')
  @HttpCode(HttpStatus.OK)
  async reason(
    @Body() body: { observation: string; orgId?: string },
    @Request() req: AuthReq,
  ): Promise<Hypothesis[]> {
    const observation = (body.observation ?? '').trim();
    const orgId = body.orgId ?? req.user.organizationId;

    if (!observation) {
      return [];
    }

    this.logger.debug(
      `[reason] userId=${req.user.userId} orgId=${orgId} observation="${observation}"`,
    );

    return this.reasoningEngine.generateHypotheses(observation, orgId);
  }

  /**
   * POST /api/v1/ellinea/feedback
   *
   * Persists feedback on an Ellinea AI answer for continuous learning.
   *
   * Body: { queryId: string; rating: 1 | -1; notes?: string }
   * Auth: JWT (JwtAuthGuard — applied at class level)
   *
   * Requirement 24.3: Feedback loop for continuous learning.
   */
  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  async feedback(
    @Body() body: { queryId?: string; rating?: unknown; notes?: string },
    @Request() req: AuthReq,
  ): Promise<{ ok: boolean; feedbackId: string }> {
    const queryId = (body.queryId ?? '').trim();
    if (!queryId) {
      return { ok: false, feedbackId: '' };
    }

    const rating = body.rating;
    if (rating !== 1 && rating !== -1) {
      return { ok: false, feedbackId: '' };
    }

    const feedbackId = `fb-${Date.now()}`;
    const ratingLabel = rating > 0 ? 'positive' : 'negative';
    const notesClause = body.notes ? ` — "${String(body.notes).slice(0, 500)}"` : '';

    // Update the ModelDecisionLog routing_reason with feedback annotation.
    try {
      await this.prisma.modelDecisionLog.updateMany({
        where: {
          queryId,
          organizationId: req.user.organizationId,
        },
        data: {
          routingReason: `[feedback] User rated: ${ratingLabel}${notesClause}`,
        },
      });
    } catch {
      // Non-fatal — audit write failures never block the response.
      this.logger.warn(`[feedback] Failed to update ModelDecisionLog for queryId=${queryId}`);
    }

    this.logger.log(
      `[feedback] userId=${req.user.userId} queryId=${queryId} rating=${rating}`,
    );

    return { ok: true, feedbackId };
  }

  // ─── Private fallback helpers ───────────────────────────────────────────────

  private emptyQueryFallback(): OrchestrateResponse {
    return {
      answer: '',
      confidence: 0,
      explanation: 'Empty query — no orchestration performed.',
      sources: [],
      modelDecisions: [],
      conflictDetected: false,
      ensembleStrategy: 'weighted_vote',
      queryType: 'language',
      routingReason: 'No query provided.',
    };
  }

  private noModelsFallback(queryType: string, reason: string): OrchestrateResponse {
    return {
      answer: '',
      confidence: 0,
      explanation: `No models available for routing: ${reason}`,
      sources: [],
      modelDecisions: [],
      conflictDetected: false,
      ensembleStrategy: 'weighted_vote',
      queryType,
      routingReason: reason,
      degradationNotice:
        `No AI models are registered in the platform registry. ` +
        `Register at least one model via POST /api/v1/ellinea/models.`,
    };
  }
}
