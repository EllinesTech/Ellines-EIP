/**
 * Ellinea-assisted system auto-detect (Owner / IT).
 * Observes only — no disk crawl, no silent harvest, no arbitrary RCE.
 * Browser probes: same-origin, user-entered hosts, and ports IT explicitly starts.
 */

export type ScanMode = 'online' | 'local' | 'hybrid';

export type PreferredCatalogId =
  | 'openapi'
  | 'rest-api'
  | 'postgres'
  | 'sqlserver'
  | 'mysql'
  | 'csv-file';

export type SystemCatalogEntry = {
  id: string;
  name: string;
  kind: 'his' | 'erp' | 'crm' | 'generic';
  /** Case-insensitive substrings matched against title / body / server header. */
  matchTokens: string[];
  pathHints: string[];
  preferredCatalogId: PreferredCatalogId;
  blurb: string;
  nextSteps: string;
};

export type ProbeResult = {
  url: string;
  reachable: boolean;
  status?: number;
  title?: string;
  contentType?: string;
  server?: string;
  snippet?: string;
  /** Opaque / CORS-limited browser probe (body unread). */
  opaque?: boolean;
  error?: string;
  latencyMs?: number;
  /** Port hint for local DB-like services. */
  portHint?: string;
  matchedCatalogIds: string[];
  recommendedCatalogId: PreferredCatalogId;
  ellineaNote: string;
};

export type AutoscanCandidate = ProbeResult & {
  systemName: string;
  catalogEntryId?: string;
};

/** Small HIS / enterprise path catalog — not a full port scanner. */
export const COMMON_ONLINE_PATHS = [
  '/',
  '/api',
  '/api/v1',
  '/health',
  '/api/health',
  '/swagger',
  '/swagger/index.html',
  '/swagger-ui/index.html',
  '/openapi.json',
  '/openapi.yaml',
  '/v3/api-docs',
  '/docs',
  '/login',
] as const;

export const COMMON_LOCAL_PORTS: { port: number; hint: string; catalogHint?: PreferredCatalogId }[] =
  [
    { port: 80, hint: 'HTTP' },
    { port: 443, hint: 'HTTPS' },
    { port: 3000, hint: 'Node / web app' },
    { port: 3001, hint: 'API service' },
    { port: 5000, hint: 'App server' },
    { port: 8000, hint: 'App server' },
    { port: 8080, hint: 'App / HIS web' },
    { port: 8443, hint: 'HTTPS alt' },
    { port: 5432, hint: 'PostgreSQL (DB likely)', catalogHint: 'postgres' },
    { port: 1433, hint: 'SQL Server (DB likely)', catalogHint: 'sqlserver' },
    { port: 3306, hint: 'MySQL (DB likely)', catalogHint: 'mysql' },
  ];

export const SYSTEM_CATALOG: SystemCatalogEntry[] = [
  {
    id: 'hospidia',
    name: 'Hospidia',
    kind: 'his',
    matchTokens: ['hospidia', 'hospedia'],
    pathHints: [
      '/',
      '/login',
      '/api',
      '/swagger',
      '/openapi.json',
      '/health',
      '/api/health',
    ],
    preferredCatalogId: 'openapi',
    blurb: 'Hospital Information System — connect read-only; EIP does not replace Hospidia.',
    nextSteps:
      'Prefer OpenAPI if /swagger or /openapi.json responds; otherwise REST to a read API, or Postgres/SQL Server reporting replica. Use read-only credentials.',
  },
  {
    id: 'generic-his',
    name: 'Generic HIS / clinical',
    kind: 'his',
    matchTokens: ['hospital', 'his', 'clinical', 'patient', 'emr', 'ehr'],
    pathHints: ['/', '/api', '/swagger', '/openapi.json', '/health'],
    preferredCatalogId: 'openapi',
    blurb: 'Looks like a clinical / HIS web surface.',
    nextSteps: 'Confirm with IT, then install OpenAPI or REST with read-only credentials.',
  },
  {
    id: 'generic-api',
    name: 'Generic API',
    kind: 'generic',
    matchTokens: ['swagger', 'openapi', 'api documentation'],
    pathHints: ['/swagger', '/openapi.json', '/v3/api-docs', '/docs'],
    preferredCatalogId: 'openapi',
    blurb: 'OpenAPI / Swagger-style surface detected.',
    nextSteps: 'Install OpenAPI connector; pick capabilities; sync read-only.',
  },
];

