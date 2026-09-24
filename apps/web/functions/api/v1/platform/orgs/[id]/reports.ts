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
    .from('scheduled_reports')
    .select('id, title, cadence, enabled, last_run_at, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // Table may not exist yet on this environment — return empty rather than 500
    if (error.code === '42P01' || error.message?.includes('schema cache')) return json([]);
    return json({ statusCode: 500, message: error.message }, 500);
  }

  return json(
    (data || []).map((r) => ({
      id: r.id,
      title: r.title,
      cadence: r.cadence,
      enabled: r.enabled,
      lastRunAt: r.last_run_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  );
};
