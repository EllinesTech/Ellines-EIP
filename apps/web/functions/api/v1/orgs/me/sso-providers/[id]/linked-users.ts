import { getAdminClient, json, requireAuth, options, type Env } from '../../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/orgs/me/sso-providers/{id}/linked-users
 */
async function handleGet(context: { env: Env; request: Request; params: Record<string, string> }) {
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  const supabase = getAdminClient(context.env);

  const { data: user } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('id', auth.sub)
    .single();

  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  const { data: provider, error: providerError } = await supabase
    .from('sso_providers')
    .select('id')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (providerError || !provider) return json({ statusCode: 404, message: 'Provider not found' }, 404);

  const { data: linkedUsers, error } = await supabase
    .from('sso_provider_users')
    .select(`
      id,
      external_id,
      external_email,
      linked_at,
      last_login_at,
      user:user_id (id, email, full_name, role)
    `)
    .eq('sso_provider_id', id)
    .order('linked_at', { ascending: false });

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  return json({ statusCode: 200, data: linkedUsers });
}

/**
 * POST /api/v1/orgs/me/sso-providers/{id}/linked-users
 * Unlink a user (Owner only)
 */
async function handleUnlink(context: { env: Env; request: Request; params: Record<string, string> }) {
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  const supabase = getAdminClient(context.env);

  const { data: user } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', auth.sub)
    .single();

  if (!user || user.role !== 'owner') {
    return json({ statusCode: 403, message: 'Only Owner can unlink users' }, 403);
  }

  try {
    const body = await context.request.json() as { linkId: string };
    if (!body.linkId) return json({ statusCode: 400, message: 'linkId required' }, 400);

    const { data: provider } = await supabase
      .from('sso_providers')
      .select('id')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .single();

    if (!provider) return json({ statusCode: 404, message: 'Provider not found' }, 404);

    const { error } = await supabase
      .from('sso_provider_users')
      .delete()
      .eq('id', body.linkId)
      .eq('sso_provider_id', id);

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    return json({ statusCode: 200, message: 'User unlinked' });
  } catch (err) {
    console.error('Error unlinking user:', err);
    return json({ statusCode: 500, message: 'Failed to unlink user' }, 500);
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method === 'GET') return handleGet(context as any);
  if (context.request.method === 'POST') return handleUnlink(context as any);
  return json({ message: 'Method not allowed' }, 405);
};
