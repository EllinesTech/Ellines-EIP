import { mergeOrganizationSettings } from '@ellines-eip/shared';
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

function maskSecret(secret: string): string {
  if (secret.length <= 10) return '••••••••';
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`;
}

function newWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `eipwh_${hex}`;
}

/**
 * Owner/IT: view (masked) or rotate org webhook secret for System B pushes.
 * GET  → { configured, secretPreview, endpoint }
 * POST → rotates and returns full secret once
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const supabase = getAdminClient(context.env);
  const endpoint = '/api/v1/webhooks/enterprise';

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
    const secret =
      typeof settings.webhookSecret === 'string' ? settings.webhookSecret.trim() : '';
    return json({
      configured: Boolean(secret),
      secretPreview: secret ? maskSecret(secret) : null,
      organizationId: auth.organizationId,
      endpoint,
      headers: {
        'X-EIP-Organization-Id': auth.organizationId,
        'X-EIP-Webhook-Secret': '(your secret)',
      },
    });
  }

  if (context.request.method === 'POST') {
    const { data: existing, error: readErr } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

    const secret = newWebhookSecret();
    const nextSettings = mergeOrganizationSettings(existing?.settings, {
      webhookSecret: secret,
      webhookSecretRotatedAt: new Date().toISOString(),
    });
    const { error: writeErr } = await supabase
      .from('organizations')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId);
    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'webhook.secret.rotate',
      resource: 'organization',
      metadata: { endpoint },
    });

    return json({
      configured: true,
      secret,
      secretPreview: maskSecret(secret),
      organizationId: auth.organizationId,
      endpoint,
      message: 'Webhook secret rotated. Copy it now — full value is shown only once.',
    });
  }

  return json({ message: 'Method not allowed' }, 405);
};
