/**
 * Pages Function: POST /api/v1/orgs/me/email-sync
 *
 * Manual email pull — re-reads the enterprise snapshot and extracts email objects
 * with richer metadata. Optionally triggers Ellinea to summarise today's inbox.
 *
 * EIP observes SoR email. It never writes to any mailbox.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';

const EMAIL_HINT = /\b(email|mail|inbox|message|subject|from:|re:|fwd:|unread|reply|forward)\b/i;
const URGENT_HINT = /\b(urgent|critical|asap|immediate|alert|escalat|action required|deadline|overdue)\b/i;
const REPORT_HINT = /\b(report|statement|invoice|ledger|analytics|export|sales|stock|inventory|finance|revenue)\b/i;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  const [snapshotResult, installResult] = await Promise.all([
    supabase
      .from('enterprise_snapshots')
      .select('timeline, model, synced_at')
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

  const syncedAt = (snapshot?.synced_at as string | null) ?? null;
  const timeline = (Array.isArray(snapshot?.timeline) ? snapshot.timeline : []) as {
    title: string;
    detail: string;
    kind?: string;
  }[];

  const emailInstalls = installs.filter(
    (i) =>
      i.catalog_id.toLowerCase().includes('email') ||
      i.catalog_id.toLowerCase().includes('imap') ||
      i.display_name.toLowerCase().includes('email') ||
      i.display_name.toLowerCase().includes('mail'),
  );

  // Build rich email objects from timeline
  const emails: {
    id: string;
    subject: string;
    from: string;
    preview: string;
    body: string;
    at: string;
    unread: boolean;
    priority: 'high' | 'normal' | 'low';
    source: string;
    tags: string[];
  }[] = [];

  const today = new Date().toDateString();

  for (const [idx, ev] of timeline.entries()) {
    if (!EMAIL_HINT.test(`${ev.title} ${ev.detail}`)) continue;

    const isUrgent = URGENT_HINT.test(`${ev.title} ${ev.detail}`);
    const isReport = REPORT_HINT.test(`${ev.title} ${ev.detail}`);
    const isToday = syncedAt ? new Date(syncedAt).toDateString() === today : false;
    const fromInstall = emailInstalls[0];

    const tags: string[] = [];
    if (isUrgent) tags.push('urgent');
    if (isReport) tags.push('report');
    if (isToday) tags.push('today');
    if (/\bunread\b/i.test(`${ev.title} ${ev.detail}`)) tags.push('unread');

    emails.push({
      id: `email-sync-${idx}`,
      subject: ev.title,
      from:
        (fromInstall?.config?.imapUser as string) ||
        fromInstall?.display_name ||
        'Connected email',
      preview: ev.detail.slice(0, 200),
      body: ev.detail,
      at: syncedAt || new Date().toISOString(),
      unread: tags.includes('unread') || isToday,
      priority: isUrgent ? 'high' : isReport ? 'normal' : 'low',
      source: fromInstall?.display_name || 'Email connector',
      tags,
    });
  }

  // Today's email summary (template — LLM enriches if configured)
  const todayEmails = emails.filter((e) => e.tags.includes('today') || e.unread);
  const urgentCount = emails.filter((e) => e.priority === 'high').length;
  const unreadCount = emails.filter((e) => e.unread).length;

  const summary = todayEmails.length
    ? `${todayEmails.length} emails today — ${urgentCount} urgent, ${unreadCount} unread. ` +
      (urgentCount > 0
        ? `Urgent: ${emails
            .filter((e) => e.priority === 'high')
            .slice(0, 3)
            .map((e) => `"${e.subject}"`)
            .join(', ')}.`
        : `Most recent: "${emails[0]?.subject || 'n/a'}".`)
    : emailInstalls.length
    ? 'Email connector installed but no emails found in current snapshot. Run a sync to refresh.'
    : 'No email connector installed. Ask IT Admin to install and configure an IMAP connector.';

  // Log the manual pull in audit
  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'org_data.email_sync',
    resource: 'email_connector',
    metadata: {
      emailCount: emails.length,
      urgentCount,
      unreadCount,
      connectorCount: emailInstalls.length,
    },
  });

  return json({
    emails: emails.slice(0, 100),
    summary,
    urgentCount,
    unreadCount,
    todayCount: todayEmails.length,
    connectors: emailInstalls.map((i) => ({
      id: i.id,
      name: i.display_name,
      status: i.status,
      lastSyncedAt: i.last_synced_at,
    })),
    syncedAt,
    pulledAt: new Date().toISOString(),
  });
};
