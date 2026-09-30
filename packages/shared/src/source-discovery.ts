/**
 * Generic source discovery.
 *
 * There is NO hardcoded list of endpoints, product types, modules or categories
 * anywhere in EIP. A fixed list is the thing this replaces: it could only ever
 * describe the systems its author had seen.
 *
 * Instead, discovery DERIVES everything from the target itself, in this order:
 *
 *   1. Machine-readable specifications, if the source publishes one
 *      (OpenAPI / Swagger / GraphQL introspection / WSDL).
 *   2. The page's own declarations: <link rel>, sitemap.xml, JSON-LD
 *      structured data, OpenGraph, and the URLs the app actually calls.
 *   3. Only then, documented-but-unlisted entry points, discovered by following
 *      what the site itself advertises.
 *
 * Whatever is found is reported with the evidence that produced it. Nothing is
 * assumed, and nothing that did not answer is claimed.
 */

import type { EndpointDef } from './openapi-importer';

export type DiscoveryMethod =
  | 'openapi' | 'swagger' | 'graphql' | 'wsdl' | 'declared' | 'none';

export interface DiscoveredEndpoint {
  method: string;
  path: string;
  /** Where this endpoint was learned from. */
  evidence: string;
  /** Pagination params the spec documented, when known. */
  parameters?: string[];
  /** Module/tag label the source gave it, when known. */
  tags?: string[];
}

export interface SourceDiscovery {
  baseUrl: string;
  /** True when the target answered at all. */
  reachable: boolean;
  httpStatus: number | null;
  methods: DiscoveryMethod[];
  endpoints: DiscoveredEndpoint[];
  /** Framework/datastore signals, purely informational. */
  signals: string[];
  /** Machine-readable data the site published (JSON-LD types, etc). */
  structuredDataTypes: string[];
  /** Public page inventory, when a sitemap exists. */
  pageInventory: string[];
  /** Human summary of what was and was not found. */
  notes: string[];
}

/**
 * Spec document locations. These are IETF-ish conventions for describing an
 * API, not a list of business endpoints — nothing here names a product,
 * module or capability.
 */
const SPEC_PATHS = [
  '/openapi.json', '/openapi.yaml', '/swagger.json', '/swagger.yaml',
  '/api/openapi.json', '/api/swagger.json', '/api-docs', '/api/docs',
  '/.well-known/openapi.json', '/graphql', '/api/graphql',
];

function endpointsFromOpenApi(paths: Record<string, unknown>): DiscoveredEndpoint[] {
  const out: DiscoveredEndpoint[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    const op = item as Record<string, Record<string, unknown>>;
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const def = op[method];
      if (!def || typeof def !== 'object') continue;
      const d = def as Record<string, unknown>;
      const params = Array.isArray(d.parameters)
        ? (d.parameters as { name?: string }[]).map((p) => String(p?.name ?? '')).filter(Boolean)
        : undefined;
      out.push({
        method: method.toUpperCase(),
        path,
        evidence: 'openapi',
        parameters: params,
        tags: Array.isArray(d.tags) ? (d.tags as string[]) : undefined,
      });
    }
  }
  return out;
}


/**
 * Framework / datastore signals. Purely informational — they help an operator
 * understand what they connected to. Nothing here gates or invents a capability.
 */
