import {
  getAdminClient, json, requireAuth, options, auditRow, getClientIp, type Env,
} from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/** Permission entry stored in CustomRole.permissions JSON array */
interface PermissionEntry {
  permission: string;
  resources?: string[];
  attributes?: Record<string, string | number | boolean>;
  conditions?: Record<string, unknown>;
}

/**
 * GET /api/v1/orgs/me/custom-roles
 * List all custom roles for the org (Owner/Admin)
 */
async function handleGet(env: Env, request: Request) {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(env);
  const { data: user } = await supabase
    .from('users').select('role, organization_id').eq('id', auth.sub).single();

  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  const { data: roles, error } = await supabase
    .from('custom_roles')
    .select('id, name, description, color, base_role, permissions, is_system, is_active, created_at, updated_at')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) return json({ statusCode: 500, message: error.message }, 500);
  return json({ statusCode: 200, data: roles });
}

/**
 * POST /api/v1/orgs/me/custom-roles
 * Create a custom role (Owner only)
 */
async function handlePost(env: Env, request: Request) {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(env);
  const { data: user } = await supabase
    .from('users').select('role, organization_id').eq('id', auth.sub).single();

  if (!user || user.role !== 'owner') {
    return json({ statusCode: 403, message: 'Only Owner can create custom roles' }, 403);
  }

  let body: { name: string; description?: string; color?: string; baseRole?: string; permissions?: PermissionEntry[] };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON' }, 400);
  }

  if (!body.name || body.name.trim().length < 2) {
    return json({ statusCode: 400, message: 'name must be at least 2 characters' }, 400);
  }

  // Check uniqueness
  const { data: existing } = await supabase
    .from('custom_roles')
    .select('id')
    .eq('organization_id', user.organization_id)
    .eq('name', body.name.trim())
    .maybeSingle();

  if (existing) {
    return json({ statusCode: 409, message: `Role '${body.name}' already exists` }, 409);
  }

  const { data: role, error } = await supabase
    .from('custom_roles')
    .insert({
      organization_id: user.organization_id,
      name: body.name.trim(),
      description: body.description ?? '',
      color: body.color ?? '#6F2D8D',
      base_role: body.baseRole ?? null,
      permissions: (body.permissions ?? []) as object[],
      is_system: false,
      is_active: true,
      created_by: auth.sub,
    })
    .select()
    .single();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const ip = getClientIp(request);
  await supabase.from('role_audit_logs').insert({
    organization_id: user.organization_id,
    role_id: role.id,
    user_id: auth.sub,
    action: 'role.created',
    details: { name: role.name },
    ip_address: ip,
  });

  return json({ statusCode: 201, data: role });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method === 'GET') return handleGet(context.env, context.request);
  if (context.request.method === 'POST') return handlePost(context.env, context.request);
  return json({ message: 'Method not allowed' }, 405);
};
