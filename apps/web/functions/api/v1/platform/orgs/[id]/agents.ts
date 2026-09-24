import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('ellinea_agents')
    .select(
      'id, name, description, type, status, trigger_type, is_active, is_paused, execution_count, success_count, last_executed_at, created_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // If table doesn't exist yet, return empty rather than 500
    if (error.code === '42P01') return json([]);
    return json({ statusCode: 500, message: error.message }, 500);
  }

  // Map DB snake_case rows to the PlatformOrgAgentDto camelCase contract
  const rows = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    // trigger_type is the DB column; fall back to type for legacy rows
    trigger: (row.trigger_type ?? row.type ?? 'manual') as string,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : row.status === 'active',
    isPaused: Boolean(row.is_paused),
    executionCount: Number(row.execution_count ?? 0),
    successCount: Number(row.success_count ?? 0),
    lastExecutedAt: (row.last_executed_at as string | null) ?? null,
    createdAt: new Date((row.created_at as string)).toISOString(),
  }));

  return json(rows);
};
