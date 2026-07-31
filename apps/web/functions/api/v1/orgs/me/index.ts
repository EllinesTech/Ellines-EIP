import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

function isOwner(role: string) {
  return role === 'owner';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .eq('id', auth.organizationId)
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
    if (!isOwner(auth.role)) {
      return json(
        { statusCode: 403, message: 'Only the Organization Owner can rename the organization' },
        403,
      );
    }

    try {
      const body = (await context.request.json()) as { name?: string };
      const name = (body.name || '').trim();
      if (name.length < 2 || name.length > 120) {
        return json(
          { statusCode: 400, message: 'Organization name must be 2–120 characters' },
          400,
        );
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('organizations')
        .update({ name, updated_at: now })
        .eq('id', auth.organizationId)
        .select('id, name, slug, created_at')
        .single();

      if (error) return json({ statusCode: 500, message: error.message }, 500);

      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        organization_id: auth.organizationId,
        user_id: auth.sub,
        action: 'org.rename',
        resource: 'organization',
        metadata: { name },
      });

      return json({
        id: data.id,
        name: data.name,
        slug: data.slug,
        createdAt: new Date(data.created_at as string).toISOString(),
      });
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
