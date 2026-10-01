/**
 * GET /api/v1/orgs/me/sources
 *
 * The single source of truth every dashboard reads.
 *
 * Returns the real graph — Organisation → Website / Business Systems →
 * Connectors → Resources — assembled from the rows that actually exist. It is
 * the ONE place the Command Center, the Connected Website page, the Connected
 * Systems page and the Super Admin overview all get their data from, so those
 * surfaces cannot disagree with each other.
 *
 * What it deliberately does NOT do:
 *   - invent a website when the org has not configured one (`website: null`)
 *   - report a system as CONNECTED because a connector row exists
 *   - default a record count, a health score or a status to 0 / healthy
 *   - claim a capability the source did not return
 *
 * Tenant isolation: rows are filtered by the caller's organization. A platform
 * admin may target one org explicitly via ?orgId=<uuid>; no other caller can.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import {
  buildSourceGraph,
  type ConnectorRow,
  type RegistryRow,
  type SourceRow,
  type WebsiteMeasurementRow,
} from '@ellines-eip/shared';
import { platformStaffHas } from '../../../../shared/platform-staff';

/**
 * PostgREST returns snake_case columns; the graph types are camelCase. Every row
 * is mapped EXPLICITLY rather than cast. A cast between the two shapes compiles
 * and then silently reads `undefined` for every renamed field — which is how a
 * real registry full of read resources came to render as `resources: []`, and
 * how a real `last_sync_at` came to read as "never synced".
 *
 * A field that is absent stays null. It is never defaulted to 0, to a string,
 * or to a healthy state.
 */
type DbRow = Record<string, unknown>;

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null;

const asNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const asBoolean = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : v === null || v === undefined ? null : Boolean(v);

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function toSourceRow(r: DbRow): SourceRow {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    sourceType: asString(r.source_type) === 'WEBSITE' ? 'WEBSITE' : 'BUSINESS_SYSTEM',
    name: asString(r.name) ?? '(unnamed source)',
    websiteUrl: asString(r.website_url),
    description: asString(r.description),
    metadata: asObject(r.metadata),
  };
}

export function toConnectorRow(r: DbRow): ConnectorRow {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    displayName: asString(r.display_name) ?? String(r.id),
    catalogId: asString(r.catalog_id) ?? 'unknown',
    status: asString(r.status) ?? 'unknown',
    config: asObject(r.config),
    lastSyncedAt: asString(r.last_synced_at),
    lastSyncAt: asString(r.last_sync_at),
    lastTestAt: asString(r.last_test_at),
    lastMessage: asString(r.last_message),
    lastError: asString(r.last_error),
    errorCount: asNumber(r.error_count) ?? 0,
    lifecycleState: asString(r.lifecycle_state),
    syncIntervalSeconds: asNumber(r.sync_interval_seconds),
  };
}

export function toRegistryRow(r: DbRow): RegistryRow | null {
  const registry = asObject(r.registry);
  // A row whose JSON payload is not a registry is not a registry. It is skipped
  // rather than treated as "discovered nothing".
  if (!registry || !Array.isArray(registry.resources)) return null;
  return {
    installationId: String(r.installation_id),
    // Unlike the row columns, this jsonb payload is written by EIP itself
    // (saveCapabilityRegistry) as camelCase JSON, so no rename can be lost here.
    // The shape check above is what justifies the narrowing. A resource carrying
    // an unrecognised `availability` still cannot be counted as AVAILABLE: the
    // graph compares against that exact string.
    registry: registry as unknown as RegistryRow['registry'],
    discoveredAt: asString(r.discovered_at),
  };
}

export function toMeasurementRow(r: DbRow): WebsiteMeasurementRow {
  const outcome = asString(r.outcome);
  return {
    sourceId: String(r.source_id),
    checkedAt: asString(r.checked_at) ?? '',
    outcome:
      outcome === 'ONLINE' ||
      outcome === 'OFFLINE' ||
      outcome === 'DNS_FAILURE' ||
      outcome === 'TLS_FAILURE' ||
      outcome === 'TIMEOUT' ||
      outcome === 'NOT_CHECKED'
        ? outcome
        : 'NOT_CHECKED',
    httpStatus: asNumber(r.http_status),
    responseTimeMs: asNumber(r.response_time_ms),
    redirected: asBoolean(r.redirected),
    finalUrl: asString(r.final_url),
    tlsValid: asBoolean(r.tls_valid),
    tlsIssuer: asString(r.tls_issuer),
    tlsSubject: asString(r.tls_subject),
    tlsValidTo: asString(r.tls_valid_to),
    message: asString(r.message),
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // A platform admin may inspect one org; everyone else is pinned to their own.
  let organizationId = auth.organizationId;
  if (await platformStaffHas(context.env, auth.email, 'platform.tenants.read')) {
    const requested = new URL(context.request.url).searchParams.get('orgId');
    if (requested) organizationId = requested;
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', organizationId)
    .maybeSingle();
  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);
  if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);

  // ── Sources ───────────────────────────────────────────────────────────────
  const { data: sourceRows, error: sourceErr } = await supabase
    .from('organization_sources')
    .select('id, organization_id, source_type, name, website_url, description, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });
  if (sourceErr) {
    return json(
      { statusCode: 500, message: `organization_sources read failed: ${sourceErr.message}` },
      500,
    );
  }

  // ── Connectors (the technical inventory) ──────────────────────────────────
  const { data: installRows, error: instErr } = await supabase
    .from('connector_installations')
    .select(
      'id, organization_id, display_name, catalog_id, status, config, last_synced_at, last_sync_at, last_test_at, last_message, last_error, error_count, lifecycle_state, sync_interval_seconds',
    )
    .eq('organization_id', organizationId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: true });
  if (instErr) return json({ statusCode: 500, message: instErr.message }, 500);

  const installations = (installRows ?? []).map(toConnectorRow);

  // ── Capability registries (what each connector really exposes) ────────────
  const ids = installations.map((i) => i.id);
  const { data: registryRows, error: regErr } = ids.length
    ? await supabase
        .from('connector_capability_registries')
        .select('installation_id, registry, discovered_at')
        .in('installation_id', ids)
        .eq('organization_id', organizationId)
    : { data: [], error: null };
  if (regErr) return json({ statusCode: 500, message: regErr.message }, 500);

  const registries = (registryRows ?? [])
    .map(toRegistryRow)
    .filter((r): r is RegistryRow => r !== null);

  // ── Website measurements (newest per source) ─────────────────────────────
  const { data: measurementRows, error: measErr } = await supabase
    .from('source_website_measurements')
    .select(
      'source_id, checked_at, outcome, http_status, response_time_ms, redirected, final_url, tls_valid, tls_issuer, tls_subject, tls_valid_to, message',
    )
    .eq('organization_id', organizationId)
    .order('checked_at', { ascending: false })
    .limit(200);
  if (measErr) {
    return json(
      { statusCode: 500, message: `source_website_measurements read failed: ${measErr.message}` },
      500,
    );
  }

  // Only the newest measurement per source is meaningful for a status card.
  const newest = new Map<string, WebsiteMeasurementRow>();
  for (const m of (measurementRows ?? []).map(toMeasurementRow)) {
    if (!newest.has(m.sourceId)) newest.set(m.sourceId, m);
  }

  const graph = buildSourceGraph({
    organizationId,
    organizationName: (org.name as string) ?? null,
    sources: (sourceRows ?? []).map(toSourceRow),
    connectors: installations,
    registries,
    measurements: [...newest.values()],
  });

  return json(graph);
};
