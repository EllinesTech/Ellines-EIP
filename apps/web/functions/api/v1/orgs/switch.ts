/**
 * Pages Function: POST /api/v1/orgs/switch
 * Issues a new JWT scoped to the requested organization.
 * The user must be a member (primary org or membership row).
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  signAccessToken,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: { organizationId?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const targetOrgId = (body.organizationId || '').trim();
  if (!targetOrgId) {
    return json({ statusCode: 400, message: 'organizationId is required' }, 400);
  }

  const supabase = getAdminClient(context.env);

  // Load user
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, title, bio, avatar_url, organization_id, role, is_active')
    .eq('id', auth.sub)
    .maybeSingle();

  if (userErr) return json({ statusCode: 500, message: userErr.message }, 500);
  if (!user || !user.is_active) return json({ statusCode: 401, message: 'User not found' }, 401);

  // Determine role in target org
  let roleInTargetOrg: string | null = null;

  if (user.organization_id === targetOrgId) {
    roleInTargetOrg = user.role as string;
  } else {
    // Check membership table
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('role, is_active')
      .eq('user_id', auth.sub)
      .eq('organization_id', targetOrgId)
      .maybeSingle();

    if (!membership || !membership.is_active) {
      return json(
        { statusCode: 403, message: 'You are not a member of that organization' },
        403,
      );
    }
    roleInTargetOrg = membership.role as string;
  }

  // Load target org
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', targetOrgId)
    .maybeSingle();

  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);
  if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);

  // Issue new token
  const tokens = await signAccessToken(context.env, {
    sub: auth.sub,
    email: auth.email,
    organizationId: targetOrgId,
    role: roleInTargetOrg,
  });

  await supabase.from('audit_logs').insert({
    organization_id: targetOrgId,
    user_id: auth.sub,
    action: 'auth.switch_org',
    resource: 'organization',
    metadata: { fromOrgId: user.organization_id, toOrgId: targetOrgId },
  });

  return json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      title: (user.title as string | null) ?? null,
      bio: (user.bio as string | null) ?? null,
      avatarUrl: (user.avatar_url as string | null) ?? null,
      organizationId: targetOrgId,
      role: roleInTargetOrg,
      isActive: user.is_active,
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
  });
};
