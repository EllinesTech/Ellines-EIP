import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { normalizePushSubscription, resolveVapidConfig } from '../../../shared/web-push';

type SubMap = Record<string, unknown>;

function readSubMap(settings: Record<string, unknown>): SubMap {
  const raw = settings.notifyPushSubscriptions;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as SubMap) };
  }
  return {};
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const vapid = resolveVapidConfig(context.env);
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
    const map = readSubMap(settings);
    const mine = map[auth.sub];
    const sub = normalizePushSubscription(mine);
    return json({
      vapidConfigured: Boolean(vapid),
      vapidPublicKey: vapid?.publicKey ?? null,
      subscribed: Boolean(sub),
      endpointHost: sub ? new URL(sub.endpoint).host : null,
    });
  }

  if (context.request.method === 'PUT') {
    if (!vapid) {
      return json(
        {
          statusCode: 503,
          message:
            'Web Push not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on Pages.',
        },
        503,
      );
    }
    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const sub = normalizePushSubscription(body);
    if (!sub) {
      return json(
        { statusCode: 400, message: 'Invalid PushSubscription (endpoint + keys.p256dh/auth required)' },
        400,
      );
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
    const map = readSubMap(settings);
    map[auth.sub] = { ...sub, updatedAt: new Date().toISOString() };
    const nextSettings = { ...settings, notifyPushSubscriptions: map };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'notify.push_subscribed',
      resource: 'notification_push',
      metadata: { host: new URL(sub.endpoint).host },
    });

    return json({
      vapidConfigured: true,
      vapidPublicKey: vapid.publicKey,
      subscribed: true,
      endpointHost: new URL(sub.endpoint).host,
    });
  }

  if (context.request.method === 'DELETE') {
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
    const map = readSubMap(settings);
    delete map[auth.sub];
    const nextSettings = { ...settings, notifyPushSubscriptions: map };
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'notify.push_unsubscribed',
      resource: 'notification_push',
      metadata: {},
    });

    return json({
      vapidConfigured: Boolean(vapid),
      vapidPublicKey: vapid?.publicKey ?? null,
      subscribed: false,
      endpointHost: null,
    });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
