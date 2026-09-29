import {
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

/**
 * GET    /api/v1/dashboards/:id    — get one dashboard with widgets
 * PATCH  /api/v1/dashboards/:id    — update name/description/visibility/refreshPolicy/layoutConfig
 * DELETE /api/v1/dashboards/:id    — delete dashboard (cascades to widgets)
 *
 * Requirements: 3.1–3.8, 30.1
 */

const VALID_VISIBILITY = ['PRIVATE', 'SHARED', 'PUBLISHED'] as const;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const id = context.params['id'] as string;
  if (!id) return json({ statusCode: 400, message: 'Missing dashboard id' }, 400);

  const supabase = getAdminClient(context.env);

  // ── GET ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('client_dashboards')
      .select('*, client_dashboard_widgets(*)')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();

    if (error || !data) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);
    return json({ dashboard: data });
  }

  // ── PATCH ─────────────────────────────────────────────────────────────────
  if (context.request.method === 'PATCH') {
    let body: Record<string, unknown> = {};
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    // Verify ownership / org membership
    const { data: existing, error: fetchErr } = await supabase
      .from('client_dashboards')
      .select('id, owner_user_id, visibility, organization_id')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();

    if (fetchErr || !existing) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 120) {
        return json({ statusCode: 422, message: 'name must be 1–120 characters' }, 422);
      }
      updates.name = name;
    }
    if (typeof body.description === 'string') updates.description = body.description.slice(0, 500);
    if (typeof body.refreshPolicy === 'number') {
      if (body.refreshPolicy < 30 || body.refreshPolicy > 86400) {
        return json({ statusCode: 422, message: 'refreshPolicy must be 30–86400 seconds' }, 422);
      }
      updates.refresh_policy = body.refreshPolicy;
    }
    if (body.layoutConfig !== undefined) updates.layout_config = body.layoutConfig;

    // Visibility change — audit in same logical write
    const visibilityBefore = existing.visibility as string;
    if (typeof body.visibility === 'string') {
      const vis = body.visibility.toUpperCase();
      if (!VALID_VISIBILITY.includes(vis as typeof VALID_VISIBILITY[number])) {
        return json({ statusCode: 422, message: 'Invalid visibility' }, 422);
      }
      updates.visibility = vis;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('client_dashboards')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select()
      .single();

    if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);

    if (updates.visibility && updates.visibility !== visibilityBefore) {
      await auditRow(supabase, {
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'dashboard:visibility_changed',
        resource: id,
        metadata: { visibility_before: visibilityBefore, visibility_after: updates.visibility },
      });
    }

    return json({ dashboard: updated });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (context.request.method === 'DELETE') {
    const { data: existing, error: fetchErr } = await supabase
      .from('client_dashboards')
      .select('id, is_default')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();

    if (fetchErr || !existing) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

    const { error: delErr } = await supabase
      .from('client_dashboards')
      .delete()
      .eq('id', id)
      .eq('organization_id', auth.organizationId);

    if (delErr) return json({ statusCode: 500, message: delErr.message }, 500);

    await auditRow(supabase, {
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'dashboard:deleted',
      resource: id,
      metadata: { was_default: existing.is_default },
    });

    return json({
      deleted: true,
      defaultCleared: existing.is_default === true,
    });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
