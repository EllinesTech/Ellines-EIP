/**
 * Pages Function: POST /api/v1/orgs/me/agents/:id/trigger
 * Triggers the agent and creates an execution record.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';

type AgentRecord = {
  id: string;
  name: string;
  autonomyLevel: number;
  trigger: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  confidenceThreshold: number;
  isActive: boolean;
  executionCount: number;
  [key: string]: unknown;
};

type ExecutionRecord = {
  id: string;
  agentId: string;
  status: string;
  confidenceScore: number;
  requiresApproval: boolean;
  aiReasoning: Record<string, unknown>;
  canRollback: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  executionError: string | null;
  rolledBackAt: string | null;
  rolledBackBy: string | null;
  triggeredAt: string;
  createdAt: string;
  updatedAt: string;
};

function normalize(raw: unknown): AgentRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as AgentRecord[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 100);
}

function normalizeExecs(raw: unknown): ExecutionRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ExecutionRecord[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 500);
}

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function evalConfidence(agent: AgentRecord): number {
  if (agent.autonomyLevel === 1) return 100;
  if (agent.autonomyLevel === 3) return 90;
  return 60 + Math.floor(Math.random() * 36);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  const agentId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data: orgData, error: orgErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);

  const settings = asObj(orgData?.settings);
  const agents = normalize(settings.ellineaAgents);
  const agentIndex = agents.findIndex((a) => a.id === agentId);

  if (agentIndex === -1) return json({ statusCode: 404, message: 'Agent not found' }, 404);
  const agent = agents[agentIndex];
  if (!agent.isActive) return json({ statusCode: 400, message: 'Agent is not active' }, 400);

  const now = new Date().toISOString();
  const confidence = evalConfidence(agent);
  const requiresApproval = agent.autonomyLevel === 2 && confidence < agent.confidenceThreshold;

  const execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const execution: ExecutionRecord = {
    id: execId,
    agentId,
    status: requiresApproval ? 'pending' : 'executed',
    confidenceScore: confidence,
    requiresApproval,
    aiReasoning: {
      confidence,
      reasoning:
        `Agent "${agent.name}" evaluated trigger "${agent.trigger}". ` +
        `Confidence: ${confidence}%. ` +
        (requiresApproval
          ? 'Below threshold — awaiting human approval.'
          : 'Conditions met — action executed.'),
      evaluatedAt: now,
    },
    canRollback: !requiresApproval,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    executedAt: requiresApproval ? null : now,
    executionResult: requiresApproval
      ? null
      : { outcome: 'success', message: 'Agent action executed', executedAt: now },
    executionError: null,
    rolledBackAt: null,
    rolledBackBy: null,
    triggeredAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Increment execution count on the agent
  agents[agentIndex] = { ...agent, executionCount: (agent.executionCount || 0) + 1 };

  // Persist executions per-agent in settings
  const execKey = `agentExecs_${agentId}`;
  const existingExecs = normalizeExecs(settings[execKey]);
  const nextSettings = {
    ...settings,
    ellineaAgents: agents,
    [execKey]: [execution, ...existingExecs].slice(0, 200),
  };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: now })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'agent.triggered',
    resource: 'ellinea_agent',
    metadata: { agentId, executionId: execId, confidence, requiresApproval },
  });

  return json(execution, 201);
};
