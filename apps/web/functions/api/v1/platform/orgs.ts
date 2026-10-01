import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { readPlatformOrgStatus } from '@ellines-eip/shared';
import { platformStaffHas } from '../../../shared/platform-staff';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!await platformStaffHas(context.env, auth.email, 'platform.tenants.read')) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, created_at, settings')
    // Exclude the platform operator's own org — it is not a client organization.
    .neq('id', auth.organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  const withCounts = await Promise.all(
    (orgs || []).map(async (o) => {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', o.id);
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        createdAt: new Date(o.created_at as string).toISOString(),
        userCount: count ?? 0,
        status: readPlatformOrgStatus(o.settings),
      };
    }),
  );

  return json(withCounts);
};
