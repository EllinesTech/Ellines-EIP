import {
  EIP_ROLES,
  assertCanAssignRole,
  assertCanManageOrgUser,
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  getClientIp,
  auditRow,
  type Env,
  type UserRole,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'PATCH') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const userId = context.params.id as string;
  if (!userId) {
    return json({ statusCode: 400, message: 'User id required' }, 400);
  }

  try {
    const body = (await context.request.json()) as {
      role?: UserRole;
      isActive?: boolean;
    };

    if (body.role === undefined && body.isActive === undefined) {
      return json({ statusCode: 400, message: 'Provide role and/or isActive' }, 400);
    }

    const supabase = getAdminClient(context.env);
    const { data: target, error: findErr } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at, organization_id')
      .eq('id', userId)
      .eq('organization_id', auth.organizationId)
      .maybeSingle();

    if (findErr) {
      return json({ statusCode: 500, message: findErr.message }, 500);
    }
    if (!target) {
      return json({ statusCode: 404, message: 'User not found' }, 404);
    }

    const manageErr = assertCanManageOrgUser(auth.role, target.role as string);
    if (manageErr) {
      return json({ statusCode: 403, message: manageErr }, 403);
    }

    if (body.role !== undefined) {
      if (!EIP_ROLES.includes(body.role)) {
        return json({ statusCode: 400, message: 'Invalid role' }, 400);
      }
      const assignErr = assertCanAssignRole(auth.role, body.role);
      if (assignErr) {
        return json({ statusCode: 403, message: assignErr }, 403);
      }
      
      // Enforce: only 1 owner per org
      if (body.role === 'owner' && target.role !== 'owner') {
        const { data: existingOwners } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', auth.organizationId)
          .eq('role', 'owner')
          .eq('is_active', true);
        if (existingOwners && existingOwners.length > 0) {
          return json(
            { statusCode: 403, message: 'An organization can have only one owner. Demote the existing owner first.' },
            403,
          );
        }
      }

      if (target.role === 'owner' && body.role !== 'owner') {
        const lastOwner = await isLastActiveOwner(
          supabase,
          auth.organizationId,
          target.id as string,
        );
        if (lastOwner) {
          return json(
            { statusCode: 403, message: 'Cannot remove or demote the last active owner' },
            403,
          );
        }
      }
    }

    if (body.isActive === false) {
      if (target.id === auth.sub) {
        return json(
          { statusCode: 403, message: 'You cannot deactivate your own account' },
          403,
        );
      }
      if (target.role === 'owner') {
        const lastOwner = await isLastActiveOwner(
          supabase,
          auth.organizationId,
          target.id as string,
        );
        if (lastOwner) {
          return json(
            { statusCode: 403, message: 'Cannot remove or demote the last active owner' },
            403,
          );
        }
      }
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.role !== undefined) patch.role = body.role;
    if (body.isActive !== undefined) patch.is_active = body.isActive;

    const { data: updated, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', target.id)
      .select('id, email, full_name, role, is_active, created_at')
      .single();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'org.update_user',
        resource: 'user',
        metadata: {
          targetUserId: updated.id,
          role: updated.role,
          isActive: updated.is_active,
        },
        ip,
      })
    );

    return json({
      id: updated.id,
      email: updated.email,
      fullName: updated.full_name,
      role: updated.role,
      isActive: updated.is_active,
      createdAt: new Date(updated.created_at as string).toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return json({ statusCode: 500, message }, 500);
  }
};

async function isLastActiveOwner(
  supabase: ReturnType<typeof getAdminClient>,
  organizationId: string,
  excludeUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .neq('id', excludeUserId);
  return !data || data.length < 1;
}
