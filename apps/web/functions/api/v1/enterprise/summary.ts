import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { unpackTimelineStorage } from '../../../shared/uem';

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
      connectedSystems: 0,
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
    connectedSystems: snap.connected_systems,
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
