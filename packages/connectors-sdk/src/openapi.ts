/** OpenAPI / Swagger → capability list (no vendor developer required). */

export type OpenApiEndpoint = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  capability: string;
  /** Relative URL path with unresolved `{params}` left as-is. */
  selectable: boolean;
};

export type ParsedOpenApi = {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: OpenApiEndpoint[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function capabilityFrom(method: string, path: string, summary: string, operationId: string): string {
  if (summary.trim()) return summary.trim();
  if (operationId.trim()) return operationId.trim();
  const leaf = path.split('/').filter(Boolean).pop() || 'resource';
  const verb =
    method === 'get'
      ? 'Read'
      : method === 'post'
        ? 'Create'
        : method === 'put' || method === 'patch'
          ? 'Update'
          : method === 'delete'
            ? 'Delete'
            : method.toUpperCase();
  return `${verb} ${leaf.replace(/[{}]/g, '')}`;
}

function resolveBaseUrl(doc: Record<string, unknown>): string {
  const servers = doc.servers;
  if (Array.isArray(servers) && servers[0]) {
    const first = asRecord(servers[0]);
    const url = first && typeof first.url === 'string' ? first.url.trim() : '';
    if (url) return url.replace(/\/$/, '');
  }
  const host = typeof doc.host === 'string' ? doc.host.trim() : '';
  const schemes = Array.isArray(doc.schemes) ? doc.schemes : [];
  const scheme =
    typeof schemes[0] === 'string' && schemes[0] ? String(schemes[0]) : 'https';
  const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
  if (host) return `${scheme}://${host}${basePath}`.replace(/\/$/, '');
  return '';
}

/**
 * Parse OpenAPI 3.x or Swagger 2 JSON into a flat endpoint / capability list.
 * IT uploads the file — Ellines does not need the vendor to write a connector.
 */
export function parseOpenApiDocument(raw: unknown): ParsedOpenApi {
  const doc = asRecord(raw);
  if (!doc) throw new Error('OpenAPI document must be a JSON object');

  const info = asRecord(doc.info) || {};
  const title =
    typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'OpenAPI System';
  const version =
    typeof info.version === 'string' && info.version.trim() ? info.version.trim() : '0';
  const baseUrl = resolveBaseUrl(doc);
  const paths = asRecord(doc.paths) || {};
  const endpoints: OpenApiEndpoint[] = [];

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = asRecord(pathItemRaw);
    if (!pathItem) continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const op = asRecord(pathItem[method]);
      if (!op) continue;
      const operationId =
        typeof op.operationId === 'string' ? op.operationId : `${method}_${path}`;
      const summary =
        typeof op.summary === 'string'
          ? op.summary
          : typeof op.description === 'string'
            ? op.description.slice(0, 120)
            : '';
      const hasParams = /\{[^}]+\}/.test(path);
      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId,
        summary,
        capability: capabilityFrom(method, path, summary, operationId),
        selectable: method === 'get' && !hasParams,
      });
    }
  }

  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return { title, version, baseUrl, endpoints };
}

export type SelectedOpenApiRoute = {
  method: string;
  path: string;
  capability?: string;
};

/**
 * Fetch selected GET routes from an OpenAPI base URL and fold results into a
 * single enterprise-shaped payload (best-effort normalization).
 */
