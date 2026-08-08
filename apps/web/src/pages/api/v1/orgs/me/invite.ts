/**
 * Dev Pages API: /api/v1/orgs/me/invite
 * Pages Router API routes are IGNORED during static export builds.
 * This only runs locally — production uses the real Cloudflare Pages Function.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth, isOrgAdmin } from '../../../../../lib/dev-authlib/dev-auth';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const inviteKey = (orgId: string) => `eip_pending_invites_${orgId}`;

type PendingInvite = {
  email: string; fullName: string; role: string; tokenHash: string;
  expiresAt: string; invitedBy: string; sentAt: string; emailSent: boolean;
};

async function readInvites(supabase: ReturnType<typeof getDevSupabase>, orgId: string): Promise<PendingInvite[]> {
  const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle();
  const s = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = s[inviteKey(orgId)];
  return Array.isArray(raw) ? raw.filter((x): x is PendingInvite => x && typeof x.email === 'string') : [];
}

async function hashToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomTokenHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const supabase = getDevSupabase();

  if (req.method === 'GET') {
    const invites = await readInvites(supabase, auth.organizationId);
    devJson(res, invites.filter((i) => new Date(i.expiresAt) > new Date()).map(({ tokenHash: _t, ...rest }) => rest));
    return;
  }

  if (req.method === 'DELETE') {
    const email = ((req.body?.email as string) || '').toLowerCase().trim();
    if (!email) { devJson(res, { statusCode: 400, message: 'email required' }, 400); return; }
    const invites = await readInvites(supabase, auth.organizationId);
    const { data: settingsRow } = await supabase.from('organizations').select('settings').eq('id', auth.organizationId).maybeSingle();
    const s = Object.assign({}, (settingsRow?.settings ?? {}) as Record<string, unknown>);
    s[inviteKey(auth.organizationId)] = invites.filter((i) => i.email !== email);
    await supabase.from('organizations').update({ settings: s, updated_at: new Date().toISOString() }).eq('id', auth.organizationId);
    await supabase.from('users').update({ is_active: false }).eq('email', email).eq('organization_id', auth.organizationId);
    devJson(res, { ok: true, message: `Invite for ${email} revoked` });
    return;
  }

  if (req.method === 'POST') {
    const email = ((req.body?.email as string) || '').toLowerCase().trim();
    const fullName = ((req.body?.fullName as string) || '').trim();
    const role = (req.body?.role as string) || 'member';
    if (!email || !fullName) { devJson(res, { statusCode: 400, message: 'email and fullName are required' }, 400); return; }

    const { data: existing } = await supabase.from('users').select('id, is_active').eq('email', email).eq('organization_id', auth.organizationId).maybeSingle();
    if (existing?.is_active) { devJson(res, { statusCode: 409, message: 'Email already has an active account' }, 409); return; }

    const rawToken = randomTokenHex(32);
    const tokenHash = await hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();

    let userId: string;
    if (existing) {
      userId = existing.id;
      await supabase.from('users').update({ is_active: false, updated_at: now.toISOString() }).eq('id', userId);
    } else {
      const { data: created, error: createErr } = await supabase.from('users').insert({
        id: crypto.randomUUID(), email, full_name: fullName, password_hash: '',
        organization_id: auth.organizationId, role, is_active: false,
        created_at: now.toISOString(), updated_at: now.toISOString(),
      }).select('id').single();
      if (createErr || !created) { devJson(res, { statusCode: 500, message: createErr?.message || 'Failed to create user' }, 500); return; }
      userId = created.id;
    }

    await supabase.from('password_reset_tokens').delete().eq('user_id', userId);
    await supabase.from('password_reset_tokens').insert({
      id: crypto.randomUUID(), user_id: userId, organization_id: auth.organizationId,
      token_hash: tokenHash, expires_at: expiresAt, created_at: now.toISOString(),
    });

    const { data: settingsRow } = await supabase.from('organizations').select('settings').eq('id', auth.organizationId).maybeSingle();
    const s = Object.assign({}, (settingsRow?.settings ?? {}) as Record<string, unknown>);
    const existingInvites = Array.isArray(s[inviteKey(auth.organizationId)]) ? (s[inviteKey(auth.organizationId)] as PendingInvite[]) : [];
    const entry: PendingInvite = { email, fullName, role, tokenHash, expiresAt, invitedBy: auth.email, sentAt: now.toISOString(), emailSent: false };
    s[inviteKey(auth.organizationId)] = [entry, ...existingInvites.filter((i) => i.email !== email)].slice(0, 100);
    await supabase.from('organizations').update({ settings: s, updated_at: now.toISOString() }).eq('id', auth.organizationId);

    const acceptLink = `http://localhost:3100/accept-invite?token=${rawToken}`;
    devJson(res, { ok: true, email, fullName, role, expiresAt, emailSent: false, acceptLink, _note: 'Email not sent in local dev — use acceptLink directly.' });
    return;
  }

  devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405);
}
