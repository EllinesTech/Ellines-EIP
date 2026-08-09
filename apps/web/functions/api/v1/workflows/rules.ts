/**
 * Workflow Rules API
 * GET /api/v1/workflows/rules — List workflow rules for an org
 * POST /api/v1/workflows/rules — Create a new rule
 *
 * These are proxies to the Identity service, which owns the workflows table.
 * Owner/Admin only.
 */

import { requireAuth, requireOrgAdmin, json, options, type Env } from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const url = new URL(context.request.url);

  if (context.request.method === 'GET') {
    try {
      const autonomyLevel = url.searchParams.get('autonomyLevel');
      const apiUrl = getApiUrl(context.env);
      let targetUrl = `${apiUrl}/api/v1/workflows/rules?organizationId=${auth.organizationId}`;
      if (autonomyLevel) {
        targetUrl += `&autonomyLevel=${autonomyLevel}`;
      }

      const response = await fetch(targetUrl, {
        headers: {
          'Authorization': context.request.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return new Response(await response.text(), { status: response.status });
      }

      const data = await response.json();
      return json(data);
    } catch (error: any) {
      console.error('[workflows/rules GET] Error:', error);
      return json({ statusCode: 500, message: error.message }, 500);
    }
  }

  if (context.request.method === 'POST') {
    try {
      const input = await context.request.json() as Record<string, unknown>;
      const apiUrl = getApiUrl(context.env);

      const response = await fetch(`${apiUrl}/api/v1/workflows/rules`, {
        method: 'POST',
        headers: {
          'Authorization': context.request.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        return new Response(await response.text(), { status: response.status });
      }

      const data = await response.json();
      return json(data, 201);
    } catch (error: any) {
      console.error('[workflows/rules POST] Error:', error);
      return json({ statusCode: 500, message: error.message }, 500);
    }
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};

function getApiUrl(env: Env): string {
  // In production Pages, BASE_URL is set. Locally, default to localhost:3001
  return env.BASE_URL || 'http://localhost:3001';
}
