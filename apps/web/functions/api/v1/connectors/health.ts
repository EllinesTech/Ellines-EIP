import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../shared/auth';

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

  const isPlatformAdmin = platformAdminFromEnv(context.env, auth.email);

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
    .select('id, display_name, catalog_id, status, last_message, updated_at, last_payload, last_sync_at, sync_interval_seconds, lifecycle_state')
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

    const syncIntervalSeconds = Number(row.sync_interval_seconds ?? 3600);
    const lastSyncAt = row.last_sync_at as string | null ?? (storedStatus === 'synced' ? row.updated_at as string : null);
    const ageMs = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : null;
    const isStale = ageMs !== null && ageMs > syncIntervalSeconds * 2 * 1000;

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
    } else if (isStale) {
      status = 'STALE';
      evidence =
        `Last successful sync was ${Math.round((ageMs as number) / 60000)} minutes ago, ` +
        `more than 2× the ${Math.round(syncIntervalSeconds / 60)} minute sync interval. ` +
        'Freshness is NOT verified — the source system has not been contacted.';
      void supabase
        .from('connector_installations')
        .update({ status: 'degraded', updated_at: new Date().toISOString() })
        .eq('id', row.id as string)
        .eq('organization_id', targetOrgId);
    } else {
      // Last sync succeeded AND was complete. This is evidence of a *past*
      // successful retrieval, not proof the system is reachable right now.
      status = 'HEALTHY';
      evidence =
        `Last verified healthy at ${lastSyncedAt} (retrieved ${retrievedRecordCount} record(s), ` +
        'pagination complete). Reachability has not been re-probed since.';
    }

    return {
      id: row.id as string,
      displayName: (row.display_name as string) || (row.catalog_id as string),
      catalogId: row.catalog_id as string,
      status,
      evidence,
      lastSyncedAt,
      // Distinguishes "healthy when we last looked" from "verified healthy now".
      lastVerifiedHealthyAt: status === 'HEALTHY' ? lastSyncedAt : null,
      currentlyVerified: false,
      recordCount: retrievedRecordCount,
      retrievedRecordCount,
      reportedRecordCount,
      retrievalComplete: retrieval.complete !== false,
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
