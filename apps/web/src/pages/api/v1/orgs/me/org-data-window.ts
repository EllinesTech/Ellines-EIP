/**
 * Dev Pages API: GET /api/v1/orgs/me/org-data-window
 * Pages Router API routes are IGNORED during static export builds.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { devJson, getDevSupabase, requireDevAuth } from '../../../../../lib/dev-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') { devJson(res, { ok: true }); return; }
  if (req.method !== 'GET') { devJson(res, { statusCode: 405, message: 'Method not allowed' }, 405); return; }

  const auth = await requireDevAuth(req, res);
  if (!auth) return;

  let supabase;
  try {
    supabase = getDevSupabase();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Supabase client init failed';
    devJson(res, { statusCode: 500, message: msg }, 500);
    return;
  }

  try {
    const [snapshotResult, installResult] = await Promise.all([
      supabase.from('enterprise_snapshots').select('timeline, synced_at, updated_at').eq('organization_id', auth.organizationId).maybeSingle(),
      supabase.from('connector_installations').select('id, display_name, catalog_id, status, last_synced_at, config').eq('organization_id', auth.organizationId),
    ]);

    if (snapshotResult.error) console.error('[org-data-window] snapshot error:', snapshotResult.error.message);
    if (installResult.error) console.error('[org-data-window] installs error:', installResult.error.message);

    const snapshot = snapshotResult.data;
    const installs = (installResult.data ?? []) as { id: string; display_name: string; catalog_id: string; status: string; last_synced_at: string | null; config: Record<string, unknown> }[];
    const syncedAt = (snapshot?.synced_at as string | null) ?? null;
    const connectors = installs.map((i) => ({ id: i.id, name: i.display_name, type: i.catalog_id, status: i.status, lastSyncedAt: i.last_synced_at }));
    const timeline = (Array.isArray(snapshot?.timeline) ? snapshot.timeline : []) as { title: string; detail: string }[];

    const EMAIL_HINT = /\b(email|mail|inbox|message|subject|from:|re:|fwd:|unread)\b/i;
    const emailInstall = installs.find((i) => i.catalog_id.toLowerCase().includes('email') || i.catalog_id.toLowerCase().includes('imap') || i.display_name.toLowerCase().includes('email') || i.display_name.toLowerCase().includes('mail'));

    const emails = timeline.filter((ev) => EMAIL_HINT.test(`${ev.title} ${ev.detail}`)).slice(0, 50).map((ev, idx) => ({
      id: `email-tl-${idx}`, subject: ev.title,
      from: (emailInstall?.config?.imapUser as string) || emailInstall?.display_name || 'Unknown sender',
      preview: ev.detail, at: syncedAt || new Date().toISOString(),
      unread: /\bnew\b|\bunread\b/i.test(ev.title + ev.detail),
      priority: (/urgent|critical|alert/i.test(ev.title + ev.detail) ? 'high' : 'normal') as 'high' | 'normal' | 'low',
      source: emailInstall?.display_name || 'Email connector',
    }));

    const REPORT_HINT = /\b(report|summary|export|statement|invoice|ledger|analytics)\b/i;
    const orgSettingsResult = await supabase.from('organizations').select('settings').eq('id', auth.organizationId).maybeSingle();
    if (orgSettingsResult.error) console.error('[org-data-window] org settings error:', orgSettingsResult.error.message);
    const settings = (orgSettingsResult.data?.settings ?? {}) as Record<string, unknown>;
    const scheduledReports = (Array.isArray(settings.workflowReports) ? settings.workflowReports : []) as { id: string; title: string; lastRunAt?: string | null }[];

    const reports = [
      ...scheduledReports.filter((r) => r.lastRunAt).slice(0, 20).map((r) => ({ id: r.id, title: r.title, source: 'Ellines EIP · Scheduled Reports', generatedAt: r.lastRunAt as string, format: 'text' })),
      ...timeline.filter((ev) => REPORT_HINT.test(`${ev.title} ${ev.detail}`)).slice(0, 20).map((ev, idx) => ({ id: `report-tl-${idx}`, title: ev.title, source: installs.find((i) => i.status === 'synced')?.display_name || 'Connected System', generatedAt: syncedAt || new Date().toISOString(), format: 'text', content: ev.detail })),
    ];

    devJson(res, { emails, reports, connectors, syncedAt });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[org-data-window] unhandled error:', err);
    devJson(res, { statusCode: 500, message: msg }, 500);
  }
}
