/**
 * Pages Function: GET /api/v1/orgs/me/reports/history/:id
 * Get content of a specific report run.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';

type ReportRun = {
  id: string;
  reportId: string;
  reportTitle: string;
  reportTemplate: string;
  runAt: string;
  status: string;
  emailStatus: string;
  recipientCount: number;
  reportBody: string;
  htmlBody?: string;
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizeHistory(raw: unknown): ReportRun[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ReportRun[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  );
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  const runId = context.params.id as string;
  const url = new URL(context.request.url);
  const format = url.searchParams.get('format') === 'html' ? 'html' : 'text';

  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);
  const history = normalizeHistory(settings.reportHistory);
  const run = history.find((r) => r.id === runId);

  if (!run) return json({ statusCode: 404, message: 'Report run not found' }, 404);

  const content = format === 'html' && run.htmlBody ? run.htmlBody : run.reportBody;

  return json({ content, format });
};
