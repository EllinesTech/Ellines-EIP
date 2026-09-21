import { getAdminClient, getClientIp, hashToken, json, options, BCRYPT_ROUNDS, type Env } from '../../../shared/auth';
import { checkRateLimit, rateLimitResponse } from '../../../shared/rate-limit';
import { checkContentLength } from '../../../shared/validation';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  try {
    // Check payload size before parsing
    checkContentLength(context.request, 100_000);

    // Rate limit by IP: 10 attempts per 15 minutes to slow token-guessing
    const ip = getClientIp(context.request);
    const limiter = await checkRateLimit(context, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      keyPrefix: 'ratelimit:auth:reset-password',
    }, ip);
    if (!limiter.allowed) {
      return rateLimitResponse(limiter.remaining, limiter.resetAt);
    }

    let body: { token?: string; newPassword?: string } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const token = (body.token || '').trim();
    const newPassword = body.newPassword || '';
    if (!token || token.length < 32) {
      return json({ statusCode: 400, message: 'Invalid or expired reset token' }, 400);
    }
    if (newPassword.length < 8) {
      return json({ statusCode: 400, message: 'Password must be at least 8 characters' }, 400);
    }

    const supabase = getAdminClient(context.env);
    const tokenHash = await hashToken(token);
    const { data: record, error } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, organization_id, expires_at, used_at, users ( id, is_active, organization_id )')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    const userRel = record?.users as
      | { id: string; is_active: boolean; organization_id: string }
      | { id: string; is_active: boolean; organization_id: string }[]
      | null
      | undefined;
    const user = Array.isArray(userRel) ? userRel[0] : userRel;

    if (
      !record ||
      record.used_at ||
      !user ||
      !user.is_active ||
      new Date(record.expires_at as string).getTime() < Date.now()
    ) {
      return json({ statusCode: 400, message: 'Invalid or expired reset token' }, 400);
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const orgId = (record.organization_id as string) || user.organization_id;

    const { error: userErr } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, updated_at: now })
      .eq('id', record.user_id);
    if (userErr) {
      return json({ statusCode: 500, message: userErr.message }, 500);
    }

    await supabase.from('password_reset_tokens').update({ used_at: now }).eq('id', record.id);
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: now })
      .eq('user_id', record.user_id)
      .is('used_at', null)
      .neq('id', record.id);

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: record.user_id,
      action: 'auth.reset_password',
      resource: 'user',
      metadata: null,
      created_at: now,
    });

    return json({ message: 'Password updated. You can sign in with your new password.' });
  } catch (err) {
    if (err instanceof RangeError && err.message.includes('Payload exceeds')) {
      return json({ statusCode: 413, message: err.message }, 413);
    }
    const message = err instanceof Error ? err.message : 'Request failed';
    return json({ statusCode: 500, message }, 500);
  }
};
