/**
 * Pages Function: PATCH /api/v1/orgs/:slug/settings/federated
 *
 * Allow an organisation Owner to opt-in or opt-out of federated learning.
 * On opt-out, the org is immediately removed from any currently open round.
 *
 * Auth: owner role only.
 *
 * Forwards to the NestJS identity service at:
 *   PATCH /api/v1/federated-learning/orgs/:orgId/settings
 *
 * Requirements: 3.4, 3.8
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

function identityBase(env: Env & Record<string, string>): string {
  return (env as unknown as Record<string, string>)['IDENTITY_API_URL'] ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'PATCH') {
    return json({ message: 'Method not allowed' }, 405);
  }

  // Authenticate
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  // Owner-only gate
  if (auth.role !== 'owner') {
    return json(
      { statusCode: 403, message: 'Only an organisation owner can change federated learning settings' },
      403,
    );
  }

  // Verify the slug matches the caller's org (tenant isolation)
  const { slug } = params as { slug: string };
  const supabase = getAdminClient(env);
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .eq('id', auth.organizationId) // mandatory org_id equality filter
    .maybeSingle();

  if (orgErr || !org) {
    return json({ statusCode: 404, message: 'Organization not found' }, 404);
  }

  // Parse and validate body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  if (typeof body['optInFederated'] !== 'boolean') {
    return json({ statusCode: 400, message: 'optInFederated must be a boolean' }, 400);
  }

  // Forward to identity service
  const bearer = (request.headers.get('authorization') ?? '').trim();
  const base = identityBase(env as Env & Record<string, string>);
  const identityUrl = `${base}/api/v1/federated-learning/orgs/${encodeURIComponent(org.id)}/settings`;

  let upstream: Response;
  try {
    upstream = await fetch(identityUrl, {
      method: 'PATCH',
      headers: {
        authorization: bearer,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ optInFederated: body['optInFederated'] }),
    });
  } catch (err) {
    console.error('[settings/federated] upstream fetch failed:', err);
    return json({ statusCode: 503, message: 'Federated learning service unavailable' }, 503);
  }

  const responseBody = await upstream.text();

  if (!upstream.ok) {
    return json(
      { statusCode: upstream.status, message: responseBody.slice(0, 200) },
      upstream.status,
    );
  }

  return new Response(responseBody, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
