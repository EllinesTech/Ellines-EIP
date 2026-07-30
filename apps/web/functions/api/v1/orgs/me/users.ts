import {
  EIP_ROLES,
  assertCanAssignRole,
  BCRYPT_ROUNDS,
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
  type UserRole,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: true });

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    return json(
      (data || []).map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        isActive: u.is_active,
        createdAt: new Date(u.created_at as string).toISOString(),
      })),
    );
  }

  if (context.request.method === 'POST') {
    try {
      const body = (await context.request.json()) as {
        email?: string;
        fullName?: string;
        role?: UserRole;
        temporaryPassword?: string;
      };
      const email = (body.email || '').toLowerCase().trim();
      const fullName = (body.fullName || '').trim();
      const role = (body.role || 'member') as UserRole;

      if (!email || !fullName) {
        return json({ statusCode: 400, message: 'email and fullName are required' }, 400);
      }
      if (!EIP_ROLES.includes(role)) {
        return json({ statusCode: 400, message: 'Invalid role' }, 400);
      }
      const assignErr = assertCanAssignRole(auth.role, role);
      if (assignErr) {
        return json({ statusCode: 403, message: assignErr }, 403);
      }

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (existing) {
        return json({ statusCode: 403, message: 'Email already registered' }, 403);
      }

      const tempPassword =
        body.temporaryPassword || `Temp-${Math.random().toString(36).slice(2, 10)}!`;
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const { data: user, error } = await supabase
        .from('users')
        .insert({
          id,
          email,
          full_name: fullName,
          password_hash: passwordHash,
          organization_id: auth.organizationId,
          role,
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .select('id, email, full_name, role')
        .single();

      if (error) {
        return json({ statusCode: 500, message: error.message }, 500);
      }

      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        organization_id: auth.organizationId,
        user_id: auth.sub,
        action: 'org.invite_user',
        resource: 'user',
        metadata: { email, role },
      });

      return json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
        },
        temporaryPassword: tempPassword,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invite failed';
      return json({ statusCode: 500, message }, 500);
    }
  }

  return json({ message: 'Method not allowed' }, 405);
};
