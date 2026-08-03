/**
 * Pages Function: GET/PUT /api/v1/orgs/me/agent-cohort-settings
 *
 * Manage org opt-in for cohort learning.
 * When opt-in is enabled, anonymised feedback signals (action type → score)
 * are contributed to and drawn from the platform-level cohort store.
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

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>) : {};
}

export type CohortSettings = {
  optIn: boolean;
  contributeFeedback: boolean;
  drawFromCohort: boolean;
  updatedAt: string;
};

const DEFAULT: CohortSettings = {
  optIn: false,
  contributeFeedback: false,
  drawFromCohort: false,
  updatedAt: new Date().toISOString(),
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  const supabase = getAdminClient(context.env);

  // ── GET ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    const settings = asObj(data?.settings);
    const cohort = asObj(settings.agentCohortSettings) as Partial<CohortSettings>;

    return json({ ...DEFAULT, ...cohort } as CohortSettings);
  }

  // ── PUT ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'PUT') {
    let body: Partial<CohortSettings>;
    try {
      body = (await context.request.json()) as Partial<CohortSettings>;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    const settings = asObj(data?.settings);
    const existing = asObj(settings.agentCohortSettings) as Partial<CohortSettings>;

    const updated: CohortSettings = {
      ...DEFAULT,
      ...existing,
      ...{
        optIn: body.optIn ?? existing.optIn ?? false,
        contributeFeedback: body.contributeFeedback ?? existing.contributeFeedback ?? false,
        drawFromCohort: body.drawFromCohort ?? existing.drawFromCohort ?? false,
      },
      updatedAt: new Date().toISOString(),
    };

    const { error: writeErr } = await supabase
      .from('organizations')
      .update({
        settings: { ...settings, agentCohortSettings: updated },
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.organizationId);

    if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

    // Audit
    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'agent.cohort_settings_updated',
      resource: 'agent_cohort',
      metadata: updated,
    });

    return json(updated);
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
