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
  type Env,
} from '../../../../../shared/auth';

type TimeFormat = OrgDateTimeSettings['timeFormat'];
type DateStyle = OrgDateTimeSettings['dateStyle'];

function normalize(raw: unknown): { timeFormat: TimeFormat; dateStyle: DateStyle } {
  return normalizeOrgDateTimeSettings(raw);
}

/**
 * Platform Super Admin tenant date/time settings.
 *
 * This mirrors /api/v1/orgs/me/settings, but is explicitly scoped to the
 * selected tenant and protected by the platform-admin gate. The platform
 * dashboard calls this route when an organization is selected in settings.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string | undefined;
  if (!orgId) return json({ statusCode: 400, message: 'Organization id required' }, 400);

  const supabase = getAdminClient(context.env);

  const { data: org, error: readErr } = await supabase
    .from('organizations')
    .select('id, name, settings')
    .eq('id', orgId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);
  if (!org) return json({ statusCode: 404, message: 'Organization not found' }, 404);

  if (context.request.method === 'GET') {
    return json(normalize(org.settings));
  }

  if (context.request.method === 'PATCH') {
    let body: Partial<{ timeFormat: TimeFormat; dateStyle: DateStyle }> = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const nextPrefs = normalize({ ...normalize(org.settings), ...body });
    const nextSettings = mergeOrganizationSettings(org.settings, nextPrefs);
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', orgId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: auth.sub,
      action: 'platform.org.settings.update',
      resource: 'organization.settings',
      metadata: {
        actorEmail: auth.email,
        timeFormat: nextPrefs.timeFormat,
        dateStyle: nextPrefs.dateStyle,
      },
      created_at: new Date().toISOString(),
    });

    return json(nextPrefs);
  }

  return json({ message: 'Method not allowed' }, 405);
};
