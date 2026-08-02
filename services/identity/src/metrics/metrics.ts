import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

/**
 * Initialize OpenTelemetry metrics with Prometheus exporter
 */
export function initializeMetrics() {
  const prometheusExporter = new PrometheusExporter(
    {
      port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
      endpoint: '/metrics',
    },
    () => {
      console.log(
        `✓ Prometheus metrics exposed on http://localhost:${process.env.PROMETHEUS_PORT || '9090'}/metrics`,
      );
    },
  );

  const meterProvider = new MeterProvider({
    readers: [prometheusExporter],
  });

  return meterProvider.getMeter('ellines-eip-identity');
}
