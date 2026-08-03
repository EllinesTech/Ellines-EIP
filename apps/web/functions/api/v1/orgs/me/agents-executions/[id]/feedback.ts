/**
 * Pages Function: POST /api/v1/orgs/me/agents-executions/:id/feedback
 *
 * Submit user feedback on an agent execution.
 * Score: -1 (unhelpful), 0 (neutral), +1 (helpful)
 * Feedback is stored on the execution and used to improve agent confidence scoring.
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
} from '../../../../../../shared/auth';

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>) : {};
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const executionId = context.params.id as string;

  let body: { score?: number; comment?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const score = body.score;
  if (score === undefined || ![-1, 0, 1].includes(score)) {
    return json({ statusCode: 400, message: 'score must be -1, 0, or 1' }, 400);
  }

  const supabase = getAdminClient(context.env);

  // Get org settings to find the execution
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);
  const executions = ((settings.agentExecutions as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
  const idx = executions.findIndex((e) => e.id === executionId);

  if (idx < 0) {
    return json({ statusCode: 404, message: 'Execution not found' }, 404);
  }

  // Update the execution with feedback
  const updatedExecution = {
    ...executions[idx],
    feedbackScore: score,
    feedbackComment: body.comment || null,
    feedbackAt: new Date().toISOString(),
    feedbackBy: auth.email || auth.sub,
  };

  const updatedExecutions = [...executions];
  updatedExecutions[idx] = updatedExecution;

  const nextSettings = {
    ...settings,
    agentExecutions: updatedExecutions,
  };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);

  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'agent.feedback_provided',
    resource: 'agent_execution',
    metadata: {
      executionId,
      score,
      comment: body.comment,
    },
  });

  return json({
    ok: true,
    execution: updatedExecution,
    message: score === 1 ? 'Thanks — marked as helpful.' : score === -1 ? 'Thanks — marked as unhelpful.' : 'Feedback recorded.',
  });
};
