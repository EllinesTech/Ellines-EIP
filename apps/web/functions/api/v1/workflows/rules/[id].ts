/**
 * Workflow Rule by ID
 * GET /api/v1/workflows/rules/:id
 * PATCH /api/v1/workflows/rules/:id
 * DELETE /api/v1/workflows/rules/:id
 *
 * Proxy to the Identity service.
 * Owner/Admin only.
 */

import { requireAuth, requireOrgAdmin, json, options, type Env } from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const id = context.params.id as string;
  const url = new URL(context.request.url);
  const apiUrl = getApiUrl(context.env);

  if (context.request.method === 'GET') {
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/workflows/rules/${id}?organizationId=${auth.organizationId}`,
        {
          headers: {
            'Authorization': context.request.headers.get('Authorization') || '',
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return new Response(await response.text(), { status: response.status });
      }

      const data = await response.json();
      return json(data);
    } catch (error: any) {
      console.error('[workflows/rules/:id GET] Error:', error);
      return json({ statusCode: 500, message: error.message }, 500);
    }
  }

  if (context.request.method === 'PATCH') {
    try {
      const input = await context.request.json() as Record<string, unknown>;

      const response = await fetch(
        `${apiUrl}/api/v1/workflows/rules/${id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': context.request.headers.get('Authorization') || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        },
      );

      if (!response.ok) {
        return new Response(await response.text(), { status: response.status });
      }

      const data = await response.json();
      return json(data);
    } catch (error: any) {
      console.error('[workflows/rules/:id PATCH] Error:', error);
      return json({ statusCode: 500, message: error.message }, 500);
    }
  }

  if (context.request.method === 'DELETE') {
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/workflows/rules/${id}?organizationId=${auth.organizationId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': context.request.headers.get('Authorization') || '',
          },
        },
      );

      if (!response.ok) {
        return new Response(await response.text(), { status: response.status });
      }

      return json({ ok: true });
    } catch (error: any) {
      console.error('[workflows/rules/:id DELETE] Error:', error);
      return json({ statusCode: 500, message: error.message }, 500);
    }
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};

function getApiUrl(env: Env): string {
  return env.BASE_URL || 'http://localhost:3001';
}
