import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';
import demoSeed from '../../../../../shared/demo-enterprise.json';
import restSample from '../../../../../shared/rest-enterprise-sample.json';
import {
  buildAuthHeaders,
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  parseOpenApiDocument,
  syncOpenApiRoutes,
  toTimelineStorage,
  type InstallConfig,
} from '../../../../../shared/connectors';

const CSV_SAMPLE = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

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
  if (error) throw new Error(error.message);

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

function resolveEndpoint(requestUrl: string, endpoint?: string): string {
  const origin = new URL(requestUrl).origin;
  const raw = (endpoint || '/api/v1/connectors/rest-sample').trim();
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return raw;
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

  const id = context.params.id as string;
  const supabase = getAdminClient(context.env);
  const { data: existing } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();
  if (!existing) return json({ statusCode: 404, message: 'Installation not found' }, 404);

  const config = (existing.config || {}) as InstallConfig;
  const catalogId = existing.catalog_id as string;
  const displayName = existing.display_name as string;

  try {
    let summary;
    if (catalogId === 'demo-json') {
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'demo-json',
        displayName || 'Demo JSON Systems',
        normalizeEnterprisePayload(demoSeed),
      );
    } else if (catalogId === 'rest-api') {
      const endpoint = resolveEndpoint(context.request.url, config.endpoint);
      const isSample =
        endpoint.includes('/api/v1/connectors/rest-sample') ||
        endpoint.endsWith('/connectors/rest-sample');
      let raw: unknown = restSample;
      if (!isSample) {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...buildAuthHeaders(config) },
        });
        if (!res.ok) {
          return json(
            { statusCode: 502, message: `REST endpoint returned ${res.status}` },
            502,
          );
        }
        raw = await res.json();
      }
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'rest-api',
        displayName || 'REST API Systems',
        normalizeEnterprisePayload(raw),
      );
    } else if (catalogId === 'openapi') {
      let baseUrl = (config.openApiBaseUrl || '').trim();
      let systemName = displayName || config.systemName || 'OpenAPI System';
      if (config.openApiDocument) {
        const parsed = parseOpenApiDocument(config.openApiDocument);
        if (!baseUrl) baseUrl = parsed.baseUrl;
        systemName = displayName || config.systemName || parsed.title;
      }
      const routes = config.selectedRoutes?.length
        ? config.selectedRoutes
        : config.openApiDocument
          ? parseOpenApiDocument(config.openApiDocument)
              .endpoints.filter((e) => e.selectable)
              .slice(0, 5)
              .map((e) => ({
                method: e.method,
                path: e.path,
                capability: e.capability,
              }))
          : [];
      const payload = await syncOpenApiRoutes({
        baseUrl,
        routes,
        headers: buildAuthHeaders(config),
        systemName,
      });
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'openapi',
        systemName,
        payload,
      );
    } else if (catalogId === 'csv-file') {
      const csvText = (config.csvText && config.csvText.trim()) || CSV_SAMPLE;
      summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'csv-file',
        displayName || 'CSV / File Import',
        parseCsvToEnterprisePayload(csvText),
      );
    } else if (catalogId === 'postgres' || catalogId === 'email-imap' || catalogId === 'sftp') {
      return json(
        {
          statusCode: 501,
          message:
            `${catalogId} sync needs the Identity API (TCP). Config is saved — point NEXT_PUBLIC_API_URL at Nest Identity, or use CSV/REST/OpenAPI on Pages.`,
        },
        501,
      );
    } else {
      return json({ statusCode: 404, message: 'Unknown connector' }, 404);
    }

    const now = new Date().toISOString();
    await supabase
      .from('connector_installations')
      .update({
        status: 'synced',
        last_synced_at: now,
        last_message: `Synced — health ${summary.healthScore}`,
        updated_at: now,
      })
      .eq('id', id);

    return json(summary);
  } catch (err) {
    return json(
      { statusCode: 500, message: err instanceof Error ? err.message : 'Sync failed' },
      500,
    );
  }
};