export function normalizeBaseUrl(raw: string, preferHttps = true): string {
  let s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `${preferHttps ? 'https' : 'http'}://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export function matchCatalog(
  haystack: string,
  forcedCatalogId?: string,
): SystemCatalogEntry | undefined {
  if (forcedCatalogId) {
    return SYSTEM_CATALOG.find((c) => c.id === forcedCatalogId);
  }
  const lower = haystack.toLowerCase();
  return SYSTEM_CATALOG.find((c) => c.matchTokens.some((t) => lower.includes(t.toLowerCase())));
}

export function buildEllineaNote(
  result: Pick<
    ProbeResult,
    'reachable' | 'url' | 'title' | 'server' | 'recommendedCatalogId' | 'portHint' | 'opaque'
  >,
  catalog?: SystemCatalogEntry,
): string {
  if (!result.reachable) {
    return `No response from ${result.url} within the timeout. Check the host, firewall, or try another mode.`;
  }
  const sys = catalog?.name || result.title || 'Unknown service';
  const type =
    result.recommendedCatalogId === 'postgres' ||
    result.recommendedCatalogId === 'sqlserver' ||
    result.recommendedCatalogId === 'mysql'
      ? `read-only ${result.recommendedCatalogId} connector (TCP via Identity)`
      : result.recommendedCatalogId === 'openapi'
        ? 'OpenAPI / Swagger connector'
        : 'REST / HTTP connector';
  const opacity = result.opaque
    ? ' Browser could only confirm reachability (CORS blocked body read) — Ellinea did not scrape the machine.'
    : '';
  const next = catalog?.nextSteps || 'Enter read-only credentials in the install wizard, then Test & Sync.';
  return `Ellinea detected a reachable surface at ${result.url}${result.title ? ` (“${result.title}”)` : ''}${result.server ? ` · server ${result.server}` : ''}${result.portHint ? ` · ${result.portHint}` : ''}. Suggested: ${sys} via ${type}. ${next}${opacity} EIP observes and connects — it does not replace the System of Record.`;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  return m?.[1]?.trim() || undefined;
}

export function analyzeProbePayload(input: {
  url: string;
  reachable: boolean;
  status?: number;
  title?: string;
  contentType?: string;
  server?: string;
  snippet?: string;
  opaque?: boolean;
  error?: string;
  latencyMs?: number;
  portHint?: string;
  catalogHint?: PreferredCatalogId;
  forcedCatalogId?: string;
}): ProbeResult {
  const hay = [input.title, input.snippet, input.server, input.url, input.portHint]
    .filter(Boolean)
    .join(' ');
  const catalog = matchCatalog(hay, input.forcedCatalogId);
  let recommended: PreferredCatalogId =
    input.catalogHint || catalog?.preferredCatalogId || 'rest-api';

  const path = (() => {
    try {
      return new URL(input.url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (
    !input.catalogHint &&
    (path.includes('openapi') || path.includes('swagger') || path.includes('api-docs'))
  ) {
    recommended = 'openapi';
  }

  const matchedCatalogIds = catalog ? [catalog.id] : [];
  const base: ProbeResult = {
    url: input.url,
    reachable: input.reachable,
    status: input.status,
    title: input.title,
    contentType: input.contentType,
    server: input.server,
    snippet: input.snippet?.slice(0, 280),
    opaque: input.opaque,
    error: input.error,
    latencyMs: input.latencyMs,
    portHint: input.portHint,
    matchedCatalogIds,
    recommendedCatalogId: recommended,
    ellineaNote: '',
  };
  base.ellineaNote = buildEllineaNote(base, catalog);
  return base;
}

export function enrichFromHtml(html: string): { title?: string; snippet: string } {
  return {
    title: extractTitle(html),
    snippet: html.replace(/\s+/g, ' ').slice(0, 400),
  };
}

const DB_PORTS = new Set([5432, 1433, 3306]);

/**
 * Browser-side probe. Uses cors when possible; falls back to no-cors reachability.
 * Never reads the local disk — only HTTP(S) to the URL IT entered.
 */
export async function probeUrlInBrowser(
  url: string,
  opts?: {
    timeoutMs?: number;
    portHint?: string;
    catalogHint?: PreferredCatalogId;
    forcedCatalogId?: string;
  },
): Promise<ProbeResult> {
  const timeoutMs = opts?.timeoutMs ?? 2500;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      mode: 'cors',
      redirect: 'follow',
      credentials: 'omit',
    });
    clearTimeout(timer);
    const contentType = res.headers.get('content-type') || undefined;
    const server = res.headers.get('server') || undefined;
    let title: string | undefined;
    let snippet: string | undefined;
    try {
      const text = await res.text();
      if (contentType?.includes('html') || text.trimStart().startsWith('<')) {
        const enriched = enrichFromHtml(text);
        title = enriched.title;
        snippet = enriched.snippet;
      } else {
        snippet = text.replace(/\s+/g, ' ').slice(0, 400);
      }
    } catch {
      /* body unread */
    }
    return analyzeProbePayload({
      url,
      reachable: true,
      status: res.status,
      title,
      contentType,
      server,
      snippet,
      latencyMs: Date.now() - started,
      portHint: opts?.portHint,
      catalogHint: opts?.catalogHint,
      forcedCatalogId: opts?.forcedCatalogId,
    });
  } catch {
    clearTimeout(timer);
    /* CORS or network — try opaque reachability */
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), timeoutMs);
    try {
      await fetch(url, {
        method: 'GET',
        signal: controller2.signal,
        mode: 'no-cors',
        redirect: 'follow',
        credentials: 'omit',
      });
      clearTimeout(timer2);
      return analyzeProbePayload({
        url,
        reachable: true,
        opaque: true,
        latencyMs: Date.now() - started,
        portHint: opts?.portHint,
        catalogHint: opts?.catalogHint,
        forcedCatalogId: opts?.forcedCatalogId,
      });
    } catch (err) {
      clearTimeout(timer2);
      return analyzeProbePayload({
        url,
        reachable: false,
        error: err instanceof Error ? err.message : 'unreachable',
        latencyMs: Date.now() - started,
        portHint: opts?.portHint,
        catalogHint: opts?.catalogHint,
        forcedCatalogId: opts?.forcedCatalogId,
      });
    }
  }
}

export function buildOnlineTargets(
  baseUrl: string,
  catalogId?: string,
): string[] {
  const base = normalizeBaseUrl(baseUrl, true);
  if (!base) return [];
  const catalog = catalogId ? SYSTEM_CATALOG.find((c) => c.id === catalogId) : undefined;
  const paths = catalog?.pathHints?.length
    ? catalog.pathHints
    : [...COMMON_ONLINE_PATHS];
  const urls = paths.map((p) => joinUrl(base, p));
  return [...new Set(urls)].slice(0, 16);
}

export function buildLocalTargets(
  hostRaw: string,
  ports?: number[],
): { url: string; port: number; hint: string; catalogHint?: PreferredCatalogId }[] {
  let host = hostRaw.trim() || 'localhost';
  host = host.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!host) host = 'localhost';
  const list = COMMON_LOCAL_PORTS.filter((p) => !ports || ports.includes(p.port));
  return list.map((p) => {
    const scheme = p.port === 443 || p.port === 8443 ? 'https' : 'http';
    const defaultPort = scheme === 'https' ? 443 : 80;
    const url =
      p.port === defaultPort
        ? `${scheme}://${host}/`
        : `${scheme}://${host}:${p.port}/`;
    return {
      url,
      port: p.port,
      hint: p.hint,
      catalogHint: p.catalogHint,
    };
  });
}

