/**
 * Pages Function: GET /api/v1/platform/orgs/:id/stats
 * Platform Super Admin: detailed stats for one org (users, connectors, approvals, events, last activity).
 */
import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  // Fetch org basics + settings
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, slug, settings, created_at, updated_at')
    .eq('id', orgId)
    .maybeSingle();
  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);
  if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);

  // Parallel counts
  const [usersRes, connectorsRes, approvalsRes, eventsRes, auditRes] = await Promise.all([
    supabase.from('users').select('id, role, is_active, created_at', { count: 'exact' }).eq('organization_id', orgId),
    supabase.from('connector_installations').select('id, status, last_synced_at', { count: 'exact' }).eq('organization_id', orgId),
    supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle(),
    supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle(),
    supabase.from('audit_logs').select('created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1),
  ]);

  const users = usersRes.data || [];
  const connectors = connectorsRes.data || [];
  const settings = asObj(approvalsRes.data?.settings);

  const approvals = Array.isArray(settings.workflowApprovals)
    ? (settings.workflowApprovals as { status: string }[])
    : [];
  const events = Array.isArray(settings.workflowEvents)
    ? (settings.workflowEvents as unknown[])
    : [];

  const lastAuditAt = (auditRes.data?.[0] as { created_at?: string })?.created_at || null;
  const lastSyncedAt = connectors
    .filter((c) => c.last_synced_at)
    .sort((a, b) => ((b.last_synced_at as string) > (a.last_synced_at as string) ? 1 : -1))[0]
    ?.last_synced_at || null;

  const roleBreakdown = users.reduce<Record<string, number>>((acc, u) => {
    const r = u.role as string;
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});

  return json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: new Date(org.created_at as string).toISOString(),
    lastActivityAt: lastAuditAt ? new Date(lastAuditAt).toISOString() : null,
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt as string).toISOString() : null,
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.is_active).length,
      roleBreakdown,
      totalConnectors: connectors.length,
      syncedConnectors: connectors.filter((c) => c.status === 'synced').length,
      totalApprovals: approvals.length,
      pendingApprovals: approvals.filter((a) => a.status === 'pending').length,
      totalEvents: events.length,
    },
  });
};
