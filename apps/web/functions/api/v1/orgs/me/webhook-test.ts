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
 * POST /api/v1/orgs/me/webhook-test
 * Sends a test delivery to the org's configured webhook URL.
 * Body: { url: string; secret?: string; event?: string }
 *
 * Returns:
 *   { success, statusCode, latencyMs, responseBody, deliveryId }
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

  const webhookUrl =
    typeof body.url === 'string' && body.url.trim() ? body.url.trim() : '';
  if (!webhookUrl) {
    return json({ statusCode: 400, message: 'url is required' }, 400);
  }

  // Validate it looks like an HTTPS URL (insecure HTTP also accepted for local dev)
  try {
    const parsed = new URL(webhookUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return json({ statusCode: 400, message: 'url must be http or https' }, 400);
    }
  } catch {
    return json({ statusCode: 400, message: 'url is not a valid URL' }, 400);
  }

  const secret =
    typeof body.secret === 'string' ? body.secret.trim() : '';
  const event =
    typeof body.event === 'string' && body.event.trim()
      ? body.event.trim().slice(0, 80)
      : 'webhook.test';

  const deliveryId = crypto.randomUUID();
  const deliveredAt = new Date().toISOString();

  // Build a HMAC signature if a secret is provided
  const testPayload = {
    id: deliveryId,
    event,
    organizationId: auth.organizationId,
    timestamp: deliveredAt,
    data: {
      message: 'This is a test delivery from Ellines EIP.',
      source: 'eip-webhook-test',
    },
  };

  const payloadStr = JSON.stringify(testPayload);
  let signature = '';
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
      signature = `sha256=${Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;
    } catch {
      // non-fatal
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EIP-Delivery': deliveryId,
    'X-EIP-Event': event,
    'X-EIP-Organization-Id': auth.organizationId,
    'User-Agent': 'Ellines-EIP-Webhook/1.0',
  };
  if (signature) headers['X-EIP-Signature'] = signature;

  const startMs = Date.now();
  let statusCode: number | null = null;
  let responseBody = '';
  let errorMsg: string | null = null;
  let success = false;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payloadStr,
      // @ts-ignore — Cloudflare Workers supports this
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    responseBody = await res.text().then((t) => t.slice(0, 500));
    success = res.ok;
    if (!success) {
      errorMsg = `HTTP ${statusCode}: ${responseBody.slice(0, 200)}`;
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Network error';
    statusCode = null;
  }

  const latencyMs = Date.now() - startMs;

  // Persist delivery log into org settings
  const supabase = getAdminClient(context.env);
  const { data: orgData } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  const existing =
    orgData?.settings && typeof orgData.settings === 'object' && !Array.isArray(orgData.settings)
      ? (orgData.settings as Record<string, unknown>)
      : {};

  const log: DeliveryLog = {
    id: deliveryId,
    webhookId: 'manual-test',
    webhookUrl,
    event,
    status: success ? 'success' : 'failure',
    statusCode,
    latencyMs,
    attempt: 1,
    nextRetryAt: null,
    error: errorMsg,
    deliveredAt,
  };

  const deliveryLog: DeliveryLog[] = Array.isArray(existing.webhookDeliveryLog)
    ? (existing.webhookDeliveryLog as DeliveryLog[])
    : [];
  // Keep last 200 entries
  deliveryLog.unshift(log);
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
    action: 'webhook.test.delivery',
    resource: 'webhook',
    metadata: {
      deliveryId,
      webhookUrl,
      event,
      success,
      statusCode,
      latencyMs,
    },
  });

  return json({
    deliveryId,
    webhookUrl,
    event,
    success,
    statusCode,
    latencyMs,
    responseBody: responseBody || null,
    error: errorMsg,
    deliveredAt,
    signature: signature || null,
    message: success
      ? 'Test delivery successful.'
      : `Test delivery failed: ${errorMsg ?? `HTTP ${statusCode}`}`,
  });
};

interface DeliveryLog {
  id: string;
  webhookId: string;
  webhookUrl: string;
  event: string;
  status: 'success' | 'failure' | 'pending';
  statusCode: number | null;
  latencyMs: number | null;
  attempt: number;
  nextRetryAt: string | null;
  error: string | null;
  deliveredAt: string;
}
