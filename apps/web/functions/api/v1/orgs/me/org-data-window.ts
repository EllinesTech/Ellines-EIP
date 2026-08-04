/**
 * Pages Function: GET /api/v1/orgs/me/org-data-window
 *
 * Aggregates data from connected/synced Systems of Record (email, reports, documents)
 * from the Enterprise Snapshot for the Organization Data Window.
 *
 * This is a READ-ONLY projection over existing UEM data — EIP never writes to SoR.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  // Load snapshot + installations
  const [snapshotResult, installResult] = await Promise.all([
    supabase
      .from('enterprise_snapshots')
      .select('timeline, synced_at, updated_at')
      .eq('organization_id', auth.organizationId)
      .maybeSingle(),
    supabase
      .from('connector_installations')
      .select('id, display_name, catalog_id, status, last_synced_at, config')
      .eq('organization_id', auth.organizationId),
  ]);

  const snapshot = snapshotResult.data;
  const installs = (installResult.data ?? []) as {
    id: string;
    display_name: string;
    catalog_id: string;
    status: string;
    last_synced_at: string | null;
    config: Record<string, unknown>;
  }[];

  const syncedAt = snapshot?.synced_at as string | null ?? null;

  // Build connector list
  const connectors = installs.map((i) => ({
    id: i.id,
    name: i.display_name,
    type: i.catalog_id,
    status: i.status,
    lastSyncedAt: i.last_synced_at,
  }));

  // Extract emails from timeline + UEM model in snapshot
  const timeline = (Array.isArray(snapshot?.timeline) ? snapshot.timeline : []) as {
    title: string;
    detail: string;
    kind?: string;
  }[];

  const EMAIL_HINT = /\b(email|mail|inbox|message|subject|from:|re:|fwd:|unread)\b/i;
  const emailInstall = installs.find((i) =>
    i.catalog_id.toLowerCase().includes('email') ||
    i.catalog_id.toLowerCase().includes('imap') ||
    i.display_name.toLowerCase().includes('email') ||
    i.display_name.toLowerCase().includes('mail'),
  );

  const emails = timeline
    .filter((ev) => EMAIL_HINT.test(`${ev.title} ${ev.detail}`))
    .slice(0, 50)
    .map((ev, idx) => ({
      id: `email-tl-${idx}`,
      subject: ev.title,
      from: emailInstall?.config?.imapUser as string || emailInstall?.display_name || 'Unknown sender',
      preview: ev.detail,
      at: syncedAt || new Date().toISOString(),
      unread: /\bnew\b|\bunread\b/i.test(ev.title + ev.detail),
      priority: (/urgent|critical|alert/i.test(ev.title + ev.detail) ? 'high' : 'normal') as 'high' | 'normal' | 'low',
      source: emailInstall?.display_name || 'Email connector',
    }));

  // Extract reports from timeline / org settings
  const REPORT_HINT = /\b(report|summary|export|statement|invoice|ledger|analytics)\b/i;
  const orgSettingsResult = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', auth.organizationId)
    .maybeSingle();
  const settings = (orgSettingsResult.data?.settings ?? {}) as Record<string, unknown>;

  // Scheduled reports that have run
  const scheduledReports = (Array.isArray(settings.workflowReports) ? settings.workflowReports : []) as {
    id: string;
    title: string;
    lastRunAt?: string | null;
    cadence?: string;
  }[];

  const reports = [
    // From scheduled reports that have run
    ...scheduledReports
      .filter((r) => r.lastRunAt)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        title: r.title,
        source: 'Ellines EIP · Scheduled Reports',
        generatedAt: r.lastRunAt as string,
        format: 'text',
        sizeKb: undefined as number | undefined,
        downloadUrl: undefined as string | undefined,
      })),
    // From timeline events that look like reports
    ...timeline
      .filter((ev) => REPORT_HINT.test(`${ev.title} ${ev.detail}`))
      .slice(0, 20)
      .map((ev, idx) => ({
        id: `report-tl-${idx}`,
        title: ev.title,
        source: installs.find((i) => i.status === 'synced')?.display_name || 'Connected System',
        generatedAt: syncedAt || new Date().toISOString(),
        format: 'text',
        sizeKb: undefined as number | undefined,
        downloadUrl: undefined as string | undefined,
        content: ev.detail,
      })),
  ];

  return json({
    emails,
    reports,
    connectors,
    syncedAt,
  });
};