const SIGNALS: [string, RegExp][] = [
  ['Next.js', /__NEXT_DATA__|next\/dist|\/_next\//i],
  ['Nuxt', /__NUXT__|nuxt/i],
  ['SvelteKit', /__sveltekit/i],
  ['Vite SPA', /\/assets\/[A-Za-z0-9._\-]+\.js|type=["']module["']/i],
  ['WordPress', /wp-content|wp-json/i],
  ['WooCommerce', /woocommerce/i],
  ['Shopify', /cdn\.shopify|Shopify\.theme/i],
  ['Medusa', /medusa/i],
  ['Squarespace', /squarespace/i],
  ['Wix', /wixstatic|wix\.com/i],
  ['Firebase', /firebase(?:app|storage)?(?:\.googleapis)?\.com|initializeApp/i],
  ['Supabase', /supabase\.co/i],
  ['Stripe', /js\.stripe\.com/i],
];

function detectSignals(html: string): string[] {
  return SIGNALS.filter(([, re]) => re.test(html)).map(([n]) => n);
}

/** Absolute external URLs the page/bundle references, minus obvious noise. */
function declaredUrls(html: string): string[] {
  const raw = [...html.matchAll(/https?:\/\/[A-Za-z0-9._\-]{4,80}\/[A-Za-z0-9._\-/]{0,60}/g)].map((m) => m[0]);
  const noise =
    /fonts\.googleapis|gstatic|google-analytics|googletagmanager|schema\.org|w3\.org|github\.com|facebook|instagram|twitter|youtube|linkedin|wa\.me|tiktok|pinterest|reddit|snapchat|openai\.com/i;
  return [...new Set(raw.filter((u) => !noise.test(u)))].slice(0, 25);
}

export interface DiscoverOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Extra spec locations to try, for sources that publish elsewhere. */
  extraSpecPaths?: string[];
}


/**
 * Discover what a target actually exposes. Every claim carries the evidence
 * that produced it; when nothing can be found, that is reported plainly rather
 * than filled in with assumed endpoints.
 */
export async function discoverSource(url: string, options: DiscoverOptions = {}): Promise<SourceDiscovery> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const base: SourceDiscovery = {
    baseUrl: url,
    reachable: false,
    httpStatus: null,
    methods: [],
    endpoints: [],
    signals: [],
    structuredDataTypes: [],
    pageInventory: [],
    notes: [],
  };

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { ...base, notes: [`"${url}" is not a valid URL; nothing could be discovered.`] };
  }

  const get = async (p: string): Promise<{ status: number; text: string; ct: string } | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await doFetch(p.startsWith('http') ? p : origin + p, {
        method: 'GET',
        headers: { accept: 'application/json, text/html, application/xml;q=0.9, */*;q=0.8' },
        signal: controller.signal,
      });
      return { status: r.status, text: await r.text(), ct: r.headers.get('content-type') || '' };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // 1. Does the target answer at all?
  const root = await get(url);
  if (!root) {
    return { ...base, notes: [`The target did not respond within ${timeoutMs} ms; nothing could be discovered.`] };
  }
  base.reachable = true;
  base.httpStatus = root.status;
  if (root.status >= 400) base.notes.push(`The target root responded HTTP ${root.status}.`);

  // 2. Machine-readable specifications the source publishes.
  // A spec is often reachable at several conventional locations; only the first
  // one that yields endpoints is used, so one published document cannot multiply
  // the same endpoint several times.
  for (const p of [...(options.extraSpecPaths ?? []), ...SPEC_PATHS]) {
    const r = await get(p);
    if (!r || r.status !== 200) continue;
    const looksJson = /json/i.test(r.ct) || r.text.trim().startsWith('{');
    if (!looksJson) continue;
    try {
      const doc = JSON.parse(r.text) as Record<string, unknown>;
      if (doc?.paths && typeof doc.paths === 'object') {
        const eps = endpointsFromOpenApi(doc.paths as Record<string, unknown>);
        if (eps.length) {
          base.methods.push('openapi');
          base.endpoints.push(...eps);
          base.notes.push(`Discovered ${eps.length} endpoint(s) from the OpenAPI document at ${p}.`);
          break; // one specification is enough
        }
      }
      if (doc && typeof doc === 'object' && (doc.data || doc.__schema)) {
        base.methods.push('graphql');
        base.notes.push(`GraphQL introspection is published at ${p}.`);
        break;
      }
    } catch {
      /* not a spec after all */
    }
  }

  // 3. What the page itself declares.
  const html = root.text || '';
  if (/<[a-z!]/i.test(html)) {
    base.signals = detectSignals(html);
    for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const j = JSON.parse(block[1]) as { '@type'?: string | string[] };
        const t = j['@type'];
        for (const one of Array.isArray(t) ? t : t ? [t] : []) base.structuredDataTypes.push(String(one));
      } catch { /* unparsable block */ }
    }
    if (base.structuredDataTypes.length) {
      base.notes.push(`Page publishes structured data: ${[...new Set(base.structuredDataTypes)].join(', ')}.`);
    }
  }

  // 4. Sitemap — a real inventory of what the site serves.
  const sm = await get('/sitemap.xml');
  if (sm && sm.status === 200 && /<loc>/i.test(sm.text)) {
    const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    base.pageInventory = locs.slice(0, 200);
    base.methods.push('declared');
    base.notes.push(`Sitemap published with ${locs.length} page(s).`);
  }

  // 5. URLs the app itself calls.
  const urls = declaredUrls(html);
  if (urls.length) {
    base.endpoints.push(...urls.map((u) => ({ method: 'GET', path: u, evidence: 'declared-by-page' })));
    base.notes.push(`The page references ${urls.length} external URL(s), recorded as declared but not yet verified.`);
  }

  if (!base.endpoints.length) {
    base.notes.push(
      'No machine-readable API specification and no declared API endpoints were found. This ' +
        'source may be a client-rendered site with no public API. EIP reports that rather than ' +
        'assuming endpoints that do not exist.',
    );
  }
  return base;
}

/** Convert discovered endpoints into the registry's EndpointDef shape. */
export function toEndpointDefs(d: SourceDiscovery): EndpointDef[] {
  return d.endpoints.map((e) => ({
    path: e.path,
    method: (e.method.toUpperCase() as EndpointDef['method']) ?? 'GET',
    operationId: null,
    summary: null,
    tags: e.tags ?? [],
    requestContentType: null,
    responseContentType: null,
    requiresAuth: false,
  }));
}


