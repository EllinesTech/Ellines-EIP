/**
 * Pages Function: POST /api/v1/orgs/me/agents/:id/execute
 * 
 * Execute an agent (manual trigger).
 * Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

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

  if (!agent) {
    return json({ statusCode: 404, message: 'Agent not found' }, 404);
  }

  if (!agent.isActive) {
    return json({ statusCode: 400, message: 'Agent is inactive' }, 400);
  }

  if (agent.isPaused) {
    return json({ statusCode: 400, message: 'Agent is paused' }, 400);
  }

  let body: {
    triggeredBy?: string;
    triggerPayload?: Record<string, unknown>;
    confidence?: number;
    reasoning?: Record<string, unknown>;
    recommendedAction?: string;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    body = {};
  }

  const confidence = body.confidence ?? 0.5;
  const requiresApproval =
    agent.requireApproval || confidence < agent.confidenceThreshold;

  const execution: ExecutionRecord = {
    id: cuid(),
    agentId: agent.id,
    triggeredBy: body.triggeredBy || 'manual',
    triggerPayload: body.triggerPayload || null,
    confidence,
    reasoning: body.reasoning || null,
    recommendedAction: body.recommendedAction || null,
    status: requiresApproval ? 'pending' : 'executed',
    requiresApproval,
    humanApprovalBy: null,
    humanApprovalAt: null,
    humanNote: null,
    executedAt: requiresApproval ? null : new Date().toISOString(),
    executionResult: null,
    executionError: null,
    canRollback: false,
    rolledBackAt: null,
    rolledBackBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Update agent stats
  const updatedAgent = {
    ...agent,
    executionCount: agent.executionCount + 1,
    ...(requiresApproval ? {} : { successCount: agent.successCount + 1 }),
    lastExecutedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const nextAgents = agents.map((a) => (a.id === agentId ? updatedAgent : a));

  // Store execution in settings
  const executions = normalizeExecutions(settings.agentExecutions);
  const nextExecutions = [execution, ...executions].slice(0, 100);

  const nextSettings = {
    ...settings,
    ellineaAgents: nextAgents,
    agentExecutions: nextExecutions,
  };

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
    action: 'agent.executed',
    resource: 'ellinea_agent',
    metadata: {
      agentId,
      executionId: execution.id,
      confidence,
      requiresApproval,
    },
  });

  return json(execution, 201);
};

type ExecutionRecord = {
  id: string;
  agentId: string;
  triggeredBy: string;
  triggerPayload: Record<string, unknown> | null;
  confidence: number;
  reasoning: Record<string, unknown> | null;
  recommendedAction: string | null;
  status: string;
  requiresApproval: boolean;
  humanApprovalBy: string | null;
  humanApprovalAt: string | null;
  humanNote: string | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  executionError: string | null;
  canRollback: boolean;
  rolledBackAt: string | null;
  rolledBackBy: string | null;
  createdAt: string;
  updatedAt: string;
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

function normalizeExecutions(raw: unknown): ExecutionRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ExecutionRecord[])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .slice(0, 100);
}

function cuid(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
