import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

/**
 * PATCH /api/v1/connectors/:id/lifecycle
 * Transitions a connector through the lifecycle state machine.
 * Platform Admin operation only — client org users cannot invoke this.
 *
 * Requirements: 20.1, 12.1
 */

// Valid transitions (from → Set<to>)
const VALID_TRANSITIONS: Record<string, string[]> = {
  CONFIGURING:    ['TESTING'],
  TESTING:        ['VALIDATED', 'CONFIGURING'],
  VALIDATED:      ['MAPPING'],
  MAPPING:        ['AUTHORIZED'],
  AUTHORIZED:     ['ENABLED'],
  ENABLED:        ['SYNCING'],
  SYNCING:        ['CONNECTED', 'ERROR'],
  CONNECTED:      ['SYNCING', 'DEGRADED', 'AUTH_REQUIRED', 'PAUSED', 'DISCONNECTED'],
  DEGRADED:       ['SYNCING', 'AUTH_REQUIRED', 'ERROR'],
  ERROR:          ['SYNCING'],
  AUTH_REQUIRED:  ['TESTING'],
  PAUSED:         ['CONNECTED'],
  DISCONNECTED:   ['REVOKED'],
  REVOKED:        ['REMOVED'],
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'PATCH') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Platform Admin only (Req 12.1)
  if (!platformAdminFromEnv(auth.email, context.env)) {
    const supabase = getAdminClient(context.env);
    await auditRow(supabase, {
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'connector:lifecycle:denied',
      resource: context.params['id'] as string,
      metadata: { reason: 'insufficient_privilege' },
    });
    return json({ statusCode: 403, message: 'Connector lifecycle management requires Platform Admin privileges' }, 403);
  }

  const connectorId = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  let body: Record<string, unknown> = {};
  try { body = await context.request.json() as Record<string, unknown>; }
  catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

  const toState = typeof body.state === 'string' ? body.state.toUpperCase() : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';

  if (!toState) return json({ statusCode: 422, message: 'state is required' }, 422);

  // Fetch current connector — include org scope
  const { data: connector, error: fetchErr } = await supabase
    .from('connector_installations')
    .select('id, organization_id, lifecycle_state, display_name')
    .eq('id', connectorId)
    .single();

  if (fetchErr || !connector) return json({ statusCode: 404, message: 'Connector not found' }, 404);

  const fromState = (connector.lifecycle_state as string | null) ?? 'CONFIGURING';
  const allowedNext = VALID_TRANSITIONS[fromState] ?? [];

  if (!allowedNext.includes(toState)) {
    return json({
      statusCode: 422,
      message: `Invalid transition: ${fromState} → ${toState}. Allowed: ${allowedNext.join(', ') || 'none'}`,
    }, 422);
  }

  // For REVOKED: clear all credential fields
  const updates: Record<string, unknown> = { lifecycle_state: toState, updated_at: new Date().toISOString() };
  if (toState === 'REVOKED') {
    // Overwrite encrypted credential fields with null marker
    updates.config = {};
    updates.status = 'revoked';
  }
  if (toState === 'CONNECTED') updates.status = 'synced';
  if (toState === 'ERROR') updates.status = 'error';
  if (toState === 'PAUSED') updates.status = 'draft';

  const { data: updated, error: updateErr } = await supabase
    .from('connector_installations')
    .update(updates)
    .eq('id', connectorId)
    .select()
    .single();

  if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);

  // Audit every transition (Req 20.x)
  await auditRow(supabase, {
    organizationId: connector.organization_id as string,
    userId: auth.sub,
    action: 'connector:lifecycle:transition',
    resource: connectorId,
    metadata: {
      connector_id: connectorId,
      previous_status: fromState,
      new_status: toState,
      reason,
      timestamp: new Date().toISOString(),
    },
  });

  return json({ connector: updated, transition: { from: fromState, to: toState } });
};
