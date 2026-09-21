import {
  BCRYPT_ROUNDS,
  auditRow,
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: { currentPassword?: string; newPassword?: string } = {};
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  try {
    const currentPassword = body.currentPassword || '';
    const newPassword = body.newPassword || '';

    if (!currentPassword || !newPassword) {
      return json(
        { statusCode: 400, message: 'currentPassword and newPassword are required' },
        400,
      );
    }
    if (newPassword.length < 8) {
      return json({ statusCode: 400, message: 'New password must be at least 8 characters' }, 400);
    }

    const supabase = getAdminClient(context.env);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, password_hash, organization_id')
      .eq('id', auth.sub)
      .maybeSingle();

    if (error || !user) {
      return json({ statusCode: 404, message: 'User not found' }, 404);
    }

    // Invited users have an empty password_hash until they accept their invite.
    // Give them a clear message instead of the generic "incorrect password" error.
    if (!user.password_hash) {
      return json(
        {
          statusCode: 403,
          message:
            'Your account was created via an invite link and has no password set yet. ' +
            'Please use the "Forgot password" flow to set a password before changing it.',
        },
        403,
      );
    }

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(currentPassword, user.password_hash as string);
    if (!valid) {
      return json({ statusCode: 401, message: 'Current password is incorrect' }, 401);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, updated_at: now })
      .eq('id', auth.sub);

    if (updateErr) {
      return json({ statusCode: 500, message: updateErr.message }, 500);
    }

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: user.organization_id as string,
        userId: auth.sub,
        action: 'auth.change_password',
        resource: 'user',
        ip: auth.ip,
      }),
    );

    return json({ message: 'Password updated.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
