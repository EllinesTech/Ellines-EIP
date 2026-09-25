/**
 * Platform Super Admin — sync a connector installation for any client org.
 *
 * POST /api/v1/platform/orgs/:orgId/connector-installations/:connId/sync
 *
 * Mirrors the org-scoped handler at connectors/[id]/sync.ts but:
 *  - Gated on platformAdminFromEnv (Super Admin only, never client-org users)
 *  - Operates cross-tenant: always queries with both connId + orgId
 *  - On successful sync, sets status to 'active' (connector is live for the
 *    client org after the Super Admin explicitly runs a sync)
 *  - Updates the enterprise_snapshots table for the client org so their
 *    Glance/Command Center reflects the synced data
 */
import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../../../shared/auth';
import {
  buildAuthHeaders,
  decryptConnectorConfig,
  normalizeEnterprisePayload,
  parseCsvToEnterprisePayload,
  syncOpenApiRoutes,
  toInstallationDto,
  toTimelineStorage,
  type InstallConfig,
} from '../../../../../../../shared/connectors';
import { isSafeEgressTarget, safeFetch, SsrfError } from '../../../../../../../shared/egress';
import {
  isFirestoreResponse,
  normalizeFirestoreResponse,
} from '../../../../../../../shared/firestore-normalizer';
import demoSeed from '../../../../../../../shared/demo-enterprise.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function proxyFetch(url: string, config: InstallConfig): Promise<unknown> {
  const check = isSafeEgressTarget(url);
  if (!check.safe) {
    throw new SsrfError(check.reason ?? 'Egress policy blocked URL', url);
  }
  const res = await safeFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'EllineEIP-Proxy/1.0',
      ...buildAuthHeaders(config),
    },
  });
  if (!res.ok) {
    throw new Error(`Upstream ${url} returned ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      briefHighlight: text.slice(0, 400) || `Sync from ${new URL(url).hostname}`,
      timeline: [{ title: 'HTTP sync', detail: `${res.status} from ${new URL(url).hostname}` }],
    };
  }
  if (isFirestoreResponse(parsed)) {
    return normalizeFirestoreResponse(parsed);
  }
  return parsed;
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
    record_count: payload.recordCount,
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

  if (existing?.id) {
    await supabase
      .from('enterprise_snapshots')
      .update({
        connector_id: row.connector_id,
        connector_name: row.connector_name,
        health_score: row.health_score,
        connected_systems: row.connected_systems,
        record_count: row.record_count,
        open_alerts: row.open_alerts,
        open_decisions: row.open_decisions,
        brief_highlight: row.brief_highlight,
        timeline: row.timeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('enterprise_snapshots').insert(row);
  }

  return {
    healthScore: payload.healthScore,
    connectedSystems: payload.connectedSystems,
    recordCount: payload.recordCount,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    syncedAt,
    connectorId,
    connectorName,
    actorUserId,
    organizationId,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const connId = context.params.connId as string;
  const supabase = getAdminClient(context.env);

  // Tenant-isolation: fetch requires both connId AND orgId to match
  const { data: install, error: fetchError } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', connId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (fetchError) return json({ statusCode: 500, message: fetchError.message }, 500);
  if (!install) return json({ statusCode: 404, message: 'Connector installation not found' }, 404);

  const config = await decryptConnectorConfig(
    (install.config || {}) as InstallConfig,
    orgId,
    context.env,
  );
  const catalogId = install.catalog_id as string;
  const displayName = (install.display_name as string) || catalogId;

  let payload: ReturnType<typeof normalizeEnterprisePayload>;

  try {
    switch (catalogId) {
      case 'demo-json': {
        payload = normalizeEnterprisePayload(demoSeed);
        break;
      }

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
          payload = normalizeEnterprisePayload({
            briefHighlight: `${displayName}: DB connector configured. Identity service sync needed for live data.`,
            timeline: [{
              title: 'DB sync',
              detail: `${catalogId} connector ready; identity service TCP sync needed for live records.`,
            }],
          });
        }
        break;
      }

      default: {
        // Generic: attempt HTTP fetch if endpoint is set
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

    const now = new Date().toISOString();

    // Update installation: mark active + record sync time.
    // Platform sync activates the connector — the client org can now use it.
    const { data: updatedInstall } = await supabase
      .from('connector_installations')
      .update({
        status: 'active',
        last_synced_at: now,
        last_message: `Synced by platform admin at ${new Date().toUTCString()}`,
        updated_at: now,
      })
      .eq('id', connId)
      .eq('organization_id', orgId)
      .select('*')
      .single();

    const summary = await upsertSnapshot(
      context.env,
      orgId,
      auth.sub,
      connId,
      displayName,
      payload,
    );

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: 'platform.connector.sync',
        resource: 'connector_installation',
        metadata: {
          id: connId,
          catalogId,
          targetOrg: orgId,
          healthScore: summary.healthScore,
          recordCount: summary.recordCount,
        },
        ip: auth.ip,
      }),
    );

    return json({
      ...summary,
      installation: updatedInstall ? toInstallationDto(updatedInstall as Record<string, unknown>) : null,
    });
  } catch (err) {
    // Mark as error and return the message
    await supabase
      .from('connector_installations')
      .update({
        status: 'error',
        last_message: err instanceof Error ? err.message.slice(0, 300) : 'Sync failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connId)
      .eq('organization_id', orgId);

    return json(
      {
        statusCode: err instanceof SsrfError ? 400 : 500,
        message: err instanceof Error ? err.message : 'Sync failed',
      },
      err instanceof SsrfError ? 400 : 500,
    );
  }
};
