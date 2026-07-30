import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import seed from '../../../shared/demo-enterprise.json';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const { data: snap, error } = await supabase
    .from('enterprise_snapshots')
    .select('*')
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  if (!snap) {
    return json({
      organizationId: auth.organizationId,
      connectorId: 'demo-json',
      connectorName: 'Demo JSON Systems',
      healthScore: 0,
      connectedSystems: 0,
      openAlerts: 0,
      openDecisions: 0,
      briefHighlight: 'No connector sync yet. Open Connectors and run Sync now.',
      timeline: [],
      syncedAt: null,
      status: 'idle',
      seedAvailable: Boolean(seed),
    });
  }

  return json({
    organizationId: snap.organization_id,
    connectorId: snap.connector_id,
    connectorName: snap.connector_name,
    healthScore: snap.health_score,
    connectedSystems: snap.connected_systems,
    openAlerts: snap.open_alerts,
    openDecisions: snap.open_decisions,
    briefHighlight: snap.brief_highlight,
    timeline: snap.timeline,
    syncedAt: new Date(snap.synced_at as string).toISOString(),
    status: 'synced',
  });
};