export function isDbPort(port: number): boolean {
  return DB_PORTS.has(port);
}

export function toCandidate(result: ProbeResult, forcedCatalogId?: string): AutoscanCandidate | null {
  if (!result.reachable) return null;
  const catalog =
    (forcedCatalogId && SYSTEM_CATALOG.find((c) => c.id === forcedCatalogId)) ||
    (result.matchedCatalogIds[0]
      ? SYSTEM_CATALOG.find((c) => c.id === result.matchedCatalogIds[0])
      : undefined);
  return {
    ...result,
    systemName: catalog?.name || result.title || guessNameFromUrl(result.url),
    catalogEntryId: catalog?.id,
  };
}

function guessNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      ? `Local service :${u.port || (u.protocol === 'https:' ? '443' : '80')}`
      : u.hostname;
  } catch {
    return 'Detected service';
  }
}

export type WizardPrefill = {
  catalogId: PreferredCatalogId;
  displayName: string;
  endpoint?: string;
  openApiBaseUrl?: string;
  connectionStringHint?: string;
  packHint?: string;
};

export function candidateToWizardPrefill(c: AutoscanCandidate): WizardPrefill {
  const catalogId = c.recommendedCatalogId;
  const base = (() => {
    try {
      const u = new URL(c.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return c.url;
    }
  })();

  if (catalogId === 'postgres' || catalogId === 'sqlserver' || catalogId === 'mysql') {
    const port =
      catalogId === 'postgres' ? 5432 : catalogId === 'sqlserver' ? 1433 : 3306;
    let host = 'localhost';
    try {
      host = new URL(c.url).hostname;
    } catch {
      /* keep */
    }
    return {
      catalogId,
      displayName: c.systemName,
      connectionStringHint:
        catalogId === 'postgres'
          ? `postgresql://readonly_user:PASSWORD@${host}:${port}/DATABASE?sslmode=prefer`
          : catalogId === 'sqlserver'
            ? `Server=${host},${port};Database=DATABASE;User Id=readonly_user;Password=PASSWORD;Encrypt=true;TrustServerCertificate=true`
            : `mysql://readonly_user:PASSWORD@${host}:${port}/DATABASE`,
    };
  }

  if (catalogId === 'openapi') {
    return {
      catalogId: 'openapi',
      displayName: c.systemName,
      openApiBaseUrl: base,
      endpoint: c.url,
    };
  }

  return {
    catalogId: 'rest-api',
    displayName: c.systemName,
    endpoint: c.url.includes('/api') ? c.url : joinUrl(base, '/api'),
  };
}
