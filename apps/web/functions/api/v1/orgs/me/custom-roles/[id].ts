import {
  getAdminClient, json, requireAuth, options, auditRow, getClientIp, type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/** GET /api/v1/orgs/me/custom-roles/:id */
async function handleGet(env: Env, request: Request, id: string) {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(env);
  const { data: user } = await supabase
    .from('users').select('role, organization_id').eq('id', auth.sub).single();

  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  const { data: role, error } = await supabase
    .from('custom_roles')
    .select('*')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !role) return json({ statusCode: 404, message: 'Role not found' }, 404);
  return json({ statusCode: 200, data: role });
}

/** PATCH /api/v1/orgs/me/custom-roles/:id */
async function handlePatch(env: Env, request: Request, id: string) {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(env);
  const { data: user } = await supabase
    .from('users').select('role, organization_id').eq('id', auth.sub).single();

  if (!user || user.role !== 'owner') {
    return json({ statusCode: 403, message: 'Only Owner can update custom roles' }, 403);
  }

  const { data: role, error: fetchErr } = await supabase
    .from('custom_roles')
    .select('id, name, permissions, is_system')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (fetchErr || !role) return json({ statusCode: 404, message: 'Role not found' }, 404);
  if (role.is_system) return json({ statusCode: 403, message: 'System roles cannot be modified' }, 403);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ statusCode: 400, message: 'Invalid JSON' }, 400); }

  // Check name uniqueness if changing
  if (body.name && body.name !== role.name) {
    const { data: clash } = await supabase
      .from('custom_roles')
      .select('id')
      .eq('organization_id', user.organization_id)
      .eq('name', body.name as string)
      .neq('id', id)
      .maybeSingle();
    if (clash) return json({ statusCode: 409, message: `Role '${body.name}' already exists` }, 409);
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = (body.name as string).trim();
  if (body.description !== undefined) updateData.description = body.description;
  if (body.color !== undefined) updateData.color = body.color;
  if (body.baseRole !== undefined) updateData.base_role = body.baseRole;
  if (body.permissions !== undefined) updateData.permissions = body.permissions;
  if (body.isActive !== undefined) updateData.is_active = body.isActive;

  const { data: updated, error } = await supabase
    .from('custom_roles').update(updateData).eq('id', id).select().single();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const ip = getClientIp(request);
  await supabase.from('role_audit_logs').insert({
    organization_id: user.organization_id,
    role_id: id,
    user_id: auth.sub,
    action: 'role.updated',
    details: { prev: { name: role.name, permissions: role.permissions }, changes: updateData },
    ip_address: ip,
  });

  return json({ statusCode: 200, data: updated });
}

/** DELETE /api/v1/orgs/me/custom-roles/:id */
async function handleDelete(env: Env, request: Request, id: string) {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(env);
  const { data: user } = await supabase
    .from('users').select('role, organization_id').eq('id', auth.sub).single();

  if (!user || user.role !== 'owner') {
    return json({ statusCode: 403, message: 'Only Owner can delete custom roles' }, 403);
  }

  const { data: role, error: fetchErr } = await supabase
    .from('custom_roles').select('id, name, is_system').eq('id', id)
    .eq('organization_id', user.organization_id).single();

  if (fetchErr || !role) return json({ statusCode: 404, message: 'Role not found' }, 404);
  if (role.is_system) return json({ statusCode: 403, message: 'System roles cannot be deleted' }, 403);

  // Check if any members have this role
  const { data: members } = await supabase
    .from('organization_memberships').select('id').eq('custom_role_id', id).limit(1);

  if (members && members.length > 0) {
    return json(
      { statusCode: 409, message: 'Cannot delete role — members are assigned to it. Reassign them first.' },
      409,
    );
  }

  const { error } = await supabase.from('custom_roles').delete().eq('id', id);
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const ip = getClientIp(request);
  await supabase.from('role_audit_logs').insert({
    organization_id: user.organization_id,
    role_id: null,
    user_id: auth.sub,
    action: 'role.deleted',
    details: { deletedId: id, name: role.name },
    ip_address: ip,
  });

  return json({ statusCode: 200, message: 'Role deleted' });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method === 'GET') return handleGet(context.env, context.request, context.params.id as string);
  if (context.request.method === 'PATCH') return handlePatch(context.env, context.request, context.params.id as string);
  if (context.request.method === 'DELETE') return handleDelete(context.env, context.request, context.params.id as string);
  return json({ message: 'Method not allowed' }, 405);
};
