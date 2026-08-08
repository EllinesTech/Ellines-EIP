/**
 * Data Access Log (D.2.2)
 * GET /api/v1/orgs/me/data-access-log
 *
 * Returns structured log of who accessed what data, when, and from where.
 * Tracks: connector syncs, snapshot reads, report views, document downloads,
 * people directory, org-data-window, exports, and API key usage.
 *
 * Query params:
 *   ?limit=100       (max 500)
 *   ?resource=       filter by resource type (connector|report|document|people|export|snapshot|api)
 *   ?userId=         filter by actor user ID
 *   ?from=ISO date
 *   ?to=ISO date
 *   ?format=json|csv (default json)
 *
 * Owner/IT only.
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

const DATA_ACCESS_ACTIONS = [
  // Connector / sync data
  'connector.sync', 'connector.test', 'connector.install', 'connector.view',
  'enterprise.webhook', 'enterprise.snapshot.read',
  // Reports
  'report.run', 'report.view', 'report.download', 'report.resend', 'report.history',
  // Documents
  'document.view', 'document.download', 'document.upload', 'document.delete',
  // People / org data
  'people.view', 'org.data.window', 'org.data.email', 'org.data.report',
  // Exports
  'data_export', 'compliance.export',
  // Snapshot / UEM
  'snapshot.read', 'uem.view',
  // API keys
  'api.key.create', 'api.key.revoke', 'api.key.use',
  // Auth (for HIPAA/SOC2 access control logs)
  'auth.login', 'auth.logout', 'auth.register', 'auth.password.change',
  'auth.invite.accept', 'webhook.secret.rotate',
];

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Math.min(Math.max(rawLimit, 1), 500);
  const resourceFilter = url.searchParams.get('resource') ?? '';
  const userIdFilter = url.searchParams.get('userId') ?? '';
  const format = (url.searchParams.get('format') ?? 'json') as 'json' | 'csv';

  const toDate = url.searchParams.get('to')
    ? new Date(url.searchParams.get('to')!)
    : new Date();
  const fromDate = url.searchParams.get('from')
    ? new Date(url.searchParams.get('from')!)
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const supabase = getAdminClient(context.env);

  // Build query — filter by data-access-related actions
  let query = supabase
    .from('audit_logs')
    .select('id, user_id, action, resource, metadata, created_at')
    .eq('organization_id', auth.organizationId)
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit * 3); // over-fetch to allow client-side action filtering

  if (userIdFilter) {
    query = query.eq('user_id', userIdFilter);
  }

  const { data: logs, error } = await query;
  if (error) return json({ statusCode: 500, message: error.message }, 500);

  const rows = (logs ?? []) as Array<{
    id: string;
    user_id: string | null;
    action: string;
    resource: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;

  // Filter to data-access actions only
  let filtered = rows.filter((r) =>
    DATA_ACCESS_ACTIONS.some((a) => r.action.startsWith(a) || r.action === a),
  );

  // Resource category filter
  if (resourceFilter) {
    const cat = resourceFilter.toLowerCase();
    filtered = filtered.filter((r) => {
      const a = r.action.toLowerCase();
      const res = (r.resource ?? '').toLowerCase();
      if (cat === 'connector') return a.includes('connector') || a.includes('sync') || a.includes('webhook');
      if (cat === 'report') return a.includes('report');
      if (cat === 'document') return a.includes('document');
      if (cat === 'people') return a.includes('people') || a.includes('user');
      if (cat === 'export') return a.includes('export');
      if (cat === 'snapshot') return a.includes('snapshot') || a.includes('uem') || a.includes('org.data');
      if (cat === 'api') return a.includes('api.key') || a.includes('auth.');
      return a.includes(cat) || res.includes(cat);
    });
  }

  filtered = filtered.slice(0, limit);

  // Resolve actors
  const userIds = [...new Set(filtered.map((r) => r.user_id).filter(Boolean))] as string[];
  const actors: Record<string, { email: string; fullName: string }> = {};

  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', userIds);
    for (const u of users ?? []) {
      actors[u.id as string] = { email: u.email as string, fullName: (u.full_name as string) ?? '' };
    }
  }

  const enriched = filtered.map((r) => {
    const actor = r.user_id ? actors[r.user_id] : null;
    return {
      id: r.id,
      timestamp: new Date(r.created_at).toISOString(),
      actorUserId: r.user_id ?? 'system',
      actorEmail: actor?.email ?? 'system',
      actorName: actor?.fullName ?? 'System',
      action: r.action,
      resource: r.resource ?? '',
      resourceCategory: categorizeResource(r.action),
      sensitivity: getSensitivity(r.action),
      metadata: r.metadata ?? {},
    };
  });

  if (format === 'csv') {
    const cols = ['timestamp', 'actorEmail', 'actorName', 'actorUserId', 'action', 'resource', 'resourceCategory', 'sensitivity', 'id'];
    const header = cols.join(',');
    const csvRows = enriched.map((r) =>
      cols.map((c) => {
        const v = (r as Record<string, unknown>)[c];
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','),
    );
    const csv = `# Data Access Log — ${auth.organizationId} — ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}\n${header}\n${csvRows.join('\n')}`;
    const filename = `data_access_log_${toDate.toISOString().split('T')[0]}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Summary stats
  const byCategory: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  for (const r of enriched) {
    byCategory[r.resourceCategory] = (byCategory[r.resourceCategory] ?? 0) + 1;
    byActor[r.actorEmail] = (byActor[r.actorEmail] ?? 0) + 1;
  }

  return json({
    logs: enriched,
    total: enriched.length,
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    summary: {
      byCategory,
      byActor,
      highSensitivity: enriched.filter((r) => r.sensitivity === 'high').length,
      mediumSensitivity: enriched.filter((r) => r.sensitivity === 'medium').length,
    },
  });
};

function categorizeResource(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('connector') || a.includes('sync') || a.includes('webhook') || a.includes('snapshot')) return 'connector';
  if (a.includes('report')) return 'report';
  if (a.includes('document')) return 'document';
  if (a.includes('export') || a.includes('compliance')) return 'export';
  if (a.includes('api.key')) return 'api_key';
  if (a.includes('auth.') || a.includes('password') || a.includes('invite')) return 'authentication';
  if (a.includes('people') || a.includes('org.data') || a.includes('uem')) return 'org_data';
  return 'other';
}

function getSensitivity(action: string): 'high' | 'medium' | 'low' {
  const a = action.toLowerCase();
  if (a.includes('export') || a.includes('compliance') || a.includes('api.key') || a.includes('password') || a.includes('webhook.secret')) return 'high';
  if (a.includes('sync') || a.includes('connector') || a.includes('document') || a.includes('report.run')) return 'medium';
  return 'low';
}
