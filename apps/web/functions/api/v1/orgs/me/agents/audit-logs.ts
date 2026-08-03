/**
 * Pages Function: GET /api/v1/orgs/me/agents/audit-logs?agentId=...&limit=50
 *
 * Fetch agent-specific audit logs (creation, execution, approval, rollback, etc.).
 * Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';

type AuditLogRecord = {
  id: string;
  agentId: string;
  organizationId: string;
  userId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const url = new URL(context.request.url);
  const agentId = url.searchParams.get('agentId');
  const limitStr = url.searchParams.get('limit') || '50';

  if (!agentId) {
    return json({ statusCode: 400, message: 'agentId query param is required' }, 400);
  }

  const limit = Math.min(Number(limitStr) || 50, 200);

  const supabase = getAdminClient(context.env);

  // Get agent to verify ownership
  const { data: agent, error: agentErr } = await supabase
    .from('ellinea_agents')
    .select('id, name')
    .eq('id', agentId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (agentErr || !agent) {
    return json({ statusCode: 404, message: 'Agent not found' }, 404);
  }

  // Fetch audit logs for the agent
  const { data: logs, error } = await supabase
    .from('agent_audit_logs')
    .select('*')
    .eq('agent_id', agentId)
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  // Transform to DTO format
  const audits = (logs || []).map((row: any) => ({
    id: row.id,
    agentId: row.agent_id,
    agentName: agent.name,
    userId: row.user_id,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  }));

  return json({ agentId, agentName: agent.name, audits, total: audits.length });
};
