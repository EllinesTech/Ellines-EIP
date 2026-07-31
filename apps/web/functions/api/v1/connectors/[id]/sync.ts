import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';
import demoSeed from '../../../../shared/demo-enterprise.json';
import restSample from '../../../../shared/rest-enterprise-sample.json';

const CSV_SAMPLE = `metric,value
healthScore,81
connectedSystems,4
openAlerts,1
openDecisions,3
briefHighlight,"Branch ops CSV export — no vendor API; file landed from nightly ERP dump."
`;

type SyncBody = {
  endpoint?: string;
  headers?: Record<string, string>;
  csvText?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeEnterprisePayload(raw: unknown) {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.enterprise && typeof root.enterprise === 'object'
        ? (root.enterprise as Record<string, unknown>)
        : root;

  const timelineRaw = data.timeline ?? data.events ?? data.activity ?? [];
  const timeline = Array.isArray(timelineRaw)
    ? timelineRaw
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const title = asString(row.title ?? row.name ?? row.event, '');
          const detail = asString(row.detail ?? row.description ?? row.message, '');
          if (!title) return null;
          return { title, detail: detail || title };
        })
        .filter((x): x is { title: string; detail: string } => Boolean(x))
        .slice(0, 12)
    : [];

  return {
    healthScore: Math.min(
      100,
      Math.max(0, asNumber(data.healthScore ?? data.health ?? data.score, 0)),
    ),
    connectedSystems: Math.max(
      0,
      asNumber(data.connectedSystems ?? data.systems ?? data.connected_systems, 0),
    ),
    openAlerts: Math.max(0, asNumber(data.openAlerts ?? data.alerts ?? data.open_alerts, 0)),
    openDecisions: Math.max(
      0,
      asNumber(data.openDecisions ?? data.decisions ?? data.open_decisions, 0),
    ),
    briefHighlight: asString(
      data.briefHighlight ?? data.brief ?? data.summary ?? data.message,
      'REST sync completed with no brief text.',
    ),
    timeline,
  };
}

function parseCsvToEnterprisePayload(csvText: string) {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('CSV is empty');

  const split = (line: string) =>
    line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const map: Record<string, string> = {};
  const looksWide =
    header.includes('healthscore') ||
    header.includes('health') ||
    header.includes('connectedsystems') ||
    header.includes('systems');

  if (looksWide && lines.length >= 2) {
    const values = split(lines[1]);
    header.forEach((h, i) => {
      if (values[i] !== undefined) map[h] = values[i];
    });
  } else {
    for (const line of lines) {
      const cols = split(line);
      if (cols.length < 2) continue;
      const key = cols[0].toLowerCase();
      if (key === 'metric' || key === 'key' || key === 'field') continue;
      map[key] = cols.slice(1).join(',').trim();
    }
  }

  return normalizeEnterprisePayload({
    healthScore: map.healthscore ?? map.health ?? map.score,
    connectedSystems: map.connectedsystems ?? map.systems ?? map.connected_systems,
    openAlerts: map.openalerts ?? map.alerts ?? map.open_alerts,
    openDecisions: map.opendecisions ?? map.decisions ?? map.open_decisions,
    briefHighlight:
      map.briefhighlight ??
      map.brief ??
      map.summary ??
      map.message ??
      'Imported from CSV file export.',
    timeline: [
      {
        title: 'CSV / file import',
        detail: 'Enterprise snapshot loaded from a file export — no vendor API required.',
      },
    ],
  });
}

function resolveEndpoint(requestUrl: string, endpoint?: string): string {
  const origin = new URL(requestUrl).origin;
  const raw = (endpoint || '/api/v1/connectors/rest-sample').trim();
  if (raw.startsWith('/')) return `${origin}${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid REST endpoint URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('REST endpoint must be http(s)');
  }
  return parsed.toString();
}

async function upsertSnapshot(
  env: Env,
  organizationId: string,
  actorUserId: string,
  connectorId: string,
  connectorName: string,
  payload: ReturnType<typeof normalizeEnterprisePayload>,
) {
  const syncedAt = new Date().toISOString();
  const supabase = getAdminClient(env);
  const row = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    connector_id: connectorId,
    connector_name: connectorName,
    health_score: payload.healthScore,
    connected_systems: payload.connectedSystems,
    open_alerts: payload.openAlerts,
    open_decisions: payload.openDecisions,
    brief_highlight: payload.briefHighlight,
    timeline: payload.timeline,
    synced_at: syncedAt,
    created_at: syncedAt,
    updated_at: syncedAt,
  };

  const { data: existing } = await supabase
    .from('enterprise_snapshots')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from('enterprise_snapshots')
      .update({
        connector_id: row.connector_id,
        connector_name: row.connector_name,
        health_score: row.health_score,
        connected_systems: row.connected_systems,
        open_alerts: row.open_alerts,
        open_decisions: row.open_decisions,
        brief_highlight: row.brief_highlight,
        timeline: row.timeline,
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('enterprise_snapshots').insert(row));
  }

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    organization_id: organizationId,
    user_id: actorUserId,
    action: 'connector.sync',
    resource: 'enterprise_snapshot',
    metadata: { connectorId },
  });

  return {
    organizationId,
    connectorId,
    connectorName,
    healthScore: payload.healthScore,
    connectedSystems: payload.connectedSystems,
    openAlerts: payload.openAlerts,
    openDecisions: payload.openDecisions,
    briefHighlight: payload.briefHighlight,
    timeline: payload.timeline,
    syncedAt,
    status: 'synced' as const,
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const connectorId = context.params.id as string;
  let body: SyncBody = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as SyncBody;
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  try {
    if (connectorId === 'demo-json') {
      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'demo-json',
        'Demo JSON Systems',
        normalizeEnterprisePayload(demoSeed),
      );
      return json(summary);
    }

    if (connectorId === 'rest-api') {
      const endpoint = resolveEndpoint(context.request.url, body.endpoint);
      const isSample =
        endpoint.includes('/api/v1/connectors/rest-sample') ||
        endpoint.endsWith('/connectors/rest-sample') ||
        endpoint.endsWith('/connectors/rest-sample/');

      let raw: unknown = restSample;
      if (!isSample) {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(body.headers || {}),
          },
        });
        if (!res.ok) {
          return json(
            { statusCode: 502, message: `REST endpoint returned ${res.status}` },
            502,
          );
        }
        raw = await res.json();
      }

      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'rest-api',
        'REST API Systems',
        normalizeEnterprisePayload(raw),
      );
      return json(summary);
    }

    if (connectorId === 'csv-file') {
      const csvText = (body.csvText && body.csvText.trim()) || CSV_SAMPLE;
      const summary = await upsertSnapshot(
        context.env,
        auth.organizationId,
        auth.sub,
        'csv-file',
        'CSV / File Import',
        parseCsvToEnterprisePayload(csvText),
      );
      return json(summary);
    }

    return json({ statusCode: 404, message: 'Unknown connector' }, 404);
  } catch (err) {
    return json(
      { statusCode: 500, message: err instanceof Error ? err.message : 'Sync failed' },
      500,
    );
  }
};
