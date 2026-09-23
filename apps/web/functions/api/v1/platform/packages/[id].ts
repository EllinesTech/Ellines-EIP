import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  enforceSafeguards,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) return json({ statusCode: 403, message: 'Platform admin only' }, 403);

  const id = context.params.id as string;
  const supabase = getAdminClient(context.env);

  if (context.request.method === 'PATCH') {
    const reasonErr = await enforceSafeguards(context, 'platform.package.update');
    if (reasonErr) return reasonErr;

    let body: Record<string, unknown>;
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    const updates: Record<string, unknown> = {};
    const map: Record<string, string> = {
      displayName: 'display_name', requestsPerDay: 'requests_per_day', requestsPerHour: 'requests_per_hour',
      requestsPerMinute: 'requests_per_minute', burstLimit: 'burst_limit', maxConnectors: 'max_connectors',
      maxUsers: 'max_users', maxDataExportPerDay: 'max_data_export_per_day', enableWebhooks: 'enable_webhooks',
      enableSso: 'enable_sso', enableCustomRoles: 'enable_custom_roles', enableAgents: 'enable_agents',
      enableAdvancedBi: 'enable_advanced_bi', priority: 'priority', monthlyPrice: 'monthly_price',
    };
    for (const [from, to] of Object.entries(map)) if (body[from] !== undefined) updates[to] = body[from];
    if (body.allowedEndpoints !== undefined) updates.allowed_endpoints = body.allowedEndpoints;
    if (body.blockedEndpoints !== undefined) updates.blocked_endpoints = body.blockedEndpoints;
    if (!Object.keys(updates).length) return json({ statusCode: 400, message: 'No package fields supplied' }, 400);

    const { data, error } = await supabase.from('rate_limit_tiers').update(updates).eq('id', id).select('*').single();
    if (error) return json({ statusCode: 404, message: error.message }, 404);
    await supabase.from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId, userId: auth.sub, action: 'platform.package.update',
      resource: 'rate_limit_tier', metadata: { packageId: id, changes: Object.keys(updates), updatedBy: auth.email, reason: (body.reason ?? '').toString().trim() }, ip: auth.ip,
    }));
    return json(data);
  }

  if (context.request.method === 'DELETE') {
    const reasonErr = await enforceSafeguards(context, 'platform.package.delete');
    if (reasonErr) return reasonErr;

    const { count } = await supabase.from('organization_tiers').select('id', { count: 'exact', head: true }).eq('tier_id', id);
    if ((count ?? 0) > 0) return json({ statusCode: 409, message: 'Package is assigned to organizations and cannot be deleted.' }, 409);
    const { error } = await supabase.from('rate_limit_tiers').delete().eq('id', id);
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const body = (await context.request.clone().json().catch(() => ({}))) as Record<string, unknown>;
    await supabase.from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId, userId: auth.sub, action: 'platform.package.delete',
      resource: 'rate_limit_tier', metadata: { packageId: id, deletedBy: auth.email, reason: (body.reason ?? '').toString().trim() }, ip: auth.ip,
    }));
    return json({ ok: true });
  }

  return json({ message: 'Method not allowed' }, 405);
};
