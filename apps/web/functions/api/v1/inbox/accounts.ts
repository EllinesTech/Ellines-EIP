/**
 * Pages Function: /api/v1/inbox/accounts
 *
 * GET  — list all email accounts for the authenticated org
 * POST — add a new email account (owner / admin only)
 *
 * Proxies to: GET|POST /api/v1/inbox/accounts on the identity service.
 * §6 tenant isolation: organizationId comes from the JWT, never from the URL.
 */

import {
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../shared/auth';

function identityBase(env: Env): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const bearer = context.request.headers.get('authorization') ?? '';
  const base = identityBase(context.env);

  // GET — all org members may list accounts
  if (context.request.method === 'GET') {
    try {
      const upstream = await fetch(`${base}/api/v1/inbox/accounts`, {
        headers: { authorization: bearer },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
    }
  }

  // POST — owner / admin only
  if (context.request.method === 'POST') {
    const guard = requireOrgAdmin(auth.role);
    if (guard) return guard;

    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    try {
      const upstream = await fetch(`${base}/api/v1/inbox/accounts`, {
        method: 'POST',
        headers: { authorization: bearer, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
    }
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
