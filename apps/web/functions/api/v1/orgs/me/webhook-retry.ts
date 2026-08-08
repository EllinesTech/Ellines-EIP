import { mergeOrganizationSettings } from '@ellines-eip/shared';
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

/**
 * POST /api/v1/orgs/me/webhook-retry
 * Retries a failed webhook delivery by its ID.
 * Body: { deliveryId: string }
 *
 * Retry policy (exponential backoff):
 *   attempt 1 → immediate
 *   attempt 2 → 1 min
 *   attempt 3 → 5 min
 *   attempt 4 → 30 min
 *   attempt 5 → 2 hours
 *   max 5 attempts, then mark permanently_failed
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const raw = await context.request.json();
    body = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const deliveryId =
    typeof body.deliveryId === 'string' ? body.deliveryId.trim() : '';
  if (!deliveryId) {
    return json({ statusCode: 400, message: 'deliveryId is required' }, 400);
  }

  const supabase = getAdminClient(context.env);
  const { data: orgData, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const existing =
    orgData?.settings && typeof orgData.settings === 'object' && !Array.isArray(orgData.settings)
      ? (orgData.settings as Record<string, unknown>)
      : {};

  const deliveryLog: DeliveryLog[] = Array.isArray(existing.webhookDeliveryLog)
    ? (existing.webhookDeliveryLog as DeliveryLog[])
    : [];

  const idx = deliveryLog.findIndex((d) => d.id === deliveryId);
  if (idx === -1) {
    return json({ statusCode: 404, message: 'Delivery not found' }, 404);
  }

  const original = deliveryLog[idx];

  if (original.status === 'success') {
    return json({ statusCode: 400, message: 'Delivery already succeeded — no retry needed' }, 400);
  }

  const MAX_ATTEMPTS = 5;
  if (original.attempt >= MAX_ATTEMPTS) {
    return json(
      {
        statusCode: 400,
        message: `Maximum retry attempts (${MAX_ATTEMPTS}) reached. Delivery permanently failed.`,
      },
      400,
    );
  }

  // Re-send
  const retryAt = new Date().toISOString();
  const retryPayload = {
    id: deliveryId,
    event: original.event,
    organizationId: auth.organizationId,
    timestamp: retryAt,
    attempt: original.attempt + 1,
    data: {
      message: 'Retry delivery from Ellines EIP.',
      source: 'eip-webhook-retry',
      originalDeliveredAt: original.deliveredAt,
    },
  };

  const payloadStr = JSON.stringify(retryPayload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EIP-Delivery': deliveryId,
    'X-EIP-Event': original.event,
    'X-EIP-Organization-Id': auth.organizationId,
    'X-EIP-Attempt': String(original.attempt + 1),
    'User-Agent': 'Ellines-EIP-Webhook/1.0',
  };

  // Attempt to get webhook secret for HMAC signing
  const secret =
    typeof (existing as Record<string, unknown>).webhookSecret === 'string'
      ? ((existing as Record<string, unknown>).webhookSecret as string)
      : '';

  if (secret) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
      headers['X-EIP-Signature'] = `sha256=${Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;
    } catch {
      // non-fatal
    }
  }

  const startMs = Date.now();
  let statusCode: number | null = null;
  let responseBody = '';
  let errorMsg: string | null = null;
  let success = false;

  try {
    const res = await fetch(original.webhookUrl, {
      method: 'POST',
      headers,
      body: payloadStr,
      // @ts-ignore — Cloudflare Workers supports this
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    responseBody = await res.text().then((t) => t.slice(0, 500));
    success = res.ok;
    if (!success) errorMsg = `HTTP ${statusCode}: ${responseBody.slice(0, 200)}`;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Network error';
  }

  const latencyMs = Date.now() - startMs;
  const newAttempt = original.attempt + 1;

  // Calculate next retry delay (exponential backoff in minutes): 1, 5, 30, 120
  const backoffMinutes = [1, 5, 30, 120];
  const nextRetryAt =
    !success && newAttempt < MAX_ATTEMPTS
      ? new Date(
          Date.now() + (backoffMinutes[newAttempt - 1] ?? 120) * 60 * 1000,
        ).toISOString()
      : null;

  // Update the log entry
  const updated: DeliveryLog = {
    ...original,
    status: success ? 'success' : newAttempt >= MAX_ATTEMPTS ? 'permanently_failed' : 'failure',
    statusCode,
    latencyMs,
    attempt: newAttempt,
    nextRetryAt,
    error: errorMsg,
    deliveredAt: retryAt,
  };

  deliveryLog[idx] = updated;
  const trimmed = deliveryLog.slice(0, 200);

  const nextSettings = mergeOrganizationSettings(orgData?.settings, {
    webhookDeliveryLog: trimmed,
  });

  await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'webhook.retry',
    resource: 'webhook',
    metadata: {
      deliveryId,
      webhookUrl: original.webhookUrl,
      event: original.event,
      attempt: newAttempt,
      success,
      statusCode,
      latencyMs,
    },
  });

  return json({
    deliveryId,
    webhookUrl: original.webhookUrl,
    event: original.event,
    success,
    statusCode,
    latencyMs,
    attempt: newAttempt,
    nextRetryAt,
    error: errorMsg,
    deliveredAt: retryAt,
    message: success
      ? `Retry #${newAttempt} succeeded.`
      : newAttempt >= MAX_ATTEMPTS
        ? `Retry #${newAttempt} failed. Max attempts reached — delivery permanently failed.`
        : `Retry #${newAttempt} failed. Next retry scheduled at ${nextRetryAt}.`,
  });
};

interface DeliveryLog {
  id: string;
  webhookId: string;
  webhookUrl: string;
  event: string;
  status: 'success' | 'failure' | 'pending' | 'permanently_failed';
  statusCode: number | null;
  latencyMs: number | null;
  attempt: number;
  nextRetryAt: string | null;
  error: string | null;
  deliveredAt: string;
}
