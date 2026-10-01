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
import { retrieveAllPages } from '../../../../../../../shared/pagination';
import { applyOutcomes, saveCapabilityRegistry } from '../../../../../../../shared/capability-store';
import { availableCapabilityCount, deriveRegistryFromResponse } from '@ellines-eip/shared';
import { platformStaffHas } from '../../../../../../../shared/platform-staff';

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
  /**
   * Real retrieval evidence from this run, when the catalog type went through
   * the retrieval engine. When absent the retrieval columns are written as
   * unknown/incomplete rather than as a success — a payload that merely parsed
   * is not evidence that records were read.
   */
  retrieval?: {
    retrievedRecordCount: number;
    reportedRecordCount: number;
    complete: boolean;
    stopReason: string;
    resourceName: string | null;
  },
) {
  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(env);
  const packedTimeline = toTimelineStorage(payload);
  const row = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    connector_id: connectorId,
    connector_name: connectorName,
    // null = the source published no health metric. Never coerced to 0.
    health_score: payload.healthScore,
    connected_systems: payload.connectedSystems,
    record_count: payload.recordCount,
    // Retrieval evidence, or explicit unknowns when there is none.
    retrieved_count: retrieval ? retrieval.retrievedRecordCount : 0,
    reported_count: retrieval ? retrieval.reportedRecordCount : 0,
    retrieval_complete: retrieval ? retrieval.complete : false,
    retrieval_stop_reason: retrieval ? retrieval.stopReason : 'not-retrieved',
    resources_retrieved: retrieval && retrieval.retrievedRecordCount > 0 ? 1 : 0,
    resources_failed: retrieval && retrieval.retrievedRecordCount > 0 ? 0 : 1,
    sync_status: !retrieval
      ? 'idle'
      : retrieval.complete && retrieval.retrievedRecordCount > 0
        ? 'synced'
        : 'partial',
    sync_error: !retrieval
      ? 'This connector type does not produce per-record retrieval evidence.'
      : retrieval.complete && retrieval.retrievedRecordCount > 0
        ? null
        : `Retrieval stopped (${retrieval.stopReason}) after ${retrieval.retrievedRecordCount} record(s).`,
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
        retrieved_count: row.retrieved_count,
        reported_count: row.reported_count,
        retrieval_complete: row.retrieval_complete,
        retrieval_stop_reason: row.retrieval_stop_reason,
        resources_retrieved: row.resources_retrieved,
        resources_failed: row.resources_failed,
        sync_status: row.sync_status,
        sync_error: row.sync_error,
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

  if (!await platformStaffHas(context.env, auth.email, 'platform.connectors.manage')) {
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
  // Real retrieval evidence from THIS run, or null when the catalog type does
  // not go through the retrieval engine. Never synthesised.
  let retrievalEvidence: {
    retrievedRecordCount: number;
    reportedRecordCount: number;
    complete: boolean;
    stopReason: string;
    errors: string[];
    resourceName: string | null;
  } | null = null;

  try {
    switch (catalogId) {
      case 'rest-api': {
        const endpoint = (config.endpoint || '').trim();
        if (!endpoint) throw new Error('Connector has no endpoint configured');

        // The Super Admin sync must use the SAME retrieval engine as the client
        // sync. It previously called a bare proxyFetch, which meant a Super Admin
        // sync persisted no retrieval evidence and never rebuilt the capability
        // registry — so the org's Connected Systems view silently went stale even
        // though a sync had just been run for it.
        const retrieval = await retrieveAllPages({
          startUrl: endpoint,
          fetchPage: async (url) => {
            const check = isSafeEgressTarget(url);
            if (!check.safe) throw new SsrfError(check.reason ?? 'Egress policy blocked URL', url);
            const res = await safeFetch(url, {
              method: 'GET',
              headers: {
                Accept: 'application/json, text/plain, */*',
                'User-Agent': 'EllineEIP-Proxy/1.0',
                ...buildAuthHeaders(config),
              },
            });
            const text = await res.text();
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => {
              headers[k.toLowerCase()] = v;
            });
            return { body: parsed, headers, status: res.status };
          },
          strategy: config.paginationStrategy ?? 'auto',
        });

        const raw = retrieval.records.length
          ? { [retrieval.resourceName ?? 'records']: retrieval.records }
          : null;
        payload = normalizeEnterprisePayload({
          ...(raw ?? {}),
          records: retrieval.records,
          retrievedCount: retrieval.retrievedRecordCount,
          systemName: displayName,
        });

        // Persist the real retrieval evidence, exactly as the org-scoped path
        // does, so both paths produce comparable, verifiable state.
        const derived = deriveRegistryFromResponse({
          systemName: config.systemLabel || config.systemName || displayName,
          payload: { [retrieval.resourceName ?? 'records']: retrieval.records },
          paginationObserved:
            retrieval.pagesFetched > 1 && retrieval.strategy !== 'single'
              ? retrieval.strategy === 'token' || retrieval.strategy === 'next-link'
                ? 'cursor'
                : retrieval.strategy
              : 'none',
        });
        const retrievedResource =
          (retrieval.resourceName && derived.discovered.includes(retrieval.resourceName)
            ? retrieval.resourceName
            : null) ?? derived.discovered[0] ?? displayName;
        const registry = applyOutcomes(derived.registry, [
          {
            resource: retrievedResource,
            ok: retrieval.errors.length === 0,
            retrievedRecordCount: retrieval.retrievedRecordCount,
            reportedRecordCount: retrieval.reportedRecordCount,
            complete: retrieval.complete,
            stopReason: retrieval.stopReason,
          },
        ]);
        await saveCapabilityRegistry(context.env, {
          installationId: connId,
          organizationId: orgId,
          registry,
        });
        retrievalEvidence = {
          retrievedRecordCount: retrieval.retrievedRecordCount,
          reportedRecordCount: retrieval.reportedRecordCount,
          complete: retrieval.complete,
          stopReason: retrieval.stopReason,
          errors: retrieval.errors.map((e) => e.reason),
          resourceName: retrieval.resourceName,
        };
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
    // `last_sync_at` MUST be written here too: it is the column the health and
    // capability endpoints read for freshness, and leaving it unset on the
    // platform path is what made a just-synced connector read as STALE.
    const { data: updatedInstall } = await supabase
      .from('connector_installations')
      .update({
        status: 'active',
        last_synced_at: now,
        last_sync_at: now,
        last_message: `Synced by platform admin at ${new Date().toUTCString()}${
          retrievalEvidence
            ? ` — retrieved ${retrievalEvidence.retrievedRecordCount} record(s) from ${retrievalEvidence.resourceName ?? 'source'}`
            : ''
        }`,
        last_error: null,
        error_count: 0,
        discovery_snapshot: retrievalEvidence
          ? {
              discoveredAt: now,
              method: 'response-analysis',
              resources: 1,
              available: retrievalEvidence.complete && retrievalEvidence.retrievedRecordCount > 0 ? 1 : 0,
              notes: [
                `Retrieved ${retrievalEvidence.retrievedRecordCount} record(s) from "${retrievalEvidence.resourceName ?? 'source'}"; stop reason: ${retrievalEvidence.stopReason}.`,
              ],
            }
          : undefined,
        updated_at: now,
      })
      .eq('id', connId)
      .eq('organization_id', orgId)
      .select('*')
      .single();

    // connected_systems must reflect the org's REAL active connector count.
    // A payload's own connectedSystems (or a floor of 1) is not authoritative —
    // `Math.max(payload.connectedSystems, 1)` fabricates a value, and per REQ-1 a
    // generic record count must never be read as a systems count.
    const { count: activeConnectorCount } = await supabase
      .from('connector_installations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['active', 'synced']);

    const summary = await upsertSnapshot(
      context.env,
      orgId,
      auth.sub,
      connId,
      displayName,
      { ...payload, connectedSystems: activeConnectorCount ?? 0 },
      retrievalEvidence ?? undefined,
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
      // The real retrieval result from this run, so a caller can distinguish
      // "synced" from "synced and actually read N records".
      retrieval: retrievalEvidence,
      installation: updatedInstall ? toInstallationDto(updatedInstall as Record<string, unknown>) : null,
    });
  } catch (err) {
    // Mark as error and return the message.
    // `last_sync_at` is deliberately NOT touched: a failed attempt is not a
    // successful retrieval, and advancing it would make freshness look verified
    // when nothing was read.
    await supabase
      .from('connector_installations')
      .update({
        status: 'error',
        last_message: err instanceof Error ? err.message.slice(0, 300) : 'Sync failed',
        last_error: err instanceof Error ? err.message.slice(0, 300) : 'Sync failed',
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
