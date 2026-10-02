import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import {
  PLATFORM_STAFF_BOOTSTRAP_CAPABILITIES,
  PLATFORM_STAFF_PLATFORM_SCOPE,
  normalizePlatformStaffEmail,
  parsePlatformAdminEmails,
} from '@ellines-eip/shared';
import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Bootstrap uses env-only check — DB is not yet populated on first run.
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);
  const emails = parsePlatformAdminEmails(
    (context.env as unknown as Record<string, string>).PLATFORM_ADMIN_EMAILS,
  );

  let created = 0;
  let skipped = 0;

  for (const rawEmail of emails) {
    const normalizedEmail = normalizePlatformStaffEmail(rawEmail);
    if (!normalizedEmail) { skipped++; continue; }

    // Check if already exists
    const { data: existing } = await supabase
      .from('platform_staff_members')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // Insert member row
    const memberId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: memberError } = await supabase
      .from('platform_staff_members')
      .insert({
        id: memberId,
        email: normalizedEmail,
        full_name: normalizedEmail,
        status: 'active',
        bootstrapped: true,
        created_at: now,
        updated_at: now,
      });

    if (memberError) { skipped++; continue; }

    // Insert all bootstrap capability grants
    const grantRows = PLATFORM_STAFF_BOOTSTRAP_CAPABILITIES.map((cap) => ({
      id: crypto.randomUUID(),
      staff_id: memberId,
      capability: cap,
      scope_org_id: PLATFORM_STAFF_PLATFORM_SCOPE,
      granted_by_email: auth.email,
      created_at: now,
      updated_at: now,
    }));

    const { error: grantsError } = await supabase
      .from('platform_staff_grants')
      .insert(grantRows);

    if (grantsError) {
      // Soft-delete the member row on grant failure
      await supabase
        .from('platform_staff_members')
        .update({ status: 'revoked', revoked_at: now, updated_at: now })
        .eq('id', memberId);
      skipped++;
      continue;
    }

    created++;
  }

  return json({ created, skipped });
};
