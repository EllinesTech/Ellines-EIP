import {
  bearerToken,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  verifyAccessToken,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ message: 'Method not allowed' }, 405);

  try {
    const token = bearerToken(context.request);
    if (!token) {
      return json({ statusCode: 401, message: 'Unauthorized' }, 401);
    }

    let claims: { sub: string };
    try {
      claims = await verifyAccessToken(context.env, token);
    } catch {
      return json({ statusCode: 401, message: 'Unauthorized' }, 401);
    }

    const supabase = getAdminClient(context.env);
    const { data: user, error } = await supabase
      .from('users')
      .select(
        'id, email, full_name, organization_id, role, is_active, created_at, updated_at, organizations ( id, name, slug )',
      )
      .eq('id', claims.sub)
      .maybeSingle();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }
    if (!user || !user.is_active) {
      return json({ statusCode: 401, message: 'User not found' }, 401);
    }

    const orgRel = user.organizations as
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null;
    const org = Array.isArray(orgRel) ? orgRel[0] : orgRel;
    if (!org) {
      return json({ statusCode: 500, message: 'Organization missing for user' }, 500);
    }

    return json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        organizationId: user.organization_id,
        role: user.role,
        isActive: user.is_active,
        createdAt: new Date(user.created_at as string).toISOString(),
        updatedAt: new Date(user.updated_at as string).toISOString(),
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      isPlatformAdmin: platformAdminFromEnv(context.env, user.email as string),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
