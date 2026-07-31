import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const { data: snap } = await supabase
    .from('enterprise_snapshots')
    .select('synced_at, connector_id')
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  const lastAt = snap?.synced_at
    ? new Date(snap.synced_at as string).toISOString()
    : null;
  const activeId = (snap?.connector_id as string | undefined) || null;

  const item = (
    id: string,
    name: string,
    type: string,
    idleMsg: string,
  ) => ({
    id,
    name,
    type,
    status: activeId === id ? 'synced' : 'idle',
    lastSyncedAt: activeId === id ? lastAt : null,
    message: activeId === id ? 'Last sync OK' : idleMsg,
  });

  return json([
    item('demo-json', 'Demo JSON Systems', 'file', 'Built-in seed — Sync now for live KPIs'),
    item('rest-api', 'REST API Systems', 'api', 'JSON HTTPS URL when the system exposes an API'),
    item('openapi', 'OpenAPI / Swagger', 'api', 'Upload OpenAPI — pick capabilities to sync'),
    item(
      'csv-file',
      'CSV / File Import',
      'file',
      'No API needed — paste a CSV export from the business system',
    ),
    item(
      'postgres',
      'PostgreSQL (read-only)',
      'database',
      'Reporting DB / replica when vendors will not ship an API',
    ),
  ]);
};
