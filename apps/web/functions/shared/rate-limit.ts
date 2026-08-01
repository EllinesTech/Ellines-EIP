import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * Simple rate limiter using Cloudflare Workers KV.
 * Tracks requests per IP or org, enforces max-requests-per-minute.
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // in ms (typically 60000 for 1 minute)
  keyPrefix: string; // e.g., 'ratelimit:auth:login'
}

export async function checkRateLimit(
  context: PagesFunction,
  config: RateLimitConfig,
  key: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  // Extract KV from context (passed via environment)
  const kv = (context.env as unknown as Record<string, unknown>).KV_CACHE as KVNamespace | undefined;

  if (!kv) {
    // If KV not available, allow request (graceful degradation on Pages)
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(Date.now() + config.windowMs) };
  }

  const fullKey = `${config.keyPrefix}:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Get current bucket
    const data = await kv.get(fullKey, 'json');
    const bucket = (data as Record<string, unknown> | null) || { count: 0, resetAt: now + config.windowMs };

    // Check if window has expired
    if ((bucket.resetAt as number) < now) {
      // New window, reset counter
      await kv.put(fullKey, JSON.stringify({ count: 1, resetAt: now + config.windowMs }), {
        expirationTtl: Math.ceil(config.windowMs / 1000) + 10,
      });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: new Date((bucket.resetAt as number) || now + config.windowMs),
      };
    }

    const count = (bucket.count as number) || 0;
    if (count >= config.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(bucket.resetAt as number),
      };
    }

    // Increment and allow
    await kv.put(fullKey, JSON.stringify({ count: count + 1, resetAt: bucket.resetAt }), {
      expirationTtl: Math.ceil(config.windowMs / 1000) + 10,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - (count + 1),
      resetAt: new Date(bucket.resetAt as number),
    };
  } catch (err) {
    console.error('Rate limit check failed:', err);
    // On error, allow request (don't break auth due to KV failure)
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(Date.now() + config.windowMs) };
  }
}

export function rateLimitResponse(remaining: number, resetAt: Date): Response {
  return new Response(JSON.stringify({ statusCode: 429, message: 'Too many requests' }), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
      'x-ratelimit-remaining': String(Math.max(0, remaining)),
      'x-ratelimit-reset': resetAt.toISOString(),
    },
  });
}
