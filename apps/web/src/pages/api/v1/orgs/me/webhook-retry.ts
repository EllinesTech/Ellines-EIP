/**
 * Dev Pages API: POST /api/v1/orgs/me/webhook-retry
 * Pages Router API routes are IGNORED during static export builds.
 * This only runs locally — production uses the real Cloudflare Pages Function.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth, isOrgAdmin } from '../../../../../lib/dev-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'POST') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const { deliveryId } = req.body || {};
  if (!deliveryId) { devJson(res, { statusCode: 400, message: 'deliveryId is required' }, 400); return; }

  const supabase = getDevSupabase();
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (error) { devJson(res, { statusCode: 500, message: error.message }, 500); return; }

  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const log = Array.isArray(settings.webhookDeliveryLog)
    ? (settings.webhookDeliveryLog as Array<{ id: string; status: string; attempt: number; deliveredAt: string }>)
    : [];

  const entry = log.find((d) => d.id === deliveryId);
  if (!entry) { devJson(res, { statusCode: 404, message: 'Delivery not found' }, 404); return; }

  // Mark as retried in local dev (no actual HTTP call — full impl in Pages Function)
  entry.status = 'pending';
  entry.attempt = (entry.attempt ?? 1) + 1;
  entry.deliveredAt = new Date().toISOString();

  await supabase
    .from('organizations')
    .update({ settings: { ...settings, webhookDeliveryLog: log }, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);

  devJson(res, { ok: true, deliveryId, message: 'Retry queued (local dev — no actual HTTP call)' });
}
