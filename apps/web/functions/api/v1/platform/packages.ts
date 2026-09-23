import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  enforceSafeguards,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) return json({ statusCode: 403, message: 'Platform admin only' }, 403);

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase.from('rate_limit_tiers').select('*').order('priority', { ascending: false }).order('name');
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json(data || []);
  }

  if (context.request.method === 'POST') {
    const reasonErr = await enforceSafeguards(context, 'platform.package.create');
    if (reasonErr) return reasonErr;

    let body: Record<string, unknown>;
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    const name = String(body.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const displayName = String(body.displayName || '').trim();
    if (!name || !displayName) return json({ statusCode: 400, message: 'name and displayName are required' }, 400);

    const row = {
      id: crypto.randomUUID(),
      name,
      display_name: displayName,
      requests_per_day: Number(body.requestsPerDay ?? 10000),
      requests_per_hour: Number(body.requestsPerHour ?? 2000),
      requests_per_minute: Number(body.requestsPerMinute ?? 120),
      burst_limit: Number(body.burstLimit ?? 20),
      allowed_endpoints: Array.isArray(body.allowedEndpoints) ? body.allowedEndpoints : [],
      blocked_endpoints: Array.isArray(body.blockedEndpoints) ? body.blockedEndpoints : [],
      max_connectors: body.maxConnectors == null ? null : Number(body.maxConnectors),
      max_users: body.maxUsers == null ? null : Number(body.maxUsers),
      max_data_export_per_day: body.maxDataExportPerDay == null ? null : Number(body.maxDataExportPerDay),
      enable_webhooks: Boolean(body.enableWebhooks),
      enable_sso: Boolean(body.enableSso),
      enable_custom_roles: Boolean(body.enableCustomRoles),
      enable_agents: Boolean(body.enableAgents),
      enable_advanced_bi: Boolean(body.enableAdvancedBi),
      priority: Number(body.priority ?? 0),
      monthly_price: Number(body.monthlyPrice ?? 0),
    };

    const { data, error } = await supabase.from('rate_limit_tiers').insert(row).select('*').single();
    if (error) return json({ statusCode: error.code === '23505' ? 409 : 500, message: error.message }, error.code === '23505' ? 409 : 500);

    await supabase.from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'platform.package.create',
      resource: 'rate_limit_tier',
      metadata: { packageId: data.id, name: data.name, displayName: data.display_name, createdBy: auth.email, reason: (body.reason ?? '').toString().trim() },
      ip: auth.ip,
    }));
    return json(data, 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};
