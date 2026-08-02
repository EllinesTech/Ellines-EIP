import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { trace } from '@opentelemetry/api';

/**
 * Initialize OpenTelemetry distributed tracing with Jaeger exporter.
 * Must be called before app bootstrap to capture all spans.
 */
export function initializeTracing() {
  const jaegerExporter = new JaegerExporter({
    host: process.env.JAEGER_HOST || 'localhost',
    port: parseInt(process.env.JAEGER_PORT || '6831'),
  });

  const tracerProvider = new BasicTracerProvider();
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));

  const sdk = new NodeSDK({
    traceExporter: jaegerExporter,
    tracerProvider,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log(
      `✓ OpenTelemetry Tracing initialized (Jaeger: ${process.env.JAEGER_HOST || 'localhost'}:${process.env.JAEGER_PORT || '6831'})`,
    );
  } catch (error) {
    console.error('Failed to initialize tracing:', error);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    try {
      await sdk.shutdown();
      console.log('OpenTelemetry SDK shut down gracefully');
    } catch (error) {
      console.error('Error shutting down SDK:', error);
    }
  });

  return sdk;
}

/**
 * Get the global tracer instance
 */
export function getTracer() {
  return trace.getTracer('ellines-eip-identity');
}
