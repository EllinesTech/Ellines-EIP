/**
 * Pages Function: /api/v1/inbox/[accountId]
 *
 * GET    — get single account details
 * PATCH  — update account (owner / admin only)
 * DELETE — remove account + all messages (owner / admin only)
 *
 * Proxies to: /api/v1/inbox/accounts/:id on the identity service.
 */

import {
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

function identityBase(env: Env): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const { accountId } = context.params as { accountId: string };
  const bearer = context.request.headers.get('authorization') ?? '';
  const base = identityBase(context.env);
  const upstream_url = `${base}/api/v1/inbox/accounts/${accountId}`;

  if (context.request.method === 'GET') {
    try {
      const res = await fetch(upstream_url, { headers: { authorization: bearer } });
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
    } catch {
      return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
    }
  }

  if (context.request.method === 'PATCH') {
    const guard = requireOrgAdmin(auth.role);
    if (guard) return guard;
    let body: unknown;
    try { body = await context.request.json(); } catch { return json({ statusCode: 400, message: 'Invalid JSON' }, 400); }
    try {
      const res = await fetch(upstream_url, {
        method: 'PATCH',
        headers: { authorization: bearer, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
    } catch {
      return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
    }
  }

  if (context.request.method === 'DELETE') {
    const guard = requireOrgAdmin(auth.role);
    if (guard) return guard;
    try {
      const res = await fetch(upstream_url, { method: 'DELETE', headers: { authorization: bearer } });
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
    } catch {
      return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
    }
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
