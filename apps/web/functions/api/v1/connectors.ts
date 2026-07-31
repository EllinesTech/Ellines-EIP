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

  return json([
    {
      id: 'demo-json',
      name: 'Demo JSON Systems',
      type: 'file',
      status: activeId === 'demo-json' ? 'synced' : 'idle',
      lastSyncedAt: activeId === 'demo-json' ? lastAt : null,
      message:
        activeId === 'demo-json'
          ? 'Last sync OK'
          : 'Built-in seed — Sync now for live KPIs',
    },
    {
      id: 'rest-api',
      name: 'REST API Systems',
      type: 'api',
      status: activeId === 'rest-api' ? 'synced' : 'idle',
      lastSyncedAt: activeId === 'rest-api' ? lastAt : null,
      message:
        activeId === 'rest-api'
          ? 'Last sync OK'
          : 'Point at any JSON REST URL (sample included)',
    },
  ]);
};
