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
 * System B → EIP push (webhooks / events).
 * Auth: Owner/IT JWT (Bearer) OR X-EIP-Organization-Id + X-EIP-Webhook-Secret
 * matching organizations.settings.webhookSecret.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const orgHeader = (context.request.headers.get('x-eip-organization-id') || '').trim();
  const secretHeader = (context.request.headers.get('x-eip-webhook-secret') || '').trim();

  let organizationId = '';
  let actorUserId: string | null = null;
  let authMode: 'jwt' | 'webhook-secret' = 'jwt';

  if (orgHeader && secretHeader) {
    const supabase = getAdminClient(context.env);
    const { data, error } = await supabase
      .from('organizations')
      .select('id, settings')
      .eq('id', orgHeader)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const settings =
      data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? (data.settings as Record<string, unknown>)
        : {};
    const expected =
      typeof settings.webhookSecret === 'string' ? settings.webhookSecret.trim() : '';
    if (!data?.id || !expected || expected !== secretHeader) {
      return json({ statusCode: 401, message: 'Invalid webhook credentials' }, 401);
    }
    organizationId = data.id as string;
    authMode = 'webhook-secret';
  } else {
    const auth = await requireAuth(context.env, context.request);
    if (auth instanceof Response) return auth;
    const denied = requireOrgAdmin(auth.role);
    if (denied) return denied;
    organizationId = auth.organizationId;
    actorUserId = auth.sub;
  }

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

  const eventType =
    typeof obj.event === 'string' && obj.event.trim()
      ? obj.event.trim().slice(0, 80)
      : 'enterprise.updated';

  const connectorId =
    typeof obj.connectorId === 'string' && obj.connectorId.trim()
      ? obj.connectorId.trim().slice(0, 80)
      : 'webhook';
  const connectorName =
    typeof obj.connectorName === 'string' && obj.connectorName.trim()
      ? obj.connectorName.trim().slice(0, 120)
      : 'System B webhook';

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
    organization_id: organizationId,
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
    .eq('organization_id', organizationId)
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
    organization_id: organizationId,
    user_id: actorUserId,
    action: 'enterprise.webhook',
    resource: 'enterprise_snapshot',
    metadata: {
      connectorId,
      connectorName,
      healthScore: payload.healthScore,
      eventType,
      authMode,
      source: 'webhook',
    },
  });

  return json({
    organizationId,
    event: eventType,
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
    message: 'Webhook event accepted; enterprise snapshot updated.',
  });
};
