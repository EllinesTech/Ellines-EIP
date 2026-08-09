/**
 * Model Performance Tracker
 * 
 * Tracks model invocations, performance metrics, and logs to AiModelRegistry
 * Requirement 1.1: Model performance tracking
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ModelInvocationResponse } from './base-model.provider';

interface PerformanceMetrics {
  modelId: string;
  avgLatencyMs: number;
  successCount: number;
  failureCount: number;
  avgConfidence: number;
  totalInvocations: number;
}

@Injectable()
export class ModelPerformanceTracker {
  private readonly logger = new Logger(ModelPerformanceTracker.name);
  private prisma: PrismaClient;

  // In-memory cache for performance metrics (flushed periodically)
  private metricsCache: Map<string, PerformanceMetrics> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Log a successful model invocation
   */
  async logInvocation(
    organizationId: string,
    queryId: string,
    queryType: string,
    response: ModelInvocationResponse,
    routingReason?: string,
  ): Promise<void> {
    try {
      // Log to database
      await this.prisma.modelDecisionLog.create({
        data: {
          organizationId,
          queryId,
          queryType,
          selectedModelId: response.modelId,
          secondaryModels: [],
          routingReason: routingReason ?? 'Direct invocation',
          ensembleStrategy: null,
          confidence: response.confidence,
          latencyMs: response.latencyMs,
          success: true,
          errorMessage: null,
        },
      });

      // Update in-memory metrics
      this.updateMetricsCache(response.modelId, response.latencyMs, response.confidence, true);
    } catch (error) {
      this.logger.error(`Failed to log model invocation: ${error.message}`);
    }
  }

  /**
   * Log a failed model invocation
   */
  async logFailure(
    organizationId: string,
    queryId: string,
    queryType: string,
    modelId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.prisma.modelDecisionLog.create({
        data: {
          organizationId,
          queryId,
          queryType,
          selectedModelId: modelId,
          secondaryModels: [],
          routingReason: 'Invocation attempted',
          ensembleStrategy: null,
          confidence: 0,
          latencyMs: 0,
          success: false,
          errorMessage,
        },
      });

      // Update failure count
      this.updateMetricsCache(modelId, 0, 0, false);
    } catch (error) {
      this.logger.error(`Failed to log model failure: ${error.message}`);
    }
  }

  /**
   * Update in-memory metrics cache
   */
  private updateMetricsCache(
    modelId: string,
    latencyMs: number,
    confidence: number,
    success: boolean,
  ): void {
    const existing = this.metricsCache.get(modelId) ?? {
      modelId,
      avgLatencyMs: 0,
      successCount: 0,
      failureCount: 0,
      avgConfidence: 0,
      totalInvocations: 0,
    };

    const total = existing.totalInvocations + 1;

    this.metricsCache.set(modelId, {
      modelId,
      avgLatencyMs: (existing.avgLatencyMs * existing.totalInvocations + latencyMs) / total,
      successCount: existing.successCount + (success ? 1 : 0),
      failureCount: existing.failureCount + (success ? 0 : 1),
      avgConfidence: (existing.avgConfidence * existing.totalInvocations + confidence) / total,
      totalInvocations: total,
    });
  }

  /**
   * Get current performance metrics for a model
   */
  getMetrics(modelId: string): PerformanceMetrics | null {
    return this.metricsCache.get(modelId) ?? null;
  }

  /**
   * Get all cached metrics
   */
  getAllMetrics(): Map<string, PerformanceMetrics> {
    return new Map(this.metricsCache);
  }

  /**
   * Flush metrics to database (call periodically)
   */
  async flushMetrics(): Promise<void> {
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - 1); // 1-hour window
    const windowEnd = new Date();

    for (const [modelId, metrics] of this.metricsCache.entries()) {
      try {
        await this.prisma.modelPerformanceLog.upsert({
          where: {
            modelId_windowStart: {
              modelId,
              windowStart,
            },
          },
          create: {
            modelId,
            windowStart,
            windowEnd,
            requestCount: metrics.totalInvocations,
            successCount: metrics.successCount,
            failureCount: metrics.failureCount,
            avgLatencyMs: metrics.avgLatencyMs,
            p95LatencyMs: metrics.avgLatencyMs * 1.5, // Approximation
            p99LatencyMs: metrics.avgLatencyMs * 2.0, // Approximation
            avgConfidence: metrics.avgConfidence,
            totalCost: 0, // Would need cost calculation
          },
          update: {
            requestCount: { increment: metrics.totalInvocations },
            successCount: { increment: metrics.successCount },
            failureCount: { increment: metrics.failureCount },
            avgLatencyMs: metrics.avgLatencyMs,
            avgConfidence: metrics.avgConfidence,
          },
        });

        // Update the model registry with latest performance
        await this.prisma.aiModelRegistry.updateMany({
          where: { modelId },
          data: {
            avgLatencyMs: metrics.avgLatencyMs,
            lastHealthCheck: new Date(),
          },
        });
      } catch (error) {
        this.logger.error(`Failed to flush metrics for ${modelId}: ${error.message}`);
      }
    }

    // Clear cache after flush
    this.metricsCache.clear();
    this.logger.log('Performance metrics flushed to database');
  }

  /**
   * Cleanup
   */
  async onModuleDestroy() {
    await this.flushMetrics();
    await this.prisma.$disconnect();
  }
}
