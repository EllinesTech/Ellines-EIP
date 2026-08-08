/**
 * Client-side error capture endpoint (Q.3)
 * POST /api/v1/error-capture
 *
 * Receives structured error events from the React error boundary
 * and frontend JS. Logs them server-side (Cloudflare Workers log tail)
 * and optionally forwards to Sentry if SENTRY_DSN is configured.
 *
 * Rate-limited: max 10 errors per IP per minute (simple bucket).
 * Not authenticated — errors can occur before session is loaded.
 */

import { json, options, type Env } from '../../shared/auth';

interface ErrorCaptureBody {
  errorId?: string;
  source?: string;
  message?: string;
  stack?: string;
  url?: string;
  timestamp?: string;
  extra?: Record<string, unknown>;
}

// Simple in-memory rate limit (resets per Worker invocation — good enough)
const ipBucket = new Map<string, number>();

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const ip = context.request.headers.get('cf-connecting-ip') ?? 'unknown';
  const count = (ipBucket.get(ip) ?? 0) + 1;
  ipBucket.set(ip, count);
  if (count > 10) {
    return json({ statusCode: 429, message: 'Too many errors' }, 429);
  }

  let body: ErrorCaptureBody = {};
  try { body = await context.request.json() as ErrorCaptureBody; } catch { /* ignore */ }

  const errorId = body.errorId ?? Math.random().toString(36).slice(2, 10);

  // Structured log — Cloudflare Pages log tail picks this up
  console.error(JSON.stringify({
    type: 'client_error',
    errorId,
    source: body.source ?? 'unknown',
    message: (body.message ?? '').slice(0, 500),
    url: (body.url ?? '').slice(0, 200),
    timestamp: body.timestamp ?? new Date().toISOString(),
    ip,
  }));

  // Forward to Sentry if DSN is configured
  if (context.env.SENTRY_DSN) {
    try {
      await fetch(`https://sentry.io/api/${extractProjectId(context.env.SENTRY_DSN)}/store/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_key=${extractKey(context.env.SENTRY_DSN)}, sentry_version=7`,
        },
        body: JSON.stringify({
          event_id: errorId.padEnd(32, '0'),
          platform: 'javascript',
          level: 'error',
          message: body.message ?? 'Unknown error',
          extra: { source: body.source, url: body.url, ...body.extra },
          timestamp: (body.timestamp ?? new Date().toISOString()).replace('Z', ''),
        }),
      });
    } catch {
      /* non-critical — Sentry forward failed */
    }
  }

  return json({ accepted: true, errorId });
};

function extractProjectId(dsn: string): string {
  // DSN format: https://key@sentry.io/PROJECT_ID
  return dsn.split('/').pop() ?? '0';
}

function extractKey(dsn: string): string {
  // DSN format: https://KEY@sentry.io/...
  const match = dsn.match(/https?:\/\/([^@]+)@/);
  return match?.[1] ?? '';
}

// Extend Env to include optional SENTRY_DSN
declare module '../../shared/auth' {
  interface Env {
    SENTRY_DSN?: string;
  }
}
