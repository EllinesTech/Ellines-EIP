import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import { egressRequest } from '@ellines-eip/shared';

/**
 * POST /api/v1/connectors/:id/discovery
 * Runs the discovery phase for a connector (Wizard Step 5).
 * Probes the connected system and stores discoverySnapshot.
 * Platform Admin only.
 *
 * Requirements: 18.1–18.5
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Discovery is a Platform Admin operation' }, 403);
  }

  const connectorId = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  const { data: connector, error: fetchErr } = await supabase
    .from('connector_installations')
    .select('id, organization_id, config, catalog_id, discovery_snapshot')
    .eq('id', connectorId)
    .single();

  if (fetchErr || !connector) return json({ statusCode: 404, message: 'Connector not found' }, 404);

  const config = (connector.config ?? {}) as Record<string, unknown>;
  const baseUrl = typeof config['baseUrl'] === 'string' ? config['baseUrl'] : null;

  let discoveryResult: Record<string, unknown> = {
    discoveredAt: new Date().toISOString(),
    connectorId,
    endpoints: [],
    entityTypes: [],
    note: 'Discovery performed without a live endpoint probe — no baseUrl configured.',
  };

  if (baseUrl) {
    try {
      // Attempt a HEAD/OPTIONS probe on the base URL through the egress guard
      const res = await egressRequest({ url: baseUrl, method: 'GET', timeoutMs: 10_000, maxRetries: 0 });
      discoveryResult = {
        discoveredAt: new Date().toISOString(),
        connectorId,
        baseUrl,
        httpStatus: res.status,
        contentType: res.headers.get('content-type') ?? null,
        endpoints: [],
        entityTypes: [],
        note: `Probe returned HTTP ${res.status}`,
      };
    } catch (err) {
      discoveryResult = {
        discoveredAt: new Date().toISOString(),
        connectorId,
        baseUrl,
        endpoints: [],
        entityTypes: [],
        probeError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Detect schema drift: compare with stored snapshot field count
  const previousSnapshot = connector.discovery_snapshot as Record<string, unknown> | null;
  const schemaDriftDetected = previousSnapshot != null &&
    JSON.stringify(Object.keys(discoveryResult)).length !== JSON.stringify(Object.keys(previousSnapshot)).length;

  // Persist the snapshot and drift flag
  const { data: updated, error: updateErr } = await supabase
    .from('connector_installations')
    .update({
      discovery_snapshot: discoveryResult,
      schema_drift_detected: schemaDriftDetected,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectorId)
    .select()
    .single();

  if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);

  await auditRow(supabase, {
    organizationId: connector.organization_id as string,
    userId: auth.sub,
    action: 'connector:discovery:completed',
    resource: connectorId,
    metadata: { schema_drift_detected: schemaDriftDetected },
  });

  return json({ discoverySnapshot: discoveryResult, schemaDriftDetected });
};
