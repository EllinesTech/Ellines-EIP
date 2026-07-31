import {
  BCRYPT_ROUNDS,
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

  try {
    const body = (await context.request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
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

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: user.organization_id,
      user_id: auth.sub,
      action: 'auth.change_password',
      resource: 'user',
      metadata: {},
    });

    return json({ message: 'Password updated.' });
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }
};
