/**
 * Pages Function: POST /api/v1/inbox/sync
 * Sync all due accounts for this org (owner / admin only).
 */

import { json, options, requireAuth, requireOrgAdmin, type Env } from '../../../shared/auth';

function identityBase(env: Env): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const guard = requireOrgAdmin(auth.role);
  if (guard) return guard;

  const bearer = context.request.headers.get('authorization') ?? '';
  const base = identityBase(context.env);

  try {
    const res = await fetch(`${base}/api/v1/inbox/sync`, {
      method: 'POST',
      headers: { authorization: bearer },
    });
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
  }
};
