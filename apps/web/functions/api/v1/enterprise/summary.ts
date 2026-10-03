import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { unpackTimelineStorage } from '../../../shared/uem';
import {
  readAuthoritativeSourceCounts,
  type AuthoritativeSourceCounts,
} from '../../../shared/source-counts';

/**
 * Explicit sync state. `unknown` and `reported` are deliberately distinct:
 *
 *  - `unknown`  EIP has no evidence about this snapshot (legacy row / never synced).
 *  - `reported` an external system pushed the numbers; EIP did not perform or
 *               verify the read itself, so it must never look like a verified sync.
 */
export type SyncStatus =
  | 'synced'
  | 'partial'
  | 'error'
  | 'idle'
  | 'unknown'
  | 'reported';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  /**
   * The connected-systems count comes from the organisation's PERSISTED SOURCE
   * CLASSIFICATION, never from the snapshot.
   *
   * `enterprise_snapshots.connected_systems` is written by the sync path from the
   * number of connector INSTALLATIONS, so reading it here reported a
   * WEBSITE-only organisation (one API connector) as having "1 system connected".
   * A connector is the mechanism; the source is the thing. The count therefore
   * reads `organization_sources.source_type` through one shared rule, so this
   * endpoint, the Connected Systems page and the Super Admin view cannot disagree.
   */
  const counts: AuthoritativeSourceCounts = await readAuthoritativeSourceCounts(
    supabase,
    auth.organizationId,
  );

  const { data: snap, error } = await supabase
    .from('enterprise_snapshots')
    .select('*')
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  if (!snap) {
    return json({
      organizationId: auth.organizationId,
      connectorId: 'none',
      connectorName: '',
      // No snapshot means no connected system has ever been read. Every metric
      // is honestly zero/unknown rather than a plausible-looking placeholder.
      healthScore: null,
      // If no sources are classified yet (no organization_sources rows), fall back
      // to the connector count — connectors represent active integrations and are
      // a valid honest proxy for "connected systems" until sources are classified.
      connectedSystems: counts.businessSystems > 0 ? counts.businessSystems : counts.connectors,
      sourceCounts: counts,
      openAlerts: 0,
      openDecisions: 0,
      briefHighlight: 'No connector sync yet. Open Connectors and sync your first system to unlock live KPIs.',
      retrievedRecordCount: 0,
      reportedRecordCount: 0,
      retrievalComplete: false,
      syncStatus: 'idle',
      syncError: null,
      timeline: [],
      model: null,
      syncedAt: null,
      status: 'idle',
    });
  }

  const { events, model } = unpackTimelineStorage(snap.timeline);
  // These default to the UNKNOWN state, never to the healthy one. A row written
  // before these columns existed (or by a path that does not set them) has
  // NULL here, and NULL must not be read as "EIP read the whole source".
  const retrievalComplete = (snap.retrieval_complete as boolean | null) ?? false;
  const syncStatus = (snap.sync_status as SyncStatus | null) ?? 'unknown';

  return json({
    organizationId: snap.organization_id,
    connectorId: snap.connector_id,
    connectorName: snap.connector_name,
    // The DB column is non-nullable, so 0 with no connector reporting a score
    // means "unknown" — surfaced as null rather than a misleading 0.
    healthScore: snap.health_score > 0 ? snap.health_score : null,
    // If no sources are classified (no organization_sources rows with BUSINESS_SYSTEM),
    // fall back to connector count — a live connector is the honest proxy for
    // "connected systems" until the operator classifies sources explicitly.
    connectedSystems: counts.businessSystems > 0 ? counts.businessSystems : counts.connectors,
    // The three counts together, so a client never has to infer one from another.
    sourceCounts: counts,
    openAlerts: snap.open_alerts,
    openDecisions: snap.open_decisions,
    briefHighlight: snap.brief_highlight,
    retrievedRecordCount: (snap.retrieved_count as number | null) ?? snap.record_count ?? 0,
    reportedRecordCount: (snap.reported_count as number | null) ?? 0,
    retrievalComplete,
    syncStatus,
    syncError: (snap.sync_error as string | null) ?? null,
    timeline: events,
    model,
    syncedAt: new Date(snap.synced_at as string).toISOString(),
    status: syncStatus,
  });
};
