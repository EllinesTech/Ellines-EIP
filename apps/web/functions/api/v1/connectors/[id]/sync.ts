import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';
import seed from '../../../../shared/demo-enterprise.json';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const connectorId = context.params.id as string;
  if (connectorId !== 'demo-json') {
    return json({ statusCode: 404, message: 'Unknown connector' }, 404);
  }

  const syncedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const supabase = getAdminClient(context.env);

  const row = {
    id,
    organization_id: auth.organizationId,
    connector_id: 'demo-json',
    connector_name: 'Demo JSON Systems',
    health_score: seed.healthScore,
    connected_systems: seed.connectedSystems,
    open_alerts: seed.openAlerts,
    open_decisions: seed.openDecisions,
    brief_highlight: seed.briefHighlight,
    timeline: seed.timeline,
    synced_at: syncedAt,
    created_at: syncedAt,
    updated_at: syncedAt,
  };

  const { data: existing } = await supabase
    .from('enterprise_snapshots')
    .select('id')
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from('enterprise_snapshots')
      .update({
        connector_id: row.connector_id,
        connector_name: row.connector_name,
        health_score: row.health_score,
        connected_systems: row.connected_systems,
        open_alerts: row.open_alerts,
        open_decisions: row.open_decisions,
        brief_highlight: row.brief_highlight,
        timeline: row.timeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('enterprise_snapshots').insert(row));
  }

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'connector.sync',
    resource: 'enterprise_snapshot',
    metadata: { connectorId },
  });

  return json({
    organizationId: auth.organizationId,
    connectorId: 'demo-json',
    connectorName: 'Demo JSON Systems',
    healthScore: seed.healthScore,
    connectedSystems: seed.connectedSystems,
    openAlerts: seed.openAlerts,
    openDecisions: seed.openDecisions,
    briefHighlight: seed.briefHighlight,
    timeline: seed.timeline,
    syncedAt,
    status: 'synced',
  });
};
