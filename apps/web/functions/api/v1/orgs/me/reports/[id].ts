/**
 * Pages Function: PATCH/DELETE/POST(run) /api/v1/orgs/me/reports/:id
 *
 * POST /api/v1/orgs/me/reports/:id/run  → handled by [id]/run.ts
 * PATCH  → toggle enabled
 * DELETE → remove
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';

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

  let next: ScheduledReport[];
  let result: ScheduledReport | { ok: boolean };

  if (context.request.method === 'PATCH') {
    let body: { enabled?: boolean };
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    const enabled = Boolean(body.enabled);
    const updated = {
      ...reports[idx],
      enabled,
      nextRunHint: enabled
        ? reports[idx].cadence === 'daily' ? 'Tomorrow morning' : 'Next Monday'
        : 'Paused',
    };
    next = reports.map((r, i) => (i === idx ? updated : r));
    result = updated;
  } else if (context.request.method === 'DELETE') {
    next = reports.filter((_, i) => i !== idx);
    result = { ok: true };
  } else {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const nextSettings = { ...settings, workflowReports: next };
  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq('id', auth.organizationId);
  if (writeErr) return json({ statusCode: 500, message: writeErr.message }, 500);

  return json(result);
};
