/**
 * Rate Limiting for Cloudflare Pages Functions (B.3.2)
 * 
 * Wraps API endpoints with rate limiting checks.
 * Reads tier from organization settings and enforces limits.
 *
 * Also exports a lightweight IP-based rate limiter for auth endpoints
 * (no org context required) and a rateLimitResponse helper.
 */

import type { Env } from './auth';
import { getAdminClient, json } from './auth';

// ---------------------------------------------------------------------------
// IP-based rate limiter (used by auth endpoints like login / register)
// ---------------------------------------------------------------------------

export interface IpRateLimitOptions {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** KV key prefix to namespace different endpoints */
  keyPrefix: string;
}

export interface IpRateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Timestamp (ms) when the window resets */
  resetAt: number;
}

interface IpRateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * Lightweight IP-based rate limiter backed by Cloudflare KV.
 * Falls back to "allow" if KV is not configured so the app stays functional
 * in environments without KV bindings.
 *
 * @param context  - Pages Function EventContext (provides env + KV)
 * @param options  - maxRequests / windowMs / keyPrefix
 * @param ip       - Client IP address to key on
 */
export async function checkRateLimit(
  context: { env: Env & { RATE_LIMIT_KV?: KVNamespace } },
  options: IpRateLimitOptions,
  ip: string,
): Promise<IpRateLimitResult>;

/**
 * Org-tier rate limiter (overload for internal org-scoped API routes).
 */
export async function checkRateLimit(
  env: Env,
  organizationId: string,
  userId: string | null,
  endpoint: string,
  method: string,
): Promise<RateLimitResult>;

// Implementation — handles both overloads
export async function checkRateLimit(
  envOrContext: unknown,
  optionsOrOrgId: unknown,
  ipOrUserId?: unknown,
  endpoint?: string,
  method?: string,
): Promise<IpRateLimitResult | RateLimitResult> {
  // Detect which overload was called by checking the second argument type
  if (
    optionsOrOrgId !== null &&
    typeof optionsOrOrgId === 'object' &&
    'maxRequests' in (optionsOrOrgId as object)
  ) {
    // IP-based path
    const context = envOrContext as { env: Env & { RATE_LIMIT_KV?: KVNamespace } };
    const options = optionsOrOrgId as IpRateLimitOptions;
    const ip = ipOrUserId as string;
    return _checkIpRateLimit(context, options, ip);
  }

  // Org-tier path
  return _checkOrgRateLimit(
    envOrContext as Env,
    optionsOrOrgId as string,
    ipOrUserId as string | null,
    endpoint as string,
    method as string,
  );
}

async function _checkIpRateLimit(
  context: { env: Env & { RATE_LIMIT_KV?: KVNamespace } },
  options: IpRateLimitOptions,
  ip: string,
): Promise<IpRateLimitResult> {
  const kv: KVNamespace | undefined = context.env.RATE_LIMIT_KV;

  if (!kv) {
    // KV not configured — allow all requests (fail open)
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: Date.now() + options.windowMs };
  }

  const key = `${options.keyPrefix}:${ip}`;
  const now = Date.now();

  try {
    const raw = await kv.get(key);
    let record: IpRateLimitRecord;

    if (raw) {
      record = JSON.parse(raw) as IpRateLimitRecord;
      if (now >= record.resetAt) {
        // Window expired — reset
        record = { count: 0, resetAt: now + options.windowMs };
      }
    } else {
      record = { count: 0, resetAt: now + options.windowMs };
    }

    const allowed = record.count < options.maxRequests;
    record.count += 1;

    // TTL in seconds for KV expiry (align with window)
    const ttlSeconds = Math.ceil((record.resetAt - now) / 1000);
    await kv.put(key, JSON.stringify(record), { expirationTtl: Math.max(ttlSeconds, 1) });

    return {
      allowed,
      remaining: Math.max(0, options.maxRequests - record.count),
      resetAt: record.resetAt,
    };
  } catch (err) {
    console.error('[checkRateLimit] KV error:', err);
    // Fail open on KV errors
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: now + options.windowMs };
  }
}

/**
 * Build a 429 Too Many Requests response for IP-based rate limiting.
 *
 * @param remaining - Remaining requests in window (usually 0)
 * @param resetAt   - Timestamp (ms) when the window resets
 */
export function rateLimitResponse(remaining: number, resetAt: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return json(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      remaining,
      resetAt: new Date(resetAt).toISOString(),
    },
    429,
    { 'Retry-After': String(retryAfter), 'X-RateLimit-Remaining': String(remaining) },
  );
}

// ---------------------------------------------------------------------------
// Org-tier rate limiter (original implementation below)
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  tierName: string;
  violated?: boolean;
}

interface RateLimitTier {
  name: string;
  displayName: string;
  requestsPerDay: number;
  requestsPerHour: number;
  requestsPerMinute: number;
}

const DEFAULT_TIERS: Record<string, RateLimitTier> = {
  free: {
    name: 'free',
    displayName: 'Free',
    requestsPerDay: 100,
    requestsPerHour: 20,
    requestsPerMinute: 5,
  },
  starter: {
    name: 'starter',
    displayName: 'Starter',
    requestsPerDay: 1000,
    requestsPerHour: 200,
    requestsPerMinute: 20,
  },
  professional: {
    name: 'professional',
    displayName: 'Professional',
    requestsPerDay: 10000,
    requestsPerHour: 2000,
    requestsPerMinute: 100,
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    requestsPerDay: 100000,
    requestsPerHour: 20000,
    requestsPerMinute: 1000,
  },
};

/**
 * Check rate limit for organization (internal implementation)
 */
