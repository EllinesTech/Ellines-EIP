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

  // Schema column is "trigger" (no @map), plus mapped snake_case fields.
  const { data, error } = await supabase
    .from('ellinea_agents')
    .select(
      'id, name, description, trigger, is_active, is_paused, execution_count, success_count, last_executed_at, created_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // If table doesn't exist yet, return empty rather than 500
    if (error.code === '42P01') return json([]);
    // Unknown column — schema drift; return empty so the UI doesn't crash
    if (error.code === '42703') return json([]);
    return json({ statusCode: 500, message: error.message }, 500);
  }

  // Map DB rows to the PlatformOrgAgentDto camelCase contract
  const rows = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    trigger: (row.trigger ?? 'manual') as string,
    isActive: Boolean(row.is_active),
    isPaused: Boolean(row.is_paused),
    executionCount: Number(row.execution_count ?? 0),
    successCount: Number(row.success_count ?? 0),
    lastExecutedAt: (row.last_executed_at as string | null) ?? null,
    createdAt: new Date((row.created_at as string)).toISOString(),
  }));

  return json(rows);
};
