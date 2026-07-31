import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

export type NotifyDeliveryPolicy = {
  emailDigest: boolean;
  emailAlerts: boolean;
  pushEnabled: boolean;
  digestCadence: 'daily' | 'weekly' | 'off';
};

const DEFAULTS: NotifyDeliveryPolicy = {
  emailDigest: false,
  emailAlerts: false,
  pushEnabled: false,
  digestCadence: 'off',
};

function normalizePolicy(raw: unknown): NotifyDeliveryPolicy {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const cadence =
    obj.digestCadence === 'daily' || obj.digestCadence === 'weekly' || obj.digestCadence === 'off'
      ? obj.digestCadence
      : 'off';
  return {
    emailDigest: obj.emailDigest === true,
    emailAlerts: obj.emailAlerts === true,
    pushEnabled: obj.pushEnabled === true,
    digestCadence: cadence,
  };
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
    const settings =
      data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? (data.settings as Record<string, unknown>)
        : {};
    return json(normalizePolicy(settings.notifyDelivery));
  }

  if (context.request.method === 'PUT') {
    const denied = requireOrgAdmin(auth.role);
    if (denied) return denied;

    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const policy = normalizePolicy(body);

    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const base =
      existing?.settings &&
      typeof existing.settings === 'object' &&
      !Array.isArray(existing.settings)
        ? { ...(existing.settings as Record<string, unknown>) }
        : {};
    const nextSettings = { ...base, notifyDelivery: policy };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'notify.policy_updated',
      resource: 'notify_delivery',
      metadata: policy,
    });

    return json(policy);
  }

  return json({ message: 'Method not allowed' }, 405);
};
