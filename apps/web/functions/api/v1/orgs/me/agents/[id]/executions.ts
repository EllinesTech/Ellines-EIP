/**
 * Pages Function: GET /api/v1/orgs/me/agents/:id/executions
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function normalizeExecs(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return (raw as { id: string }[]).filter((x) => x && typeof x.id === 'string').slice(0, 200);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  const agentId = context.params.id as string;
  const url = new URL(context.request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  const supabase = getAdminClient(context.env);
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);
  const execKey = `agentExecs_${agentId}`;
  return json(normalizeExecs(settings[execKey]).slice(0, limit));
};
