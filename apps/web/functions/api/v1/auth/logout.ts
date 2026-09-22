import { bearerToken, getAdminClient, hashToken, json, options, verifyAccessToken, type Env } from '../../../shared/auth';

/**
 * POST /api/v1/auth/logout — session-registry revocation foundation (spec 24.2.3).
 *
 * Verifies the presented bearer token (signature must still validate), then marks
 * its session row revoked so `requireAuth` rejects it from then on. Idempotent:
 * revoking twice, or when no registry row exists, still returns 200 — clients
 * always clear local state on sign-out. Non-fatal while migration
 * 0003_phase2_session_registry is unapplied (revocation skipped with a warning).
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const token = bearerToken(context.request);
  if (!token) return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  try {
    await verifyAccessToken(context.env, token);
  } catch {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }

  try {
    const supabase = getAdminClient(context.env);
    const { error } = await supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', await hashToken(token));
    if (error) {
      console.warn('[logout] session revocation skipped:', error.message);
    }
  } catch (err) {
    console.warn('[logout] session revocation skipped:', err);
  }

  return json({ message: 'Signed out' });
};
