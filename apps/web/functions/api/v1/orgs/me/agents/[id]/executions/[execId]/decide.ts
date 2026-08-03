/**
 * Pages Function: POST /api/v1/orgs/me/agents/:id/executions/:execId/decide
 * Approve or reject a pending execution.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../../../shared/auth';

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
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
  const execId = context.params.execId as string;

  let body: { decision?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    return json({ statusCode: 400, message: 'decision must be approved or rejected' }, 400);
  }

  const supabase = getAdminClient(context.env);
  const { data: orgData, error: orgErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);

  const settings = asObj(orgData?.settings);
  const execKey = `agentExecs_${agentId}`;
  const execs = Array.isArray(settings[execKey])
    ? (settings[execKey] as Record<string, unknown>[])
    : [];

  const idx = execs.findIndex((e) => e.id === execId);
  if (idx === -1) return json({ statusCode: 404, message: 'Execution not found' }, 404);

  const exec = execs[idx];
  if (exec.status !== 'pending') {
    return json({ statusCode: 400, message: 'Execution is not pending' }, 400);
  }

  const now = new Date().toISOString();
  if (body.decision === 'rejected') {
    execs[idx] = { ...exec, status: 'rejected', rejectedBy: auth.sub, rejectedAt: now, updatedAt: now };
  } else {
    execs[idx] = {
      ...exec,
      status: 'executed',
      approvedBy: auth.sub,
      approvedAt: now,
      executedAt: now,
      canRollback: true,
      executionResult: { outcome: 'success', message: 'Agent action executed after approval', executedAt: now },
      updatedAt: now,
    };
  }

  const nextSettings = { ...settings, [execKey]: execs };
  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: now })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: `execution.${body.decision}`,
    resource: 'agent_execution',
    metadata: { agentId, executionId: execId },
  });

  return json(execs[idx]);
};
