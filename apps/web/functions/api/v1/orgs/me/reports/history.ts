/**
 * Pages Function: GET /api/v1/orgs/me/reports/history
 * List past report runs (from org settings reportHistory array).
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';

type ReportRun = {
  id: string;
  reportId: string;
  reportTitle: string;
  reportTemplate: string;
  runAt: string;
  status: 'queued' | 'sent' | 'failed';
  emailStatus: string;
  recipientCount: number;
  reportChars: number;
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizeHistory(raw: unknown): ReportRun[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ReportRun[])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .slice(0, 200); // Keep last 200 runs
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

  const url = new URL(context.request.url);
  const reportId = url.searchParams.get('reportId');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);
  let history = normalizeHistory(settings.reportHistory);

  // Filter by reportId if specified
  if (reportId) {
    history = history.filter((r) => r.reportId === reportId);
  }

  // Sort by runAt descending (newest first)
  history.sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());

  return json(history.slice(0, limit));
};
