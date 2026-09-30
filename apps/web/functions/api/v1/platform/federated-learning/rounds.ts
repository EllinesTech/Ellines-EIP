/**
 * Pages Function: /api/v1/platform/federated-learning/rounds
 *
 * GET  — List all federated learning rounds (Platform Super Admin only)
 * POST — Start a new federated training round (Platform Super Admin only)
 *
 * Forwards to the NestJS identity service at:
 *   GET  /api/v1/federated-learning/rounds
 *   POST /api/v1/federated-learning/rounds
 *
 * Requirements: 3.1, 3.4, 3.8
 */

import {
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

function identityBase(env: Env): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return options();

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  // Authenticate
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  // Platform Super Admin gate (Connector Governance Rule: must be platformAdmin check)
  if (!platformAdminFromEnv(env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform Super Admin access required' }, 403);
  }

  const bearer = (request.headers.get('authorization') ?? '').trim();
  const base = identityBase(env);
  const identityUrl = `${base}/api/v1/federated-learning/rounds`;

  let upstream: Response;
  try {
    if (request.method === 'GET') {
      upstream = await fetch(identityUrl, {
        method: 'GET',
        headers: {
          authorization: bearer,
          'content-type': 'application/json',
        },
      });
    } else {
      // POST — forward body
      const body = await request.text();
      upstream = await fetch(identityUrl, {
        method: 'POST',
        headers: {
          authorization: bearer,
          'content-type': 'application/json',
        },
        body,
      });
    }
  } catch (err) {
    console.error('[federated-learning/rounds] upstream fetch failed:', err);
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
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
