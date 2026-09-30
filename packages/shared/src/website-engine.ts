/**
 * Website connector engine — two independent layers.
 *
 *   Layer 1: WEBSITE MONITORING   — reachability, TLS, response time, uptime.
 *   Layer 2: WEBSITE/API BUSINESS — products, orders, customers, payments...
 *
 * A website may have Layer 1 only, Layer 2 only, or both. The layers stay
 * logically separate even when served by the same API.
 *
 * Every measurement is a REAL observation made against the target. There is
 * no synthetic uptime, no simulated latency and no random score: if a probe
 * cannot run, the result says so.
 */

export type WebsiteProbeOutcome =
  | 'ONLINE' | 'OFFLINE' | 'DNS_FAILURE' | 'TLS_FAILURE' | 'TIMEOUT' | 'NOT_CHECKED';

export interface WebsiteTlsReport {
  valid: boolean | null;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiry: number | null;
  reason: string | null;
}

export interface WebsiteTechnicalReport {
  url: string;
  checkedAt: string;
  outcome: WebsiteProbeOutcome;
  /** HTTP status, when a response was actually received. */
  httpStatus: number | null;
  /** Milliseconds, measured around the real request. */
  responseTimeMs: number | null;
  tls: WebsiteTlsReport;
  finalUrl: string | null;
  redirected: boolean;
  message: string;
}

export interface WebsiteBusinessCapability {
  /** Resource as the site's own API publishes it. */
  resource: string;
  label: string;
  /** The endpoint probed, verbatim. */
  path: string;
  status: 'AVAILABLE' | 'EMPTY' | 'NOT_AUTHORIZED' | 'UNAVAILABLE' | 'NOT_PROVIDED';
  httpStatus: number | null;
  /** Records actually returned by the probe. */
  recordCount: number | null;
  /** Total the site reported, if it reports one. */
  reportedTotal: number | null;
  message: string;
}

/**
 * Paths commonly used by commerce/business APIs. This is a PROBE LIST, not a
 * capability list: each path is requested, and only what actually answers is
 * reported. A site publishing none of them simply exposes none.
 */
export const BUSINESS_PROBE_PATHS: { path: string; label: string; resource: string }[] = [
  { path: '/api/products', label: 'Products', resource: 'products' },
  { path: '/api/categories', label: 'Categories', resource: 'categories' },
  { path: '/api/orders', label: 'Orders', resource: 'orders' },
  { path: '/api/customers', label: 'Customers', resource: 'customers' },
  { path: '/api/inventory', label: 'Inventory', resource: 'inventory' },
  { path: '/api/payments', label: 'Payments', resource: 'payments' },
  { path: '/api/bookings', label: 'Bookings', resource: 'bookings' },
  { path: '/api/shipping', label: 'Shipping', resource: 'shipping' },
  { path: '/api/reviews', label: 'Reviews', resource: 'reviews' },
  { path: '/api/accounts', label: 'Accounts', resource: 'accounts' },
];

const UNKNOWN_TLS: WebsiteTlsReport = {
  valid: null, issuer: null, subject: null,
  validFrom: null, validTo: null, daysUntilExpiry: null, reason: null,
};

export interface ProbeOptions {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected TLS inspector; when absent, TLS is honestly reported as unknown. */
  tlsInspector?: (url: string) => Promise<WebsiteTlsReport>;
  timeoutMs?: number;
  businessPaths?: typeof BUSINESS_PROBE_PATHS;
  /** Extra headers (e.g. an API key) for business probes only. */
  businessHeaders?: Record<string, string>;
}


