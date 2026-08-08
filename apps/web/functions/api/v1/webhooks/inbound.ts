/**
 * Inbound Webhook Receiver — POST /api/v1/webhooks/inbound
 *
 * Accepts webhooks from external systems with:
 * - HMAC-SHA256 signature verification
 * - Replay attack prevention (timestamp validation)
 * - Automatic UEM normalization
 * - Audit logging
 *
 * External systems configure a webhook pointing to:
 *   https://eip.ellines.co.ke/api/v1/webhooks/inbound
 *
 * Required headers from sender:
 *   X-Webhook-Signature: sha256=<HMAC-SHA256(body, secret)>
 *   X-Webhook-Timestamp: <unix-timestamp>
 *   X-Webhook-ID: <unique-webhook-id>
 *
 * The org's webhook secret is stored in org settings (webhookSecret field).
 */

import {
  getAdminClient,
  json,
  options,
  auditRow,
  getClientIp,
  type Env,
} from '../../../shared/auth';
import { normalizeEnterprisePayload, toTimelineStorage } from '../../../shared/connectors';

/** Maximum age of webhook in seconds (5 minutes) */
const MAX_WEBHOOK_AGE_SECONDS = 300;

/** Minimum webhook body size (1 byte) */
const MIN_BODY_SIZE = 1;

/** Maximum webhook body size (1 MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Verify HMAC-SHA256 signature in constant time
 */
async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const receivedSig = signature.slice(7); // Remove 'sha256=' prefix

  // Compute expected signature
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(body);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
  const expectedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (expectedSig.length !== receivedSig.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ receivedSig.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Check if webhook ID has been seen before (replay attack prevention)
 */
async function isWebhookReplay(
  env: Env,
  webhookId: string,
): Promise<boolean> {
  const supabase = getAdminClient(env);

  const { data } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('action', 'webhook.inbound.received')
    .eq('metadata->webhookId', webhookId)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const supabase = getAdminClient(context.env);

  // Extract headers
  const signature = context.request.headers.get('X-Webhook-Signature') || '';
  const timestamp = context.request.headers.get('X-Webhook-Timestamp') || '';
  const webhookId = context.request.headers.get('X-Webhook-ID') || '';
  const sourceSystem = context.request.headers.get('X-Source-System') || 'Unknown';

  // Read raw body
  const rawBody = await context.request.text();

  // Validate body size
  if (rawBody.length < MIN_BODY_SIZE || rawBody.length > MAX_BODY_SIZE) {
    return json(
      {
        statusCode: 413,
        message: `Webhook body must be between ${MIN_BODY_SIZE} and ${MAX_BODY_SIZE} bytes`,
      },
      413,
    );
  }

  // Extract org from webhook path or body
  // Expected URL: /api/v1/webhooks/inbound?org=<org-slug>
  const url = new URL(context.request.url);
  const orgSlug = url.searchParams.get('org');

  if (!orgSlug) {
    return json(
      {
        statusCode: 400,
        message: 'Organization slug is required in query parameter: ?org=your-org',
      },
      400,
    );
  }

  // Lookup organization
  const { data: org } = await supabase
    .from('organizations')
    .select('id, settings')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (!org) {
    return json({ statusCode: 404, message: 'Organization not found' }, 404);
  }

  const organizationId = org.id as string;
  const settings = (org.settings || {}) as Record<string, unknown>;
  const webhookSecret = (settings.webhookSecret as string) || '';

  // Validate webhook secret exists
  if (!webhookSecret) {
    return json(
      {
        statusCode: 403,
        message: 'Webhook secret not configured for this organization',
      },
      403,
    );
  }

  // Validate timestamp (replay attack prevention)
  if (!timestamp) {
    return json(
      { statusCode: 400, message: 'X-Webhook-Timestamp header is required' },
      400,
    );
  }

  const webhookTime = parseInt(timestamp, 10);
  if (isNaN(webhookTime)) {
    return json(
      { statusCode: 400, message: 'Invalid X-Webhook-Timestamp format' },
      400,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - webhookTime;

  if (age > MAX_WEBHOOK_AGE_SECONDS) {
    return json(
      {
        statusCode: 400,
        message: `Webhook is too old (${age}s, max ${MAX_WEBHOOK_AGE_SECONDS}s)`,
      },
      400,
    );
  }

  if (age < -60) {
    // Allow 1 minute clock skew
    return json(
      { statusCode: 400, message: 'Webhook timestamp is in the future' },
      400,
    );
  }

  // Validate webhook ID (replay attack prevention)
  if (!webhookId) {
    return json(
      { statusCode: 400, message: 'X-Webhook-ID header is required' },
      400,
    );
  }

  const isReplay = await isWebhookReplay(context.env, webhookId);
  if (isReplay) {
    return json(
      { statusCode: 409, message: 'Webhook ID has already been processed (replay attack)' },
      409,
    );
  }

  // Verify signature
  if (!signature) {
    return json(
      { statusCode: 401, message: 'X-Webhook-Signature header is required' },
      401,
    );
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId,
        userId: null,
        action: 'webhook.inbound.invalid_signature',
        resource: 'webhook',
        metadata: { webhookId, sourceSystem, signatureProvided: Boolean(signature) },
        ip,
      })
    );

    return json(
      { statusCode: 401, message: 'Invalid webhook signature' },
      401,
    );
  }

  // Parse body
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    // Non-JSON body — wrap in envelope
    parsedBody = {
      rawData: rawBody.slice(0, 1000),
      briefHighlight: `Webhook from ${sourceSystem}`,
      timeline: [{ title: 'Webhook received', detail: `Non-JSON payload from ${sourceSystem}` }],
    };
  }

  // Normalize into UEM
  const payload = normalizeEnterprisePayload(parsedBody);

  // Update enterprise snapshot
  const syncedAt = new Date().toISOString();
  const packedTimeline = toTimelineStorage(payload);

  const snapshotRow = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    connector_id: `webhook-${sourceSystem.toLowerCase().replace(/\s+/g, '-')}`,
    connector_name: `Webhook: ${sourceSystem}`,
    health_score: payload.healthScore,
    connected_systems: Math.max(payload.connectedSystems, 1),
    open_alerts: payload.openAlerts,
    open_decisions: payload.openDecisions,
    brief_highlight: payload.briefHighlight || `Webhook update from ${sourceSystem}`,
    timeline: packedTimeline,
    synced_at: syncedAt,
    created_at: syncedAt,
    updated_at: syncedAt,
  };

  const { data: existing } = await supabase
    .from('enterprise_snapshots')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('enterprise_snapshots')
      .update({
        connector_id: snapshotRow.connector_id,
        connector_name: snapshotRow.connector_name,
        health_score: snapshotRow.health_score,
        connected_systems: snapshotRow.connected_systems,
        open_alerts: snapshotRow.open_alerts,
        open_decisions: snapshotRow.open_decisions,
        brief_highlight: snapshotRow.brief_highlight,
        timeline: snapshotRow.timeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('enterprise_snapshots').insert(snapshotRow);
  }

  // Audit log
  const ip = getClientIp(context.request);
  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId,
      userId: null,
      action: 'webhook.inbound.received',
      resource: 'webhook',
      metadata: {
        webhookId,
        sourceSystem,
        timestamp: webhookTime,
        age,
        healthScore: payload.healthScore,
      },
      ip,
    })
  );

  return json({
    ok: true,
    message: 'Webhook received and processed',
    webhookId,
    timestamp: syncedAt,
  });
};
