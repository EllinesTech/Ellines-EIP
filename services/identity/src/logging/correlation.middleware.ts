/**
 * Correlation ID middleware (Q.2 — Structured logging)
 *
 * Extracts or generates a request correlation ID and stores it in
 * AsyncLocalStorage so any log call within the same request lifecycle
 * can include it without explicitly passing it down.
 *
 * The correlation ID is:
 *   1. Read from incoming X-Correlation-ID header (if sent by client/proxy)
 *   2. Falling back to X-Trace-ID (set by some API gateways)
 *   3. Otherwise generated as a compact uuid-like string
 *
 * The ID is echoed back in response headers so callers can trace logs.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  userId?: string;
  organizationId?: string;
  method: string;
  path: string;
  startedAt: number;
}

// Module-level singleton storage — safe in a single Node.js process
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a short correlation ID: timestamp + random suffix, no hyphens
 */
function newCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-trace-id'] as string) ||
      newCorrelationId();

    // Echo correlation ID back in every response
    res.setHeader('X-Correlation-ID', correlationId);

    const ctx: RequestContext = {
      correlationId,
      method: req.method,
      path: req.path,
      startedAt: Date.now(),
    };

    // After JWT guard runs, userId/orgId may be set on req.user
    // Use res.on('finish') to capture them at log time
    res.on('finish', () => {
      const user = (req as any).user;
      if (user) {
        ctx.userId = user.sub || user.id;
        ctx.organizationId = user.organizationId;
      }
    });

    requestContextStorage.run(ctx, () => next());
  }
}

/**
 * Get the current request correlation ID, or 'no-context' outside a request.
 */
export function getCorrelationId(): string {
  return requestContextStorage.getStore()?.correlationId ?? 'no-context';
}

/**
 * Get full request context for the current async scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
