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

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    // org:view permission for reading branches
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'org:view',
    );
    if (permErr) return permErr;

    const { data, error } = await supabase
      .from('branches')
      .select('id, name, code, created_at')
      .eq('organization_id', auth.organizationId)
      .order('name', { ascending: true });

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    return json(
      (data || []).map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        createdAt: new Date(b.created_at as string).toISOString(),
      })),
    );
  }

  if (context.request.method === 'POST') {
    // org:manage_branches permission for creating branches
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'org:manage_branches',
    );
    if (permErr) return permErr;

    try {
      const body = (await context.request.json()) as { name?: string; code?: string };
      const name = (body.name || '').trim();
      const code = (body.code || '').trim() || null;
      if (name.length < 2) {
        return json({ statusCode: 400, message: 'name is required (min 2 chars)' }, 400);
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('branches')
        .insert({
          id,
          organization_id: auth.organizationId,
          name,
          code,
          created_at: now,
        })
        .select('id, name, code, created_at')
        .single();

      if (error) {
        return json({ statusCode: 500, message: error.message }, 500);
      }

      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        organization_id: auth.organizationId,
        user_id: auth.sub,
        action: 'org.create_branch',
        resource: 'branch',
        metadata: { branchId: data.id, name: data.name },
      });

      return json(
        {
          id: data.id,
          name: data.name,
          code: data.code,
          createdAt: new Date(data.created_at as string).toISOString(),
        },
        201,
      );
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
