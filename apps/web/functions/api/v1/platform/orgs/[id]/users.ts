/**
 * Pages Function: /api/v1/platform/orgs/:id/users
 *
 * GET    — list all users in any org
 * POST   — create a user in any org
 * PATCH  — update a user (role, isActive, fullName)  ?userId=...
 * DELETE — deactivate a user                          ?userId=...
 *
 * All routes require Platform Super Admin (PLATFORM_ADMIN_EMAILS).
 */
import {
  BCRYPT_ROUNDS,
  auditRow,
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
  type UserRole,
  EIP_ROLES,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  // ── GET — list users ────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    return json(
      (data || []).map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        isActive: u.is_active,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })),
    );
  }

  // ── POST — create user ──────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: {
      email?: string;
      fullName?: string;
      password?: string;
      role?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const email = (body.email || '').trim().toLowerCase();
    const fullName = (body.fullName || '').trim();
    const password = (body.password || '').trim();
    const role = (body.role || 'member') as UserRole;

    if (!email || !fullName || !password) {
      return json({ statusCode: 400, message: 'email, fullName, and password are required' }, 400);
    }
    if (password.length < 8) {
      return json({ statusCode: 400, message: 'Password must be at least 8 characters' }, 400);
    }
    if (!EIP_ROLES.includes(role)) {
      return json({ statusCode: 400, message: `Invalid role. Must be one of: ${EIP_ROLES.join(', ')}` }, 400);
    }

    // Verify org exists
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .maybeSingle();
    if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);

    // Check email uniqueness
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) return json({ statusCode: 409, message: 'Email already registered' }, 409);

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        full_name: fullName,
        password_hash: passwordHash,
        organization_id: orgId,
        role,
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select('id, email, full_name, role, is_active, created_at, updated_at')
      .single();

    if (insertErr) return json({ statusCode: 500, message: insertErr.message }, 500);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: 'platform.user.create',
        resource: 'user',
        metadata: { targetEmail: email, role, createdBy: auth.email },
        ip: auth.ip,
      }),
    );

    return json({
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.full_name,
      role: newUser.role,
      isActive: newUser.is_active,
      createdAt: newUser.created_at,
      updatedAt: newUser.updated_at,
    }, 201);
  }

  // ── PATCH — update user ─────────────────────────────────────────────────
  if (context.request.method === 'PATCH') {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return json({ statusCode: 400, message: 'userId query param required' }, 400);

    let body: {
      fullName?: string;
      role?: string;
      isActive?: boolean;
      password?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.fullName !== undefined) updates.full_name = body.fullName.trim();
    if (body.role !== undefined) {
      if (!EIP_ROLES.includes(body.role as UserRole)) {
        return json({ statusCode: 400, message: `Invalid role` }, 400);
      }
      updates.role = body.role;
    }
    if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);
    if (body.password !== undefined) {
      if (body.password.length < 8) {
        return json({ statusCode: 400, message: 'Password must be at least 8 characters' }, 400);
      }
      const bcrypt = await import('bcryptjs');
      updates.password_hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .eq('organization_id', orgId)
      .select('id, email, full_name, role, is_active, created_at, updated_at')
      .single();

    if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);
    if (!updated) return json({ statusCode: 404, message: 'User not found in this org' }, 404);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: 'platform.user.update',
        resource: 'user',
        metadata: { targetUserId: userId, changes: Object.keys(updates).filter(k => k !== 'updated_at'), updatedBy: auth.email },
        ip: auth.ip,
      }),
    );

    return json({
      id: updated.id,
      email: updated.email,
      fullName: updated.full_name,
      role: updated.role,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  }

  // ── DELETE — deactivate user ────────────────────────────────────────────
  if (context.request.method === 'DELETE') {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return json({ statusCode: 400, message: 'userId query param required' }, 400);

    // Deactivate rather than hard delete to preserve audit history
    const { data: deactivated, error } = await supabase
      .from('users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('organization_id', orgId)
      .select('id, email')
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    if (!deactivated) return json({ statusCode: 404, message: 'User not found in this org' }, 404);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: 'platform.user.deactivate',
        resource: 'user',
        metadata: { targetEmail: deactivated.email, deactivatedBy: auth.email },
        ip: auth.ip,
      }),
    );

    return json({ ok: true, message: `User ${deactivated.email} deactivated.` });
  }

  return json({ message: 'Method not allowed' }, 405);
};
