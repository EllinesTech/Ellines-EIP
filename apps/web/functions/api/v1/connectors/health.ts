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
 * GET /api/v1/connectors/health
 *
 * Returns live health status for every connector installation belonging to the
 * authenticated org.  Each entry derives from the real database rows —
 * connector_installations (status, last_synced_at, display_name, catalog_id) and
 * the last_payload stored on each installation after a successful sync.
 *
 * Platform admins may query any org by passing ?orgId=<uuid>.
 *
 * Response shape:
 * {
 *   checkedAt: string,           // ISO timestamp of this probe
 *   overallStatus: 'ok' | 'degraded' | 'error' | 'idle',
 *   connectors: ConnectorHealthItem[]
 * }
 *
 * ConnectorHealthItem:
 * {
 *   id: string,
 *   displayName: string,
 *   catalogId: string,
 *   status: 'synced' | 'error' | 'active' | 'draft' | 'idle',
 *   lastSyncedAt: string | null,   // ISO or null
 *   recordCount: number,           // from last_payload.recordCount or 0
 *   healthScore: number,           // from last_payload.healthScore or 0
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
    .select('id, display_name, catalog_id, status, last_message, updated_at, last_payload')
    .eq('organization_id', targetOrgId)
    .neq('status', 'deleted')
    .order('updated_at', { ascending: false });

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  const checkedAt = new Date().toISOString();
  const installations = rows || [];

  type Payload = {
    healthScore?: number;
    recordCount?: number;
    openAlerts?: number;
    openDecisions?: number;
    syncedAt?: string;
  };

  const connectors = installations.map((row) => {
    const payload = (row.last_payload || {}) as Payload;
    const status = (row.status as string) || 'idle';

    // last_payload is written on each successful sync and contains the
    // normalised metrics from the upstream system — these are real values,
    // not derived here.
    const recordCount = Math.max(0, Number(payload.recordCount ?? 0));
    const healthScore = Math.max(0, Number(payload.healthScore ?? 0));
    const openAlerts = Math.max(0, Number(payload.openAlerts ?? 0));
    const openDecisions = Math.max(0, Number(payload.openDecisions ?? 0));

    // lastSyncedAt: use payload.syncedAt first (set by the sync handler),
    // fall back to the installation's updated_at only when the status is synced
    // (updated_at changes on every PATCH, not only syncs).
    const lastSyncedAt =
      payload.syncedAt
        ? payload.syncedAt
        : status === 'synced' || status === 'active'
          ? (row.updated_at as string) ?? null
          : null;

    return {
      id: row.id as string,
      displayName: (row.display_name as string) || (row.catalog_id as string),
      catalogId: row.catalog_id as string,
      status: status as 'synced' | 'error' | 'active' | 'draft' | 'idle',
      lastSyncedAt,
      recordCount,
      healthScore,
      openAlerts,
      openDecisions,
      message: (row.last_message as string | null) || null,
    };
  });

  // Derive overall status from the connector set
  let overallStatus: 'ok' | 'degraded' | 'error' | 'idle';
  if (connectors.length === 0) {
    overallStatus = 'idle';
  } else {
    const syncedCount = connectors.filter((c) => c.status === 'synced' || c.status === 'active').length;
    const errorCount = connectors.filter((c) => c.status === 'error').length;
    if (errorCount === connectors.length) {
      overallStatus = 'error';
    } else if (errorCount > 0 || syncedCount < connectors.length) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'ok';
    }
  }

  return json({ checkedAt, overallStatus, connectors });
};
