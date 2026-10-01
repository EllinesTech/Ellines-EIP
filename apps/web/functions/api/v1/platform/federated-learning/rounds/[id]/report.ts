/**
 * Pages Function: GET /api/v1/platform/federated-learning/rounds/:id/report
 *
 * Returns the transparency report for a completed federated learning round.
 * Platform Super Admin only.
 *
 * Forwards to the NestJS identity service at:
 *   GET /api/v1/federated-learning/rounds/:id/report
 *
 * Requirements: 3.7, 3.8
 */

import {
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';
import { platformStaffHas } from '../../../../../../shared/platform-staff';

function identityBase(env: Env): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  // Authenticate
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  // Platform Super Admin gate
  if (!await platformStaffHas(env, auth.email, 'platform.system.read')) {
    return json({ statusCode: 403, message: 'Platform Super Admin access required' }, 403);
  }

  const { id } = params as { id: string };

  if (!id) {
    return json({ statusCode: 400, message: 'Round id is required' }, 400);
  }

  const bearer = (request.headers.get('authorization') ?? '').trim();
  const base = identityBase(env);
  const identityUrl = `${base}/api/v1/federated-learning/rounds/${encodeURIComponent(id)}/report`;

  let upstream: Response;
  try {
    upstream = await fetch(identityUrl, {
      method: 'GET',
      headers: {
        authorization: bearer,
        'content-type': 'application/json',
      },
    });
  } catch (err) {
    console.error('[federated-learning/report] upstream fetch failed:', err);
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
