import {
  getAdminClient,
  hashToken,
  json,
  options,
  randomTokenHex,
  type Env,
} from '../../../shared/auth';
import { resolveMailConfig, sendOutboundEmail } from '../../../shared/mail';

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
      message: 'If that email is registered, a password reset link has been sent.',
    };

    const supabase = getAdminClient(context.env);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, organization_id, is_active, full_name')
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

    // Determine the site origin to build a real reset link.
    const origin = new URL(context.request.url).origin;
    const resetLink = `${origin}/reset-password?token=${rawToken}`;
    const fullName = (user as { full_name?: string }).full_name || 'there';

    const mailConfig = resolveMailConfig(context.env);
    if (mailConfig) {
      // Real email available — send the reset link and do not expose the token in the response.
      await sendOutboundEmail(context.env, {
        to: email,
        subject: 'Ellines EIP — Reset your password',
        text: [
          `Hi ${fullName},`,
          ``,
          `We received a request to reset your Ellines EIP password.`,
          ``,
          `Click the link below to choose a new password (valid for 1 hour):`,
          ``,
          resetLink,
          ``,
          `If you did not request this, you can safely ignore this email.`,
          ``,
          `---`,
          `Ellines EIP — Enterprise Intelligence Platform`,
        ].join('\n'),
      }).catch(() => {/* ignore transient failure */});

      return json(base);
    }

    // No email provider configured — return raw token so the operator/client can complete
    // the reset manually (MVP fallback; remove once email secrets are set on Pages).
    return json({
      ...base,
      resetToken: rawToken,
      resetLink,
      expiresIn: '1h',
      _note: 'Email provider not configured on Pages. Set RESEND_API_KEY or SMTP_* to send real reset emails.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
