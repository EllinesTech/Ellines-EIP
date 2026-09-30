/**
 * Controlled authorized test business system — "Ellines Haven" sample API.
 *
 * PURPOSE
 * -------
 * The EIP roadmap requires a REAL end-to-end connector proof
 * (connect -> authenticate -> test -> discover -> retrieve -> normalize ->
 *  display -> freshness -> health -> audit -> failure handling).
 *
 * No authorized Ellines Haven endpoint/credentials were available in this
 * environment, and fabricating a "passing" connector test would be dishonest.
 * Instead this script stands up a small, REAL, locally-hosted business system
 * with genuine HTTP semantics so the EIP connector engine can be exercised
 * against actual network I/O and real data.
 *
 * It is a genuine System of Record stand-in: real records, real timestamps,
 * stable identifiers, API-key authentication, pagination, and real failure
 * modes (401, 500, malformed JSON, hang-for-timeout).
 *
 * Routes
 * ------
 *   GET  /health                      → liveness, no auth
 *   GET  /api/v1/catalogue            → paginated record list (API key)
 *   GET  /api/v1/catalogue/:id        → single record (API key)
 *   POST /api/v1/catalogue            → create (API key) — proves write path
 *   GET  /api/v1/openapi.json         → OpenAPI 3 description of the above
 *   GET  /boom/flaky                 → always 500 (failure-path proof)
 *   GET  /boom/malformed             → 200 with invalid JSON body
 *   GET  /boom/unauthorized           → always 401
 *   GET  /boom/slow                  → never responds (timeout proof)
 *
 * Usage:  node scripts/haven-test-api.mjs [--port 4599] [--key demo-key]
 */

import { createServer } from 'node:http';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = Number(arg('port', '4599'));
const API_KEY = arg('key', 'haven-demo-key');

// ── Real business records ─────────────────────────────────────────────────────
// Stable ids, ISO timestamps, 6+ fields each — matching the roadmap's
// "test object" requirements (one org, real records, stable id, timestamps).
const CATALOGUE = [
  {
    id: 'room-haven-001',
    name: 'Executive Suite',
    category: 'accommodation',
    capacity: 4,
    nightlyRate: 42000,
    status: 'available',
    updatedAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'room-haven-002',
    name: 'Garden Cottage',
    category: 'accommodation',
    capacity: 2,
    nightlyRate: 18000,
    status: 'occupied',
    updatedAt: '2026-09-02T09:30:00.000Z',
  },
  {
    id: 'svc-haven-101',
    name: 'Conference Centre',
    category: 'events',
    capacity: 120,
    nightlyRate: 85000,
    status: 'available',
    updatedAt: '2026-09-03T11:15:00.000Z',
  },
  {
    id: 'svc-haven-102',
    name: 'Spa & Wellness',
    category: 'wellness',
    capacity: 20,
    nightlyRate: 25000,
    status: 'maintenance',
    updatedAt: '2026-09-04T14:45:00.000Z',
  },
];

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-correlation-id': `haven-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    'access-control-allow-origin': '*',
    ...headers,
  });
  res.end(payload);
}

function authorized(req) {
  const header = req.headers['x-api-key'];
  return typeof header === 'string' && header === API_KEY;
}

const OPENAPI_DOC = {
  openapi: '3.0.3',
  info: { title: 'Ellines Haven Business API', version: '1.0.0' },
  servers: [{ url: `http://127.0.0.1:${PORT}` }],
  components: {
    securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
    schemas: {
      CatalogueRecord: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: { type: 'string' },
          capacity: { type: 'integer' },
          nightlyRate: { type: 'number' },
          status: { type: 'string', enum: ['available', 'occupied', 'maintenance'] },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'status'],
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/api/v1/catalogue': {
      get: {
        operationId: 'listCatalogue',
        summary: 'List business records',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        operationId: 'createCatalogueRecord',
        summary: 'Create a record',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/v1/catalogue/{id}': {
      get: {
        operationId: 'getCatalogueRecord',
        summary: 'Get one record by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
    },
  },
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (pathname === '/health') {
    return send(res, 200, { status: 'ok', system: 'ellines-haven-sample', records: CATALOGUE.length });
  }

  if (pathname === '/api/v1/openapi.json') {
    return send(res, 200, OPENAPI_DOC);
  }

  // ── Deliberate failure modes for the connector failure-handling proof ───────
  if (pathname === '/boom/flaky') {
    return send(res, 500, { error: 'upstream_failure', message: 'Simulated upstream error' });
  }
  if (pathname === '/boom/malformed') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"count": 4, "records": [ {"id": "broken",  ');
  }
  if (pathname === '/boom/slow') {
    // Never responds — forces the caller's timeout to fire.
    return;
  }
  if (pathname === '/boom/unauthorized') {
    return send(res, 401, { error: 'unauthorized' });
  }
  
  if (pathname === '/api/v1/catalogue' && req.method === 'GET') {
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized', message: 'Missing or invalid X-API-Key' });
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '50') || 50));
    const start = (page - 1) * pageSize;
    const records = CATALOGUE.slice(start, start + pageSize);
    // NOTE: `count` is a generic RECORD count. EIP must map this to
    // `recordCount`, never to `connectedSystems` (connector spec REQ-1).
    return send(res, 200, {
      business: 'Ellines Haven',
      count: records.length,
      total: CATALOGUE.length,
      page,
      pageSize,
      health: 88,
      records,
      systemName: 'Ellines Haven Business API',
    });
  }

  if (pathname === '/api/v1/catalogue' && req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'invalid_json' }); }
      const created = {
        id: `room-haven-${String(CATALOGUE.length + 1).padStart(3, '0')}`,
        name: parsed.name ?? 'Unnamed',
        category: parsed.category ?? 'accommodation',
        capacity: Number(parsed.capacity ?? 1),
        nightlyRate: Number(parsed.nightlyRate ?? 0),
        status: 'available',
        updatedAt: new Date().toISOString(),
      };
      CATALOGUE.push(created);
      return send(res, 201, created);
    });
    return;
  }

  if (pathname.startsWith('/api/v1/catalogue/')) {
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    const id = decodeURIComponent(pathname.split('/').pop() ?? '');
    const found = CATALOGUE.find((r) => r.id === id);
    if (!found) return send(res, 404, { error: 'not_found', id });
    return send(res, 200, found);
  }

  return send(res, 404, { error: 'not_found', path: pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `Haven sample business API listening on http://127.0.0.1:${PORT}\n` +
    `  API key: ${API_KEY}\n` +
    `  Records:  ${CATALOGUE.length}\n` +
    `  OpenAPI:  http://127.0.0.1:${PORT}/api/v1/openapi.json\n`,
  );
});

