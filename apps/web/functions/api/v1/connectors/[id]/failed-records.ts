import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

/**
 * GET  /api/v1/connectors/:id/failed-records
 *   List failed sync records for a connector (Platform Admin).
 *
 * POST /api/v1/connectors/:id/failed-records/replay
 *   Replay failed records. Uses idempotency key (connectorId + sourceRecordId)
 *   to prevent duplicate writes.
 *
 * Requirements: 22.3, 22.4
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Requires Platform Admin privileges' }, 403);
  }

  const connectorId = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  // ── GET ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('connector_failed_records')
      .select('id, connector_id, organization_id, source_record_id, failure_reason, raw_payload_hash, created_at')
      .eq('connector_id', connectorId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json({ failedRecords: data ?? [] });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
