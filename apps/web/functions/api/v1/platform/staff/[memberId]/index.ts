import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import { loadPlatformStaff } from '../../../../../shared/platform-staff';
import type { PagesFunction } from '@cloudflare/workers-types';

async function isPlatformAdmin(env: Env, email: string): Promise<boolean> {
  if (platformAdminFromEnv(env, email)) return true;
  try {
    const staffCtx = await loadPlatformStaff(env, email);
    return staffCtx.active;
  } catch {
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'DELETE') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!await isPlatformAdmin(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const memberId = String((context.params as Record<string, string | undefined>)?.memberId ?? '');
  if (!memberId) {
    return json({ statusCode: 400, message: 'memberId is required' }, 400);
  }

  const supabase = getAdminClient(context.env);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('platform_staff_members')
    .update({ status: 'revoked', revoked_at: now, updated_at: now })
    .eq('id', memberId);

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  return json({ ok: true, id: memberId });
};
