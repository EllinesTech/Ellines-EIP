/**
 * Generic source discovery tests.
 *
 * The point of this module is that EIP contains no hardcoded knowledge of any
 * business system. These tests prove discovery is derived from the target:
 * a spec is used when published, a site with no spec reports that honestly,
 * and nothing is invented either way.
 */
import { discoverSource, toEndpointDefs } from '../source-discovery';

function stub(routes: Record<string, { status: number; body: string; ct?: string }>) {
  return (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const hit = routes[url] ?? routes[Object.keys(routes).find((k) => url.endsWith(k)) ?? ''];
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(hit.body, { status: hit.status, headers: { 'content-type': hit.ct ?? 'text/html' } });
  }) as unknown as typeof fetch;
}

const SPEC = JSON.stringify({
  openapi: '3.0.0',
  paths: {
    '/employees': { get: { tags: ['HR'], parameters: [{ name: 'page' }, { name: 'pageSize' }] } },
    '/orders': { get: { tags: ['Sales'] }, post: { tags: ['Sales'] } },
    '/vehicles': { get: { tags: ['Fleet'] } },
  },
});

const specRoutes = {
  'https://acme.test': { status: 200, body: '<html></html>' },
  '/openapi.json': { status: 200, body: SPEC, ct: 'application/json' },
};

describe('discovery uses a published specification when there is one', () => {
  it('reads every documented path — nothing capped or dropped', async () => {
    const d = await discoverSource('https://acme.test', { fetchImpl: stub(specRoutes) });
    expect(d.reachable).toBe(true);
    expect(d.methods).toContain('openapi');
    const paths = d.endpoints.filter((e) => e.evidence === 'openapi').map((e) => `${e.method} ${e.path}`).sort();
    expect(paths).toEqual(['GET /employees', 'GET /orders', 'GET /vehicles', 'POST /orders']);
  });

  it('keeps the source own module tags and pagination params', async () => {
    const d = await discoverSource('https://acme.test', { fetchImpl: stub(specRoutes) });
    const employees = d.endpoints.find((e) => e.path === '/employees');
    expect(employees?.tags).toEqual(['HR']);
    expect(employees?.parameters).toEqual(['page', 'pageSize']);
  });

  it('assumes no module — only what the spec lists', async () => {
    const d = await discoverSource('https://fleetonly.test', {
      fetchImpl: stub({
        'https://fleetonly.test': { status: 200, body: '<html></html>' },
        '/openapi.json': {
          status: 200, ct: 'application/json',
          body: JSON.stringify({ paths: { '/vehicles': { get: {} }, '/drivers': { get: {} } } }),
        },
      }),
    });
    const paths = d.endpoints.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['/vehicles', '/drivers']));
    // Despite being reached via a generic path, no HR/sales/finance is invented.
    expect(paths.join()).not.toMatch(/employee|sale|invoice|payroll/);
  });
});

describe('a site with no specification is reported honestly', () => {
  it('says so rather than inventing endpoints', async () => {
    const d = await discoverSource('https://plain.test', {
      fetchImpl: stub({ 'https://plain.test': { status: 200, body: '<html><body>hi</body></html>' } }),
    });
    expect(d.reachable).toBe(true);
    expect(d.endpoints).toHaveLength(0);
    expect(d.notes.join(' ')).toContain('No machine-readable API specification');
  });

  it('reports an unreachable target instead of guessing', async () => {
    const d = await discoverSource('https://down.test', {
      fetchImpl: (async () => { throw Object.assign(new Error('fetch failed'), { name: 'TypeError' }); }) as any,
    });
    expect(d.reachable).toBe(false);
    expect(d.httpStatus).toBeNull();
    expect(d.endpoints).toHaveLength(0);
    expect(d.notes.join(' ')).toContain('did not respond');
  });
});


describe('what a page declares about itself is used as evidence', () => {
  it('reads JSON-LD structured data the site publishes', async () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'BookStore' })}</script>` +
      `<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization' })}</script></head></html>`;
    const d = await discoverSource('https://haven.test', {
      fetchImpl: stub({ 'https://haven.test': { status: 200, body: html } }),
    });
    expect(d.structuredDataTypes).toEqual(expect.arrayContaining(['BookStore', 'Organization']));
  });

  it('reads a published sitemap as a real page inventory', async () => {
    const d = await discoverSource('https://haven.test', {
      fetchImpl: stub({
        'https://haven.test': { status: 200, body: '<html></html>' },
        '/sitemap.xml': {
          status: 200, ct: 'application/xml',
          body: '<urlset><loc>https://haven.test/</loc><loc>https://haven.test/library</loc></urlset>',
        },
      }),
    });
    expect(d.pageInventory).toHaveLength(2);
    expect(d.methods).toContain('declared');
  });

  it('detects a framework signal without treating it as a capability', async () => {
    const d = await discoverSource('https://spa.test', {
      fetchImpl: stub({
        'https://spa.test': { status: 200, body: '<script type="module" src="/assets/index-abc.js"></script>' },
      }),
    });
    expect(d.signals).toContain('Vite SPA');
    // A signal is informational only.
    expect(d.endpoints).toHaveLength(0);
  });
});

describe('conversion to registry endpoints', () => {
  it('maps discovered endpoints into registry defs without loss', async () => {
    const d = await discoverSource('https://acme.test', { fetchImpl: stub(specRoutes) });
    expect(toEndpointDefs(d).length).toBe(d.endpoints.length);
  });
});

