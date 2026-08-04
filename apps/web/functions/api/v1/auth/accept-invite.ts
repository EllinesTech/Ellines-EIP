/**
 * Pages Function: POST /api/v1/auth/accept-invite
 *
 * Validates the invite token, sets the user's password, activates the account,
 * and returns a full AuthSession so the UI can log the user in immediately.
 *
 * Body: { token: string; password: string; fullName?: string }
 */
import {
  getAdminClient,
  hashToken,
  json,
  options,
  signAccessToken,
  BCRYPT_ROUNDS,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  let body: { token?: string; password?: string; fullName?: string } = {};
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const rawToken = (body.token || '').trim();
  const password = (body.password || '').trim();
  const fullNameOverride = (body.fullName || '').trim();

  if (!rawToken) return json({ statusCode: 400, message: 'token is required' }, 400);
  if (!password || password.length < 8) {
    return json({ statusCode: 400, message: 'Password must be at least 8 characters' }, 400);
  }

  const supabase = getAdminClient(context.env);
  const tokenHash = await hashToken(rawToken);
  const now = new Date();

  // Look up the invite token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('password_reset_tokens')
    .select('id, user_id, organization_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (tokenErr) return json({ statusCode: 500, message: tokenErr.message }, 500);
  if (!tokenRow) return json({ statusCode: 400, message: 'Invalid or expired invite link' }, 400);
  if (tokenRow.used_at) return json({ statusCode: 400, message: 'This invite link has already been used' }, 400);
  if (new Date(tokenRow.expires_at as string) < now) {
    return json({ statusCode: 400, message: 'Invite link has expired. Ask your administrator to resend.' }, 400);
  }

  // Load the user
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, role, organization_id, is_active')
    .eq('id', tokenRow.user_id as string)
    .maybeSingle();

  if (userErr || !user) return json({ statusCode: 400, message: 'User account not found' }, 400);

  // Hash the new password
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Activate user + set password
  const updateName = fullNameOverride || (user.full_name as string);
  const { error: updateErr } = await supabase
    .from('users')
    .update({
      password_hash: passwordHash,
      full_name: updateName,
      is_active: true,
      updated_at: now.toISOString(),
    })
    .eq('id', user.id as string);

  if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);

  // Mark token as used
  await supabase
    .from('password_reset_tokens')
    .update({ used_at: now.toISOString() })
    .eq('id', tokenRow.id as string);

  // Fetch org for the session
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, settings')
    .eq('id', user.organization_id as string)
    .maybeSingle();

  if (!org) return json({ statusCode: 500, message: 'Organization not found' }, 500);

  // Check platform suspension
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  if (settings.platformStatus === 'suspended') {
    return json({ statusCode: 403, message: 'This organization has been suspended. Contact Ellines support.' }, 403);
  }

  // Audit
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: user.organization_id as string,
    user_id: user.id as string,
    action: 'auth.invite_accepted',
    resource: 'user',
    metadata: { email: user.email },
    created_at: now.toISOString(),
  });

  // Issue JWT and return session
  const { accessToken, expiresIn } = await signAccessToken(context.env, {
    sub: user.id as string,
    email: user.email as string,
    organizationId: user.organization_id as string,
    role: user.role as string,
  });

  return json({
    accessToken,
    expiresIn,
    user: {
      id: user.id,
      email: user.email,
      fullName: updateName,
      organizationId: user.organization_id,
      role: user.role,
      isActive: true,
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
  });
};
