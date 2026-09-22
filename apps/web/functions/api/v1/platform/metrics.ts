import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    orgs,
    activeUsers,
    auditEvents,
    apiRequests,
    rateLimitViolations,
    connectors,
    failedConnectors,
  ] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }).neq('slug', 'ellines-platform'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('api_usage').select('request_count').gte('window_start', since),
    supabase.from('rate_limit_violations').select('id', { count: 'exact', head: true }).gte('blocked_at', since),
    supabase.from('connector_installations').select('id', { count: 'exact', head: true }),
    supabase.from('connector_installations').select('id', { count: 'exact', head: true }).eq('status', 'error'),
  ]);

  const errors = [orgs, activeUsers, auditEvents, apiRequests, rateLimitViolations, connectors, failedConnectors]
    .filter(x => x.error)
    .map(x => x.error?.message);

  if (errors.length) return json({ statusCode: 500, message: errors.join('; ') }, 500);

  const requests24h = (apiRequests.data || []).reduce(
    (sum, row) => sum + Number((row as { request_count?: number }).request_count || 0),
    0,
  );

  return json({
    generatedAt: new Date().toISOString(),
    window: { since, durationHours: 24 },
    platform: {
      businesses: orgs.count || 0,
      activeUsers: activeUsers.count || 0,
      auditEvents24h: auditEvents.count || 0,
      apiRequests24h: requests24h,
      rateLimitViolations24h: rateLimitViolations.count || 0,
    },
    businessServices: {
      connectorInstallations: connectors.count || 0,
      failedConnectorInstallations: failedConnectors.count || 0,
    },
  });
};
