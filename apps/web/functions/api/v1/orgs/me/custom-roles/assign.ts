import {
  getAdminClient, json, requireAuth, options, getClientIp, type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * POST /api/v1/orgs/me/custom-roles/assign
 * Assign or remove a custom role from a user (Owner only)
 * Body: { userId: string, customRoleId: string | null }
 *       Pass null to revert to the user's fixed role
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const { data: actor } = await supabase
    .from('users').select('role, organization_id').eq('id', auth.sub).single();

  if (!actor || actor.role !== 'owner') {
    return json({ statusCode: 403, message: 'Only Owner can assign custom roles' }, 403);
  }

  let body: { userId: string; customRoleId: string | null };
  try { body = await context.request.json() as typeof body; }
  catch { return json({ statusCode: 400, message: 'Invalid JSON' }, 400); }

  if (!body.userId) return json({ statusCode: 400, message: 'userId required' }, 400);

  // Verify target user belongs to same org
  const { data: target } = await supabase
    .from('users').select('id, full_name, role')
    .eq('id', body.userId).eq('organization_id', actor.organization_id).single();

  if (!target) return json({ statusCode: 404, message: 'User not found in this organisation' }, 404);

  // Verify custom role belongs to org (if provided)
  if (body.customRoleId) {
    const { data: role } = await supabase
      .from('custom_roles').select('id, is_active')
      .eq('id', body.customRoleId).eq('organization_id', actor.organization_id).single();

    if (!role || !role.is_active) {
      return json({ statusCode: 404, message: 'Custom role not found or inactive' }, 404);
    }
  }

  // Upsert membership with customRoleId
  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .upsert(
      {
        user_id: body.userId,
        organization_id: actor.organization_id,
        role: target.role,
        custom_role_id: body.customRoleId ?? null,
        is_active: true,
      },
      { onConflict: 'user_id,organization_id' },
    )
    .select()
    .single();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const ip = getClientIp(context.request);
  await supabase.from('role_audit_logs').insert({
    organization_id: actor.organization_id,
    role_id: body.customRoleId ?? null,
    user_id: auth.sub,
    action: 'role.assigned',
    details: { targetUserId: body.userId, customRoleId: body.customRoleId },
    ip_address: ip,
  });

  return json({ statusCode: 200, data: membership });
};
