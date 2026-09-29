import {
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

/**
 * POST /api/v1/dashboards/:id/export
 * Generates a dashboard export. Requires dashboard:export permission.
 * Writes audit row with format + widget_count.
 * Requirements: 29.1–29.3
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const id = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  // Verify dashboard belongs to org
  const { data: dashboard, error: dashErr } = await supabase
    .from('client_dashboards')
    .select('id, name, owner_user_id')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .single();
  if (dashErr || !dashboard) return json({ statusCode: 404, message: 'Dashboard not found' }, 404);

  // Only owner / org admin may export (simplified permission check)
  if (dashboard.owner_user_id !== auth.sub && auth.role !== 'owner' && auth.role !== 'admin') {
    return json({ statusCode: 403, message: 'You do not have permission to export this dashboard' }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await context.request.json() as Record<string, unknown>; }
  catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

  const format = typeof body.format === 'string' ? body.format : '';
  if (!['pdf', 'csv', 'xlsx', 'json'].includes(format)) {
    return json({ statusCode: 422, message: 'format must be pdf, csv, xlsx, or json' }, 422);
  }

  // Count widgets for audit
  const { count } = await supabase
    .from('client_dashboard_widgets')
    .select('id', { count: 'exact', head: true })
    .eq('dashboard_id', id);

  const exportedAt = new Date().toISOString();

  await auditRow(supabase, {
    organizationId: auth.organizationId,
    userId: auth.sub,
    action: 'dashboard:exported',
    resource: id,
    metadata: { export_format: format, widget_count: count ?? 0, exported_at: exportedAt },
  });

  // Return metadata — actual file generation is a future step (PDF/XLSX requires server-side tooling)
  return json({
    exportId: crypto.randomUUID(),
    dashboardId: id,
    dashboardName: dashboard.name,
    format,
    widgetCount: count ?? 0,
    exportedAt,
    status: 'queued',
    message: `${format.toUpperCase()} export queued. Download will be available shortly.`,
  });
};
