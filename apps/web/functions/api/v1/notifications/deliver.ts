import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

type Channel = 'email' | 'push' | 'in_app';

type DeliverBody = {
  channel?: Channel;
  subject?: string;
  body?: string;
  eventType?: string;
};

type OutboxItem = {
  id: string;
  channel: Channel;
  subject: string;
  body: string;
  eventType: string;
  status: 'queued' | 'simulated' | 'skipped';
  at: string;
};

function normalizeOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object').slice(0, 50) as OutboxItem[];
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
    return json(normalizeOutbox(settings.notifyOutbox));
  }

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: DeliverBody;
  try {
    body = (await context.request.json()) as DeliverBody;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const channel: Channel =
    body.channel === 'push' || body.channel === 'in_app' ? body.channel : 'email';
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : '';
  const eventType =
    typeof body.eventType === 'string' ? body.eventType.trim().slice(0, 80) : 'manual';

  if (!subject || !text) {
    return json({ statusCode: 400, message: 'subject and body are required' }, 400);
  }

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings =
    existing?.settings &&
    typeof existing.settings === 'object' &&
    !Array.isArray(existing.settings)
      ? { ...(existing.settings as Record<string, unknown>) }
      : {};

  const policyRaw = settings.notifyDelivery;
  const policy =
    policyRaw && typeof policyRaw === 'object' && !Array.isArray(policyRaw)
      ? (policyRaw as Record<string, unknown>)
      : {};

  let status: OutboxItem['status'] = 'simulated';
  if (channel === 'email' && policy.emailAlerts !== true && policy.emailDigest !== true) {
    status = 'skipped';
  }
  if (channel === 'push' && policy.pushEnabled !== true) {
    status = 'skipped';
  }

  const item: OutboxItem = {
    id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    channel,
    subject,
    body: text,
    eventType,
    status,
    at: new Date().toISOString(),
  };

  const outbox = [item, ...normalizeOutbox(settings.notifyOutbox)].slice(0, 50);
  const nextSettings = { ...settings, notifyOutbox: outbox };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: status === 'skipped' ? 'notify.skipped' : 'notify.simulated',
    resource: 'notification_outbox',
    metadata: { id: item.id, channel, eventType, subject },
  });

  return json({
    ...item,
    message:
      status === 'skipped'
        ? 'Skipped — enable the channel in Delivery policy.'
        : 'Queued and simulated (SMTP/push provider not configured). Outbox + audit updated.',
  });
};
