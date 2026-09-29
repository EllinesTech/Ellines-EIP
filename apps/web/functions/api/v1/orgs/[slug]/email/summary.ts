/**
 * Pages Function: GET /api/v1/orgs/:slug/email/summary?accountId=
 *
 * Returns an urgency-classified summary of unread messages for a connected
 * email account.
 * Gate: owner or admin only.
 *
 * Proxies to: GET /api/v1/email/summary on the identity service.
 *
 * Requirements: 26.4, 32.2
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

  // Gate: owner or admin only
  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  // Verify slug belongs to caller's org (tenant isolation §6)
  const { slug } = context.params as { slug: string };
  const supabase = getAdminClient(context.env);
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (orgErr || !org) {
    return json({ statusCode: 404, message: 'Organization not found' }, 404);
  }

  // Forward to identity service — accountId comes from query string
  const url = new URL(context.request.url);
  const accountId = url.searchParams.get('accountId') ?? '';

  if (!accountId) {
    return json({ statusCode: 400, message: 'accountId query parameter is required' }, 400);
  }

  const bearerHeader = (context.request.headers.get('authorization') ?? '').trim();
  const base = identityBase(context.env as Env & Record<string, string>);
  const identityUrl = `${base}/api/v1/email/summary?accountId=${encodeURIComponent(accountId)}`;

  let upstream: Response;
  try {
    upstream = await fetch(identityUrl, {
      method: 'GET',
      headers: {
        authorization: bearerHeader,
        'content-type': 'application/json',
      },
    });
  } catch (err) {
    console.error('[email/summary] upstream fetch failed:', err);
    return json({ statusCode: 503, message: 'Email service unavailable' }, 503);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    return json(
      { statusCode: upstream.status, message: text.slice(0, 200) },
      upstream.status,
    );
  }

  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
