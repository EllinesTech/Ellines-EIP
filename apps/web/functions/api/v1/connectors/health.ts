import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../shared/auth';
import { toInstantMs, toUtcIso } from '@ellines-eip/shared';
import { platformStaffHas } from '../../../shared/platform-staff';

/**
 * Evidence-based connector status.
 *
 * A stored database flag is NOT proof that an external system is reachable.
 * Each state below is only claimed when there is evidence for it, and the
 * response always carries a human-readable `evidence` string saying what that
 * evidence actually is.
 *
 *   CONFIGURED           saved, never successfully synced
 *   AUTHENTICATION_FAILED last sync was rejected (401/403/credentials)
 *   PARTIAL               last retrieval was incomplete (pagination truncated)
 *   STALE                last successful sync is older than 2× its interval
 *   HEALTHY               last sync succeeded AND was complete
 *
 * HEALTHY means "healthy when we last verified it", not "reachable right now".
 * `currentlyVerified` is always false here: this endpoint deliberately does not
 * perform a live probe on every dashboard request. Use the sync/test endpoint
 * for a real-time check.
 */
export type ConnectorStatus =
  | 'CONFIGURED'
  | 'AUTHENTICATED'
  | 'CONNECTED'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'STALE'
  | 'AUTHENTICATION_FAILED'
  | 'UNAVAILABLE'
  | 'SYNCING'
  | 'PARTIAL';

