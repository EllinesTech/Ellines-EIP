import { getAdminClient, json, requireAuth, options, auditRow, getClientIp, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/orgs/me/sso-providers/{id}
 */
async function handleGet(context: { env: Env; request: Request; params: Record<string, string> }) {
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  const supabase = getAdminClient(context.env);

  const { data: user } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', auth.sub)
    .single();

  if (!user) return json({ statusCode: 401, message: 'User not found' }, 401);

  const { data: provider, error } = await supabase
    .from('sso_providers')
    .select('*')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !provider) return json({ statusCode: 404, message: 'Provider not found' }, 404);

  return json({ statusCode: 200, data: provider });
}

/**
 * PATCH /api/v1/orgs/me/sso-providers/{id}
 * Update SSO provider (Owner only)
 */
async function handlePatch(context: { env: Env; request: Request; params: Record<string, string> }) {
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
    return json({ statusCode: 403, message: 'Only Owner can update SSO providers' }, 403);
  }

  try {
    const body = await context.request.json() as Record<string, unknown>;

    const { data: provider, error: fetchError } = await supabase
      .from('sso_providers')
      .select('id')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !provider) return json({ statusCode: 404, message: 'Provider not found' }, 404);

    const { data: updated, error } = await supabase
      .from('sso_providers')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: user.organization_id,
        userId: auth.sub,
        action: 'sso.provider.updated',
        resource: id,
        ip,
        metadata: body,
      }),
    );

    return json({ statusCode: 200, data: updated });
  } catch (err) {
    console.error('Error updating SSO provider:', err);
    return json({ statusCode: 500, message: 'Failed to update provider' }, 500);
  }
}

/**
 * DELETE /api/v1/orgs/me/sso-providers/{id}
 * Delete SSO provider (Owner only)
 */
async function handleDelete(context: { env: Env; request: Request; params: Record<string, string> }) {
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
    return json({ statusCode: 403, message: 'Only Owner can delete SSO providers' }, 403);
  }

  const { data: provider, error: fetchError } = await supabase
    .from('sso_providers')
    .select('id')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (fetchError || !provider) return json({ statusCode: 404, message: 'Provider not found' }, 404);

  const { data: linkedUsers } = await supabase
    .from('sso_provider_users')
    .select('id')
    .eq('sso_provider_id', id)
    .limit(1);

  if (linkedUsers && linkedUsers.length > 0) {
    return json({ statusCode: 409, message: 'Cannot delete provider with linked users' }, 409);
  }

  const { error } = await supabase.from('sso_providers').delete().eq('id', id);
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const ip = getClientIp(context.request);
  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId: user.organization_id,
      userId: auth.sub,
      action: 'sso.provider.deleted',
      resource: id,
      ip,
    }),
  );

  return json({ statusCode: 200, message: 'Provider deleted' });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method === 'GET') return handleGet(context as any);
  if (context.request.method === 'PATCH') return handlePatch(context as any);
  if (context.request.method === 'DELETE') return handleDelete(context as any);
  return json({ message: 'Method not allowed' }, 405);
};
