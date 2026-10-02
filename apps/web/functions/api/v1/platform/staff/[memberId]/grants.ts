import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import {
  isPlatformStaffCapability,
  PLATFORM_STAFF_PLATFORM_SCOPE,
} from '@ellines-eip/shared';
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
  if (context.request.method !== 'PATCH') {
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

  let body: { add?: unknown; remove?: unknown };
  try {
    body = await context.request.json() as { add?: unknown; remove?: unknown };
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const add = Array.isArray(body.add) ? (body.add as unknown[]) : [];
  const remove = Array.isArray(body.remove) ? (body.remove as unknown[]) : [];

  // Validate all capability strings before writing
  for (const cap of [...add, ...remove]) {
    if (!isPlatformStaffCapability(cap)) {
      return json({ statusCode: 400, message: `Unknown capability: ${String(cap)}` }, 400);
    }
  }

  const supabase = getAdminClient(context.env);
  const now = new Date().toISOString();

  // Add capabilities: upsert grant rows
  if (add.length > 0) {
    const grantRows = (add as string[]).map((cap) => ({
      id: crypto.randomUUID(),
      staff_id: memberId,
      capability: cap,
      scope_org_id: PLATFORM_STAFF_PLATFORM_SCOPE,
      granted_by_email: auth.email,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    }));

    const { error } = await supabase
      .from('platform_staff_grants')
      .upsert(grantRows, { onConflict: 'staff_id,capability,scope_org_id' });

    if (error) {
      return json({ statusCode: 500, message: 'Failed to add grants: ' + error.message }, 500);
    }
  }

  // Remove capabilities: soft-revoke matching grant rows
  if (remove.length > 0) {
    for (const cap of remove as string[]) {
      const { error } = await supabase
        .from('platform_staff_grants')
        .update({ revoked_at: now, updated_at: now })
        .eq('staff_id', memberId)
        .eq('capability', cap)
        .eq('scope_org_id', PLATFORM_STAFF_PLATFORM_SCOPE);

      if (error) {
        return json({ statusCode: 500, message: 'Failed to revoke grant for ' + cap + ': ' + error.message }, 500);
      }
    }
  }

  // Return updated grants for this member
  const { data: grants, error: fetchError } = await supabase
    .from('platform_staff_grants')
    .select('*')
    .eq('staff_id', memberId);

  if (fetchError) {
    return json({ statusCode: 500, message: fetchError.message }, 500);
  }

  return json({ ok: true, grants: grants ?? [] });
};
