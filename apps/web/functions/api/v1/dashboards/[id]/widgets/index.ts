import {
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import { WIDGET_REGISTRY } from '@ellines-eip/shared';

/**
 * POST /api/v1/dashboards/:id/widgets — add a widget to a dashboard
 * Requirements: 4.3, 4.9
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const dashboardId = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  // Verify dashboard belongs to org
  const { data: dashboard, error: dashErr } = await supabase
    .from('client_dashboards')
    .select('id')
    .eq('id', dashboardId)
    .eq('organization_id', auth.organizationId)
    .single();
  if (dashErr || !dashboard) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

  let body: Record<string, unknown> = {};
  try { body = await context.request.json() as Record<string, unknown>; }
  catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

  const widgetTypeId = typeof body.widgetTypeId === 'string' ? body.widgetTypeId : '';
  if (!widgetTypeId || !WIDGET_REGISTRY[widgetTypeId]) {
    return json({ statusCode: 422, message: `Unknown widgetTypeId "${widgetTypeId}"` }, 422);
  }

  // Config size check — 64 KB max (Req 4.9)
  const configStr = JSON.stringify(body.config ?? {});
  if (configStr.length > 65536) {
    return json({ statusCode: 422, message: 'Widget config exceeds 64 KB limit' }, 422);
  }

  const { data: widget, error: insertErr } = await supabase
    .from('client_dashboard_widgets')
    .insert({
      dashboard_id: dashboardId,
      widget_type_id: widgetTypeId,
      col: typeof body.col === 'number' ? body.col : 0,
      row: typeof body.row === 'number' ? body.row : 0,
      width: typeof body.width === 'number' ? body.width : (WIDGET_REGISTRY[widgetTypeId]?.defaultWidth ?? 4),
      height: typeof body.height === 'number' ? body.height : (WIDGET_REGISTRY[widgetTypeId]?.defaultHeight ?? 3),
      config: body.config ?? {},
      data_source_ref: typeof body.dataSourceRef === 'string' ? body.dataSourceRef : null,
      refresh_override_seconds: typeof body.refreshOverrideSeconds === 'number' ? body.refreshOverrideSeconds : null,
    })
    .select()
    .single();

  if (insertErr) return json({ statusCode: 500, message: insertErr.message }, 500);

  return json({ widget }, 201);
};
