import {
  getAdminClient,
  json,
  options,
  signAccessToken,
  verifySsoChallenge,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const body = (await context.request.json()) as { token?: string };
    const token = (body.token || '').trim();
    if (!token) {
      return json({ statusCode: 400, message: 'SSO token is required' }, 400);
    }

    let claims: { sub: string; email: string; organizationId: string; role: string };
    try {
      claims = await verifySsoChallenge(context.env, token);
    } catch {
      return json({ statusCode: 401, message: 'Invalid or expired SSO token' }, 401);
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
    if (!user || !user.is_active || (user.email as string).toLowerCase() !== claims.email) {
      return json({ statusCode: 401, message: 'Invalid or expired SSO token' }, 401);
    }

    const orgRel = user.organizations as
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null;
    const org = Array.isArray(orgRel) ? orgRel[0] : orgRel;
    if (!org) {
      return json({ statusCode: 500, message: 'Organization missing for user' }, 500);
    }

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: user.organization_id,
      user_id: user.id,
      action: 'auth.sso_login',
      resource: 'user',
      created_at: new Date().toISOString(),
    });

    const tokens = await signAccessToken(context.env, {
      sub: user.id as string,
      email: user.email as string,
      organizationId: user.organization_id as string,
      role: user.role as string,
    });

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
      ...tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SSO verify failed';
    return json({ statusCode: 500, message }, 500);
  }
};
