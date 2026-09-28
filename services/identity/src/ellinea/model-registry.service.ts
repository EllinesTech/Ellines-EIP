/**
 * ModelRegistryService
 *
 * Platform-level (global) registry for AI models used by the Ellinea multi-model
 * orchestrator. Provides CRUD for the model catalogue, decision-log persistence,
 * and performance-metric retrieval.
 *
 * Requirement 1.1: Integrate specialised AI models for different capabilities.
 * Requirement 1.4: Maintain a model performance registry tracking accuracy,
 *                  latency, and cost metrics for each model.
 * Requirement 1.8: Log model selection decisions and reasoning for audit.
 *
 * All methods are scoped to the *platform* — there is no organization_id filter
 * here because the model registry is shared across all organisations.
 */
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterModelDto } from './dto/register-model.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';
import { Prisma } from '@prisma/client';

// ─── Lightweight return types ─────────────────────────────────────────────────

export type AiModelSummary = {
  modelId: string;
  displayName: string;
  provider: string;
  modelType: string;
  capabilities: string[];
  isAvailable: boolean;
  priority: number;
  accuracyScore: number | null;
  avgLatencyMs: number | null;
  costPerMToken: number | null;
};

export type PerformanceWindow = {
  modelId: string;
  windowStart: Date;
  windowEnd: Date;
  requestCount: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  avgConfidence: number | null;
  totalCost: number;
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // registerModel
  // ---------------------------------------------------------------------------

  /**
   * Register a new AI model in the platform catalogue.
   *
   * Throws `ConflictException` if a model with the same `modelId` already exists.
   * Requirement 1.1: pluggable model architecture — new models added without restart.
   */
  async registerModel(dto: RegisterModelDto) {
    const existing = await this.prisma.aiModelRegistry.findUnique({
      where: { modelId: dto.modelId },
    });

    if (existing) {
      throw new ConflictException(
        `Model '${dto.modelId}' is already registered. Use update instead.`,
      );
    }

    const model = await this.prisma.aiModelRegistry.create({
      data: {
        modelId: dto.modelId,
        displayName: dto.displayName,
        provider: dto.provider,
        modelType: dto.modelType,
        capabilities: dto.capabilities,
        contextWindow: dto.contextWindow ?? null,
        costPerMToken: dto.costPerMToken ?? null,
        avgLatencyMs: dto.avgLatencyMs ?? null,
        accuracyScore: dto.accuracyScore ?? null,
        throughputQps: dto.throughputQps ?? null,
        priority: dto.priority ?? 50,
        configuration: (dto.configuration ?? {}) as Prisma.InputJsonValue,
        fallbackModelId: dto.fallbackModelId ?? null,
        isAvailable: true,
      },
    });

    this.logger.log(`Registered AI model: ${model.modelId} (${model.provider})`);
    return model;
  }

  // ---------------------------------------------------------------------------
  // getModels
  // ---------------------------------------------------------------------------

  /**
   * List all registered models, optionally filtered by a capability string.
   *
   * Models are returned sorted by priority descending so callers always receive
   * the best candidates first.
   *
   * Requirement 1.4: registry tracks accuracy, latency, and cost per model.
   */
  async getModels(capability?: string): Promise<AiModelSummary[]> {
    const models = await this.prisma.aiModelRegistry.findMany({
      orderBy: { priority: 'desc' },
    });

    const filtered = capability
      ? models.filter((m) => m.capabilities.includes(capability))
      : models;

    return filtered.map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      provider: m.provider,
      modelType: m.modelType,
      capabilities: m.capabilities,
      isAvailable: m.isAvailable,
      priority: m.priority,
      accuracyScore: m.accuracyScore,
      avgLatencyMs: m.avgLatencyMs,
      costPerMToken: m.costPerMToken,
    }));
  }

  // ---------------------------------------------------------------------------
  // getModelById
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a single model by its `modelId`.
   * Throws `NotFoundException` when the model does not exist.
   */
  async getModelById(modelId: string) {
    const model = await this.prisma.aiModelRegistry.findUnique({
      where: { modelId },
    });

    if (!model) {
      throw new NotFoundException(`Model '${modelId}' not found in registry.`);
    }

    return model;
  }

  // ---------------------------------------------------------------------------
  // updateAvailability
  // ---------------------------------------------------------------------------

  /**
   * Toggle a model's availability (e.g. after a health-check failure).
   * Requirement 1.5: fallback to general-purpose model when unavailable.
   */
  async updateAvailability(modelId: string, isAvailable: boolean) {
    await this.getModelById(modelId); // ensure it exists

    return this.prisma.aiModelRegistry.update({
      where: { modelId },
      data: { isAvailable, lastHealthCheck: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // recordDecision
  // ---------------------------------------------------------------------------

  /**
   * Persist a model routing decision to `ModelDecisionLog`.
   *
   * This is called by the model router after every query to maintain a full
   * audit trail of which model was selected, why, and with what outcome.
   *
   * Requirement 1.8: log model selection decisions and reasoning for audit.
   */
  async recordDecision(dto: RecordDecisionDto) {
    const decision = await this.prisma.modelDecisionLog.create({
      data: {
        queryId: dto.queryId,
        queryType: dto.queryType,
        selectedModelId: dto.selectedModelId,
        secondaryModels: dto.secondaryModels ?? [],
        routingReason: dto.routingReason,
        ensembleStrategy: dto.ensembleStrategy ?? null,
        confidence: dto.confidence ?? null,
        latencyMs: dto.latencyMs ?? null,
        success: dto.success ?? true,
        errorMessage: dto.errorMessage ?? null,
        organizationId: dto.organizationId ?? null,
      },
    });

    this.logger.debug(
      `Decision logged: queryId=${dto.queryId} model=${dto.selectedModelId} success=${dto.success ?? true}`,
    );
    return decision;
  }

  // ---------------------------------------------------------------------------
  // getMetrics
  // ---------------------------------------------------------------------------

  /**
   * Retrieve aggregated performance metrics for a model over a given time window.
   *
   * `window` is an ISO 8601 duration string or a named period:
   *   '1h' | '24h' | '7d' | '30d' (defaults to '24h')
   *
   * Returns `ModelPerformanceLog` rows already grouped by the Prisma model (one
   * row = one hourly window). Callers may further aggregate as needed.
   *
   * Requirement 1.4: track accuracy, latency, and cost metrics for each model.
   */
  async getMetrics(modelId: string, window = '24h'): Promise<PerformanceWindow[]> {
    // Ensure the model exists before querying logs.
    await this.getModelById(modelId);

    const windowStart = this.resolveWindowStart(window);

    const rows = await this.prisma.modelPerformanceLog.findMany({
      where: {
        modelId,
        windowStart: { gte: windowStart },
      },
      orderBy: { windowStart: 'asc' },
    });

    return rows.map((r) => ({
      modelId: r.modelId,
      windowStart: r.windowStart,
      windowEnd: r.windowEnd,
      requestCount: r.requestCount,
      successCount: r.successCount,
      failureCount: r.failureCount,
      avgLatencyMs: r.avgLatencyMs,
      p95LatencyMs: r.p95LatencyMs,
      p99LatencyMs: r.p99LatencyMs,
      avgConfidence: r.avgConfidence,
      totalCost: r.totalCost,
    }));
  }

  // ---------------------------------------------------------------------------
  // getDecisionLog
  // ---------------------------------------------------------------------------

  /**
   * List recent model decisions for a given query type or model, ordered newest
   * first. Used for explainability and audit surfaces.
   *
   * Requirement 1.8.
   */
  async getDecisionLog(opts: {
    modelId?: string;
    queryType?: string;
    limit?: number;
  }) {
    const { modelId, queryType, limit = 50 } = opts;

    return this.prisma.modelDecisionLog.findMany({
      where: {
        ...(modelId ? { selectedModelId: modelId } : {}),
        ...(queryType ? { queryType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a named window string into an absolute `Date` representing the
   * start of the requested period.
   */
  private resolveWindowStart(window: string): Date {
    const now = Date.now();
    const MS = 1000;
    const map: Record<string, number> = {
      '1h':  MS * 60 * 60,
      '24h': MS * 60 * 60 * 24,
      '7d':  MS * 60 * 60 * 24 * 7,
      '30d': MS * 60 * 60 * 24 * 30,
    };
    const ms = map[window] ?? map['24h'];
    return new Date(now - ms);
  }
}
