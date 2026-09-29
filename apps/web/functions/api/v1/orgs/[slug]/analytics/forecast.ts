/**
 * Pages Function: GET /api/v1/orgs/:slug/analytics/forecast
 *
 * Query params:
 *   metric   — InfluxDB measurement / field name to forecast (required)
 *   horizon  — number of future days (optional, default 30)
 *
 * Gate: owner or admin role only.
 * Forwards to the identity service GET /api/v1/ellinea/analytics/forecast
 * with the caller's JWT so NestJS JwtAuthGuard accepts it.
 *
 * Requirements: 11.1, 7.5, 9.4
 */

import {
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  getAdminClient,
  type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

function identityBase(env: Env & Record<string, string>): string {
  return (env as unknown as Record<string, string>)['IDENTITY_API_URL'] ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  // Authenticate
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Gate: owner or admin only (Requirement 9.4)
  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  // Verify the slug resolves to the caller's organisation (tenant isolation, Req 9.4)
  const { slug } = context.params as { slug: string };
  const supabase = getAdminClient(context.env);
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .eq('id', auth.organizationId)   // mandatory org_id equality filter
    .maybeSingle();

  if (orgErr || !org) {
    return json({ statusCode: 404, message: 'Organization not found' }, 404);
  }

  // Parse query params
  const url = new URL(context.request.url);
  const metric = url.searchParams.get('metric') ?? '';
  const horizonRaw = url.searchParams.get('horizon');
  const horizon = horizonRaw ? parseInt(horizonRaw, 10) : 30;

  if (!metric) {
    return json({ statusCode: 400, message: 'metric query parameter is required' }, 400);
  }
  if (isNaN(horizon) || horizon < 1 || horizon > 365) {
    return json({ statusCode: 400, message: 'horizon must be between 1 and 365' }, 400);
  }

  // Forward to identity service
  const bearerToken = (context.request.headers.get('authorization') ?? '').trim();
  const base = identityBase(context.env as Env & Record<string, string>);
  const identityUrl = `${base}/api/v1/ellinea/analytics/forecast?metric=${encodeURIComponent(metric)}&horizon=${horizon}&orgId=${encodeURIComponent(auth.organizationId)}`;

  let upstream: Response;
  try {
    upstream = await fetch(identityUrl, {
      method: 'GET',
      headers: {
        authorization: bearerToken,
        'content-type': 'application/json',
      },
    });
  } catch (err) {
    console.error('[analytics/forecast] upstream fetch failed:', err);
    return json({ statusCode: 503, message: 'Analytics service unavailable' }, 503);
  }

  const body = await upstream.text();

  if (!upstream.ok) {
    return json(
      { statusCode: upstream.status, message: body.slice(0, 200) },
      upstream.status,
    );
  }

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
