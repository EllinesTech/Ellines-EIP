import { context, trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Helper class for creating and managing tracing spans with attributes and error handling
 */
export class TracingContext {
  /**
   * Create a new span with optional attributes
   */
  static createSpan(name: string, attributes?: Record<string, any>) {
    const tracer = trace.getTracer('ellines-eip-identity');
    const span = tracer.startSpan(name);

    if (attributes) {
      Object.entries(attributes).forEach(([k, v]) => {
        if (v !== null && v !== undefined) {
          try {
            span.setAttribute(k, v);
          } catch (error) {
            // Silently skip invalid attribute values
          }
        }
      });
    }

    return span;
  }

  /**
   * Wrap async function execution in a span with automatic error handling
   */
  static wrapAsync<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, any>,
  ): Promise<T> {
    const span = this.createSpan(name, attributes);

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) {
          span.recordException(error);
        }
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Wrap sync function execution in a span
   */
  static wrapSync<T>(
    name: string,
    fn: () => T,
    attributes?: Record<string, any>,
  ): T {
    const span = this.createSpan(name, attributes);

    try {
      const result = fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Add event to current span
   */
  static addEvent(name: string, attributes?: Record<string, any>) {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.addEvent(name, attributes);
    }
  }

  /**
   * Set attribute on current span
   */
  static setAttribute(key: string, value: any) {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      try {
        currentSpan.setAttribute(key, value);
      } catch (error) {
        // Silently skip invalid attribute values
      }
    }
  }
}
