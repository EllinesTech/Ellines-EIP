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
    .select('synced_at')
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  return json([
    {
      id: 'demo-json',
      name: 'Demo JSON Systems',
      type: 'file',
      status: snap ? 'synced' : 'idle',
      lastSyncedAt: snap?.synced_at
        ? new Date(snap.synced_at as string).toISOString()
        : null,
      message: snap ? 'Last sync OK' : 'Not synced yet',
    },
  ]);
};
