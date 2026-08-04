/**
 * Pages Function: POST /api/v1/orgs/me/invite
 *
 * Upgrade from temp-password invite to magic-link invite.
 * Creates the user account (inactive until accepted), stores an invite token,
 * emails a one-click acceptance link, and returns status to the admin.
 *
 * GET  /api/v1/orgs/me/invite          → list pending invites
 * POST /api/v1/orgs/me/invite          → send invite
 * POST /api/v1/orgs/me/invite/resend   → resend (token renewed)
 * DELETE /api/v1/orgs/me/invite        → revoke invite (body: { email })
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

const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 h

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
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  const s = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = s[inviteKey(orgId)];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is PendingInvite => x && typeof x.email === 'string');
}

async function writeInvites(
  supabase: ReturnType<typeof getAdminClient>,
  orgId: string,
  invites: PendingInvite[],
) {
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  const s = Object.assign({}, (data?.settings ?? {}) as Record<string, unknown>);
  s[inviteKey(orgId)] = invites.slice(0, 100);
  await supabase
    .from('organizations')
    .update({ settings: s, updated_at: new Date().toISOString() })
    .eq('id', orgId);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const url = new URL(context.request.url);
  const isResend = url.pathname.endsWith('/resend');
  const isRevoke = context.request.method === 'DELETE';

  // ── GET: list pending invites ────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const permErr = await requirePermissionAsync(context.env, auth.sub, auth.organizationId, auth.role, 'org:manage_members');
    if (permErr) return permErr;
    const invites = await readInvites(supabase, auth.organizationId);
    // Redact token hashes from output
    return json(
      invites
        .filter((i) => new Date(i.expiresAt) > new Date()) // only non-expired
        .map(({ tokenHash: _t, ...rest }) => rest),
    );
  }

  // ── DELETE: revoke invite ─────────────────────────────────────────────────
  if (isRevoke) {
    const permErr = await requirePermissionAsync(context.env, auth.sub, auth.organizationId, auth.role, 'org:manage_members');
    if (permErr) return permErr;
    let body: { email?: string } = {};
    try { body = await context.request.json() as { email?: string }; } catch { /* ignore */ }
    const email = (body.email || '').toLowerCase().trim();
    if (!email) return json({ statusCode: 400, message: 'email required' }, 400);
    const invites = await readInvites(supabase, auth.organizationId);
    await writeInvites(supabase, auth.organizationId, invites.filter((i) => i.email !== email));
    // Also deactivate user if they haven't accepted (is_active = false marker)
    await supabase.from('users').update({ is_active: false }).eq('email', email).eq('organization_id', auth.organizationId);
    return json({ ok: true, message: `Invite for ${email} revoked` });
  }

  // ── POST: send / resend invite ────────────────────────────────────────────
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const permErr = await requirePermissionAsync(context.env, auth.sub, auth.organizationId, auth.role, 'org:manage_members');
  if (permErr) return permErr;

  let body: { email?: string; fullName?: string; role?: string } = {};
  try { body = await context.request.json() as typeof body; } catch {
    return json({ statusCode: 400, message: 'Invalid JSON' }, 400);
  }

  const email = (body.email || '').toLowerCase().trim();
  const fullName = (body.fullName || '').trim();
  const role = (body.role || 'member') as UserRole;

  if (!email || !fullName) return json({ statusCode: 400, message: 'email and fullName are required' }, 400);
  if (!EIP_ROLES.includes(role)) return json({ statusCode: 400, message: 'Invalid role' }, 400);
  const assignErr = assertCanAssignRole(auth.role, role);
  if (assignErr) return json({ statusCode: 403, message: assignErr }, 403);

  // Check if already a real active member
  const { data: existing } = await supabase
    .from('users')
    .select('id, is_active')
    .eq('email', email)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();
  if (existing?.is_active) {
    return json({ statusCode: 409, message: 'This email already has an active account in the org' }, 409);
  }

  // Generate invite token
  const rawToken = randomTokenHex(32);
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();

  // Upsert user record (inactive placeholder until accepted)
  let userId: string;
  if (existing) {
    userId = existing.id;
    await supabase.from('users').update({ is_active: false, updated_at: now.toISOString() }).eq('id', userId);
  } else {
    const { data: created, error: createErr } = await supabase
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        email,
        full_name: fullName,
        password_hash: '', // will be set on accept
        organization_id: auth.organizationId,
        role,
        is_active: false, // inactive until invite accepted
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select('id')
      .single();
    if (createErr || !created) return json({ statusCode: 500, message: createErr?.message || 'Failed to create user' }, 500);
    userId = created.id;
  }

  // Store token hash in password_reset_tokens (reuse the table; type = 'invite')
  await supabase.from('password_reset_tokens').delete().eq('user_id', userId);
  await supabase.from('password_reset_tokens').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    organization_id: auth.organizationId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: now.toISOString(),
  });

  // Track in org settings pending list
  const invites = await readInvites(supabase, auth.organizationId);
  const filtered = invites.filter((i) => i.email !== email);
  const entry: PendingInvite = {
    email,
    fullName,
    role,
    tokenHash,
    expiresAt,
    invitedBy: auth.email,
    sentAt: now.toISOString(),
    emailSent: false,
  };
  await writeInvites(supabase, auth.organizationId, [entry, ...filtered]);

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: isResend ? 'org.invite_resend' : 'org.invite_user',
    resource: 'user',
    metadata: { email, role, fullName },
  });

  // Build accept link
  const origin = url.origin;
  const acceptLink = `${origin}/accept-invite?token=${rawToken}`;

  // Get org name
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', auth.organizationId)
    .maybeSingle();
  const orgName = orgData?.name || 'your organization';

  // Send email
  let emailSent = false;
  let emailNote = 'Email provider not configured — share the accept link manually.';
  const mailConfig = resolveMailConfig(context.env);
  if (mailConfig) {
    const result = await sendOutboundEmail(context.env, {
      to: email,
      subject: `You've been invited to ${orgName} on Ellines EIP`,
      text: [
        `Hi ${fullName},`,
        ``,
        `${auth.email} has invited you to join ${orgName} on Ellines EIP as ${role}.`,
        ``,
        `Click the link below to accept your invitation and set your password (valid for 72 hours):`,
        ``,
        acceptLink,
        ``,
        `If you did not expect this invitation, you can safely ignore this email.`,
        ``,
        `— The Ellines EIP Team`,
        `Ellines Tech · Enterprise Intelligence Platform`,
      ].join('\n'),
    });
    emailSent = result.ok;
    if (!result.ok) emailNote = `Email send failed: ${(result as { error?: string }).error || 'unknown'}`;
  }

  // Update emailSent in pending list
  const updatedInvites = await readInvites(supabase, auth.organizationId);
  const withStatus = updatedInvites.map((i) => i.email === email ? { ...i, emailSent } : i);
  await writeInvites(supabase, auth.organizationId, withStatus);

  return json({
    ok: true,
    email,
    fullName,
    role,
    expiresAt,
    emailSent,
    acceptLink: mailConfig ? undefined : acceptLink, // only expose if no email
    _note: mailConfig ? (emailSent ? 'Invite email sent.' : emailNote) : emailNote,
  });
};