export async function syncOpenApiRoutes(options: {
  baseUrl: string;
  routes: SelectedOpenApiRoute[];
  headers?: Record<string, string>;
  systemName?: string;
  fetchImpl?: typeof fetch;
  normalize: (raw: unknown) => {
    healthScore: number | null;
    connectedSystems: number;
    /** Optional on the payload; treat as 0 when absent. */
    recordCount?: number;
    openAlerts: number;
    openDecisions: number;
    briefHighlight: string;
    timeline: { title: string; detail: string }[];
  };
}): Promise<{
  ok: boolean;
  message: string;
  payload: ReturnType<typeof options.normalize>;
}> {
  const fetchImpl = options.fetchImpl || fetch;
  const base = options.baseUrl.replace(/\/$/, '');
  if (!base) {
    return {
      ok: false,
      message: 'OpenAPI base URL is required',
      payload: options.normalize({}),
    };
  }

  const gets = options.routes.filter((r) => r.method.toUpperCase() === 'GET');
  if (!gets.length) {
    return {
      ok: false,
      message: 'Select at least one GET endpoint without path parameters',
      payload: options.normalize({}),
    };
  }

  const timeline: { title: string; detail: string }[] = [];
  let okCount = 0;
  // Every selected resource is retrieved independently and kept separately.
  // Reducing them to a single "best" payload would silently discard real data
  // (Customers, Invoices and Products are different resources, not candidates).
  const normalizedPerRoute: { route: typeof route0; p: ReturnType<typeof options.normalize> }[] = [];
  const route0 = gets[0];
  let totalRecordCount = 0;
  let sumOpenAlerts = 0;
  let sumOpenDecisions = 0;
  const realHealth: number[] = [];
  const collectedTimeline: { title: string; detail: string }[] = [];
  let allSucceeded = true;

  for (const route of gets) {
    const url = `${base}${route.path.startsWith('/') ? route.path : `/${route.path}`}`;
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
      });
      if (!res.ok) {
        timeline.push({
          title: route.capability || route.path,
          detail: `HTTP ${res.status}`,
        });
        allSucceeded = false;
        continue;
      }
      const raw = await res.json();
      okCount += 1;
      const normalized = options.normalize(raw);
      normalizedPerRoute.push({ route, p: normalized });
      totalRecordCount += normalized.recordCount ?? 0;
      sumOpenAlerts += normalized.openAlerts;
      sumOpenDecisions += normalized.openDecisions;
      if (typeof normalized.healthScore === 'number') realHealth.push(normalized.healthScore);
      collectedTimeline.push(...(normalized.timeline ?? []));
      const count = Array.isArray(raw)
        ? raw.length
        : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
          ? ((raw as { data: unknown[] }).data.length)
          : null;
      timeline.push({
        title: route.capability || route.path,
        detail: count != null ? `${count} records` : `OK from ${route.path}`,
      });
    } catch (err) {
      timeline.push({
        title: route.capability || route.path,
        detail: err instanceof Error ? err.message : 'Request failed',
      });
      allSucceeded = false;
    }
  }

  const name = options.systemName || 'OpenAPI System';
  if (!okCount) {
    return {
      ok: false,
      message: 'No selected OpenAPI endpoints returned data',
      payload: options.normalize({}),
    };
  }

  // Deterministic aggregation across ALL resources. No resource is discarded for
  // having a lower health score, and no value is invented.
  const firstPayload = normalizedPerRoute[0].p;
  const payload = {
    ...firstPayload,
    healthScore: realHealth.length
      ? Math.round(realHealth.reduce((a, b) => a + b, 0) / realHealth.length)
      : null,
    recordCount: totalRecordCount,
    openAlerts: sumOpenAlerts,
    openDecisions: sumOpenDecisions,
    timeline: collectedTimeline.length ? collectedTimeline : timeline,
  };
  return {
    ok: true,
    message: allSucceeded
      ? `Retrieved ${okCount} OpenAPI resource(s) from ${name}`
      : `PARTIAL: retrieved ${okCount} of ${gets.length} OpenAPI resource(s) from ${name}`,
    payload: {
      ...payload,
      // Do NOT inflate connectedSystems. It is derived by the service layer from
      // the org's ACTIVE connector installation count — a connector cannot know
      // that, and a floor of 1 would be a fabricated number.
      briefHighlight:
        payload.briefHighlight && !payload.briefHighlight.includes('no brief')
          ? payload.briefHighlight
          : `${name}: synced ${okCount} API capability route(s).`,
      timeline: timeline.length ? timeline : payload.timeline,
    },
  };
}
