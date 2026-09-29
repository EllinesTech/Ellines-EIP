/**
 * POST /api/v1/connectors/install-from-template
 *
 * PLATFORM ADMIN ONLY — Connector Governance Rule §5.
 *
 * This Pages Function proxy enforces the platformAdmin gate at the edge
 * before forwarding to the identity service.  The identity-service
 * TemplateController independently re-validates the same gate, providing
 * defence in depth.
 */
import { platformAdminFromEnv, requireAuth, json, options, type Env } from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  // Require a valid JWT session
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Gate: platform admin only
  const isPlatformAdmin = platformAdminFromEnv(context.env, auth.email);
  if (!isPlatformAdmin) {
    return json(
      {
        statusCode: 403,
        message:
          'Connector installation is a platform admin operation. ' +
          'Client organizations cannot install connectors directly.',
      },
      403,
    );
  }

  // Forward to identity service (which will re-validate the same gate)
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const apiUrl = context.env.IDENTITY_API_URL || 'http://localhost:3001';
  try {
    const response = await fetch(
      `${apiUrl}/api/v1/connectors/install-from-template`,
      {
        method: 'POST',
        headers: {
          Authorization: context.request.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[install-from-template] upstream error:', msg);
    return json({ statusCode: 502, message: 'Upstream service unavailable' }, 502);
  }
};
