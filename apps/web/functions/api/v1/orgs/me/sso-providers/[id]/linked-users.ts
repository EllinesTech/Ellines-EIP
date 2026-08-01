import { getAdminClient, json, requireAuth, options, type Env } from '../../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/orgs/me/sso-providers/{id}/linked-users
 * List users linked to this SSO provider
 */
async function handleGet(context: { env: Env; request: Request; params: Record<string, string> }) {
  const auth = requireAuth(context.request);
  if (!auth) {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }

  const { id } = context.params;

  const supabase = getAdminClient(context.env);

  // Get user org
  const { data: user } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('id', auth.sub)
    .single();

  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  // Get provider
  const { data: provider, error: providerError } = await supabase
    .from('sso_providers')
    .select('id')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (providerError || !provider) {
    return json({ statusCode: 404, message: 'Provider not found' }, 404);
  }

  // Get linked users
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

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  return json({
    statusCode: 200,
    data: linkedUsers,
  });
}

/**
 * POST /api/v1/orgs/me/sso-providers/{id}/unlink-user
 * Unlink a user from this SSO provider
 */
async function handleUnlink(context: { env: Env; request: Request; params: Record<string, string> }) {
  const auth = requireAuth(context.request);
  if (!auth) {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }

  const { id } = context.params;

  const supabase = getAdminClient(context.env);

  // Check if user is Owner
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

    if (!body.linkId) {
      return json({ statusCode: 400, message: 'linkId required' }, 400);
    }

    // Get provider to verify org
    const { data: provider } = await supabase
      .from('sso_providers')
      .select('organization_id')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .single();

    if (!provider) {
      return json({ statusCode: 404, message: 'Provider not found' }, 404);
    }

    // Unlink user
    const { error } = await supabase
      .from('sso_provider_users')
      .delete()
      .eq('id', body.linkId)
      .eq('sso_provider_id', id);

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    return json({
      statusCode: 200,
      message: 'User unlinked',
    });
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
