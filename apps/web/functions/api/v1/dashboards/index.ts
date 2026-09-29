import {
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

/**
 * GET  /api/v1/dashboards  — list client dashboards for the authenticated org
 * POST /api/v1/dashboards  — create a new client dashboard
 *
 * Every query is scoped to auth.organizationId — cross-tenant reads are blocked.
 * Requirements: 3.1, 3.2, 3.5, 3.7, 3.8
 */

const VALID_TYPES = ['EXECUTIVE','OPERATIONS','FINANCE','HR','SALES','INVENTORY','CRM','CUSTOM','STAFF_MY_WORK'] as const;
const VALID_VISIBILITY = ['PRIVATE','SHARED','PUBLISHED'] as const;
const MAX_DASHBOARDS = 500;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // ── GET ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type') ?? undefined;
    const defaultOnly = url.searchParams.get('default') === 'true';

    let query = supabase
      .from('client_dashboards')
      .select('id, owner_user_id, name, description, type, visibility, is_default, refresh_policy, created_at, updated_at')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (defaultOnly) query = query.eq('is_default', true);

    const { data, error } = await query;
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json({ dashboards: data ?? [] });
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length < 1 || name.length > 120) {
      return json({ statusCode: 422, message: 'name must be 1–120 characters' }, 422);
    }

    const description = typeof body.description === 'string' ? body.description.slice(0, 500) : '';
    const type = typeof body.type === 'string' ? body.type.toUpperCase() : '';
    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return json({ statusCode: 422, message: `Invalid dashboard type. Valid: ${VALID_TYPES.join(', ')}` }, 422);
    }

    const visibility = typeof body.visibility === 'string' ? body.visibility.toUpperCase() : 'PRIVATE';
    if (!VALID_VISIBILITY.includes(visibility as typeof VALID_VISIBILITY[number])) {
      return json({ statusCode: 422, message: `Invalid visibility. Valid: ${VALID_VISIBILITY.join(', ')}` }, 422);
    }

    const refreshPolicy = typeof body.refreshPolicy === 'number' ? body.refreshPolicy : 300;
    if (refreshPolicy < 30 || refreshPolicy > 86400) {
      return json({ statusCode: 422, message: 'refreshPolicy must be 30–86400 seconds' }, 422);
    }

    // Check dashboard count cap
    const { count, error: countErr } = await supabase
      .from('client_dashboards')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.organizationId);
    if (countErr) return json({ statusCode: 500, message: countErr.message }, 500);
    if ((count ?? 0) >= MAX_DASHBOARDS) {
      return json({ statusCode: 422, message: `Organization dashboard limit of ${MAX_DASHBOARDS} reached` }, 422);
    }

    const layoutConfig = body.layoutConfig && typeof body.layoutConfig === 'object' ? body.layoutConfig : {};

    const { data, error } = await supabase
      .from('client_dashboards')
      .insert({
        organization_id: auth.organizationId,
        owner_user_id: auth.sub,
        name,
        description,
        type,
        visibility,
        is_default: false,
        layout_config: layoutConfig,
        refresh_policy: refreshPolicy,
      })
      .select()
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    await auditRow(supabase, {
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'dashboard:created',
      resource: data.id,
      metadata: { name, type, visibility },
    });

    return json({ dashboard: data }, 201);
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
