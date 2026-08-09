/**
 * Pages Function: POST /api/v1/orgs/me/agents-webhook-trigger
 *
 * Webhook trigger entry point: fire a webhook event → find matching agent
 * subscriptions → evaluate conditions → score confidence → create executions.
 *
 * Called by:
 *   - Connector sync complete/failed events
 *   - External webhook sources
 *   - Manual test from UI
 *
 * Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

// ─── Inline condition evaluator (mirrors agents.service.ts) ───────────────────

type Condition = {
  field?: string;
  op?: string;
  value?: unknown;
  and?: Condition[];
  or?: Condition[];
};

function evalCondition(condition: unknown, context: Record<string, unknown>): boolean {
  if (!condition || typeof condition !== 'object') return true;
  const cond = condition as Condition;

  if (Array.isArray(cond.and)) return cond.and.every((c) => evalCondition(c, context));
  if (Array.isArray(cond.or))  return cond.or.some((c) => evalCondition(c, context));

  const { field, op, value } = cond;
  if (!field || !op) return true;
  const actual = context[field];

  switch (op) {
    case 'eq':       return actual === value;
    case 'neq':      return actual !== value;
    case 'gt':       return Number(actual) > Number(value);
    case 'gte':      return Number(actual) >= Number(value);
    case 'lt':       return Number(actual) < Number(value);
    case 'lte':      return Number(actual) <= Number(value);
    case 'contains': return typeof actual === 'string' && actual.toLowerCase().includes(String(value).toLowerCase());
    case 'in':       return Array.isArray(value) && value.includes(actual);
    default:         return true;
  }
}

function scoreConfidence(
  action: Record<string, unknown>,
  context: Record<string, unknown>,
): number {
  const actionType = String(action?.type || '');
  const base: Record<string, number> = {
    notify: 0.95, escalate: 0.90, auto_approve: 0.80,
    reorder: 0.70, campaign: 0.65, custom: 0.60,
  };
  let score = base[actionType] ?? 0.70;
  if (context.ellineaRecommended === true) score += 0.05;
  if (Number(context.historicalSuccessRate) > 0.9) score += 0.05;
  if (context.amount && Number(context.amount) < 500) score += 0.03;
  return Math.min(1.0, score);
}

function cuid() { return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }
function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>) : {};
}

type AgentRecord = {
  id: string; name: string; trigger: string;
  condition: unknown; action: Record<string, unknown>;
  confidenceThreshold: number; requireApproval: boolean;
  isActive: boolean; isPaused: boolean;
  executionCount: number; successCount: number;
  lastExecutedAt: string | null; createdBy: string;
  createdAt: string; updatedAt: string;
};

type SubscriptionRecord = {
  id: string; agentId: string; eventSource: string;
  eventSourceId: string | null; eventType: string;
  filter: Record<string, unknown> | null;
  isActive: boolean;
};

type ExecutionRecord = {
  id: string; agentId: string; agentName: string;
  triggeredBy: string; triggerPayload: Record<string, unknown>;
  confidence: number; reasoning: string;
  recommendedAction: string; status: string;
  requiresApproval: boolean;
  executedAt: string | null; createdAt: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: {
    eventSource?: string;
    eventSourceId?: string | null;
    eventType?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const eventSource = (body.eventSource || '').trim();
  const eventType = (body.eventType || '').trim();

  if (!eventSource || !eventType) {
    return json(
      { statusCode: 400, message: 'eventSource and eventType are required' },
      400,
    );
  }

  const supabase = getAdminClient(context.env);
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);

  // Find matching subscriptions
  const subscriptions: SubscriptionRecord[] = (
    (settings.agentWebhookSubscriptions as SubscriptionRecord[] | undefined) ?? []
  ).filter(
    (s) =>
      s &&
      s.isActive &&
      s.eventSource === eventSource &&
      (!s.eventSourceId || s.eventSourceId === (body.eventSourceId || null)) &&
      s.eventType === eventType,
  );

  if (!subscriptions.length) {
    return json({
      triggered: 0,
      executions: [],
      message: `No active subscriptions for ${eventSource}:${eventType}`,
    });
  }

  const ctx: Record<string, unknown> = { ...asObj(body.payload), eventSource, eventSourceId: body.eventSourceId, eventType };
  const agents: AgentRecord[] = ((settings.ellineaAgents as AgentRecord[] | undefined) ?? []);
  const newExecutions: ExecutionRecord[] = [];
  const updatedAgents = [...agents];

  for (const sub of subscriptions) {
    const agent = agents.find((a) => a.id === sub.agentId);
    if (!agent || !agent.isActive || agent.isPaused) continue;

    // Check filters
    if (sub.filter && typeof sub.filter === 'object') {
      let filterMatch = true;
      for (const [key, value] of Object.entries(sub.filter)) {
        if (ctx[key] !== value) {
          filterMatch = false;
          break;
        }
      }
      if (!filterMatch) continue;
    }

    if (!evalCondition(agent.condition, ctx)) continue;

    const score = scoreConfidence(agent.action, ctx);
    const requiresApproval = agent.requireApproval || score < agent.confidenceThreshold;

    const execution: ExecutionRecord = {
      id: cuid(),
      agentId: agent.id,
      agentName: agent.name,
      triggeredBy: `${eventSource}:${eventType}`,
      triggerPayload: asObj(body.payload),
      confidence: score,
      reasoning: `Webhook triggered by ${eventSource}:${eventType}. Confidence: ${(score * 100).toFixed(0)}%.`,
      recommendedAction: String(agent.action?.type ?? 'act'),
      status: requiresApproval ? 'pending' : 'executed',
      requiresApproval,
      executedAt: requiresApproval ? null : new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    newExecutions.push(execution);

    // Update agent stats
    const idx = updatedAgents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      updatedAgents[idx] = {
        ...updatedAgents[idx],
        executionCount: updatedAgents[idx].executionCount + 1,
        ...(!requiresApproval ? { successCount: updatedAgents[idx].successCount + 1 } : {}),
        lastExecutedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (!newExecutions.length) {
    return json({ triggered: 0, executions: [], message: 'No subscriptions matched conditions' });
  }

  // Persist executions + updated agent stats
  const executions: ExecutionRecord[] = [
    ...newExecutions,
    ...((settings.agentExecutions as ExecutionRecord[] | undefined) ?? []),
  ].slice(0, 200);

  const nextSettings = {
    ...settings,
    ellineaAgents: updatedAgents,
    agentExecutions: executions,
  };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);

  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  // Audit logs
  for (const exec of newExecutions) {
    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'agent.webhook_triggered',
      resource: 'ellinea_agent',
      metadata: {
        agentId: exec.agentId,
        agentName: exec.agentName,
        executionId: exec.id,
        eventSource,
        eventType,
        confidence: exec.confidence,
        requiresApproval: exec.requiresApproval,
      },
    });
  }

  return json({ triggered: newExecutions.length, executions: newExecutions });
};
