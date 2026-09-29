import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';

/**
 * GET /api/v1/dashboards/attention
 * Aggregates attention items for the authenticated user's org.
 * Sources: connector_installations (ERROR/DEGRADED), approval_requests (pending in scope).
 * All items scoped to auth.organizationId — cross-tenant reads are a critical defect.
 * Requirements: 6.1–6.6
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const items: AttentionItemDto[] = [];

  // ── Failed / degraded connectors ──────────────────────────────────────────
  const { data: connectors } = await supabase
    .from('connector_installations')
    .select('id, display_name, status, last_message, updated_at')
    .eq('organization_id', auth.organizationId)
    .in('status', ['error', 'degraded']);

  for (const c of connectors ?? []) {
    items.push({
      id: `connector-${c.id as string}`,
      severity: c.status === 'error' ? 'critical' : 'high',
      category: 'connector_failure',
      sourceConnectorId: c.id as string,
      affectedEntity: c.display_name as string,
      evidence: (c.last_message as string | null) ?? `Connector is in ${c.status as string} state`,
      detectedAt: (c.updated_at as string | null) ?? new Date().toISOString(),
      availableAction: 'investigate',
      recurrence: false,
    });
  }

  // ── Pending approvals in user scope ────────────────────────────────────────
  const { data: approvals } = await supabase
    .from('approval_requests')
    .select('id, title, created_at')
    .eq('organization_id', auth.organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  for (const a of approvals ?? []) {
    items.push({
      id: `approval-${a.id as string}`,
      severity: 'medium',
      category: 'pending_approval',
      sourceConnectorId: null,
      affectedEntity: a.title as string,
      evidence: 'Approval is pending your action',
      detectedAt: a.created_at as string,
      availableAction: 'approve',
      recurrence: false,
    });
  }

  // Sort by severity
  const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));

  return json({ items });
};

interface AttentionItemDto {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  sourceConnectorId: string | null;
  affectedEntity: string;
  evidence: string;
  detectedAt: string;
  availableAction: 'view' | 'approve' | 'investigate' | 'dismiss';
  recurrence: boolean;
}
