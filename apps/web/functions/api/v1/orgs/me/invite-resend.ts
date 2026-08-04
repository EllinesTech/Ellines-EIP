/**
 * Pages Function: POST /api/v1/orgs/me/invite-resend
 *
 * Renews the invite token and resends the magic link email.
 * Delegates to the same logic as invite.ts (creates a new token, sends email).
 */
import {
  EIP_ROLES,
  assertCanAssignRole,
  getAdminClient,
  hashToken,
  json,
  options,
  randomTokenHex,
  requireAuth,
  requirePermissionAsync,
  type Env,
  type UserRole,
} from '../../../../shared/auth';
import { resolveMailConfig, sendOutboundEmail } from '../../../../shared/mail';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

function inviteKey(orgId: string) {
  return `eip_pending_invites_${orgId}`;
}

type PendingInvite = {
  email: string;
  fullName: string;
  role: string;
  tokenHash: string;
  expiresAt: string;
  invitedBy: string;
  sentAt: string;
  emailSent: boolean;
};

async function readInvites(supabase: ReturnType<typeof getAdminClient>, orgId: string): Promise<PendingInvite[]> {
  const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle();
  const s = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = s[inviteKey(orgId)];
  return Array.isArray(raw) ? (raw as PendingInvite[]).filter((x) => x && typeof x.email === 'string') : [];
}

async function writeInvites(supabase: ReturnType<typeof getAdminClient>, orgId: string, invites: PendingInvite[]) {
  const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle();
  const s = Object.assign({}, (data?.settings ?? {}) as Record<string, unknown>);
  s[inviteKey(orgId)] = invites.slice(0, 100);
  await supabase.from('organizations').update({ settings: s, updated_at: new Date().toISOString() }).eq('id', orgId);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const permErr = await requirePermissionAsync(context.env, auth.sub, auth.organizationId, auth.role, 'org:manage_members');
  if (permErr) return permErr;

  let body: { email?: string; fullName?: string; role?: string } = {};
  try { body = await context.request.json() as typeof body; } catch {
    return json({ statusCode: 400, message: 'Invalid JSON' }, 400);
  }

  const email = (body.email || '').toLowerCase().trim();
  const fullName = (body.fullName || '').trim();
  const role = (body.role || 'member') as UserRole;

  if (!email) return json({ statusCode: 400, message: 'email required' }, 400);
  if (!EIP_ROLES.includes(role)) return json({ statusCode: 400, message: 'Invalid role' }, 400);
  const assignErr = assertCanAssignRole(auth.role, role);
  if (assignErr) return json({ statusCode: 403, message: assignErr }, 403);

  const supabase = getAdminClient(context.env);

  // Find the user
  const { data: user } = await supabase.from('users').select('id, is_active').eq('email', email).eq('organization_id', auth.organizationId).maybeSingle();
  if (!user) return json({ statusCode: 404, message: 'No pending invite found for this email' }, 404);
  if (user.is_active) return json({ statusCode: 409, message: 'User has already accepted their invite' }, 409);

  // Generate new token
  const rawToken = randomTokenHex(32);
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();

  // Replace old token
  await supabase.from('password_reset_tokens').delete().eq('user_id', user.id);
  await supabase.from('password_reset_tokens').insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    organization_id: auth.organizationId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: now.toISOString(),
  });

  // Update pending invite list
  const invites = await readInvites(supabase, auth.organizationId);
  const updated = invites.map((i) =>
    i.email === email ? { ...i, tokenHash, expiresAt, sentAt: now.toISOString(), emailSent: false } : i,
  );
  if (!updated.find((i) => i.email === email)) {
    updated.unshift({ email, fullName: fullName || email, role, tokenHash, expiresAt, invitedBy: auth.email, sentAt: now.toISOString(), emailSent: false });
  }
  await writeInvites(supabase, auth.organizationId, updated);

  const url = new URL(context.request.url);
  const origin = url.origin;
  const acceptLink = `${origin}/accept-invite?token=${rawToken}`;

  const { data: orgData } = await supabase.from('organizations').select('name').eq('id', auth.organizationId).maybeSingle();
  const orgName = orgData?.name || 'your organization';

  let emailSent = false;
  const mailConfig = resolveMailConfig(context.env);
  if (mailConfig) {
    const result = await sendOutboundEmail(context.env, {
      to: email,
      subject: `Invitation reminder — ${orgName} on Ellines EIP`,
      text: [
        `Hi ${fullName || email},`,
        ``,
        `This is a reminder that ${auth.email} has invited you to join ${orgName} on Ellines EIP as ${role}.`,
        ``,
        `Click the link below to accept your invitation (valid for 72 hours):`,
        ``,
        acceptLink,
        ``,
        `— The Ellines EIP Team`,
      ].join('\n'),
    });
    emailSent = result.ok;
  }

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'org.invite_resend',
    resource: 'user',
    metadata: { email, role },
  });

  return json({
    ok: true,
    email,
    expiresAt,
    emailSent,
    acceptLink: mailConfig ? undefined : acceptLink,
    _note: mailConfig ? (emailSent ? 'Reminder email sent.' : 'Email send failed.') : 'No email provider — share the link manually.',
  });
};
