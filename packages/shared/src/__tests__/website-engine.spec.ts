/**
 * Website engine tests (Phases 2 + 3).
 *
 * The properties that matter:
 *  1. Layer 1 (monitoring) and Layer 2 (business) stay separate.
 *  2. Every number is measured from a real response, never invented.
 *  3. A 404 is NOT_PROVIDED, not "available with zero records".
 *  4. A 401/403 is NOT_AUTHORIZED, never an empty business.
 *  5. TLS is honestly UNKNOWN when it cannot be inspected.
 */
import {
  probeWebsite,
  probeWebsiteBusiness,
  inspectWebsite,
  BUSINESS_PROBE_PATHS,
} from '../website-engine';

/** Build a fetch stub from a path → response map. */
function stubFetch(routes: Record<string, { status: number; body?: unknown }>) {
  return (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const hit = routes[url] ?? routes[Object.keys(routes).find((k) => url.endsWith(k)) ?? ''];
    if (!hit) throw Object.assign(new Error(`fetch failed: ${url}`), { name: 'TypeError' });
    return new Response(hit.body === undefined ? '' : JSON.stringify(hit.body), {
      status: hit.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('Layer 1 — website monitoring is measured, not invented', () => {
  it('reports ONLINE with a real status and real elapsed time', async () => {
    const r = await probeWebsite('https://shop.example.com', {
      fetchImpl: stubFetch({ 'https://shop.example.com': { status: 200, body: {} } }),
    });
    expect(r.outcome).toBe('ONLINE');
    expect(r.httpStatus).toBe(200);
    // A real measurement, not a fabricated one.
    expect(typeof r.responseTimeMs).toBe('number');
    expect(r.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a 500 as OFFLINE, not as an available site', async () => {
    const r = await probeWebsite('https://shop.example.com', {
      fetchImpl: stubFetch({ 'https://shop.example.com': { status: 500, body: {} } }),
    });
    expect(r.outcome).toBe('OFFLINE');
    expect(r.httpStatus).toBe(500);
  });

  it('distinguishes DNS failure, TLS failure and timeout', async () => {
    const dns = await probeWebsite('https://nope.invalid', {
      fetchImpl: (async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { name: 'TypeError' }); }) as any,
    });
    expect(dns.outcome).toBe('DNS_FAILURE');

    const tls = await probeWebsite('https://badssl.example.com', {
      fetchImpl: (async () => { throw Object.assign(new Error('self signed certificate'), { name: 'TypeError' }); }) as any,
    });
    expect(tls.outcome).toBe('TLS_FAILURE');

    const timeout = await probeWebsite('https://slow.example.com', {
      fetchImpl: (async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) as any,
    });
    expect(timeout.outcome).toBe('TIMEOUT');
  });

  it('reports TLS as UNKNOWN when no inspector is available', async () => {
    const r = await probeWebsite('https://shop.example.com', {
      fetchImpl: stubFetch({ 'https://shop.example.com': { status: 200, body: {} } }),
    });
    expect(r.tls.valid).toBeNull();
  });

  it('refuses an invalid URL rather than reporting a status', async () => {
    const r = await probeWebsite('not-a-url');
    expect(r.outcome).toBe('NOT_CHECKED');
    expect(r.httpStatus).toBeNull();
  });
});


describe('Layer 2 — business capabilities come only from what answers', () => {
  const paths = BUSINESS_PROBE_PATHS.slice(0, 3);

  it('marks a 404 resource NOT_PROVIDED, never an empty business', async () => {
    const caps = await probeWebsiteBusiness('https://shop.example.com', {
      businessPaths: paths,
      fetchImpl: stubFetch({
        '/api/products': { status: 200, body: { data: [{ id: 1 }, { id: 2 }] } },
        '/api/categories': { status: 404 },
        '/api/orders': { status: 404 },
      }),
    });
    expect(caps.find((c) => c.resource === 'products')?.status).toBe('AVAILABLE');
    expect(caps.find((c) => c.resource === 'products')?.recordCount).toBe(2);
    expect(caps.find((c) => c.resource === 'categories')?.status).toBe('NOT_PROVIDED');
    expect(caps.find((c) => c.resource === 'orders')?.status).toBe('NOT_PROVIDED');
  });

  it('marks a 401 NOT_AUTHORIZED rather than an empty result', async () => {
    const caps = await probeWebsiteBusiness('https://shop.example.com', {
      businessPaths: paths,
      fetchImpl: stubFetch({
        '/api/products': { status: 200, body: { data: [{ id: 1 }] } },
        '/api/categories': { status: 200, body: { data: [] } },
        '/api/orders': { status: 401 },
      }),
    });
    expect(caps.find((c) => c.resource === 'orders')?.status).toBe('NOT_AUTHORIZED');
    // A genuinely empty list is EMPTY, distinct from unauthorized.
    expect(caps.find((c) => c.resource === 'categories')?.status).toBe('EMPTY');
  });

  it('separates a reported total from the records actually retrieved', async () => {
    const caps = await probeWebsiteBusiness('https://shop.example.com', {
      businessPaths: [{ path: '/api/products', label: 'Products', resource: 'products' }],
      fetchImpl: stubFetch({
        '/api/products': { status: 200, body: { data: [{ id: 1 }], total: 500 } },
      }),
    });
    const c = caps[0];
    expect(c.recordCount).toBe(1);
    expect(c.reportedTotal).toBe(500);
  });

  it('does not report a capability when the body has no record list', async () => {
    const caps = await probeWebsiteBusiness('https://shop.example.com', {
      businessPaths: [{ path: '/api/products', label: 'Products', resource: 'products' }],
      fetchImpl: stubFetch({ '/api/products': { status: 200, body: { message: 'ok' } } }),
    });
    expect(caps[0].status).toBe('UNAVAILABLE');
    expect(caps[0].recordCount).toBeNull();
  });
});

describe('Both layers stay separate', () => {
  it('returns technical and business results independently', async () => {
    const out = await inspectWebsite('https://shop.example.com', {
      businessPaths: [{ path: '/api/products', label: 'Products', resource: 'products' }],
      fetchImpl: stubFetch({
        'https://shop.example.com': { status: 200, body: { ok: true } },
        '/api/products': { status: 200, body: { data: [{ id: 1 }] } },
      }),
    });
    expect(out.technical.outcome).toBe('ONLINE');
    expect(out.business).toHaveLength(1);
    expect(out.business[0].status).toBe('AVAILABLE');
    // Layer 1 knows nothing about products; Layer 2 knows nothing about uptime.
    expect((out.technical as unknown as Record<string, unknown>).business).toBeUndefined();
  });
});

