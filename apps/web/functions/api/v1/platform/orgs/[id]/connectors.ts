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
    .from('connector_installations')
    .select(
      'id, catalog_id, display_name, config, status, last_synced_at, last_message, last_error, error_count, created_at, updated_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01' || error.message?.includes('schema cache')) return json([]);
    return json({ statusCode: 500, message: error.message }, 500);
  }

  // Map DB snake_case rows to the PlatformOrgConnectorDto camelCase contract
  const rows = (data || []).map((row: Record<string, unknown>) => {
    const lastSyncedAt = (row.last_synced_at as string | null) ?? null;

    return {
      id: row.id,
      catalogId: (row.catalog_id ?? 'unknown') as string,
      displayName: (row.display_name ?? row.catalog_id ?? 'Connector') as string,
      status: (row.status ?? 'idle') as string,
      lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
      lastMessage: (row.last_message as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
      errorCount: Number(row.error_count ?? 0),
      createdAt: new Date((row.created_at as string)).toISOString(),
      updatedAt: new Date((row.updated_at ?? row.created_at) as string).toISOString(),
    };
  });

  return json(rows);
};
