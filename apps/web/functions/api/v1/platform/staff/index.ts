import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import {
  PLATFORM_STAFF_PLATFORM_SCOPE,
  isPlatformStaffCapability,
  normalizePlatformStaffEmail,
} from '@ellines-eip/shared';
import { loadPlatformStaff } from '../../../../shared/platform-staff';
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

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!await isPlatformAdmin(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);

  // ── GET: list all staff members with their grants ─────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('platform_staff_members')
      .select('*, platform_staff_grants(*)')
      .order('created_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json({ staff: data ?? [] });
  }

  // ── POST: invite a new staff member ───────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: { email?: unknown; name?: unknown; capabilities?: unknown };
    try {
      body = await context.request.json() as { email?: unknown; name?: unknown; capabilities?: unknown };
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const rawEmail = body.email;
    const rawName = body.name;
    const rawCapabilities = body.capabilities;

    if (typeof rawEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail.trim())) {
      return json({ statusCode: 400, message: 'Invalid email address' }, 400);
    }
    if (typeof rawName !== 'string' || !rawName.trim()) {
      return json({ statusCode: 400, message: 'name is required' }, 400);
    }
    if (!Array.isArray(rawCapabilities) || rawCapabilities.length === 0) {
      return json({ statusCode: 400, message: 'capabilities must be a non-empty array' }, 400);
    }
    for (const cap of rawCapabilities) {
      if (!isPlatformStaffCapability(cap)) {
        return json({ statusCode: 400, message: `Unknown capability: ${String(cap)}` }, 400);
      }
    }

    const normalizedEmail = normalizePlatformStaffEmail(rawEmail);
    const name = rawName.trim();
    const capabilities = rawCapabilities as string[];

    // Check for duplicate
    const { data: existing } = await supabase
      .from('platform_staff_members')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return json({ statusCode: 409, message: 'A staff member with this email already exists' }, 409);
    }

    // Insert member row
    const memberId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { data: newMember, error: memberError } = await supabase
      .from('platform_staff_members')
      .insert({
        id: memberId,
        email: normalizedEmail,
        full_name: name,
        status: 'active',
        invited_by_email: auth.email,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (memberError) {
      return json({ statusCode: 500, message: memberError.message }, 500);
    }

    // Insert grant rows
    const grantRows = capabilities.map((cap) => ({
      id: crypto.randomUUID(),
      staff_id: memberId,
      capability: cap,
      scope_org_id: PLATFORM_STAFF_PLATFORM_SCOPE,
      granted_by_email: auth.email,
      created_at: now,
      updated_at: now,
    }));

    const { data: grants, error: grantsError } = await supabase
      .from('platform_staff_grants')
      .insert(grantRows)
      .select();

    if (grantsError) {
      // Rollback by soft-deleting the member row
      await supabase
        .from('platform_staff_members')
        .update({ status: 'revoked', revoked_at: now, updated_at: now })
        .eq('id', memberId);
      return json({ statusCode: 500, message: 'Failed to create grants: ' + grantsError.message }, 500);
    }

    return json({ ...newMember, platform_staff_grants: grants ?? [] }, 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};
