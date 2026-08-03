/**
 * Pages Function: GET /api/v1/orgs/me/agent-cohort-signals
 *
 * Returns aggregated cohort confidence signals for agent action types.
 * Only available to orgs that have opted in to draw from cohort.
 *
 * Signals are computed from feedback stored in all opted-in orgs' settings.
 * Each signal is a confidence boost/penalty per action type.
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

type CohortSignal = {
  actionType: string;
  cohortAvgScore: number;  // -1.0 to +1.0 normalised
  sampleSize: number;
  confidenceBoost: number; // +/- boost to apply to base confidence
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

  const supabase = getAdminClient(context.env);

  // Check this org has opted in to draw from cohort
  const { data: orgData, error: orgErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (orgErr) return json({ statusCode: 500, message: orgErr.message }, 500);

  const orgSettings = asObj(orgData?.settings);
  const cohortSettings = asObj(orgSettings.agentCohortSettings);

  if (!cohortSettings.optIn || !cohortSettings.drawFromCohort) {
    return json({
      enabled: false,
      message: 'Cohort learning is not enabled for this organisation. Enable it in Automation → Settings.',
      signals: [],
    });
  }

  // Gather feedback from all opted-in orgs that have contributeFeedback=true
  // We read the agentExecutions from each org's settings and aggregate by action type
  const { data: orgs, error: orgsErr } = await supabase
    .from('organizations')
    .select('id, settings')
    .neq('id', auth.organizationId); // exclude self to avoid double-counting

  if (orgsErr) return json({ statusCode: 500, message: orgsErr.message }, 500);

  // Aggregate feedback by action type across opted-in orgs
  const buckets: Record<string, { total: number; sum: number }> = {};

  for (const org of (orgs || [])) {
    const s = asObj(org.settings);
    const cs = asObj(s.agentCohortSettings);

    // Only include if org has opted in and contributes feedback
    if (!cs.optIn || !cs.contributeFeedback) continue;

    const executions = ((s.agentExecutions as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;

    for (const exec of executions) {
      const score = exec.feedbackScore;
      const action = exec.recommendedAction as string | undefined;
      if (score === undefined || score === null || !action) continue;

      if (!buckets[action]) buckets[action] = { total: 0, sum: 0 };
      buckets[action].total += 1;
      buckets[action].sum += Number(score);
    }
  }

  // Also include own feedback if we contribute
  if (cohortSettings.contributeFeedback) {
    const ownExecs = ((orgSettings.agentExecutions as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>;
    for (const exec of ownExecs) {
      const score = exec.feedbackScore;
      const action = exec.recommendedAction as string | undefined;
      if (score === undefined || score === null || !action) continue;
      if (!buckets[action]) buckets[action] = { total: 0, sum: 0 };
      buckets[action].total += 1;
      buckets[action].sum += Number(score);
    }
  }

  // Convert buckets to signals
  const signals: CohortSignal[] = Object.entries(buckets)
    .filter(([, b]) => b.total >= 3) // minimum sample size for signal
    .map(([actionType, b]) => {
      const avg = b.sum / b.total;           // -1 to +1
      const boost = Math.round(avg * 0.05 * 100) / 100; // max ±0.05 confidence boost
      return {
        actionType,
        cohortAvgScore: Math.round(avg * 100) / 100,
        sampleSize: b.total,
        confidenceBoost: boost,
      };
    })
    .sort((a, b) => b.sampleSize - a.sampleSize);

  return json({
    enabled: true,
    signals,
    meta: {
      totalOptedInOrgs: (orgs || []).filter((o) => {
        const cs = asObj(asObj(o.settings).agentCohortSettings);
        return cs.optIn && cs.contributeFeedback;
      }).length,
      computedAt: new Date().toISOString(),
    },
  });
};
