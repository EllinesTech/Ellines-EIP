/**
 * POST /api/v1/orgs/:slug/me/preferences
 *
 * Persists an explicit preference override for the authenticated user inside
 * the specified organisation.
 *
 * Auth: any authenticated member of the org (JWT bearer).
 *
 * Request body:
 *   { key: string, value: unknown }
 *
 * Explicit preferences take precedence over learned ones (Requirement 19.7).
 * The request is forwarded to the NestJS identity service at
 *   POST /api/v1/personalization/preferences?orgId=<orgId>
 * with the same body, which calls PersonalizationService.updateUserPreference().
 *
 * Requirements: 19.5, 19.7
 */

import { requireAuth, getAdminClient, json, options, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

type EnvWithIdentity = Env & { IDENTITY_API_URL?: string };

function identityBase(env: EnvWithIdentity): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

interface PreferenceBody {
  key: string;
  value: unknown;
}

export const onRequest: PagesFunction<EnvWithIdentity> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  // Verify the bearer token and retrieve the caller's identity.
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Parse and validate the request body.
  let body: PreferenceBody;
  try {
    // `Request.json<T>()` is generic in the Workers types but not in lib.dom, so
    // the cast is what keeps this compiling in BOTH programs. Behaviour is
    // identical — Workers' generic form is a type-level convenience only.
    const raw = (await context.request.json()) as PreferenceBody;
    if (typeof raw?.key !== 'string' || raw.key.trim() === '') {
      return json({ statusCode: 400, message: '`key` must be a non-empty string' }, 400);
    }
    if (!('value' in raw)) {
      return json({ statusCode: 400, message: '`value` is required' }, 400);
    }
    body = { key: raw.key.trim(), value: raw.value };
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  // Resolve the org slug to an organisation row and validate cross-tenant access.
  const { slug } = context.params as { slug: string };
  const supabase = getAdminClient(context.env);
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (orgErr || !org) {
    return json({ statusCode: 404, message: 'Organization not found' }, 404);
  }

  // JWT org must match the slug org — cross-tenant write guard.
  if (org.id !== auth.organizationId) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  const base = identityBase(context.env);
  const identityUrl =
    `${base}/api/v1/personalization/preferences?orgId=${encodeURIComponent(org.id)}`;

  let upstream: Response;
  try {
    upstream = await fetch(identityUrl, {
      method: 'POST',
      headers: {
        'Authorization': context.request.headers.get('Authorization') ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return json(
      { statusCode: 503, message: 'Personalization service unavailable' },
      503,
    );
  }

  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => '');
    console.error(`[preferences] identity responded ${upstream.status}: ${errBody}`);
    return json(
      { statusCode: upstream.status, message: 'Failed to update preference' },
      upstream.status >= 400 && upstream.status < 600 ? upstream.status : 500,
    );
  }

  return json({ success: true, message: 'Preference updated successfully' });
};
