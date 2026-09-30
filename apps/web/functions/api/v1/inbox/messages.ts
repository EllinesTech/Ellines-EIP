/**
 * Pages Function: GET /api/v1/inbox/messages
 *
 * List messages for the authenticated org.
 * Query params forwarded: accountId, unreadOnly, limit, offset
 *
 * All org members may read messages.
 */

import { json, options, requireAuth, type Env } from '../../../shared/auth';

function identityBase(env: Env): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const bearer = context.request.headers.get('authorization') ?? '';
  const base = identityBase(context.env);

  // Forward query string as-is
  const url = new URL(context.request.url);
  const qs = url.searchParams.toString();
  const upstream_url = `${base}/api/v1/inbox/messages${qs ? `?${qs}` : ''}`;

  try {
    const res = await fetch(upstream_url, { headers: { authorization: bearer } });
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return json({ statusCode: 503, message: 'Inbox service unavailable' }, 503);
  }
};
