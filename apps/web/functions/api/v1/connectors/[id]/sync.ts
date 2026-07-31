import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';
import demoSeed from '../../../../shared/demo-enterprise.json';
import restSample from '../../../../shared/rest-enterprise-sample.json';
import {
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  toTimelineStorage,
} from '../../../../shared/connectors';

const CSV_SAMPLE = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

type SyncBody = {
  endpoint?: string;
  headers?: Record<string, string>;
  csvText?: string;
};

function resolveEndpoint(requestUrl: string, endpoint?: string): string {
  const origin = new URL(requestUrl).origin;
  const raw = (endpoint || '/api/v1/connectors/rest-sample').trim();
  if (raw.startsWith('/')) return `${origin}${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid REST endpoint URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('REST endpoint must be http(s)');
  }
  return parsed.toString();
}

async function upsertSnapshot(
  env: Env,
  organizationId: string,
  actorUserId: string,
  connectorId: string,
  connectorName: string,
  payload: ReturnType<typeof normalizeEnterprisePayload>,
) {
  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(env);
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
    throw new Error(error.message);
  }

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: organizationId,
    user_id: actorUserId,
    action: 'connector.sync',
    resource: 'enterprise_snapshot',
    metadata: { connectorId },
  });

  return {
    organizationId,
    connectorId,
    connectorName,
    healthScore: payload.healthScore,
    connectedSystems: payload.connectedSystems,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    model: payload.model || null,
    syncedAt,
    status: 'synced' as const,
  };
}

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
  let body: SyncBody = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as SyncBody;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  try {
    if (connectorId === 'demo-json') {
      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'demo-json',
        'Demo JSON Systems',
        normalizeEnterprisePayload(demoSeed),
      );
      return json(summary);
    }

    if (connectorId === 'rest-api') {
      const endpoint = resolveEndpoint(context.request.url, body.endpoint);
      const isSample =
        endpoint.includes('/api/v1/connectors/rest-sample') ||
        endpoint.endsWith('/connectors/rest-sample') ||
        endpoint.endsWith('/connectors/rest-sample/');

      let raw: unknown = restSample;
      if (!isSample) {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(body.headers || {}),
          },
        });
        if (!res.ok) {
          return json(
            { statusCode: 502, message: `REST endpoint returned ${res.status}` },
            502,
          );
        }
        raw = await res.json();
      }

      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'rest-api',
        'REST API Systems',
        normalizeEnterprisePayload(raw),
      );
      return json(summary);
    }

    if (connectorId === 'csv-file') {
      const csvText = (body.csvText && body.csvText.trim()) || CSV_SAMPLE;
      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'csv-file',
        'CSV / File Import',
        parseCsvToEnterprisePayload(csvText),
      );
      return json(summary);
    }

    return json({ statusCode: 404, message: 'Unknown connector' }, 404);
  } catch (err) {
    return json(
      { statusCode: 500, message: err instanceof Error ? err.message : 'Sync failed' },
      500,
    );
  }
};
