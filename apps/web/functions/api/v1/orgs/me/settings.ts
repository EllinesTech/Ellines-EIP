import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

type TimeFormat = '12h' | '24h';
type DateStyle = 'short' | 'medium' | 'log';

function normalize(raw: unknown): { timeFormat: TimeFormat; dateStyle: DateStyle } {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    timeFormat: obj.timeFormat === '24h' ? '24h' : '12h',
    dateStyle:
      obj.dateStyle === 'medium' || obj.dateStyle === 'log' ? obj.dateStyle : 'short',
  };
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
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json(normalize(data?.settings));
  }

  if (context.request.method === 'PATCH') {
    const canEdit =
      isOrgAdmin(auth.role) || platformAdminFromEnv(context.env, auth.email);
    if (!canEdit) {
      return json(
        {
          statusCode: 403,
          message:
            'Only organization admins or platform operators can change date & time settings',
        },
        403,
      );
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

    const next = normalize({ ...normalize(existing?.settings), ...body });
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: next, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);
    return json(next);
  }

  return json({ message: 'Method not allowed' }, 405);
};
