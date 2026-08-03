/**
 * Pages Function: GET/PATCH/DELETE /api/v1/orgs/me/agents/:id
 * 
 * Single agent operations.
 * Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  const agentId = context.params.id as string;
  if (!agentId) {
    return json({ statusCode: 400, message: 'Agent ID required' }, 400);
  }

  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);
  const agents = normalizeAgents(settings.ellineaAgents);
  const agent = agents.find((a) => a.id === agentId);

  // ── GET: single agent ──────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    if (!agent) {
      return json({ statusCode: 404, message: 'Agent not found' }, 404);
    }
    return json(agent);
  }

  // ── PATCH: update agent ────────────────────────────────────────────────────
  if (context.request.method === 'PATCH') {
    if (!agent) {
      return json({ statusCode: 404, message: 'Agent not found' }, 404);
    }

    let body: Partial<{
      name: string;
      description: string;
      triggerConfig: Record<string, unknown>;
      condition: Record<string, unknown>;
      action: Record<string, unknown>;
      confidenceThreshold: number;
      requireApproval: boolean;
      isActive: boolean;
      isPaused: boolean;
    }>;
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const updated = {
      ...agent,
      ...(body.name && { name: body.name.trim().slice(0, 120) }),
      ...(body.description !== undefined && {
        description: body.description.trim().slice(0, 500),
      }),
      ...(body.triggerConfig && { triggerConfig: body.triggerConfig }),
      ...(body.condition && { condition: body.condition }),
      ...(body.action && { action: body.action }),
      ...(body.confidenceThreshold !== undefined && {
        confidenceThreshold: body.confidenceThreshold,
      }),
      ...(body.requireApproval !== undefined && {
        requireApproval: body.requireApproval,
      }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.isPaused !== undefined && { isPaused: body.isPaused }),
      updatedAt: new Date().toISOString(),
    };

    const nextAgents = agents.map((a) => (a.id === agentId ? updated : a));
    const nextSettings = { ...settings, ellineaAgents: nextAgents };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({
        settings: nextSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.organizationId);

    if (writeErr)
      return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'agent.updated',
      resource: 'ellinea_agent',
      metadata: { id: agentId, changes: body },
    });

    return json(updated);
  }

  // ── DELETE: remove agent ───────────────────────────────────────────────────
  if (context.request.method === 'DELETE') {
    if (!agent) {
      return json({ statusCode: 404, message: 'Agent not found' }, 404);
    }

    const nextAgents = agents.filter((a) => a.id !== agentId);
    const nextSettings = { ...settings, ellineaAgents: nextAgents };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({
        settings: nextSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.organizationId);

    if (writeErr)
      return json({ statusCode: 500, message: writeErr.message }, 500);

    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'agent.deleted',
      resource: 'ellinea_agent',
      metadata: { id: agentId, name: agent.name },
    });

    return json({ ok: true });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};

type AgentRecord = {
  id: string;
  name: string;
  description: string;
  templateId: string | null;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  confidenceThreshold: number;
  requireApproval: boolean;
  isActive: boolean;
  isPaused: boolean;
  executionCount: number;
  successCount: number;
  lastExecutedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeAgents(raw: unknown): AgentRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as AgentRecord[])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .slice(0, 50);
}

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
