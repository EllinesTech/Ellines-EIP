import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { mailProviderLabel, resolveMailConfig, sendOutboundEmail } from '../../../shared/mail';
import {
  normalizePushSubscription,
  resolveVapidConfig,
  sendWebPush,
} from '../../../shared/web-push';

type Channel = 'email' | 'push' | 'in_app';

type DeliverBody = {
  channel?: Channel;
  subject?: string;
  body?: string;
  eventType?: string;
  /** Optional recipient; defaults to the authenticated user email. */
  to?: string;
};

type OutboxStatus = 'queued' | 'simulated' | 'skipped' | 'delivered' | 'failed';

type OutboxItem = {
  id: string;
  channel: Channel;
  subject: string;
  body: string;
  eventType: string;
  status: OutboxStatus;
  at: string;
  to?: string;
  provider?: 'resend' | 'smtp' | 'vapid' | 'none';
  detail?: string;
};

function normalizeOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object').slice(0, 50) as OutboxItem[];
}

function readUserPushSub(settings: Record<string, unknown>, userId: string) {
  const raw = settings.notifyPushSubscriptions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return normalizePushSubscription((raw as Record<string, unknown>)[userId]);
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
  const toRaw = typeof body.to === 'string' ? body.to.trim().slice(0, 200) : '';
  const to = toRaw || auth.email;

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

  let status: OutboxStatus = 'simulated';
  let provider: OutboxItem['provider'] = mailProviderLabel(context.env);
  let detail =
    'Queued and simulated (SMTP/Resend not configured). Outbox + audit updated.';
  let auditAction = 'notify.simulated';

  if (channel === 'email' && policy.emailAlerts !== true && policy.emailDigest !== true) {
    status = 'skipped';
    detail = 'Skipped — enable the channel in Delivery policy.';
    auditAction = 'notify.skipped';
    provider = 'none';
  } else if (channel === 'push' && policy.pushEnabled !== true) {
    status = 'skipped';
    detail = 'Skipped — enable the channel in Delivery policy.';
    auditAction = 'notify.skipped';
    provider = 'none';
  } else if (channel === 'email') {
    const mailConfig = resolveMailConfig(context.env);
    if (mailConfig) {
      const result = await sendOutboundEmail(context.env, { to, subject, text });
      provider = result.provider;
      if (result.ok) {
        status = 'delivered';
        detail = `Delivered via ${result.provider}${result.id ? ` (${result.id})` : ''} to ${to}.`;
        auditAction = 'notify.delivered';
      } else {
        status = 'failed';
        detail = result.error;
        auditAction = 'notify.failed';
      }
    } else {
      status = 'simulated';
      provider = 'none';
      detail =
        'Simulated — set RESEND_API_KEY or SMTP_* / ELLINEA_SMTP_* on Pages to send real email.';
      auditAction = 'notify.simulated';
    }
  } else if (channel === 'push') {
    const vapid = resolveVapidConfig(context.env);
    const sub = readUserPushSub(settings, auth.sub);
    if (!vapid) {
      status = 'simulated';
      provider = 'none';
      detail =
        'Simulated — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on Pages for browser push.';
      auditAction = 'notify.simulated';
    } else if (!sub) {
      status = 'failed';
      provider = 'vapid';
      detail =
        'VAPID configured but no push subscription for this user — use Register browser push on Delivery policy.';
      auditAction = 'notify.failed';
    } else {
      const result = await sendWebPush(context.env, sub, { title: subject, body: text });
      provider = 'vapid';
      if (result.ok) {
        status = 'delivered';
        detail = `Push delivered via VAPID to ${new URL(sub.endpoint).host}.`;
        auditAction = 'notify.delivered';
      } else {
        status = 'failed';
        detail = result.error;
        auditAction = 'notify.failed';
      }
    }
  } else {
    status = 'simulated';
    provider = 'none';
    detail = 'In-app channel recorded in outbox (no external send).';
    auditAction = 'notify.simulated';
  }

  const item: OutboxItem = {
    id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    channel,
    subject,
    body: text,
    eventType,
    status,
    at: new Date().toISOString(),
    to,
    provider,
    detail,
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
    action: auditAction,
    resource: 'notification_outbox',
    metadata: {
      id: item.id,
      channel,
      eventType,
      subject,
      status,
      provider,
      to,
      detail: detail.slice(0, 240),
    },
  });

  return json({
    ...item,
    message: detail,
  });
};
