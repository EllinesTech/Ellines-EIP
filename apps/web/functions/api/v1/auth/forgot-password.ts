import {
  getAdminClient,
  hashToken,
  json,
  options,
  randomTokenHex,
  type Env,
} from '../../../shared/auth';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    const body = (await context.request.json()) as { email?: string };
    const email = (body.email || '').toLowerCase().trim();
    if (!email) {
      return json({ statusCode: 400, message: 'Email is required' }, 400);
    }

    const base = {
      message: 'If that email is registered, a password reset token has been issued.',
    };

    const supabase = getAdminClient(context.env);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, organization_id, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }
    if (!user || !user.is_active) {
      return json(base);
    }

    const rawToken = randomTokenHex(32);
    const tokenHash = await hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();
    const id = crypto.randomUUID();

    const { error: insertErr } = await supabase.from('password_reset_tokens').insert({
      id,
      user_id: user.id,
      organization_id: user.organization_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: now.toISOString(),
    });
    if (insertErr) {
      return json({ statusCode: 500, message: insertErr.message }, 500);
    }

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: user.organization_id,
      user_id: user.id,
      action: 'auth.forgot_password',
      resource: 'user',
      created_at: now.toISOString(),
    });

    // Until notification service exists, return token so the client can complete reset (MVP).
    return json({
      ...base,
      resetToken: rawToken,
      expiresIn: '1h',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
