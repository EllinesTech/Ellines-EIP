/**
 * Global exception filter (Q.3 — Error tracking)
 *
 * Catches ALL unhandled exceptions in the NestJS app and:
 * 1. Logs them in structured JSON format (for log aggregation / Loki / CloudWatch)
 * 2. Forwards to Sentry if SENTRY_DSN is configured
 * 3. Returns a standardised error response to the client
 *
 * To enable Sentry: add SENTRY_DSN to .env and run:
 *   npm install @sentry/node --workspace=@ellines-eip/identity
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const stack =
      exception instanceof Error ? exception.stack : undefined;

    const errorId = crypto.randomUUID().slice(0, 8);

    // Structured log — picked up by any log aggregator
    const logPayload = {
      errorId,
      level: status >= 500 ? 'error' : 'warn',
      statusCode: status,
      message,
      method: req.method,
      path: req.path,
      // Omit auth token — log the org id from JWT payload if present
      organizationId: (req as any).user?.organizationId ?? null,
      userId: (req as any).user?.sub ?? null,
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip,
      timestamp: new Date().toISOString(),
      // Stack only logged server-side — never sent to client
      ...(status >= 500 && stack ? { stack } : {}),
    };

    if (status >= 500) {
      this.logger.error(JSON.stringify(logPayload));
    } else if (status >= 400) {
      this.logger.warn(JSON.stringify(logPayload));
    }

    // Forward to Sentry if configured (conditional import — no install needed without DSN)
    if (process.env.SENTRY_DSN && status >= 500) {
      try {
        // Dynamic require — only executes if @sentry/node is installed
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sentry = require('@sentry/node');
        Sentry.withScope((scope: any) => {
          scope.setTag('errorId', errorId);
          scope.setTag('path', req.path);
          scope.setTag('method', req.method);
          if (logPayload.organizationId) scope.setTag('organizationId', logPayload.organizationId);
          Sentry.captureException(exception);
        });
      } catch {
        // @sentry/node not installed — log hint once
        this.logger.warn('SENTRY_DSN is set but @sentry/node is not installed. Run: npm install @sentry/node -w @ellines-eip/identity');
      }
    }

    // Client response — never leak stack traces
    const response = {
      statusCode: status,
      message: status >= 500 ? `Internal error [${errorId}]. Our team has been notified.` : message,
      errorId,
      timestamp: new Date().toISOString(),
      path: req.path,
    };

    res.status(status).json(response);
  }
}
