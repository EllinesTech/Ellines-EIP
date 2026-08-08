import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

/**
 * GET  /api/v1/orgs/me/webhook-deliveries
 * Returns delivery logs for the org's outbound webhooks.
 * Query params:
 *   ?limit=50   (default 50, max 200)
 *   ?status=success|failure|pending
 *   ?webhookId= filter by specific webhook config id
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const statusFilter = url.searchParams.get('status') ?? '';
  const webhookIdFilter = url.searchParams.get('webhookId') ?? '';

  const supabase = getAdminClient(context.env);

  // Deliveries are stored in org settings under webhookDeliveryLog[]
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

  let deliveries: WebhookDelivery[] = Array.isArray(settings.webhookDeliveryLog)
    ? (settings.webhookDeliveryLog as WebhookDelivery[])
    : [];

  // Filter
  if (statusFilter && ['success', 'failure', 'pending'].includes(statusFilter)) {
    deliveries = deliveries.filter((d) => d.status === statusFilter);
  }
  if (webhookIdFilter) {
    deliveries = deliveries.filter((d) => d.webhookId === webhookIdFilter);
  }

  // Sort newest first, then limit
  deliveries.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());
  deliveries = deliveries.slice(0, limit);

  const successCount = deliveries.filter((d) => d.status === 'success').length;
  const failureCount = deliveries.filter((d) => d.status === 'failure').length;

  return json({
    deliveries,
    total: deliveries.length,
    successCount,
    failureCount,
    limit,
  });
};

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
