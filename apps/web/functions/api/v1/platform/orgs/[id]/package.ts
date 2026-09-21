import {
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) return json({ statusCode: 403, message: 'Platform admin only' }, 403);

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organization_tiers')
      .select('id, organization_id, tier_id, started_at, expires_at, auto_renew, custom_limits, rate_limit_tiers(*)')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json(data || null);
  }

  if (context.request.method === 'PUT') {
    let body: { tierId?: string; expiresAt?: string | null; autoRenew?: boolean; customLimits?: Record<string, unknown> | null };
    try { body = await context.request.json() as typeof body; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }
    if (!body.tierId) return json({ statusCode: 400, message: 'tierId is required' }, 400);

    const { data: tier } = await supabase.from('rate_limit_tiers').select('id, name').eq('id', body.tierId).maybeSingle();
    if (!tier) return json({ statusCode: 404, message: 'Package not found' }, 404);

    const payload = {
      organization_id: orgId,
      tier_id: body.tierId,
      expires_at: body.expiresAt ?? null,
      auto_renew: body.autoRenew !== false,
      custom_limits: body.customLimits ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('organization_tiers').upsert(payload, { onConflict: 'organization_id' }).select('id, organization_id, tier_id, started_at, expires_at, auto_renew, custom_limits, rate_limit_tiers(*)').single();
    if (error) return json({ statusCode: 500, message: error.message }, 500);

    await supabase.from('audit_logs').insert(auditRow({
      organizationId: orgId, userId: auth.sub, action: 'platform.org.package.assign',
      resource: 'organization_tier', metadata: { tierId: body.tierId, tierName: tier.name, assignedBy: auth.email }, ip: auth.ip,
    }));
    return json(data);
  }

  return json({ message: 'Method not allowed' }, 405);
};
