import { Module, Global } from '@nestjs/common';
import { MetricsCollector } from '../metrics/metrics-collector';
import { ObservabilityInterceptor } from '../middleware/observability.interceptor';

/**
 * Global observability module that provides metrics collection and distributed tracing
 * Automatically included in every request via the interceptor
 */
@Global()
@Module({
  providers: [MetricsCollector, ObservabilityInterceptor],
  exports: [MetricsCollector, ObservabilityInterceptor],
})
export class ObservabilityModule {}
