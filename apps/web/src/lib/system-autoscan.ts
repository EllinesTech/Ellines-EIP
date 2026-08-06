/**
 * Ellinea-assisted system auto-detect (Owner / IT).
 * Observes only — no disk crawl, no silent harvest, no arbitrary RCE.
 * Browser probes: same-origin, user-entered hosts, and ports IT explicitly starts.
 *
 * Scan ≠ connect: probes only check reachability / heuristics. Connect opens the
 * install wizard; credentials + Test & Sync complete the connection.
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
  /** Case-insensitive substrings matched against title / body / server header / URL. */
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
  /** Catalog hint only — not an HTTP detection (e.g. common DB ports). */
  isDbHint?: boolean;
};

export type AutoscanCandidate = ProbeResult & {
  systemName: string;
  catalogEntryId?: string;
  /** Prefer this row when deduping (exact URL IT entered). */
  exactPrefer?: boolean;
};

export type ParsedScanTarget = {
  input: string;
  origin: string;
  host: string;
  pathname: string;
  fullUrl: string;
  /** App directory URL, e.g. http://192.168.0.6/Mathari/ */
  appBaseUrl: string;
  isPrivateLan: boolean;
  isLocalhost: boolean;
  hasAppPath: boolean;
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
    { port: 5432, hint: 'PostgreSQL (common reporting port)', catalogHint: 'postgres' },
    { port: 1433, hint: 'SQL Server (common reporting port)', catalogHint: 'sqlserver' },
    { port: 3306, hint: 'MySQL (common reporting port)', catalogHint: 'mysql' },
  ];

/**
 * Optional keyword bonuses only — success never requires a catalog match.
 * Any reachable URL IT enters becomes a primary REST/OpenAPI candidate.
 */
export const SYSTEM_CATALOG: SystemCatalogEntry[] = [
  {
    id: 'generic-his',
    name: 'Generic HIS / clinical',
    kind: 'his',
    matchTokens: ['hospital', 'clinic', 'clinical', 'patient', 'emr', 'ehr', 'his', 'healthcare'],
    pathHints: ['/', '/api', '/swagger', '/openapi.json', '/health'],
    preferredCatalogId: 'rest-api',
    blurb: 'Optional hint: clinical / HIS keywords detected in URL or title.',
    nextSteps:
      'Scan ≠ connect. Connect → REST/OpenAPI with the entered base URL, then Test & Sync read-only.',
  },
  {
    id: 'generic-erp',
    name: 'Generic ERP / finance',
    kind: 'erp',
    matchTokens: ['erp', 'odoo', 'sap', 'dynamics', 'netsuite', 'finance', 'accounting'],
    pathHints: ['/', '/api', '/swagger', '/openapi.json', '/web/login', '/login'],
    preferredCatalogId: 'rest-api',
    blurb: 'Optional hint: ERP / finance keywords in URL or title.',
    nextSteps:
      'Scan ≠ connect. Connect → REST/OpenAPI with the entered base URL, then Test & Sync read-only.',
  },
  {
    id: 'generic-crm',
    name: 'Generic CRM',
    kind: 'crm',
    matchTokens: ['crm', 'salesforce', 'hubspot', 'customers', 'leads'],
    pathHints: ['/', '/api', '/swagger', '/openapi.json', '/login'],
    preferredCatalogId: 'rest-api',
    blurb: 'Optional hint: CRM keywords in URL or title.',
    nextSteps:
      'Scan ≠ connect. Connect → REST/OpenAPI with the entered base URL, then Test & Sync read-only.',
  },
  {
    id: 'generic-api',
    name: 'OpenAPI / Swagger',
    kind: 'generic',
    matchTokens: ['swagger', 'openapi', 'api documentation', 'api-docs'],
    pathHints: ['/swagger', '/openapi.json', '/v3/api-docs', '/docs'],
    preferredCatalogId: 'openapi',
    blurb: 'Optional hint: OpenAPI / Swagger-style surface.',
    nextSteps: 'Connect → OpenAPI connector; pick capabilities; Test & Sync read-only.',
  },
];

const DB_PORTS = new Set([5432, 1433, 3306]);

