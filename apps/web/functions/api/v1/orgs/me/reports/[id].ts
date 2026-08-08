/**
 * Pages Function: PATCH/DELETE /api/v1/orgs/me/reports/:id
 *
 * POST /api/v1/orgs/me/reports/:id/run  → handled by [id]/run.ts
 * PATCH  → toggle enabled + update delivery (recipients / cc / bcc / sendHour)
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
import {
  nextRunHintFor,
  parseDeliveryFromBody,
  parseSendHour,
} from '../../../../../shared/report-delivery';
import { normalizeAddressList } from '../../../../../shared/mail';

type ScheduledReport = {
  id: string;
  title: string;
  cadence: string;
  template?: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
  recipients?: string[];
  cc?: string[];
  bcc?: string[];
  sendHour?: number | null;
};

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalize(raw: unknown): ScheduledReport[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ScheduledReport[])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .slice(0, 40);
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
    let body: {
      enabled?: boolean;
      title?: string;
      cadence?: string;
      recipients?: unknown;
      cc?: unknown;
      bcc?: unknown;
      sendHour?: unknown;
    };
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const current = reports[idx];
    const enabled =
      typeof body.enabled === 'boolean' ? Boolean(body.enabled) : current.enabled;
    const cadence =
      body.cadence === 'weekly' || body.cadence === 'daily'
        ? body.cadence
        : current.cadence;

    const hasDeliveryPatch =
      body.recipients !== undefined ||
      body.cc !== undefined ||
      body.bcc !== undefined ||
      body.sendHour !== undefined;

    let recipients = Array.isArray(current.recipients) ? current.recipients : [];
    let cc = Array.isArray(current.cc) ? current.cc : [];
    let bcc = Array.isArray(current.bcc) ? current.bcc : [];
    let sendHour =
      typeof current.sendHour === 'number' ? current.sendHour : null;

    if (hasDeliveryPatch) {
      const parsed = parseDeliveryFromBody(body);
      if (body.recipients !== undefined) recipients = parsed.recipients;
      if (body.cc !== undefined) cc = parsed.cc;
      if (body.bcc !== undefined) bcc = parsed.bcc;
      if (body.sendHour !== undefined) sendHour = parseSendHour(body.sendHour);
    }

    // Keep address lists normalized even for legacy rows
    recipients = normalizeAddressList(recipients);
    cc = normalizeAddressList(cc);
    bcc = normalizeAddressList(bcc);

    const title =
      typeof body.title === 'string' && body.title.trim().length >= 3
        ? body.title.trim()
        : current.title;

    const updated: ScheduledReport = {
      ...current,
      title,
      cadence,
      enabled,
      recipients,
      cc,
      bcc,
      sendHour,
      nextRunHint: nextRunHintFor(cadence, enabled, sendHour),
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