/** Layer 1: a real, timed reachability/TLS probe. */
export async function probeWebsite(url: string, options: ProbeOptions = {}): Promise<WebsiteTechnicalReport> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const checkedAt = new Date().toISOString();

  const base: WebsiteTechnicalReport = {
    url,
    checkedAt,
    outcome: 'NOT_CHECKED',
    httpStatus: null,
    responseTimeMs: null,
    tls: UNKNOWN_TLS,
    finalUrl: null,
    redirected: false,
    message: 'No probe was performed.',
  };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ...base, message: `"${url}" is not a valid URL, so nothing could be checked.` };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ...base, message: `Unsupported protocol "${parsed.protocol}".` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  let res: Response;
  try {
    res = await doFetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const elapsed = Date.now() - started;
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : 'Request failed';
    const isDns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg);
    const isTls = /certificate|SSL|TLS|self.signed/i.test(msg);
    const isTimeout = name === 'AbortError' || /timeout/i.test(msg);
    return {
      ...base,
      responseTimeMs: elapsed,
      outcome: isDns ? 'DNS_FAILURE' : isTls ? 'TLS_FAILURE' : isTimeout ? 'TIMEOUT' : 'OFFLINE',
      message: isDns
        ? `The hostname could not be resolved (${msg}).`
        : isTls
          ? `TLS negotiation failed: ${msg}`
          : isTimeout
            ? `No response within ${timeoutMs} ms.`
            : `The site could not be reached: ${msg}`,
    };
  }
  clearTimeout(timer);

  const elapsed = Date.now() - started;
  const finalUrl = res.url || url;
  const tls = options.tlsInspector ? await options.tlsInspector(finalUrl) : UNKNOWN_TLS;
  const healthy = res.status >= 200 && res.status < 400;

  return {
    ...base,
    httpStatus: res.status,
    responseTimeMs: elapsed,
    outcome: healthy ? 'ONLINE' : 'OFFLINE',
    finalUrl,
    redirected: finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, ''),
    tls,
    message: healthy
      ? `Responded HTTP ${res.status} in ${elapsed} ms.`
      : `Responded HTTP ${res.status} in ${elapsed} ms, which is not a healthy response.`,
  };
}


/** Pull a record array out of a common JSON envelope, or null if absent. */
function recordsFrom(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return null;
  const r = body as Record<string, unknown>;
  for (const k of ['data', 'results', 'items', 'records', 'products', 'orders', 'customers', 'payments']) {
    if (Array.isArray(r[k])) return r[k] as unknown[];
  }
  return null;
}

function reportedTotalFrom(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const r = body as Record<string, unknown>;
  const t = Number(r.total ?? r.count ?? r.totalCount ?? NaN);
  return Number.isFinite(t) ? t : null;
}

/**
 * Layer 2: probe the site's own API for business capabilities.
 *
 * Only resources that actually answer are reported. A 404 means NOT_PROVIDED
 * and a 401/403 means NOT_AUTHORIZED — never "available with zero records",
 * which would present an unreadable resource as an empty business.
 */
export async function probeWebsiteBusiness(
  url: string,
  options: ProbeOptions = {},
): Promise<WebsiteBusinessCapability[]> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const paths = options.businessPaths ?? BUSINESS_PROBE_PATHS;

  let base: string;
  try {
    base = new URL(url).origin;
  } catch {
    return [];
  }

  const out: WebsiteBusinessCapability[] = [];
  for (const entry of paths) {
    const target = `${base}${entry.path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number | null = null;
    let recordCount: number | null = null;
    let reportedTotal: number | null = null;
    let state: WebsiteBusinessCapability['status'];
    let message: string;

    try {
      const res = await doFetch(target, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(options.businessHeaders ?? {}) },
        signal: controller.signal,
      });
      status = res.status;
      if (res.status === 401 || res.status === 403) {
        state = 'NOT_AUTHORIZED';
        message = `Responded ${res.status}; the credential in use is not permitted to read this.`;
      } else if (res.status === 404 || res.status === 405) {
        state = 'NOT_PROVIDED';
        message = `This site does not publish ${entry.label} at ${entry.path}.`;
      } else if (!res.ok) {
        state = 'UNAVAILABLE';
        message = `Responded ${res.status} for ${entry.label}.`;
      } else {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = undefined;
        }
        const arr = body === undefined ? null : recordsFrom(body);
        if (arr === null) {
          state = 'UNAVAILABLE';
          message = `${entry.label} answered with no recognisable record list, so no records could be read.`;
        } else {
          recordCount = arr.length;
          reportedTotal = reportedTotalFrom(body);
          state = arr.length === 0 ? 'EMPTY' : 'AVAILABLE';
          message =
            arr.length === 0
              ? `${entry.label} is published but currently returns no records.`
              : `${entry.label}: retrieved ${arr.length} record(s).`;
        }
      }
    } catch (err) {
      state = 'UNAVAILABLE';
      message = `${entry.label} could not be reached (${err instanceof Error ? err.message : 'request failed'}).`;
    } finally {
      clearTimeout(timer);
    }

    out.push({
      resource: entry.resource, label: entry.label, path: entry.path,
      status: state, httpStatus: status, recordCount, reportedTotal, message,
    });
  }
  return out;
}

/**
 * Both layers in one call. Website monitoring and business integration stay
 * separate in the result so the UI can present them apart (§6/§15).
 */
export async function inspectWebsite(
  url: string,
  options: ProbeOptions = {},
): Promise<{ technical: WebsiteTechnicalReport; business: WebsiteBusinessCapability[] }> {
  const technical = await probeWebsite(url, options);
  const business = await probeWebsiteBusiness(url, options);
  return { technical, business };
}


