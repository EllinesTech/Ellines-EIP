/**
 * Pages Function: GET/POST /api/v1/orgs/me/reports
 * Scheduled report definitions stored in org settings JSON.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

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

function nextRunHint(cadence: string, enabled: boolean): string {
  if (!enabled) return 'Paused';
  return cadence === 'daily' ? 'Tomorrow morning' : 'Next Monday';
}

function cuid(): string {
  return `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // GET — report:view   POST — report:create
  if (context.request.method === 'GET') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'report:view',
    );
    if (permErr) return permErr;
  } else if (context.request.method === 'POST') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'report:create',
    );
    if (permErr) return permErr;
  } else {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', auth.organizationId)
      .maybeSingle();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    const settings = asObj(data?.settings);
    return json(normalize(settings.workflowReports));
  }

  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  let body: { title?: string; cadence?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const title = (body.title || '').trim();
  if (!title || title.length < 3) {
    return json({ statusCode: 400, message: 'title must be at least 3 characters' }, 400);
  }

  const cadence = body.cadence === 'weekly' ? 'weekly' : 'daily';

  const newReport: ScheduledReport = {
    id: cuid(),
    title,
    cadence,
    enabled: true,
    lastRunAt: null,
    nextRunHint: nextRunHint(cadence, true),
    createdAt: new Date().toISOString(),
  };

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const reports = normalize(settings.workflowReports);
  const next = [newReport, ...reports].slice(0, 40);
  const nextSettings = { ...settings, workflowReports: next };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'workflow.report_created',
    resource: 'scheduled_report',
    metadata: { id: newReport.id, title: newReport.title, cadence: newReport.cadence },
  });

  return json(newReport);
};