async function _checkOrgRateLimit(
  env: Env,
  organizationId: string,
  userId: string | null,
  endpoint: string,
  method: string,
): Promise<RateLimitResult> {
  try {
    const supabase = getAdminClient(env);

    // Get organization tier
    const { data: orgData } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', organizationId)
      .maybeSingle();

    const tierName = orgData?.settings?.rateLimitTier || 'free';
    const tier = DEFAULT_TIERS[tierName] || DEFAULT_TIERS.free;

    // Check minute limit (most restrictive)
    const minuteResult = await checkWindow(
      env,
      organizationId,
      endpoint,
      method,
      'minute',
      tier.requestsPerMinute,
    );

    if (!minuteResult.allowed) {
      return { ...minuteResult, tierName: tier.displayName };
    }

    // Check hour limit
    const hourResult = await checkWindow(
      env,
      organizationId,
      endpoint,
      method,
      'hour',
      tier.requestsPerHour,
    );

    if (!hourResult.allowed) {
      return { ...hourResult, tierName: tier.displayName };
    }

    // Check day limit
    const dayResult = await checkWindow(
      env,
      organizationId,
      endpoint,
      method,
      'day',
      tier.requestsPerDay,
    );

    if (!dayResult.allowed) {
      return { ...dayResult, tierName: tier.displayName };
    }

    // All checks passed - record usage
    await recordUsage(env, organizationId, userId, endpoint, method);

    return {
      allowed: true,
      limit: tier.requestsPerDay,
      remaining: dayResult.remaining - 1,
      reset: dayResult.reset,
      tierName: tier.displayName,
    };
  } catch (err) {
    console.error('[checkRateLimit] Error:', err);
    // On error, allow request but log
    return {
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 86400000),
      tierName: 'Unknown',
    };
  }
}

/**
 * Check usage within a time window
 */
async function checkWindow(
  env: Env,
  organizationId: string,
  endpoint: string,
  method: string,
  window: 'minute' | 'hour' | 'day',
  limit: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = getWindowStart(now, window);
  const windowEnd = getWindowEnd(now, window);

  const supabase = getAdminClient(env);

  // Count requests in current window
  const { data: usage } = await supabase
    .from('api_usage')
    .select('request_count')
    .eq('organization_id', organizationId)
    .eq('endpoint', endpoint)
    .eq('method', method)
    .gte('window_start', windowStart.toISOString())
    .maybeSingle();

  const currentCount = usage?.request_count || 0;
  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount < limit;

  return {
    allowed,
    limit,
    remaining,
    reset: windowEnd,
    tierName: '',
  };
}

/**
 * Record API usage
 */
async function recordUsage(
  env: Env,
  organizationId: string,
  userId: string | null,
  endpoint: string,
  method: string,
): Promise<void> {
  try {
    const now = new Date();
    const windowStart = getWindowStart(now, 'day');
    const windowEnd = getWindowEnd(now, 'day');

    const supabase = getAdminClient(env);

    // Check if record exists
    const { data: existing } = await supabase
      .from('api_usage')
      .select('id, request_count')
      .eq('organization_id', organizationId)
      .eq('endpoint', endpoint)
      .eq('method', method)
      .eq('window_start', windowStart.toISOString())
      .maybeSingle();

    if (existing) {
      // Increment existing record
      await supabase
        .from('api_usage')
        .update({ request_count: existing.request_count + 1 })
        .eq('id', existing.id);
    } else {
      // Create new record
      await supabase.from('api_usage').insert({
        organization_id: organizationId,
        user_id: userId,
        endpoint,
        method,
        request_count: 1,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
      });
    }
  } catch (err) {
    console.error('[recordUsage] Error:', err);
    // Non-fatal - don't block request
  }
}

/**
 * Get window start time
 */
function getWindowStart(now: Date, window: 'minute' | 'hour' | 'day'): Date {
  const date = new Date(now);
  switch (window) {
    case 'minute':
      date.setSeconds(0, 0);
      break;
    case 'hour':
      date.setMinutes(0, 0, 0);
      break;
    case 'day':
      date.setHours(0, 0, 0, 0);
      break;
  }
  return date;
}

/**
 * Get window end time
 */
function getWindowEnd(now: Date, window: 'minute' | 'hour' | 'day'): Date {
  const date = getWindowStart(now, window);
  switch (window) {
    case 'minute':
      date.setMinutes(date.getMinutes() + 1);
      break;
    case 'hour':
      date.setHours(date.getHours() + 1);
      break;
    case 'day':
      date.setDate(date.getDate() + 1);
      break;
  }
  return date;
}

/**
 * Middleware wrapper that applies rate limiting
 */
export async function withRateLimit(
  env: Env,
  request: Request,
  organizationId: string,
  userId: string | null,
  handler: () => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const endpoint = url.pathname;
  const method = request.method;

  const result = await _checkOrgRateLimit(env, organizationId, userId, endpoint, method);

  // Add rate limit headers
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', result.reset.toISOString());
  headers.set('X-RateLimit-Tier', result.tierName);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.reset.getTime() - Date.now()) / 1000);
    headers.set('Retry-After', String(retryAfter));
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Tier: ${result.tierName}. Limit: ${result.limit} requests. Try again in ${retryAfter} seconds.`,
        limit: result.limit,
        remaining: 0,
        reset: result.reset.toISOString(),
        tier: result.tierName,
      }),
      {
        status: 429,
        headers,
      },
    );
  }

  // Execute handler and add rate limit headers to response
  const response = await handler();
  const newResponse = new Response(response.body, response);
  
  // Copy rate limit headers
  headers.forEach((value, key) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
}
