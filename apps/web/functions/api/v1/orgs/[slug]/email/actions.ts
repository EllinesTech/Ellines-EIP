/**
 * Pages Function: POST /api/v1/orgs/:slug/email/actions
 *
 * Extracts action items from a submitted email message.
 * Gate: owner or admin only.
 *
 * Proxies to: POST /api/v1/email/actions on the identity service.
 *
 * Requirements: 26.4, 32.4
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
  if (context.request.method !== 'POST') {
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

  // Forward to identity service
  const bearerHeader = (context.request.headers.get('authorization') ?? '').trim();
  const base = identityBase(context.env as Env & Record<string, string>);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/v1/email/actions`, {
      method: 'POST',
      headers: {
        authorization: bearerHeader,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[email/actions] upstream fetch failed:', err);
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
