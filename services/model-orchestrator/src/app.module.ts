/**
 * Model Orchestrator App Module
 *
 * Top-level module for the model-orchestrator microservice.
 * Integrates all specialized AI models with pluggable architecture.
 *
 * Requirements: 1.1 – 1.8
 */

import { Module } from '@nestjs/common';
import { OrchestratorModule } from './orchestrator.module';
import { HealthController } from './health.controller';

@Module({
  imports: [OrchestratorModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
