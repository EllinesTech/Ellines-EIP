/**
 * GET /api/v1/orgs/:slug/me/shortcuts
 *
 * Returns the top-5 context-aware shortcut suggestions for the authenticated
 * user within the specified organisation.
 *
 * Auth: any authenticated member of the org (JWT bearer).
 *
 * The request is forwarded to the NestJS identity service at
 *   GET /api/v1/personalization/shortcuts?orgId=<orgId>
 * which calls PersonalizationService.getContextAwareShortcuts(userId, orgId, 5).
 *
 * When IDENTITY_API_URL is not configured (pure Pages deployment without a
 * running identity service), the endpoint returns an empty shortcuts array so
 * the UI stays stable.
 *
 * Requirements: 19.3, 19.7
 */

import { requireAuth, getAdminClient, json, options, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

type EnvWithIdentity = Env & { IDENTITY_API_URL?: string };

function identityBase(env: EnvWithIdentity): string {
  return env.IDENTITY_API_URL ?? 'http://localhost:3001';
}

export const onRequest: PagesFunction<EnvWithIdentity> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  // Verify the bearer token and retrieve the caller's identity.
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Resolve the org slug to an organisation row so we can validate membership.
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

  // The JWT already carries the user's primary org; confirm the slug-org matches
  // to prevent cross-tenant reads.
  if (org.id !== auth.organizationId) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  const base = identityBase(context.env);
  const identityUrl =
    `${base}/api/v1/personalization/shortcuts?orgId=${encodeURIComponent(org.id)}`;

  let upstream: Response;
  try {
    upstream = await fetch(identityUrl, {
      method: 'GET',
      headers: {
        'Authorization': context.request.headers.get('Authorization') ?? '',
        'Content-Type': 'application/json',
      },
    });
  } catch {
    // Identity service not reachable (local dev without identity running).
    return json({ shortcuts: [] });
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    console.error(`[shortcuts] identity responded ${upstream.status}: ${body}`);
    // Surface graceful empty list rather than a hard 5xx.
    return json({ shortcuts: [] });
  }

  const data = await upstream.json<{ success: boolean; data: unknown[] }>();
  const shortcuts = Array.isArray(data?.data) ? data.data.slice(0, 5) : [];

  return json({ shortcuts });
};
