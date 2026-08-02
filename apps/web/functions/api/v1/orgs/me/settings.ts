import {
  mergeOrganizationSettings,
  normalizeOrgDateTimeSettings,
  type OrgDateTimeSettings,
} from '@ellines-eip/shared';
import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

type TimeFormat = OrgDateTimeSettings['timeFormat'];
type DateStyle = OrgDateTimeSettings['dateStyle'];

function normalize(raw: unknown): { timeFormat: TimeFormat; dateStyle: DateStyle } {
  return normalizeOrgDateTimeSettings(raw);
}

function isOrgAdmin(role: string) {
  return role === 'owner' || role === 'admin';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    // org:view permission for reading settings
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'org:view',
    );
    if (permErr) return permErr;

    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json(normalize(data?.settings));
  }

  if (context.request.method === 'PATCH') {
    // org:manage_settings permission required (or platform admin)
    const isPlatformAdmin = platformAdminFromEnv(context.env, auth.email);
    if (!isPlatformAdmin) {
      const permErr = await requirePermissionAsync(
        context.env,
        auth.sub,
        auth.organizationId,
        auth.role,
        'org:manage_settings',
      );
      if (permErr) return permErr;
    }

    let body: Partial<{ timeFormat: TimeFormat; dateStyle: DateStyle }> = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const nextPrefs = normalize({ ...normalize(existing?.settings), ...body });
    const nextSettings = mergeOrganizationSettings(existing?.settings, nextPrefs);
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);
    return json(nextPrefs);
  }

  return json({ message: 'Method not allowed' }, 405);
};
