/**
 * Pages Function: GET /api/v1/platform/audit-logs
 *
 * Platform Super Admin only.
 * Cross-org audit log viewer with filtering and pagination.
 *
 * Query params:
 *   orgId    — filter by org (optional)
 *   action   — filter by action prefix e.g. "auth." (optional)
 *   limit    — max rows (default 50, max 200)
 *   offset   — pagination offset (default 0)
 *   from     — ISO date start (optional)
 *   to       — ISO date end   (optional)
 */
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

  const url = new URL(context.request.url);
  const orgId = url.searchParams.get('orgId') || null;
  const action = url.searchParams.get('action') || null;
  const from = url.searchParams.get('from') || null;
  const to = url.searchParams.get('to') || null;
  const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);
  const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  const supabase = getAdminClient(context.env);

  // Build query
  let q = supabase
    .from('audit_logs')
    .select(
      'id, organization_id, user_id, action, resource, metadata, created_at, organizations(name, slug), users(email, full_name)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (orgId) q = q.eq('organization_id', orgId);
  if (action) q = q.ilike('action', `${action}%`);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  const { data, error, count } = await q;
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const rows = (data || []).map((r: Record<string, unknown>) => {
    const org = r.organizations as { name?: string; slug?: string } | null;
    const user = r.users as { email?: string; full_name?: string } | null;
    return {
      id: r.id,
      organizationId: r.organization_id,
      organizationName: org?.name ?? null,
      organizationSlug: org?.slug ?? null,
      userId: r.user_id,
      userEmail: user?.email ?? null,
      userFullName: user?.full_name ?? null,
      action: r.action,
      resource: r.resource,
      metadata: r.metadata,
      createdAt: r.created_at,
    };
  });

  return json({ total: count ?? 0, offset, limit, rows });
};
