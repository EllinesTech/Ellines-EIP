import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // audit:view permission required
  const permErr = await requirePermissionAsync(
    context.env,
    auth.sub,
    auth.organizationId,
    auth.role,
    'audit:view',
  );
  if (permErr) return permErr;

  const url = new URL(context.request.url);
  const limitRaw = Number(url.searchParams.get('limit') || '80');
  const limit = Math.min(200, Math.max(10, Number.isFinite(limitRaw) ? limitRaw : 80));

  const supabase = getAdminClient(context.env);
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, action, resource, metadata, created_at')
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  const rows = data || [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const actors: Record<string, { email: string; fullName: string }> = {};

  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', userIds)
      .eq('organization_id', auth.organizationId);
    for (const u of users || []) {
      actors[u.id as string] = {
        email: u.email as string,
        fullName: u.full_name as string,
      };
    }
  }

  return json(
    rows.map((r) => {
      const actor = r.user_id ? actors[r.user_id as string] : undefined;
      return {
        id: r.id,
        action: r.action,
        resource: r.resource,
        metadata: r.metadata ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
        actorUserId: r.user_id,
        actorName: actor?.fullName || null,
        actorEmail: actor?.email || null,
      };
    }),
  );
};
