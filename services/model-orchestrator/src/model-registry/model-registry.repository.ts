import { Injectable, Logger } from '@nestjs/common';
import { ModelMetadata, ModelMetrics } from '../interfaces/model.interface';
import { ModelCapability } from '../interfaces/query.interface';

/**
 * In-memory Model Registry repository
 * Tracks model metadata, performance metrics, and availability status.
 * Requirements: 1.4 — maintain a model performance registry tracking accuracy, latency, and cost
 */
@Injectable()
export class ModelRegistryRepository {
  private readonly logger = new Logger(ModelRegistryRepository.name);

  /** In-memory store: modelId → ModelMetadata */
  private readonly registry = new Map<string, ModelMetadata>();

  constructor() {
    this.seedDefaultModels();
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  /**
   * Get all registered models
   */
  findAll(): ModelMetadata[] {
    return Array.from(this.registry.values());
  }

  /**
   * Find a model by ID
   */
  findById(modelId: string): ModelMetadata | undefined {
    return this.registry.get(modelId);
  }

  /**
   * Find models that have at least one of the requested capabilities and are available
   */
  findByCapabilities(capabilities: ModelCapability[]): ModelMetadata[] {
    return Array.from(this.registry.values()).filter(
      (model) =>
        model.status === 'available' &&
        capabilities.some((cap) => model.capabilities.includes(cap)),
    );
  }

  /**
   * Find the best model for a capability based on accuracy + latency score
   */
  findBestForCapability(capability: ModelCapability): ModelMetadata | undefined {
    const candidates = Array.from(this.registry.values()).filter(
      (m) => m.status === 'available' && m.capabilities.includes(capability),
    );

    if (candidates.length === 0) return undefined;

    // Score = accuracy * 0.6 - (latency/1000) * 0.4  (latency in ms, scaled)
    return candidates.reduce((best, current) => {
      const scoreOf = (m: ModelMetadata) =>
        m.metrics.accuracy * 0.6 - (m.metrics.averageLatency / 1000) * 0.4;
      return scoreOf(current) > scoreOf(best) ? current : best;
    });
  }

  /**
   * Find the fallback general-purpose model
   */
  findFallback(): ModelMetadata | undefined {
    return Array.from(this.registry.values()).find(
      (m) => m.type === 'general' && m.status !== 'unavailable',
    );
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Register a new model (pluggable architecture — Req 1.6)
   */
  register(metadata: ModelMetadata): void {
    this.registry.set(metadata.id, metadata);
    this.logger.log(`Model registered: ${metadata.id} (${metadata.type})`);
  }

  /**
   * Update availability status
   */
  updateStatus(modelId: string, status: ModelMetadata['status']): void {
    const model = this.registry.get(modelId);
    if (!model) return;
    model.status = status;
    model.updatedAt = new Date();
    this.logger.log(`Model ${modelId} status → ${status}`);
  }

  /**
   * Record a completed call and update rolling metrics (Req 1.4, 1.8)
   */
  recordCall(
    modelId: string,
    opts: { success: boolean; latencyMs: number; cost?: number },
  ): void {
    const model = this.registry.get(modelId);
    if (!model) return;

    const m = model.metrics;
    const prev = m.totalCalls;
    const next = prev + 1;

    // Exponential moving average for latency (α = 0.1)
    m.averageLatency = m.averageLatency * 0.9 + opts.latencyMs * 0.1;

    // Update success rate
    const prevSuccesses = Math.round(m.successRate * prev);
    m.successRate = (prevSuccesses + (opts.success ? 1 : 0)) / next;

    if (opts.cost !== undefined) {
      m.costPerCall = m.costPerCall * 0.9 + opts.cost * 0.1;
    }

    m.totalCalls = next;
    m.lastUpdated = new Date();
    model.updatedAt = new Date();
  }

  /**
   * Update accuracy metric (typically after evaluation against ground truth)
   */
  updateAccuracy(modelId: string, accuracy: number): void {
    const model = this.registry.get(modelId);
    if (!model) return;
    // Clamp to [0, 1]
    model.metrics.accuracy = Math.max(0, Math.min(1, accuracy));
    model.metrics.lastUpdated = new Date();
    model.updatedAt = new Date();
  }

  /**
   * Get metrics for a model (Req 1.4)
   */
  getMetrics(modelId: string): ModelMetrics | undefined {
    return this.registry.get(modelId)?.metrics;
  }

  // ─── Seed ───────────────────────────────────────────────────────────────────

  /**
   * Seed the registry with the five required specialized model stubs (Req 1.1)
   */
  private seedDefaultModels(): void {
    const now = new Date();
    const defaultMetrics = (overrides: Partial<ModelMetrics> = {}): ModelMetrics => ({
      modelId: '',
      accuracy: 0.85,
      averageLatency: 500,
      totalCalls: 0,
      successRate: 1.0,
      costPerCall: 0.001,
      lastUpdated: now,
      ...overrides,
    });

    const models: ModelMetadata[] = [
      {
        id: 'llm-language',
        name: 'Language Understanding Model',
        type: 'language',
        version: '1.0.0',
        capabilities: ['language_understanding', 'causal_analysis'],
        status: 'available',
        endpoint: process.env.LLM_ENDPOINT ?? '',
        maxConcurrency: 20,
        rateLimit: 60,
        metrics: { ...defaultMetrics({ modelId: 'llm-language', accuracy: 0.92 }) },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ts-forecaster',
        name: 'Time-Series Forecasting Model',
        type: 'time-series',
        version: '1.0.0',
        capabilities: ['time_series_forecasting', 'pattern_detection'],
        status: 'available',
        endpoint: process.env.TS_MODEL_ENDPOINT ?? '',
        maxConcurrency: 10,
        rateLimit: 30,
        metrics: { ...defaultMetrics({ modelId: 'ts-forecaster', accuracy: 0.88, averageLatency: 800 }) },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'anomaly-detector',
        name: 'Anomaly Detection Model',
        type: 'anomaly',
        version: '1.0.0',
        capabilities: ['anomaly_detection', 'pattern_detection'],
        status: 'available',
        endpoint: process.env.ANOMALY_ENDPOINT ?? '',
        maxConcurrency: 15,
        rateLimit: 60,
        metrics: { ...defaultMetrics({ modelId: 'anomaly-detector', accuracy: 0.90, averageLatency: 300 }) },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'vision-model',
        name: 'Computer Vision Model',
        type: 'vision',
        version: '1.0.0',
        capabilities: ['computer_vision'],
        status: 'available',
        endpoint: process.env.VISION_ENDPOINT ?? '',
        maxConcurrency: 5,
        rateLimit: 20,
        metrics: { ...defaultMetrics({ modelId: 'vision-model', accuracy: 0.87, averageLatency: 1200 }) },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'knowledge-reasoner',
        name: 'Knowledge Reasoning Model',
        type: 'reasoning',
        version: '1.0.0',
        capabilities: ['knowledge_reasoning', 'causal_analysis', 'pattern_detection'],
        status: 'available',
        endpoint: process.env.REASONING_ENDPOINT ?? '',
        maxConcurrency: 8,
        rateLimit: 30,
        metrics: { ...defaultMetrics({ modelId: 'knowledge-reasoner', accuracy: 0.83, averageLatency: 1500 }) },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'general-fallback',
        name: 'General-Purpose Fallback Model',
        type: 'general',
        version: '1.0.0',
        capabilities: [
          'language_understanding',
          'time_series_forecasting',
          'anomaly_detection',
          'computer_vision',
          'knowledge_reasoning',
          'causal_analysis',
          'pattern_detection',
        ],
        status: 'available',
        endpoint: process.env.GENERAL_MODEL_ENDPOINT ?? '',
        maxConcurrency: 50,
        rateLimit: 120,
        metrics: { ...defaultMetrics({ modelId: 'general-fallback', accuracy: 0.75, averageLatency: 600 }) },
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const model of models) {
      this.registry.set(model.id, model);
    }

    this.logger.log(`ModelRegistry seeded with ${models.length} models`);
  }
}
