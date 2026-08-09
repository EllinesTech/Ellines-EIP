/**
 * Dev Pages API: GET /api/v1/orgs/me/webhook-deliveries
 * Pages Router API routes are IGNORED during static export builds.
 * This only runs locally — production uses the real Cloudflare Pages Function.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth, isOrgAdmin } from '../../../../../lib/dev-auth';

interface WebhookDelivery {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'GET') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;
  if (!isOrgAdmin(auth.role)) { devJson(res, { statusCode: 403, message: 'Admins only' }, 403); return; }

  const rawLimit = parseInt((req.query.limit as string) ?? '50', 10);
  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const statusFilter = (req.query.status as string) ?? '';
  const webhookIdFilter = (req.query.webhookId as string) ?? '';

  const supabase = getDevSupabase();
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (error) { devJson(res, { statusCode: 500, message: error.message }, 500); return; }

  const settings =
    data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? (data.settings as Record<string, unknown>)
      : {};

  let deliveries: WebhookDelivery[] = Array.isArray(settings.webhookDeliveryLog)
    ? (settings.webhookDeliveryLog as WebhookDelivery[])
    : [];

  if (statusFilter && ['success', 'failure', 'pending'].includes(statusFilter)) {
    deliveries = deliveries.filter((d) => d.status === statusFilter);
  }
  if (webhookIdFilter) {
    deliveries = deliveries.filter((d) => d.webhookId === webhookIdFilter);
  }

  deliveries.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());
  deliveries = deliveries.slice(0, limit);

  const successCount = deliveries.filter((d) => d.status === 'success').length;
  const failureCount = deliveries.filter((d) => d.status === 'failure').length;

  devJson(res, { deliveries, total: deliveries.length, successCount, failureCount, limit });
}
