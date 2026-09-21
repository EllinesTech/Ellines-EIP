/**
 * Pages Function: POST /api/v1/orgs/me/users/:id/reset-password
 *
 * Allows an org owner or admin to trigger a password reset link for any active
 * member in their organisation. The link is sent to the user's email address.
 * If no email provider is configured the reset link is returned in the response
 * so the admin can share it manually.
 *
 * Requires: Owner or IT Admin role (requireOrgAdmin).
 * Cannot target: yourself (use /api/v1/auth/change-password instead).
 */
import {
  getAdminClient,
  hashToken,
  json,
  options,
  randomTokenHex,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';
import { resolveMailConfig, sendOutboundEmail } from '../../../../../../shared/mail';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const userId = context.params.id as string;
  if (!userId) {
    return json({ statusCode: 400, message: 'User id required' }, 400);
  }

  // Admins cannot reset their own password via this endpoint
  if (userId === auth.sub) {
    return json(
      { statusCode: 403, message: 'Use the profile page to change your own password.' },
      403,
    );
  }

  const supabase = getAdminClient(context.env);

  // Fetch target user — must belong to the same org
  const { data: target, error: findErr } = await supabase
    .from('users')
    .select('id, email, full_name, role, is_active, organization_id')
    .eq('id', userId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (findErr) return json({ statusCode: 500, message: findErr.message }, 500);
  if (!target) return json({ statusCode: 404, message: 'User not found' }, 404);
  if (!target.is_active) {
    return json(
      {
        statusCode: 400,
        message:
          'This user is inactive. Reactivate the account first, or resend their invite if they have never logged in.',
      },
      400,
    );
  }

  // Generate reset token
  const rawToken = randomTokenHex(32);
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();

  // Delete any existing tokens for this user before inserting a fresh one
  await supabase.from('password_reset_tokens').delete().eq('user_id', userId);

  const { error: insertErr } = await supabase.from('password_reset_tokens').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    organization_id: auth.organizationId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: now.toISOString(),
  });
  if (insertErr) return json({ statusCode: 500, message: insertErr.message }, 500);

  // Audit log
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'auth.admin_reset_password',
    resource: 'user',
    metadata: {
      targetUserId: userId,
      targetEmail: target.email,
    },
    created_at: now.toISOString(),
  });

  const origin = new URL(context.request.url).origin;
  const resetLink = `${origin}/reset-password?token=${rawToken}`;
  const fullName = (target.full_name as string) || 'there';

  const mailConfig = resolveMailConfig(context.env);
  if (mailConfig) {
    await sendOutboundEmail(context.env, {
      to: target.email as string,
      subject: 'Ellines EIP — Password reset requested by your administrator',
      text: [
        `Hi ${fullName},`,
        ``,
        `Your administrator has requested a password reset for your Ellines EIP account.`,
        ``,
        `Click the link below to set a new password (valid for 1 hour):`,
        ``,
        resetLink,
        ``,
        `If you did not expect this, please contact your administrator.`,
        ``,
        `---`,
        `Ellines EIP — Enterprise Intelligence Platform`,
      ].join('\n'),
    }).catch(() => {/* ignore transient send failure */});

    return json({
      message: `Password reset email sent to ${target.email as string}.`,
      emailSent: true,
    });
  }

  // No email provider — return link for manual sharing
  return json({
    message: 'No email provider configured. Share the reset link with the user manually.',
    emailSent: false,
    resetLink,
    expiresIn: '1h',
    _note: 'Set RESEND_API_KEY or SMTP_* on Pages to send real reset emails.',
  });
};
