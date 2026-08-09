/**
 * Workflow Executions API
 * GET /api/v1/workflows/executions — List workflow executions for an org
 *
 * Proxy to the Identity service.
 * Owner/Admin only.
 */

import { requireAuth, requireOrgAdmin, json, options, type Env } from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  try {
    const url = new URL(context.request.url);
    const ruleId = url.searchParams.get('ruleId');
    const limit = url.searchParams.get('limit');

    const apiUrl = getApiUrl(context.env);
    let targetUrl = `${apiUrl}/api/v1/workflows/executions?organizationId=${auth.organizationId}`;
    if (ruleId) targetUrl += `&ruleId=${ruleId}`;
    if (limit) targetUrl += `&limit=${limit}`;

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
    console.error('[executions] Error:', error);
    return json({ statusCode: 500, message: error.message }, 500);
  }
};

function getApiUrl(env: Env): string {
  return env.BASE_URL || 'http://localhost:3001';
}
