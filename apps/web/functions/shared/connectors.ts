/** Connector helpers for Cloudflare Pages Functions (mirrors connectors-sdk). */

export type InstallConfig = {
  endpoint?: string;
  headers?: Record<string, string>;
  authType?: 'none' | 'apiKey' | 'bearer' | 'basic';
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  csvText?: string;
  openApiDocument?: unknown;
  openApiBaseUrl?: string;
  selectedRoutes?: { method: string; path: string; capability?: string }[];
  connectionString?: string;
  sql?: string;
  systemName?: string;
};

const SECRET_KEYS = ['apiKey', 'bearerToken', 'basicPass', 'connectionString'] as const;

export function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  for (const key of SECRET_KEYS) {
    if (typeof out[key] === 'string' && (out[key] as string).length > 0) {
      out[key] = '***';
    }
  }
  if (out.openApiDocument !== undefined) {
    out.openApiDocument = { _present: true };
  }
  return out;
}

export function mergeConfig(existing: InstallConfig, patch: InstallConfig): InstallConfig {
  const next: InstallConfig = { ...existing, ...patch };
  for (const key of SECRET_KEYS) {
    const v = patch[key];
    if (v === '***' || v === '' || v === undefined) {
      next[key] = existing[key];
    }
  }
  if (patch.openApiDocument && (patch.openApiDocument as { _present?: boolean })._present) {
    next.openApiDocument = existing.openApiDocument;
  }
  return next;
}

export function buildAuthHeaders(config: InstallConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(config.headers || {}) };
  const auth = config.authType || 'none';
  if (auth === 'apiKey' && config.apiKey) {
    headers[config.apiKeyHeader || 'X-API-Key'] = config.apiKey;
  } else if (auth === 'bearer' && config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  } else if (auth === 'basic' && config.basicUser) {
    headers.Authorization = `Basic ${btoa(`${config.basicUser}:${config.basicPass || ''}`)}`;
  }
  return headers;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeEnterprisePayload(raw: unknown) {
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

export function parseCsvToEnterprisePayload(csvText: string) {
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

export function parseOpenApiDocument(raw: unknown) {
  const doc = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!doc) throw new Error('OpenAPI document must be a JSON object');
  const info = (doc.info && typeof doc.info === 'object' ? doc.info : {}) as Record<
    string,
    unknown
  >;
  const title =
    typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'OpenAPI System';
  const version =
    typeof info.version === 'string' && info.version.trim() ? info.version.trim() : '0';

  let baseUrl = '';
  if (Array.isArray(doc.servers) && doc.servers[0] && typeof doc.servers[0] === 'object') {
    const url = (doc.servers[0] as { url?: string }).url;
    if (url) baseUrl = url.replace(/\/$/, '');
  } else if (typeof doc.host === 'string' && doc.host) {
    const schemes = Array.isArray(doc.schemes) ? doc.schemes : ['https'];
    const scheme = typeof schemes[0] === 'string' ? schemes[0] : 'https';
    const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
    baseUrl = `${scheme}://${doc.host}${basePath}`.replace(/\/$/, '');
  }

  const paths = (doc.paths && typeof doc.paths === 'object' ? doc.paths : {}) as Record<
    string,
    unknown
  >;
  const endpoints: {
    method: string;
    path: string;
    operationId: string;
    summary: string;
    capability: string;
    selectable: boolean;
  }[] = [];

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
    const pathItem = pathItemRaw as Record<string, unknown>;
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      const o = op as Record<string, unknown>;
      const operationId =
        typeof o.operationId === 'string' ? o.operationId : `${method}_${path}`;
      const summary =
        typeof o.summary === 'string'
          ? o.summary
          : typeof o.description === 'string'
            ? String(o.description).slice(0, 120)
            : '';
      const leaf = path.split('/').filter(Boolean).pop() || 'resource';
      const capability =
        summary ||
        operationId ||
        `${method === 'get' ? 'Read' : method} ${leaf.replace(/[{}]/g, '')}`;
      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId,
        summary,
        capability,
        selectable: method === 'get' && !/\{[^}]+\}/.test(path),
      });
    }
  }

  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { title, version, baseUrl, endpoints };
}

export async function syncOpenApiRoutes(options: {
  baseUrl: string;
  routes: { method: string; path: string; capability?: string }[];
  headers?: Record<string, string>;
  systemName?: string;
}) {
  const base = options.baseUrl.replace(/\/$/, '');
  if (!base) throw new Error('OpenAPI base URL is required');
  const gets = options.routes.filter((r) => r.method.toUpperCase() === 'GET');
  if (!gets.length) throw new Error('Select at least one GET endpoint');

  const timeline: { title: string; detail: string }[] = [];
  let best = normalizeEnterprisePayload({});
  let okCount = 0;

  for (const route of gets.slice(0, 12)) {
    const url = `${base}${route.path.startsWith('/') ? route.path : `/${route.path}`}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
      });
      if (!res.ok) {
        timeline.push({ title: route.capability || route.path, detail: `HTTP ${res.status}` });
        continue;
      }
      const raw = await res.json();
      okCount += 1;
      const normalized = normalizeEnterprisePayload(raw);
      if (normalized.healthScore >= best.healthScore) best = normalized;
      timeline.push({
        title: route.capability || route.path,
        detail: Array.isArray(raw) ? `${raw.length} records` : `OK from ${route.path}`,
      });
    } catch (err) {
      timeline.push({
        title: route.capability || route.path,
        detail: err instanceof Error ? err.message : 'Request failed',
      });
    }
  }

  if (!okCount) throw new Error('No selected OpenAPI endpoints returned data');
  const name = options.systemName || 'OpenAPI System';
  return {
    ...best,
    connectedSystems: Math.max(best.connectedSystems, 1),
    briefHighlight:
      best.briefHighlight && !best.briefHighlight.includes('no brief')
        ? best.briefHighlight
        : `${name}: synced ${okCount} API capability route(s).`,
    timeline: timeline.length ? timeline : best.timeline,
  };
}

export function toInstallationDto(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    catalogId: row.catalog_id as string,
    displayName: row.display_name as string,
    status: row.status as string,
    lastTestAt: row.last_test_at
      ? new Date(row.last_test_at as string).toISOString()
      : null,
    lastSyncedAt: row.last_synced_at
      ? new Date(row.last_synced_at as string).toISOString()
      : null,
    lastMessage: (row.last_message as string) || null,
    packId: (row.pack_id as string) || null,
    config: redactConfig((row.config || {}) as Record<string, unknown>),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export function toPackDto(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string) || '',
    catalogId: row.catalog_id as string,
    templateConfig: redactConfig((row.template_config || {}) as Record<string, unknown>),
    published: Boolean(row.published),
    createdByEmail: (row.created_by_email as string) || null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
