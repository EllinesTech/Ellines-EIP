import {
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

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .eq('id', orgId)
      .maybeSingle();

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    if (!data) return json({ statusCode: 404, message: 'Organization not found' }, 404);

    return json({
      id: data.id,
      name: data.name,
      slug: data.slug,
      createdAt: new Date(data.created_at as string).toISOString(),
    });
  }

  if (context.request.method === 'PATCH') {
    let body: { name?: string } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const name = (body.name || '').trim();
    if (!name) return json({ statusCode: 400, message: 'name is required' }, 400);

    const { data, error } = await supabase
      .from('organizations')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', orgId)
      .select('id, name, slug, created_at')
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: auth.sub,
      action: 'platform.org.update_profile',
      resource: 'organization',
      metadata: { orgId, name },
    });

    return json({
      id: data.id,
      name: data.name,
      slug: data.slug,
      createdAt: new Date(data.created_at as string).toISOString(),
    });
  }

  return json({ message: 'Method not allowed' }, 405);
};