/**
 * GET /api/v1/connectors/health
 *
 * Returns evidence-based health for every connector installation belonging to
 * the authenticated org, derived from the real database rows — connector_
 * installations (status, last_synced_at, display_name, catalog_id) and the
 * last_payload stored on each installation after a successful sync.
 *
 * This endpoint does NOT perform a live network probe. It reports what was
 * genuinely observed at the last sync, and says so via `evidence`.
 *
 * Platform admins may query any org by passing ?orgId=<uuid>.
 *
 * Response shape:
 * {
 *   checkedAt: string,           // ISO timestamp of this read
 *   overallStatus: 'ok' | 'degraded' | 'error' | 'partial' | 'idle',
 *   connectors: ConnectorHealthItem[]
 * }
 *
 * ConnectorHealthItem:
 * {
 *   id: string,
 *   displayName: string,
 *   catalogId: string,
 *   status: ConnectorStatus,     // evidence-based, never inferred from a flag
 *   evidence: string,            // WHY this status was chosen
 *   lastSyncedAt: string | null,
 *   lastVerifiedHealthyAt: string | null,
 *   currentlyVerified: false,    // no live probe is performed here
 *   retrievedRecordCount: number,   // what EIP actually read
 *   reportedRecordCount: number,    // what the source claimed (0 = not reported)
 *   retrievalComplete: boolean,     // false ⇒ data is partial
 *   healthScore: number | null,     // null = source published no health metric
 *   openAlerts: number,
 *   openDecisions: number,
 *   message: string | null,        // last_message from the installation row
 * }
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const isPlatformAdmin = await platformStaffHas(context.env, auth.email, 'platform.connectors.manage');

  // connector:read permission required for org users
  if (!isPlatformAdmin) {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'connector:read',
      undefined,
      auth.email,
    );
    if (permErr) return permErr;
  }

  const url = new URL(context.request.url);
  const targetOrgId = isPlatformAdmin
    ? (url.searchParams.get('orgId') || auth.organizationId)
    : auth.organizationId;

  const supabase = getAdminClient(context.env);

  // Fetch all installations for the org — always scoped by organization_id
  const { data: rows, error } = await supabase
    .from('connector_installations')
    .select('id, display_name, catalog_id, status, last_message, updated_at, last_payload, last_sync_at, last_synced_at, config, sync_interval_seconds, lifecycle_state, last_error, error_count, last_test_at')
    .eq('organization_id', targetOrgId)
    .neq('status', 'deleted')
    .order('updated_at', { ascending: false });

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  const checkedAt = new Date().toISOString();
  const installations = rows || [];

  type Retrieval = {
    retrievedRecordCount?: number;
    reportedRecordCount?: number;
    complete?: boolean;
    stopReason?: string;
  };
  type Payload = {
    healthScore?: number | null;
    recordCount?: number;
    openAlerts?: number;
    openDecisions?: number;
    syncedAt?: string;
    retrieval?: Retrieval;
  };

  const connectors = installations.map((row) => {
    const payload = (row.last_payload || {}) as Payload;
    const storedStatus = (row.status as string) || 'idle';
    const retrieval = payload.retrieval ?? {};

    // These are real values written by the sync handler from what was actually
    // retrieved — not derived here. healthScore is null (unknown) when the source
    // system published no health metric; it must not be coerced to 0.
    const recordCount = Math.max(0, Number(payload.recordCount ?? 0));
    const healthScore =
      typeof payload.healthScore === 'number' ? Math.max(0, Math.min(100, payload.healthScore)) : null;
    const openAlerts = Math.max(0, Number(payload.openAlerts ?? 0));
    const openDecisions = Math.max(0, Number(payload.openDecisions ?? 0));
    const retrievedRecordCount = Number(retrieval.retrievedRecordCount ?? recordCount);
    const reportedRecordCount = Number(retrieval.reportedRecordCount ?? 0);

    const lastSyncedAt =
      payload.syncedAt
        ? payload.syncedAt
        : storedStatus === 'synced' || storedStatus === 'active'
          ? (row.updated_at as string) ?? null
          : null;
    // Emitted as explicit UTC: the column fallback is zone-less, and a client
    // that re-parses it would otherwise shift the instant by its own offset.
    const lastSyncedAtUtc = toUtcIso(lastSyncedAt);

    // The sync interval comes from the connector's OWN stored configuration
    // first. `sync_interval_seconds` is a column that is frequently left at its
    // 3600 default while the connector is actually configured for a different
    // cadence — the real Ellines Haven connector stores
    // `syncIntervalMinutes: 15` while its column still said 3600, so freshness
    // was judged against an interval the operator never chose.
    const configuredMinutes = (() => {
      const cfg = (row.config || {}) as { syncIntervalMinutes?: unknown };
      const v = Number(cfg.syncIntervalMinutes);
      return Number.isFinite(v) && v > 0 ? v : null;
    })();
    const syncIntervalSeconds =
      configuredMinutes !== null ? configuredMinutes * 60 : Number(row.sync_interval_seconds ?? 3600);
    const syncIntervalSource =
      configuredMinutes !== null ? 'connector configuration' : 'connector_installations.sync_interval_seconds';

    // `last_sync_at` is the authoritative "a retrieval actually succeeded" time.
    // It is written by the sync handler on success and deliberately left alone
    // on failure, so it can only ever move forward on real evidence. The
    // `last_synced_at` / `updated_at` fallbacks exist for rows written before
    // this column was maintained, and are reported as such.
    const authoritativeLastSyncAt = (row.last_sync_at as string | null) ?? null;
    const lastSyncAt =
      authoritativeLastSyncAt ??
      (storedStatus === 'synced' || storedStatus === 'active'
        ? ((row.last_synced_at as string | null) ?? (row.updated_at as string) ?? null)
        : null);
    const freshnessSource = authoritativeLastSyncAt
      ? 'last_sync_at'
      : storedStatus === 'synced' || storedStatus === 'active'
        ? 'last_synced_at (fallback)'
        : 'none';

    // Parsed with toInstantMs, not `new Date(...)`: the column is a zone-less
    // UTC timestamp, and reading it as local time made a sync that had just
    // completed measure 180 minutes old on a UTC+3 host (→ false STALE).
    const lastSyncMs = toInstantMs(lastSyncAt);
    const ageMs = lastSyncMs === null ? null : Date.now() - lastSyncMs;
    const isStale = ageMs !== null && ageMs > syncIntervalSeconds * 2 * 1000;
    // Same instant, stated as UTC for every consumer (evidence text, payload).
    const lastSyncAtUtc = toUtcIso(lastSyncAt);

    // ── Status model ──────────────────────────────────────────────────────
    // Database state alone never proves the external system is reachable.
    // Each state below is justified by evidence, and `evidence` states what
    // that evidence actually is — so "healthy" is never inferred from a flag.
    let status: ConnectorStatus;
    let evidence: string;

    if (storedStatus === 'error') {
      status = 'AUTHENTICATION_FAILED';
      evidence =
        /HTTP 40[13]|auth|credential|permission|unauthorized/i.test(row.last_message as string)
          ? 'Last sync failed with an authentication/permission error from the source system.'
          : 'Last sync failed. See the connector message for the reported reason.';
    } else if (storedStatus === 'draft') {
      status = 'CONFIGURED';
      evidence = 'Connector is saved but has never been synced.';
    } else if (!lastSyncAt && storedStatus !== 'synced' && storedStatus !== 'active') {
      status = 'CONFIGURED';
      evidence = 'Connector is saved but has never completed a sync.';
    } else if (retrieval.complete === false) {
      status = 'PARTIAL';
      evidence =
        `Last retrieval was incomplete (${retrieval.stopReason ?? 'unknown reason'}): ` +
        `${retrievedRecordCount} of ${reportedRecordCount || '?'} record(s) retrieved.`;
    } else if (retrievedRecordCount <= 0) {
      // A 200 that yielded no records is not a healthy read. Reporting it as one
      // is how a connector that has never actually retrieved anything came to
      // be shown as HEALTHY.
      status = 'UNAVAILABLE';
      evidence = reportedRecordCount > 0
        ? `Source reported ${reportedRecordCount} record(s) but EIP retrieved none, so the read did not succeed.`
        : 'The last sync completed without retrieving any records, so the source has no verified data.';
    } else if (isStale) {
      status = 'STALE';
      evidence =
        `Last successful sync was ${Math.round((ageMs as number) / 60000)} minutes ago, ` +
        `more than 2× the ${Math.round(syncIntervalSeconds / 60)} minute sync interval ` +
        `(from ${syncIntervalSource}, freshness from ${freshnessSource}). ` +
        'The source system has not been contacted since then.';
    } else {
      // Last sync succeeded AND was complete AND actually returned records. This
      // is evidence of a *past* successful retrieval, not proof the system is
      // reachable right now.
      status = 'HEALTHY';
      evidence =
        `Last verified healthy at ${lastSyncAtUtc ?? lastSyncedAtUtc} (retrieved ${retrievedRecordCount} record(s), ` +
        'pagination complete). Reachability has not been re-probed since.';
    }

    return {
      id: row.id as string,
      displayName: (row.display_name as string) || (row.catalog_id as string),
      catalogId: row.catalog_id as string,
      status,
      evidence,
      lastSyncedAt: lastSyncedAtUtc,
      // Distinguishes "healthy when we last looked" from "verified healthy now".
      lastVerifiedHealthyAt: status === 'HEALTHY' ? (lastSyncAtUtc ?? lastSyncedAtUtc) : null,
      currentlyVerified: false,
      recordCount: retrievedRecordCount,
      retrievedRecordCount,
      reportedRecordCount,
      retrievalComplete: retrieval.complete !== false,
      // Freshness is reported as an explicit, inspectable object rather than a
      // single derived boolean, so a consumer can never present an unverified
      // age as if it were a verified one.
      freshness: {
        lastSuccessfulSyncAt: lastSyncAtUtc,
        source: freshnessSource,
        syncIntervalSeconds,
        syncIntervalSource,
        ageMinutes: ageMs === null ? null : Math.round(ageMs / 60000),
        stale: isStale,
        // Explicitly false: this endpoint performs no live probe.
        currentlyVerified: false,
      },
      healthScore,
      openAlerts,
      openDecisions,
      message: (row.last_message as string | null) || null,
    };
  });

  // Overall status is derived from evidence-bearing states only.
  let overallStatus: 'ok' | 'degraded' | 'error' | 'partial' | 'idle';
  if (connectors.length === 0) {
    overallStatus = 'idle';
  } else {
    const healthy = connectors.filter((c) => c.status === 'HEALTHY').length;
    const failed = connectors.filter((c) => c.status === 'AUTHENTICATION_FAILED').length;
    const partial = connectors.filter((c) => c.status === 'PARTIAL').length;
    const stale = connectors.filter((c) => c.status === 'STALE').length;
    if (failed === connectors.length) overallStatus = 'error';
    else if (partial > 0) overallStatus = 'partial';
    else if (healthy === connectors.length) overallStatus = 'ok';
    else if (stale > 0 || failed > 0) overallStatus = 'degraded';
    else overallStatus = 'degraded';
  }

  return json({ checkedAt, overallStatus, connectors });
};
