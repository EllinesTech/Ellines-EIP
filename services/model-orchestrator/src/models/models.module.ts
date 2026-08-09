/**
 * Models Module
 * 
 * Provides all specialized AI model providers
 * Pluggable architecture for runtime model addition
 */

import { Module } from '@nestjs/common';
import { LanguageModelProvider } from './language-model.provider';
import { TimeSeriesModelProvider } from './timeseries-model.provider';
import { AnomalyModelProvider } from './anomaly-model.provider';
import { ReasoningModelProvider } from './reasoning-model.provider';
import { ModelPerformanceTracker } from './model-performance-tracker.service';

@Module({
  providers: [
    LanguageModelProvider,
    TimeSeriesModelProvider,
    AnomalyModelProvider,
    ReasoningModelProvider,
    ModelPerformanceTracker,
  ],
  exports: [
    LanguageModelProvider,
    TimeSeriesModelProvider,
    AnomalyModelProvider,
    ReasoningModelProvider,
    ModelPerformanceTracker,
  ],
})
export class ModelsModule {}
