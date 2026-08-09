/**
 * Workflow Rule Dry Run
 * POST /api/v1/workflows/rules/:id/dry-run
 *
 * Proxy to the Identity service.
 * Owner/Admin only.
 */

import { requireAuth, requireOrgAdmin, json, options, type Env } from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  try {
    const id = context.params.id as string;
    const input = await context.request.json() as Record<string, unknown>;
    const apiUrl = getApiUrl(context.env);

    const response = await fetch(
      `${apiUrl}/api/v1/workflows/rules/${id}/dry-run`,
      {
        method: 'POST',
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
    console.error('[workflows/rules/:id/dry-run] Error:', error);
    return json({ statusCode: 500, message: error.message }, 500);
  }
};

function getApiUrl(env: Env): string {
  return env.BASE_URL || 'http://localhost:3001';
}
