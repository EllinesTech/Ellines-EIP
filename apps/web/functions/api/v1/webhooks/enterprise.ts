import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  auditRow,
  getClientIp,
  type Env,
} from '../../../shared/auth';
import {
  normalizeEnterprisePayload,
  toTimelineStorage,
} from '../../../shared/connectors';

/** Maximum age of a webhook payload in seconds (5 minutes) */
const MAX_WEBHOOK_AGE_SECONDS = 300;

/**
 * Verify HMAC-SHA256 signature in constant time.
 * Accepts header value in format: sha256=<hex>
 */
async function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * System B → EIP push (webhooks / events).
 *
 * Auth path A — HMAC webhook secret (preferred for machine-to-machine):
 *   Headers: X-EIP-Organization-Id, X-EIP-Signature (sha256=<hmac>),
 *            X-EIP-Timestamp (unix seconds), X-EIP-Event-Id (idempotency key)
 *
 * Auth path B — Operator JWT (Bearer) for manual test pushes from the console.
 *
 * Legacy path (deprecated): X-EIP-Webhook-Secret plaintext header.
 * Still accepted for backward compatibility but logs a deprecation warning.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  // Read raw body once — needed for HMAC verification before any JSON parse
  const rawBody = await context.request.text();
  if (!rawBody.length) {
    return json({ statusCode: 400, message: 'Empty request body' }, 400);
  }

  const orgHeader      = (context.request.headers.get('x-eip-organization-id') || '').trim();
  const signatureHeader = (context.request.headers.get('x-eip-signature') || '').trim();
  const timestampHeader = (context.request.headers.get('x-eip-timestamp') || '').trim();
  const eventIdHeader   = (context.request.headers.get('x-eip-event-id') || '').trim();
  // Legacy plaintext header (backward compat only)
  const secretHeader   = (context.request.headers.get('x-eip-webhook-secret') || '').trim();

  let organizationId = '';
  let actorUserId: string | null = null;
  let authMode: 'jwt' | 'hmac' | 'legacy-secret' = 'jwt';

  if (orgHeader && (signatureHeader || secretHeader)) {
    const supabase = getAdminClient(context.env);
    const { data, error } = await supabase
      .from('organizations')
      .select('id, settings')
      .eq('id', orgHeader)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const settings =
      data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? (data.settings as Record<string, unknown>)
        : {};
    const storedSecret =
      typeof settings.webhookSecret === 'string' ? settings.webhookSecret.trim() : '';
    if (!data?.id || !storedSecret) {
      return json({ statusCode: 401, message: 'Webhook not configured for this organization' }, 401);
    }

    if (signatureHeader) {
      // ── HMAC path (secure) ────────────────────────────────────────────────
      // Validate timestamp to prevent replay attacks
      if (!timestampHeader) {
        return json({ statusCode: 400, message: 'X-EIP-Timestamp header is required for HMAC auth' }, 400);
      }
      const ts = parseInt(timestampHeader, 10);
      if (!Number.isFinite(ts)) {
        return json({ statusCode: 400, message: 'Invalid X-EIP-Timestamp value' }, 400);
      }
      const ageSecs = Math.floor(Date.now() / 1000) - ts;
      if (ageSecs > MAX_WEBHOOK_AGE_SECONDS) {
        return json({ statusCode: 400, message: `Webhook timestamp too old (${ageSecs}s, max ${MAX_WEBHOOK_AGE_SECONDS}s)` }, 400);
      }
      if (ageSecs < -60) {
        return json({ statusCode: 400, message: 'Webhook timestamp is in the future' }, 400);
      }

      // Check idempotency / replay via event ID
      if (eventIdHeader) {
        const { data: seen } = await supabase
          .from('audit_logs')
          .select('id')
          .eq('action', 'enterprise.webhook')
          .eq('metadata->eventId', eventIdHeader)
          .limit(1)
          .maybeSingle();
        if (seen) {
          return json({ statusCode: 409, message: 'Duplicate event ID — webhook already processed' }, 409);
        }
      }

      // Verify HMAC signature (constant-time)
      const valid = await verifyHmacSignature(rawBody, signatureHeader, storedSecret);
      if (!valid) {
        const ip = getClientIp(context.request);
        await supabase.from('audit_logs').insert(
          auditRow({
            organizationId: data.id as string,
            userId: null,
            action: 'webhook.enterprise.invalid_signature',
            resource: 'webhook',
            metadata: { orgId: orgHeader, signaturePresent: true, eventId: eventIdHeader || null },
            ip,
          }),
        );
        return json({ statusCode: 401, message: 'Invalid webhook signature' }, 401);
      }
      authMode = 'hmac';
    } else {
      // ── Legacy plaintext secret (deprecated) ─────────────────────────────
      if (secretHeader !== storedSecret) {
        return json({ statusCode: 401, message: 'Invalid webhook credentials' }, 401);
      }
      authMode = 'legacy-secret';
      // Log deprecation — caller should migrate to HMAC
      console.warn(`[SECURITY] Organization ${orgHeader} is using deprecated plaintext X-EIP-Webhook-Secret. Migrate to X-EIP-Signature HMAC.`);
    }

    organizationId = data.id as string;
  } else {
    // ── JWT operator auth path ────────────────────────────────────────────
    const auth = await requireAuth(context.env, context.request);
    if (auth instanceof Response) return auth;
    const denied = requireOrgAdmin(auth.role);
    if (denied) return denied;
    organizationId = auth.organizationId;
    actorUserId = auth.sub;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const obj =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const eventType =
    typeof obj.event === 'string' && obj.event.trim()
      ? obj.event.trim().slice(0, 80)
      : 'enterprise.updated';

  const connectorId =
    typeof obj.connectorId === 'string' && obj.connectorId.trim()
      ? obj.connectorId.trim().slice(0, 80)
      : 'webhook';
  const connectorName =
    typeof obj.connectorName === 'string' && obj.connectorName.trim()
      ? obj.connectorName.trim().slice(0, 120)
      : 'System B webhook';

  let payload;
  try {
    payload = normalizeEnterprisePayload(obj.payload ?? obj);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid enterprise payload';
    return json({ statusCode: 400, message }, 400);
  }

  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(context.env);
  const packedTimeline = toTimelineStorage(payload);
  const row = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    connector_id: connectorId,
    connector_name: connectorName,
    health_score: payload.healthScore,
    connected_systems: payload.connectedSystems,
    open_alerts: payload.openAlerts,
    open_decisions: payload.openDecisions,
    brief_highlight: payload.briefHighlight,
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

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from('enterprise_snapshots')
      .update({
        connector_id: connectorId,
        connector_name: connectorName,
        health_score: payload.healthScore,
        connected_systems: payload.connectedSystems,
        open_alerts: payload.openAlerts,
        open_decisions: payload.openDecisions,
        brief_highlight: payload.briefHighlight,
        timeline: packedTimeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id as string));
  } else {
    ({ error } = await supabase.from('enterprise_snapshots').insert(row));
  }

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  await supabase.from('audit_logs').insert(
    auditRow({
      organizationId,
      userId: actorUserId,
      action: 'enterprise.webhook',
      resource: 'enterprise_snapshot',
      metadata: {
        connectorId,
        connectorName,
        healthScore: payload.healthScore,
        eventType,
        authMode,
        eventId: eventIdHeader || null,
        source: 'webhook',
      },
      ip: getClientIp(context.request),
    }),
  );

  return json({
    organizationId,
    event: eventType,
    connectorId,
    connectorName,
    healthScore: payload.healthScore,
    connectedSystems: payload.connectedSystems,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    model: payload.model,
    syncedAt,
    status: 'synced' as const,
    message: 'Webhook event accepted; enterprise snapshot updated.',
  });
};
