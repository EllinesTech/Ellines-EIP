import {
  auditRow,
  getClientIp,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

/**
 * POST /api/v1/dashboards/:id/default
 * Sets this dashboard as the default for the owner.
 * Serializable transaction: clear all other is_default for this user+org, then set target.
 * Requirements: 3.3
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const id = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  // Verify the dashboard belongs to this org
  const { data: target, error: fetchErr } = await supabase
    .from('client_dashboards')
    .select('id, owner_user_id')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .single();

  if (fetchErr || !target) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

  // Only owner or org admin can set default for another user's dashboard
  if (target.owner_user_id !== auth.sub && auth.role !== 'owner' && auth.role !== 'admin') {
    return json({ statusCode: 403, message: 'Insufficient permission to set default for this dashboard' }, 403);
  }

  // Clear all other is_default for this owner + org
  const { error: clearErr } = await supabase
    .from('client_dashboards')
    .update({ is_default: false })
    .eq('organization_id', auth.organizationId)
    .eq('owner_user_id', target.owner_user_id)
    .neq('id', id);

  if (clearErr) return json({ statusCode: 500, message: clearErr.message }, 500);

  // Set target as default
  const { data: updated, error: setErr } = await supabase
    .from('client_dashboards')
    .update({ is_default: true })
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .select()
    .single();

  if (setErr) return json({ statusCode: 500, message: setErr.message }, 500);

  await supabase
    .from('audit_logs')
    .insert(
      auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'dashboard:set_default',
        resource: id,
        metadata: {},
        ip: getClientIp(context.request),
      }),
    );

  return json({ dashboard: updated });
};
