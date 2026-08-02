import { Injectable, NestMiddleware } from '@nestjs/common';
import { Logger, generateTraceId, LogContext } from '../logging/log-context';

/**
 * Middleware to log all HTTP requests with structured context
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private logger: Logger) {}

  use(req: any, res: any, next: Function) {
    const start = Date.now();
    const traceId = req.headers['x-trace-id'] || generateTraceId();

    // Attach trace ID to response header
    res.setHeader('x-trace-id', traceId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const durationSeconds = duration / 1000;

      const context: LogContext = {
        trace_id: traceId,
        user_id: req.user?.id,
        org_id: req.user?.org_id,
        service: 'identity',
        operation: `${req.method} ${req.path}`,
        level: res.statusCode >= 400 ? 'warn' : 'info',
        duration_ms: duration,
        metadata: {
          status: res.statusCode,
          method: req.method,
          path: req.path,
          remote_addr: req.ip || req.connection?.remoteAddress,
          user_agent: req.get('user-agent'),
        },
      };

      if (res.statusCode >= 500) {
        context.level = 'error';
      }

      this.logger.log(context);
    });

    // Log request errors
    res.on('error', (error: Error) => {
      this.logger.error(
        {
          trace_id: traceId,
          user_id: req.user?.id,
          org_id: req.user?.org_id,
          service: 'identity',
          operation: `${req.method} ${req.path}`,
          duration_ms: Date.now() - start,
        },
        error,
      );
    });

    next();
  }
}
