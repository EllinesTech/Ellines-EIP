/**
 * Pages Function: GET/POST /api/v1/orgs/me/agents
 * 
 * Ellinea Agent CRUD endpoints.
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

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  const supabase = getAdminClient(context.env);

  // ── GET: list agents ───────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    // For MVP: store agents in org settings JSON
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    const settings = asObj(data?.settings);
    const agents = normalizeAgents(settings.ellineaAgents);

    return json(agents);
  }

  // ── POST: create agent ─────────────────────────────────────────────────────
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: {
    name?: string;
    description?: string;
    templateId?: string;
    trigger?: string;
    triggerConfig?: Record<string, unknown>;
    condition?: Record<string, unknown>;
    action?: Record<string, unknown>;
    confidenceThreshold?: number;
    requireApproval?: boolean;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const name = (body.name || '').trim();
  if (!name || name.length < 3) {
    return json(
      { statusCode: 400, message: 'name must be at least 3 characters' },
      400,
    );
  }

  if (!body.trigger) {
    return json({ statusCode: 400, message: 'trigger is required' }, 400);
  }

  if (!body.action || typeof body.action !== 'object') {
    return json({ statusCode: 400, message: 'action is required' }, 400);
  }

  const newAgent: AgentRecord = {
    id: cuid(),
    name: name.slice(0, 120),
    description: (body.description || '').trim().slice(0, 500),
    templateId: body.templateId || null,
    trigger: body.trigger,
    triggerConfig: body.triggerConfig || {},
    condition: body.condition || {},
    action: body.action,
    confidenceThreshold: body.confidenceThreshold ?? 0.7,
    requireApproval: body.requireApproval ?? false,
    isActive: true,
    isPaused: false,
    executionCount: 0,
    successCount: 0,
    lastExecutedAt: null,
    createdBy: auth.email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const agents = normalizeAgents(settings.ellineaAgents);
  const next = [newAgent, ...agents].slice(0, 50);
  const nextSettings = { ...settings, ellineaAgents: next };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);

  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'agent.created',
    resource: 'ellinea_agent',
    metadata: { id: newAgent.id, name: newAgent.name, trigger: newAgent.trigger },
  });

  return json(newAgent, 201);
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

function cuid(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
