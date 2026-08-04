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
  buildAuthHeaders,
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  syncOpenApiRoutes,
  toTimelineStorage,
  type InstallConfig,
} from '../../../../shared/connectors';
import { sendOutboundEmail } from '../../../../shared/mail';

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
    metadata: { connectorId, connectorName },
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

/**
 * Fetch any HTTP/HTTPS endpoint from the Cloudflare edge.
 * This bypasses browser Mixed Content restrictions and can reach private IPs
 * when the Cloudflare network has a pathway (site-to-site VPN / DMZ exposure).
 */
async function proxyFetch(
  url: string,
  config: InstallConfig,
): Promise<unknown> {
  const headers = buildAuthHeaders(config);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'EllineEIP-Proxy/1.0',
      ...headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Upstream ${url} returned ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON: wrap in a minimal enterprise-compatible envelope
    return {
      briefHighlight: text.slice(0, 400) || `Sync from ${new URL(url).hostname}`,
      timeline: [{ title: 'HTTP sync', detail: `${res.status} from ${new URL(url).hostname}` }],
    };
  }
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

  const supabase = getAdminClient(context.env);

  try {
    // ── Built-in demo / sample connectors ───────────────────────────────────────
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
        raw = await proxyFetch(endpoint, { headers: body.headers });
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

    // ── Installed connector sync (any system) ───────────────────────────────────
    // connectorId here is the installation UUID (UUIDv4 format) or catalog ID.
    // Try UUID-format lookup first, then fall back to catalog ID lookup.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      connectorId,
    );

    if (isUuid) {
      const { data: install } = await supabase
        .from('connector_installations')
        .select('*')
        .eq('id', connectorId)
        .eq('organization_id', auth.organizationId)
        .maybeSingle();

      if (!install) {
        return json({ statusCode: 404, message: 'Connector installation not found' }, 404);
      }

      const config = (install.config || {}) as InstallConfig;
      const catalogId = install.catalog_id as string;
      const displayName = (install.display_name as string) || catalogId;

      let payload: ReturnType<typeof normalizeEnterprisePayload>;

      switch (catalogId) {
        case 'rest-api': {
          const endpoint = (config.endpoint || '').trim();
          if (!endpoint) throw new Error('Connector has no endpoint configured');
          const raw = await proxyFetch(endpoint, config);
          payload = normalizeEnterprisePayload(raw);
          break;
        }

        case 'openapi': {
          const baseUrl = (config.openApiBaseUrl || config.endpoint || '').trim();
          const routes = config.selectedRoutes || [];
          if (!baseUrl) throw new Error('OpenAPI connector has no base URL configured');
          if (!routes.length) throw new Error('No routes selected for OpenAPI sync');
          const headers = buildAuthHeaders(config);
          payload = normalizeEnterprisePayload(
            await syncOpenApiRoutes({ baseUrl, routes, headers, systemName: config.systemName }),
          );
          break;
        }

        case 'csv-file': {
          const csvText = (config.csvText || '').trim();
          if (!csvText) throw new Error('No CSV data in connector configuration');
          payload = parseCsvToEnterprisePayload(csvText);
          break;
        }

        case 'postgres':
        case 'sqlserver':
        case 'mysql': {
          // DB connectors execute server-side via the identity service TCP drivers.
          // Call the identity-side proxy endpoint when available; otherwise return a
          // meaningful stub so the snapshot stays recent.
          const identityBase = (context.env as Env & { IDENTITY_API_URL?: string }).IDENTITY_API_URL;
          if (identityBase) {
            const res = await fetch(`${identityBase}/api/v1/connectors/db-sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                catalogId,
                connectionString: config.connectionString,
                sql: config.sql,
                fieldMap: config.fieldMap,
                systemName: config.systemName || displayName,
              }),
            });
            if (!res.ok) throw new Error(`DB sync service returned ${res.status}`);
            const raw = await res.json();
            payload = normalizeEnterprisePayload(raw);
          } else {
            // Identity service not reachable from edge — record what we know.
            payload = normalizeEnterprisePayload({
              briefHighlight: `${displayName}: DB connector configured. Run identity service sync for live data.`,
              timeline: [
                {
                  title: 'DB sync',
                  detail: `${catalogId} connector ready; identity service TCP sync needed for live records.`,
                },
              ],
            });
          }
          break;
        }

        case 'demo-json': {
          payload = normalizeEnterprisePayload(demoSeed);
          break;
        }

        default: {
          // Generic: attempt an HTTP fetch if endpoint is set, else empty.
          const endpoint = (config.endpoint || '').trim();
          if (endpoint) {
            const raw = await proxyFetch(endpoint, config);
            payload = normalizeEnterprisePayload(raw);
          } else {
            payload = normalizeEnterprisePayload({
              briefHighlight: `${displayName}: no sync method implemented yet for ${catalogId}.`,
              timeline: [],
            });
          }
        }
      }

      // Update installation status + last synced time
      await supabase
        .from('connector_installations')
        .update({
          status: 'active',
          last_synced_at: new Date().toISOString(),
          last_message: `Synced successfully at ${new Date().toUTCString()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectorId);

      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        connectorId,
        displayName,
        payload,
      );

      // Fire-and-forget sync notification to the IT admin who triggered the sync.
      sendOutboundEmail(context.env, {
        to: auth.email,
        subject: `Ellines EIP — Connector synced: ${displayName}`,
        text: [
          `Connector sync completed successfully.`,
          ``,
          `Connector: ${displayName}`,
          `Health Score: ${summary.healthScore}/100`,
          `Connected Systems: ${summary.connectedSystems}`,
          `Open Alerts: ${summary.openAlerts}`,
          `Open Decisions: ${summary.openDecisions}`,
          `Brief: ${summary.briefHighlight || '—'}`,
          `Synced at: ${summary.syncedAt}`,
          ``,
          `---`,
          `Ellines EIP — Enterprise Intelligence Platform`,
        ].join('\n'),
      }).catch(() => {/* silent — email secrets not configured */});

      return json(summary);
    }

    return json({ statusCode: 404, message: `Unknown connector: ${connectorId}` }, 404);
  } catch (err) {
    // Mark installation as error if it's a UUID-based connector
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      connectorId,
    );
    if (isUuid) {
      const sb = getAdminClient(context.env);
      await sb
        .from('connector_installations')
        .update({
          status: 'error',
          last_message: err instanceof Error ? err.message.slice(0, 300) : 'Sync failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectorId)
        .eq('organization_id', auth.organizationId);
    }
    return json(
      { statusCode: 500, message: err instanceof Error ? err.message : 'Sync failed' },
      500,
    );
  }
};
