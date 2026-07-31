import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../shared/auth';
import {
  normalizeEnterprisePayload,
  toTimelineStorage,
} from '../../../shared/connectors';

/**
 * Bring-your-own System B ingest (Phase 6.4).
 * POST any JSON that normalizeEnterprisePayload understands → upsert org snapshot.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const obj =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const connectorId =
    typeof obj.connectorId === 'string' && obj.connectorId.trim()
      ? obj.connectorId.trim().slice(0, 80)
      : 'external-uem';
  const connectorName =
    typeof obj.connectorName === 'string' && obj.connectorName.trim()
      ? obj.connectorName.trim().slice(0, 120)
      : 'External System B';

  let payload;
  try {
    payload = normalizeEnterprisePayload(obj.payload ?? obj);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid enterprise payload';
    return json({ statusCode: 400, message }, 400);
  }

  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(context.env);
  const packedTimeline = toTimelineStorage(payload);
  const row = {
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    connector_id: connectorId,
    connector_name: connectorName,
    health_score: payload.healthScore,
    connected_systems: payload.connectedSystems,
    open_alerts: payload.openAlerts,
    open_decisions: payload.openDecisions,
    brief_highlight: payload.briefHighlight,
    timeline: packedTimeline,
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
        connector_id: connectorId,
        connector_name: connectorName,
        health_score: payload.healthScore,
        connected_systems: payload.connectedSystems,
        open_alerts: payload.openAlerts,
        open_decisions: payload.openDecisions,
        brief_highlight: payload.briefHighlight,
        timeline: packedTimeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id as string));
  } else {
    ({ error } = await supabase.from('enterprise_snapshots').insert(row));
  }

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'enterprise.ingest',
    resource: 'enterprise_snapshot',
    metadata: {
      connectorId,
      connectorName,
      healthScore: payload.healthScore,
      source: 'byo-system-b',
    },
  });

  return json({
    organizationId: auth.organizationId,
    connectorId,
    connectorName,
    healthScore: payload.healthScore,
    connectedSystems: payload.connectedSystems,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    model: payload.model,
    syncedAt,
    status: 'synced' as const,
    message: 'External UEM snapshot ingested for this organization.',
  });
};