export function isPrivateLanHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
  if (h.endsWith('.local')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** App/directory base from any SoR URL (strip file → keep folder, e.g. …/erp/login → …/erp/). */
export function appBaseFromUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname || '/';
    if (/\.[a-z0-9]+$/i.test(path)) {
      path = path.replace(/\/[^/]+$/, '/') || '/';
    } else if (!path.endsWith('/')) {
      path = `${path}/`;
    }
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return url;
  }
}

/** Generic primary label — never requires a product catalog match. */
export function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = appBaseFromUrl(url);
    let pathLabel = '/';
    try {
      pathLabel = new URL(base).pathname || '/';
    } catch {
      pathLabel = u.pathname || '/';
    }
    const host =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1'
        ? `localhost:${u.port || (u.protocol === 'https:' ? '443' : '80')}`
        : u.host;
    if (pathLabel && pathLabel !== '/') {
      const short = pathLabel.length > 48 ? `${pathLabel.slice(0, 45)}…` : pathLabel;
      return `Web app at ${host}${short}`;
    }
    return `Service at ${host}`;
  } catch {
    return 'Reachable web surface';
  }
}

/** Suggest connector kind from path alone (generic). */
export function suggestCatalogFromPath(url: string): PreferredCatalogId {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (
      path.includes('openapi') ||
      path.includes('swagger') ||
      path.includes('api-docs')
    ) {
      return 'openapi';
    }
  } catch {
    /* ignore */
  }
  return 'rest-api';
}

/**
 * Parse IT-entered host or full URL. Preserves path (e.g. /Mathari/Welcome.aspx).
 * Private / LAN hosts default to http when scheme omitted.
 */
export function parseScanTarget(raw: string, preferHttps = true): ParsedScanTarget | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    const hostPart = s.split('/')[0].split(':')[0];
    const lan = isPrivateLanHost(hostPart) || s.includes('/') || /^[\d.]+$/.test(hostPart);
    s = `${lan || !preferHttps ? 'http' : 'https'}://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const origin = `${u.protocol}//${u.host}`;
    const pathname = u.pathname || '/';
    const fullUrl = `${origin}${pathname}${u.search}`;
    const appBaseUrl = appBaseFromUrl(fullUrl);
    const hasAppPath = pathname !== '/' && pathname !== '';
    return {
      input: raw.trim(),
      origin,
      host: u.hostname,
      pathname,
      fullUrl,
      appBaseUrl,
      isPrivateLan: isPrivateLanHost(u.hostname),
      isLocalhost:
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '::1',
      hasAppPath,
    };
  } catch {
    return null;
  }
}

export function normalizeBaseUrl(raw: string, preferHttps = true): string {
  const parsed = parseScanTarget(raw, preferHttps);
  return parsed?.origin || '';
}

