/**
 * Pages Function: POST /api/v1/orgs/me/reports/history/:id/resend
 * Resend a past report to specified recipients.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../../shared/auth';
import { sendOutboundEmail, resolveMailConfig } from '../../../../../../../shared/mail';

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
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  const runId = context.params.id as string;

  let body: { recipients?: string[] };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    body = {};
  }

  const supabase = getAdminClient(context.env);

  const { data, error } = await supabase
    .from('organizations')
    .select('settings, name')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const settings = asObj(data?.settings);
  const orgName = (data as { name?: string })?.name || 'Your Organization';
  const history = normalizeHistory(settings.reportHistory);
  const run = history.find((r) => r.id === runId);

  if (!run) return json({ statusCode: 404, message: 'Report run not found' }, 404);

  // Determine recipients (from request body or fall back to actor email)
  const recipients = Array.isArray(body.recipients) && body.recipients.length > 0
    ? body.recipients.filter((e): e is string => typeof e === 'string' && e.includes('@')).slice(0, 20)
    : [auth.email];

  const mailConfig = resolveMailConfig(context.env);
  if (!mailConfig) {
    return json({
      statusCode: 400,
      message: 'Email not configured (set RESEND_API_KEY or SMTP_* on Pages)',
    }, 400);
  }

  // Send to all recipients
  const emailPromises = recipients.map((to) =>
    sendOutboundEmail(context.env, {
      to,
      subject: `[Resent] ${run.reportTitle} — ${orgName} (${new Date(run.runAt).toLocaleDateString()})`,
      text: run.reportBody,
    }).catch((err) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : 'Send failed',
      provider: 'none' as const,
      id: undefined,
    }))
  );

  const results = await Promise.all(emailPromises);
  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;

  let emailStatus: string;
  if (failCount === 0) {
    emailStatus = `resent_to_${successCount}_recipient${successCount !== 1 ? 's' : ''}_via_${results[0]?.provider || 'unknown'}`;
  } else if (successCount > 0) {
    emailStatus = `partial: ${successCount} sent, ${failCount} failed`;
  } else {
    emailStatus = `failed: ${results[0]?.error || 'Unknown error'}`;
  }

  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'workflow.report_resent',
    resource: 'report_run',
    metadata: { runId, reportTitle: run.reportTitle, recipients, emailStatus },
  });

  return json({ ok: successCount > 0, sentCount: successCount, emailStatus });
};
