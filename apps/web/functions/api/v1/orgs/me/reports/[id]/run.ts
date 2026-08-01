/**
 * Pages Function: POST /api/v1/orgs/me/reports/:id/run
 * Mark a scheduled report as "run now" — updates lastRunAt.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';

type ScheduledReport = {
  id: string; title: string; cadence: string; enabled: boolean;
  lastRunAt: string | null; nextRunHint: string; createdAt: string;
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalize(raw: unknown): ScheduledReport[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ScheduledReport[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 40);
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

  const reportId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const reports = normalize(settings.workflowReports);
  const idx = reports.findIndex((r) => r.id === reportId);
  if (idx === -1) return json({ statusCode: 404, message: 'Report not found' }, 404);

  const now = new Date().toISOString();
  const updated: ScheduledReport = {
    ...reports[idx],
    lastRunAt: now,
    nextRunHint: reports[idx].enabled
      ? reports[idx].cadence === 'daily' ? 'Tomorrow morning' : 'Next Monday'
      : 'Paused',
  };

  const next = reports.map((r, i) => (i === idx ? updated : r));
  const nextSettings = { ...settings, workflowReports: next };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: now })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'workflow.report_run',
    resource: 'scheduled_report',
    metadata: { id: reportId, title: updated.title },
  });

  return json(updated);
};
