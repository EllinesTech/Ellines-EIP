import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import { unpackTimelineStorage } from '../../../../../shared/uem';
import { readAuthoritativeSourceCounts } from '../../../../../shared/source-counts';

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

  // The Super Admin reads the SAME authoritative classification the client
  // dashboard does. A platform view that re-derived its own count from connector
  // rows would let two screens disagree about the same organisation, which is
  // the specific confusion this separation exists to remove.
  const counts = await readAuthoritativeSourceCounts(supabase, orgId);

  // Read the real enterprise snapshot for this client org
  const { data: snap, error } = await supabase
    .from('enterprise_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  if (!snap) {
    return json({
      organizationId: orgId,
      connectorId: 'none',
      connectorName: '',
      healthScore: 0,
      connectedSystems: counts.businessSystems,
      sourceCounts: counts,
      openAlerts: 0,
      openDecisions: 0,
      briefHighlight: 'No connector sync yet for this organization.',
      timeline: [],
      model: null,
      syncedAt: null,
      status: 'idle',
    });
  }

  const { events, model } = unpackTimelineStorage(snap.timeline);

  return json({
    organizationId: snap.organization_id,
    connectorId: snap.connector_id,
    connectorName: snap.connector_name,
    healthScore: snap.health_score,
    // Same authoritative classification count as the client dashboard.
    connectedSystems: counts.businessSystems,
    sourceCounts: counts,
    openAlerts: snap.open_alerts,
    openDecisions: snap.open_decisions,
    briefHighlight: snap.brief_highlight,
    timeline: events,
    model,
    syncedAt: new Date(snap.synced_at as string).toISOString(),
    status: 'synced',
  });
};