export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Optional catalog bonus from URL keywords — never required for a successful scan. */
export function inferCatalogFromUrl(url: string): SystemCatalogEntry | undefined {
  return matchCatalog(url.toLowerCase());
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

function corsOpaqueGuidance(url: string): string {
  const privateLan = (() => {
    try {
      return isPrivateLanHost(new URL(url).hostname);
    } catch {
      return false;
    }
  })();
  if (privateLan) {
    return (
      ' Browser confirmed HTTP reachability only (CORS blocked reading the page body — normal for LAN SoR apps from the EIP web app). ' +
      'This is not a failed connect. Use Local scan + Connect REST/OpenAPI with the app base URL you entered. ' +
      'Online edge probe is for public HTTPS; mixed content also blocks https://EIP → http://LAN page bodies.'
    );
  }
  return (
    ' Browser could only confirm reachability (CORS or mixed-content blocked body read) — Ellinea did not scrape the machine. ' +
    'Online edge probe works best for public HTTPS. Scan ≠ connect: click Connect, then Test & Sync with credentials.'
  );
}

export function buildEllineaNote(
  result: Pick<
    ProbeResult,
    | 'reachable'
    | 'url'
    | 'title'
    | 'server'
    | 'recommendedCatalogId'
    | 'portHint'
    | 'opaque'
    | 'isDbHint'
  >,
  catalog?: SystemCatalogEntry,
): string {
  if (result.isDbHint) {
    return `Possible reporting DB port ${result.portHint || ''} at ${result.url}. Not probed as HTTP and not connected. Opt-in hint only — use a read-only SQL connector with credentials IT controls if this is your reporting replica.`;
  }
  if (!result.reachable) {
    return `No response from ${result.url} within the timeout. Check the host, firewall, or try Local mode for LAN ASP.NET. Scan ≠ connect.`;
  }
  const bonus = catalog ? ` Optional catalog hint: ${catalog.name}.` : '';
  const type =
    result.recommendedCatalogId === 'postgres' ||
    result.recommendedCatalogId === 'sqlserver' ||
    result.recommendedCatalogId === 'mysql'
      ? `read-only ${result.recommendedCatalogId} connector (TCP via Identity)`
      : result.recommendedCatalogId === 'openapi'
        ? 'OpenAPI / Swagger connector'
        : 'REST / HTTP connector';
  const opacity = result.opaque ? corsOpaqueGuidance(result.url) : '';
  return `Ellinea found a reachable surface at ${result.url}${result.title ? ` (“${result.title}”)` : ''}${result.server ? ` · server ${result.server}` : ''}${result.portHint ? ` · ${result.portHint}` : ''}. Suggest ${type} with this base URL prefilled.${bonus} Scan ≠ connect — click Connect, enter read-only credentials, then Test & Sync.${opacity} EIP observes — it does not replace the System of Record.`;
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
  isDbHint?: boolean;
}): ProbeResult {
  const hay = [input.title, input.snippet, input.server, input.url, input.portHint]
    .filter(Boolean)
    .join(' ');
  // Catalog is optional bonus (or explicit IT force) — never required for success.
  const catalog = matchCatalog(hay, input.forcedCatalogId);
  let recommended: PreferredCatalogId =
    input.catalogHint || suggestCatalogFromPath(input.url);

  // Forced / keyword catalog may nudge OpenAPI vs REST, but path wins for swagger URLs.
  if (!input.catalogHint && catalog?.preferredCatalogId === 'openapi') {
    recommended = 'openapi';
  }
  if (!input.catalogHint && suggestCatalogFromPath(input.url) === 'openapi') {
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
    isDbHint: input.isDbHint,
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

/**
 * Browser-side probe. Uses cors when possible; falls back to no-cors reachability.
 * Never reads the local disk — only HTTP(S) to the URL IT entered.
 * Opaque success = reachability only; never claim scrape.
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

/** Online / edge targets: exact URL first, then app base, then catalog/common paths. */
export function buildOnlineTargets(baseUrl: string, catalogId?: string): string[] {
  const parsed = parseScanTarget(baseUrl, true);
  if (!parsed) return [];
  const catalog = catalogId ? SYSTEM_CATALOG.find((c) => c.id === catalogId) : undefined;
  const fromUrl = inferCatalogFromUrl(parsed.fullUrl);
  const effective = catalog || fromUrl;
  const paths = effective?.pathHints?.length ? effective.pathHints : [...COMMON_ONLINE_PATHS];

  const urls: string[] = [];
  if (parsed.hasAppPath) {
    urls.push(parsed.fullUrl);
    if (parsed.appBaseUrl !== parsed.fullUrl) urls.push(parsed.appBaseUrl);
  }
  for (const p of paths) {
    urls.push(joinUrl(parsed.origin, p));
  }
  return [...new Set(urls)].slice(0, 16);
}

export type LocalHttpTarget = {
  url: string;
  port: number;
  hint: string;
  catalogHint?: PreferredCatalogId;
  exact?: boolean;
};

/**
 * Local HTTP targets. Always probes the exact URL IT entered first.
 * Host-only input also checks common HTTP ports (not DB).
 */
export function buildLocalHttpTargets(hostOrUrl: string): LocalHttpTarget[] {
  const parsed = parseScanTarget(hostOrUrl, false);
  if (!parsed) return [];

  const out: LocalHttpTarget[] = [];
  const seen = new Set<string>();
  const push = (item: LocalHttpTarget) => {
    if (seen.has(item.url)) return;
    seen.add(item.url);
    out.push(item);
  };

  let explicitPort = parsed.origin.startsWith('https:') ? 443 : 80;
  try {
    const u = new URL(parsed.fullUrl);
    if (u.port) explicitPort = Number(u.port);
  } catch {
    /* keep */
  }

  // 1) Exact URL IT entered (any SoR path).
  push({
    url: parsed.fullUrl,
    port: explicitPort,
    hint: 'Exact URL IT entered',
    exact: true,
  });

  if (parsed.hasAppPath) {
    if (parsed.appBaseUrl !== parsed.fullUrl) {
      push({
        url: parsed.appBaseUrl,
        port: explicitPort,
        hint: 'App base path',
      });
    }
    push({
      url: `${parsed.origin}/`,
      port: explicitPort,
      hint: 'HTTP origin',
    });
    // Path entered → stay focused; do not shotgun every common port.
    return out.slice(0, 6);
  }

  // Host-only: also probe common HTTP ports.
  for (const p of COMMON_LOCAL_PORTS) {
    if (isDbPort(p.port)) continue;
    const scheme = p.port === 443 || p.port === 8443 ? 'https' : 'http';
    const def = scheme === 'https' ? 443 : 80;
    const url =
      p.port === def ? `${scheme}://${parsed.host}/` : `${scheme}://${parsed.host}:${p.port}/`;
    push({
      url,
      port: p.port,
      hint: p.hint,
      catalogHint: p.catalogHint,
    });
  }

  return out.slice(0, 14);
}

/** Opt-in only — common DB ports as collapsed hints, never primary “Detected” cards. */
export function buildDbPortHints(hostOrUrl: string): LocalHttpTarget[] {
  const parsed = parseScanTarget(hostOrUrl, false);
  if (!parsed) return [];
  return COMMON_LOCAL_PORTS.filter((p) => isDbPort(p.port)).map((p) => ({
    url: `http://${parsed.host}:${p.port}/`,
    port: p.port,
    hint: p.hint,
    catalogHint: p.catalogHint,
  }));
}

/** @deprecated Prefer buildLocalHttpTargets + buildDbPortHints */
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

/**
 * Primary candidate from any reachable URL. Catalog match is optional bonus only.
 */
export function toCandidate(result: ProbeResult, forcedCatalogId?: string): AutoscanCandidate | null {
  if (!result.reachable) return null;
  const catalog =
    (forcedCatalogId && SYSTEM_CATALOG.find((c) => c.id === forcedCatalogId)) ||
    (result.matchedCatalogIds[0]
      ? SYSTEM_CATALOG.find((c) => c.id === result.matchedCatalogIds[0])
      : undefined) ||
    (!forcedCatalogId ? inferCatalogFromUrl(result.url) : undefined);

  const matchedCatalogIds =
    catalog && !result.matchedCatalogIds.includes(catalog.id)
      ? [...result.matchedCatalogIds, catalog.id]
      : result.matchedCatalogIds.length
        ? result.matchedCatalogIds
        : catalog
          ? [catalog.id]
          : [];

  const recommended =
    result.isDbHint && result.recommendedCatalogId
      ? result.recommendedCatalogId
      : suggestCatalogFromPath(result.url) === 'openapi'
        ? 'openapi'
        : result.recommendedCatalogId || 'rest-api';

  return {
    ...result,
    matchedCatalogIds,
    recommendedCatalogId: recommended,
    // Generic hostname+path label; optional catalog never replaces it.
    systemName: result.title?.trim() || labelFromUrl(result.url),
    catalogEntryId: catalog?.id,
  };
}

export type WizardPrefill = {
  catalogId: PreferredCatalogId;
  displayName: string;
  endpoint?: string;
  openApiBaseUrl?: string;
  connectionStringHint?: string;
  packHint?: string;
};

/** Prefill wizard from the reachable surface — works for any SoR URL. */
export function candidateToWizardPrefill(c: AutoscanCandidate): WizardPrefill {
  const catalogId = c.recommendedCatalogId;
  const appBase = appBaseFromUrl(c.url);
  const origin = (() => {
    try {
      const u = new URL(c.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return c.url;
    }
  })();
  const displayName = c.systemName || labelFromUrl(c.url);

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
      displayName,
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
      displayName,
      openApiBaseUrl: appBase,
      endpoint: c.url,
    };
  }

  // Default: REST from the entered app base (any SoR — HIS, ERP, CRM, custom).
  return {
    catalogId: 'rest-api',
    displayName,
    endpoint: appBase,
    openApiBaseUrl: appBase !== `${origin}/` ? appBase : origin,
  };
}
