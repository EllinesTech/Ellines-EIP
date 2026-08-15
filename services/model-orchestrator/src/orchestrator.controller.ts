/**
 * Orchestrator Controller
 *
 * Exposes the Model Orchestrator via HTTP:
 *  POST /api/v1/orchestrator/query  — process a query
 *  GET  /api/v1/orchestrator/models — list registered models + metrics
 *  GET  /api/v1/orchestrator/models/:id/metrics — single model metrics
 *
 * Requirements: 1.2, 1.4, 1.8
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  NotFoundException,
  Logger,
} from '@nestjs/common';

import { OrchestratorService, OrchestratorResult } from './orchestrator.service';
import { ModelRegistryRepository } from './model-registry/model-registry.repository';
import { Query, QueryContext } from './interfaces/query.interface';
import { ModelMetrics } from './interfaces/model.interface';

interface QueryRequestDto {
  content: string;
  type?: Query['type'];
  context?: Partial<QueryContext>;
  requiredCapabilities?: Query['requiredCapabilities'];
}

let queryCounter = 0;

@Controller('orchestrator')
export class OrchestratorController {
  private readonly logger = new Logger(OrchestratorController.name);

  constructor(
    private readonly orchestratorService: OrchestratorService,
    private readonly modelRegistry: ModelRegistryRepository,
  ) {}

  /**
   * POST /api/v1/orchestrator/query
   * Route a user query to the most appropriate model(s) and return a unified answer.
   */
  @Post('query')
  async processQuery(@Body() dto: QueryRequestDto): Promise<OrchestratorResult> {
    const query: Query = {
      id: `q-${Date.now()}-${++queryCounter}`,
      content: dto.content,
      type: dto.type,
      context: {
        timestamp: new Date(),
        ...(dto.context ?? {}),
      },
      requiredCapabilities: dto.requiredCapabilities ?? [],
    };

    this.logger.log(`Received query ${query.id}: "${query.content.slice(0, 80)}"`);
    return this.orchestratorService.process(query);
  }

  /**
   * GET /api/v1/orchestrator/models
   * List all models in the registry with their current status and metrics.
   */
  @Get('models')
  listModels() {
    return this.modelRegistry.findAll().map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      version: m.version,
      status: m.status,
      capabilities: m.capabilities,
      metrics: m.metrics,
    }));
  }

  /**
   * GET /api/v1/orchestrator/models/:id/metrics
   * Return performance metrics for a single model.
   */
  @Get('models/:id/metrics')
  getModelMetrics(@Param('id') modelId: string): ModelMetrics {
    const metrics = this.modelRegistry.getMetrics(modelId);
    if (!metrics) {
      throw new NotFoundException(`No metrics found for model '${modelId}'`);
    }
    return metrics;
  }
}
