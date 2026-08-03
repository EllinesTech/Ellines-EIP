/**
 * Pages Function: GET /api/v1/orgs/me/alert-correlations
 *
 * Real-time alert correlation engine (A.3.1).
 * Reads enterprise events from the last 24 h, groups related alerts by:
 *   - Event type prefix (e.g. "alert.*", "sync.*")
 *   - Time proximity (within same 15-min window)
 *   - Source system
 *
 * Returns correlation groups, each with a severity, root-cause hint, and
 * suggested actions so agents can act on the group as a whole.
 *
 * Owner/IT Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>) : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type CorrelationGroup = {
  id: string;
  category: string;          // e.g. "sync_failure", "alert_threshold", "connector_error"
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  events: string[];          // event IDs
  sources: string[];         // source systems involved
  rootCauseHint: string;
  suggestedActions: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categorise(eventType: string): string {
  if (eventType.startsWith('alert') || eventType.includes('alert')) return 'alert_threshold';
  if (eventType.startsWith('sync') || eventType.includes('sync')) return 'sync_event';
  if (eventType.includes('fail') || eventType.includes('error')) return 'connector_error';
  if (eventType.includes('approval') || eventType.includes('approve')) return 'approval_pressure';
  return 'general';
}

function severity(count: number, category: string): CorrelationGroup['severity'] {
  if (category === 'connector_error') return count >= 3 ? 'critical' : count >= 2 ? 'high' : 'medium';
  if (category === 'alert_threshold') return count >= 5 ? 'critical' : count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low';
  if (category === 'approval_pressure') return count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';
  return count >= 5 ? 'high' : count >= 3 ? 'medium' : 'low';
}

function rootCauseHint(category: string, sources: string[]): string {
  const src = sources.length > 0 ? ` from ${sources.slice(0, 2).join(', ')}` : '';
  switch (category) {
    case 'connector_error': return `Repeated connector failures${src} — check credentials, network, and connector config.`;
    case 'alert_threshold': return `Multiple threshold alerts${src} — a connected system may be under load or degraded.`;
    case 'sync_event': return `Sync activity cluster${src} — review connector sync schedules for overlap.`;
    case 'approval_pressure': return `Approval queue building up — consider auto-approve rules for routine items.`;
    default: return `Cluster of related events${src} — investigate with Ellinea Ask for a root-cause brief.`;
  }
}

function suggestedActions(category: string): string[] {
  switch (category) {
    case 'connector_error': return ['Test connector connectivity', 'Review connector credentials', 'Ask Ellinea for diagnosis'];
    case 'alert_threshold': return ['Review enterprise snapshot', 'Activate alert escalation agent', 'Ask Ellinea for brief'];
    case 'approval_pressure': return ['Install auto-approve agent', 'Review approval backlog', 'Escalate to Owner'];
    case 'sync_event': return ['Review sync schedules', 'Check connector health', 'Run sync now'];
    default: return ['Review timeline', 'Ask Ellinea for brief'];
  }
}

// ─── Correlation engine ───────────────────────────────────────────────────────

function correlate(events: EventRow[]): CorrelationGroup[] {
  if (!events.length) return [];

  // Sort by time
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Group by category + 15-min window
  const buckets = new Map<string, EventRow[]>();

  for (const ev of sorted) {
    const cat = categorise(ev.type);
    const windowKey = Math.floor(new Date(ev.created_at).getTime() / (15 * 60 * 1000));
    const key = `${cat}::${windowKey}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(ev);
  }

  const groups: CorrelationGroup[] = [];
  let gIdx = 0;

  for (const [key, evs] of buckets) {
    // Only surface groups with 2+ events
    if (evs.length < 2) continue;

    const [cat] = key.split('::');
    const sources = [
      ...new Set(
        evs.map((e) => String(e.payload?.source || e.payload?.connectorName || e.payload?.system || '')).filter(Boolean),
      ),
    ];

    groups.push({
      id: `corr_${++gIdx}_${cat}`,
      category: cat,
      severity: severity(evs.length, cat),
      count: evs.length,
      firstSeenAt: evs[0].created_at,
      lastSeenAt: evs[evs.length - 1].created_at,
      events: evs.map((e) => e.id),
      sources,
      rootCauseHint: rootCauseHint(cat, sources),
      suggestedActions: suggestedActions(cat),
    });
  }

  // Sort by severity then count
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return groups.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminCheck = requireOrgAdmin(auth.role);
  if (adminCheck) return adminCheck;

  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const supabase = getAdminClient(context.env);

  // Fetch enterprise events from the last 24 h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabase
    .from('enterprise_events')
    .select('id, type, payload, created_at')
    .eq('organization_id', auth.organizationId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return json({ statusCode: 500, message: error.message }, 500);
  }

  const rows: EventRow[] = (events || []).map((e: any) => ({
    id: e.id,
    type: e.type,
    payload: asObj(e.payload),
    created_at: e.created_at,
  }));

  const groups = correlate(rows);

  return json({
    windowHours: 24,
    totalEvents: rows.length,
    correlationGroups: groups,
    correlatedEvents: groups.reduce((s, g) => s + g.count, 0),
    computedAt: new Date().toISOString(),
  });
};
