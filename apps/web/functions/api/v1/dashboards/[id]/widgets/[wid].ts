import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

/**
 * PATCH  /api/v1/dashboards/:id/widgets/:wid — update widget position/config (atomic)
 * DELETE /api/v1/dashboards/:id/widgets/:wid — remove a widget
 * Requirements: 4.4, 4.8
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const dashboardId = context.params['id'] as string;
  const wid = context.params['wid'] as string;
  const supabase = getAdminClient(context.env);

  // Verify dashboard belongs to org before touching any widget
  const { data: dashboard, error: dashErr } = await supabase
    .from('client_dashboards')
    .select('id')
    .eq('id', dashboardId)
    .eq('organization_id', auth.organizationId)
    .single();
  if (dashErr || !dashboard) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

  // ── PATCH ─────────────────────────────────────────────────────────────────
  if (context.request.method === 'PATCH') {
    let body: Record<string, unknown> = {};
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    const updates: Record<string, unknown> = {};
    if (typeof body.col === 'number') updates.col = body.col;
    if (typeof body.row === 'number') updates.row = body.row;
    if (typeof body.width === 'number') updates.width = body.width;
    if (typeof body.height === 'number') updates.height = body.height;
    if (body.config !== undefined) {
      const configStr = JSON.stringify(body.config);
      if (configStr.length > 65536) {
        return json({ statusCode: 422, message: 'Widget config exceeds 64 KB limit' }, 422);
      }
      updates.config = body.config;
    }

    if (Object.keys(updates).length === 0) {
      return json({ statusCode: 422, message: 'No valid fields to update' }, 422);
    }

    const { data: widget, error: updateErr } = await supabase
      .from('client_dashboard_widgets')
      .update(updates)
      .eq('id', wid)
      .eq('dashboard_id', dashboardId)
      .select()
      .single();

    if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);
    if (!widget) return json({ statusCode: 404, message: 'Widget not found' }, 404);

    return json({ widget });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (context.request.method === 'DELETE') {
    const { error: delErr } = await supabase
      .from('client_dashboard_widgets')
      .delete()
      .eq('id', wid)
      .eq('dashboard_id', dashboardId);

    if (delErr) return json({ statusCode: 500, message: delErr.message }, 500);
    return new Response(null, { status: 204 });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
