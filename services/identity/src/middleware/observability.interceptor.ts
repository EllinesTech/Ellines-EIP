import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * Interceptor to:
 * 1. Track HTTP request metrics (latency, count, errors)
 * 2. Create distributed tracing spans for each request
 * 3. Propagate trace IDs in response headers for debugging
 */
@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private metricsCollector: MetricsCollector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.getArgByIndex(0) as Request;
    const res = ctx.getArgByIndex(1) as Response;

    const method = req.method;
    const route = req.route?.path || req.path;
    const startTime = Date.now();

    // Get or generate trace ID
    const traceId =
      (req.headers['x-trace-id'] as string) ||
      `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create span for this request
    const tracer = trace.getTracer('ellines-eip-identity');
    const span = tracer.startSpan(`${method} ${route}`, {
      attributes: {
        'http.method': method,
        'http.url': req.originalUrl,
        'http.target': route,
        'trace_id': traceId,
        'http.client_ip': req.ip || 'unknown',
      },
    });

    // Add trace ID to response headers for correlation
    res.setHeader('X-Trace-ID', traceId);

    return context.with(
      trace.setSpan(context.active(), span),
      () =>
        next.handle().pipe(
          tap(
            (data) => {
              const duration = Date.now() - startTime;

              // Record metrics
              this.metricsCollector.recordRequestDuration(duration / 1000, {
                method,
                route,
                status: String(res.statusCode),
              });

              this.metricsCollector.recordRequest({
                method,
                route,
                status: String(res.statusCode),
              });

              // Update span with response status
              span.setAttribute('http.status_code', res.statusCode);
              span.setAttribute('http.response_duration_ms', duration);

              if (res.statusCode >= 400) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: `HTTP ${res.statusCode}`,
                });
              } else {
                span.setStatus({ code: SpanStatusCode.OK });
              }

              span.end();
            },
            (error: Error) => {
              const duration = Date.now() - startTime;

              // Record error metrics
              this.metricsCollector.recordRequestDuration(duration / 1000, {
                method,
                route,
                status: 'error',
              });

              // Record error in span
              span.recordException(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.setAttribute('http.response_duration_ms', duration);

              span.end();
            },
          ),
        ),
    );
  }
}
