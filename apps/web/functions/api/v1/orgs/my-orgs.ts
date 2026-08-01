/**
 * Pages Function: GET /api/v1/orgs/my-orgs
 * Returns all organizations this authenticated user belongs to.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // Primary org from the user record
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('organization_id, role, organizations(id, name, slug, settings, parent_org_id)')
    .eq('id', auth.sub)
    .maybeSingle();

  if (userErr) return json({ statusCode: 500, message: userErr.message }, 500);
  if (!user) return json({ statusCode: 401, message: 'User not found' }, 401);

  const primaryOrg = Array.isArray(user.organizations)
    ? user.organizations[0]
    : user.organizations;

  const orgs: {
    id: string; name: string; slug: string; role: string;
    isPrimary: boolean; parentOrgId: string | null;
  }[] = [];
  const seen = new Set<string>();

  if (primaryOrg) {
    seen.add(primaryOrg.id as string);
    orgs.push({
      id: primaryOrg.id as string,
      name: primaryOrg.name as string,
      slug: primaryOrg.slug as string,
      role: user.role as string,
      isPrimary: true,
      parentOrgId: (primaryOrg.parent_org_id as string | null) ?? null,
    });
  }

  // Additional memberships (v1.1 join table)
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('role, is_active, organizations(id, name, slug, parent_org_id)')
    .eq('user_id', auth.sub)
    .eq('is_active', true);

  if (memberships) {
    for (const m of memberships) {
      const mOrg = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
      if (!mOrg || seen.has(mOrg.id as string)) continue;
      seen.add(mOrg.id as string);
      orgs.push({
        id: mOrg.id as string,
        name: mOrg.name as string,
        slug: mOrg.slug as string,
        role: m.role as string,
        isPrimary: false,
        parentOrgId: (mOrg.parent_org_id as string | null) ?? null,
      });
    }
  }

  return json(orgs);
};
