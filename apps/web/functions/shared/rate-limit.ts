/**
 * Rate Limiting for Cloudflare Pages Functions (B.3.2)
 * 
 * Wraps API endpoints with rate limiting checks.
 * Reads tier from organization settings and enforces limits.
 */

import type { Env } from './auth';
import { getAdminClient } from './auth';

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
 * Check rate limit for organization
 */
export async function checkRateLimit(
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

  const result = await checkRateLimit(env, organizationId, userId, endpoint, method);

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
