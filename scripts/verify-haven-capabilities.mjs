/**
 * Phase 4 real-source verification.
 *
 * Runs capability discovery against the REAL, configured Ellines Haven API and
 * reports exactly what the source supports. Read-only: it never writes to the
 * database, creates no tenant, and fabricates nothing.
 *
 * The endpoint is NOT hardcoded here — it is read from the real connector row
 * so the proof is against the actual production configuration.
 */
import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const shared = require('../packages/shared/dist/index.js');

const prisma = new PrismaClient();
const HAVEN_ORG = 'ellines-haven';

const orgs = await prisma.$queryRawUnsafe(`SELECT id, slug FROM organizations WHERE slug = '${HAVEN_ORG}'`);
if (!orgs.length) throw new Error(`org ${HAVEN_ORG} not found`);
const orgId = orgs[0].id;
console.log(`ORG  ${HAVEN_ORG}  (${orgId})`);

const installs = await prisma.$queryRawUnsafe(
  `SELECT id, display_name, catalog_id, status, config FROM connector_installations
   WHERE organization_id = '${orgId}'`,
);
if (!installs.length) throw new Error('no connector installation for this org');
const inst = installs[0];
const cfg = inst.config && typeof inst.config === 'object' ? inst.config : {};
const endpoint = cfg.endpoint;
console.log(`CONN ${inst.display_name}  catalog=${inst.catalog_id}  status=${inst.status}`);
console.log(`URL  ${endpoint}`);
if (!endpoint) throw new Error('connector has no endpoint configured');

const headers = {};
const get = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers } });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: res.status, text, bytes: text.length, parsed };
};

// 1. The real response from the configured endpoint.
const base = await get(endpoint);
console.log(`\nBASE  HTTP ${base.status}  ${base.bytes} bytes  json=${base.parsed !== null}`);
const reference = {
  path: '/',
  status: base.status,
  fingerprint: shared.fingerprint(base.parsed),
  bytes: base.bytes,
};

// 2. Probe conventional resource paths. Each is compared to the reference.
const PROBE_PATHS = [
  '/sales', '/orders', '/invoices', '/payments', '/customers', '/products',
  '/employees', '/departments', '/payroll', '/vehicles', '/drivers', '/inventory',
  '/bookings', '/accounts', '/reports', '/analytics',
];
const baseUrl = endpoint.replace(/\/+$/, '');
const others = [];
for (const p of PROBE_PATHS) {
  try {
    const r = await get(baseUrl + p);
    others.push({ path: p, status: r.status, fingerprint: shared.fingerprint(r.parsed), bytes: r.bytes });
  } catch (e) {
    others.push({ path: p, status: 0, fingerprint: `error:${e.message}`, bytes: 0 });
  }
}

// 3. Did the source actually honour paging? Compare against a real request.
let paginationObserved = 'unknown';
try {
  const p1 = await get(`${endpoint}?page=1&pageSize=2`);
  const p2 = await get(`${endpoint}?page=2&pageSize=2`);
  paginationObserved =
    shared.fingerprint(p1.parsed) === shared.fingerprint(p2.parsed) ? 'none' : 'page';
} catch { paginationObserved = 'unknown'; }

console.log(`PAGING  observed=${paginationObserved}`);

// 4. Derive capabilities from that real evidence.
const derived = shared.deriveRegistryFromResponse({
  systemName: cfg.systemName || inst.display_name,
  payload: base.parsed,
  probes: { reference, others },
  paginationObserved,
});

console.log('\n--- PROBE ASSESSMENT ---');
const a = shared.assessProbes(reference, others);
console.log(`distinct paths : ${a.distinct.length ? a.distinct.join(', ') : '(none)'}`);
console.log(`catch-all paths: ${a.catchAll.length} of ${others.length}`);
console.log(`failed paths   : ${a.failed.length ? a.failed.join(', ') : '(none)'}`);
console.log(`sourceIsCatchAll: ${a.sourceIsCatchAll}`);

console.log('\n--- DISCOVERED CAPABILITIES ---');
for (const r of derived.registry.resources) {
  console.log(`  ${r.id}  availability=${r.availability}  reported=${r.reportedRecordCount ?? '-'}`);
}
console.log(`total resources: ${derived.registry.resources.length}`);
console.log(`available      : ${shared.availableCapabilityCount(derived.registry)}`);
console.log(`reportedTotal  : ${derived.reportedTotal}`);
console.log(`rejectedPaths  : ${derived.rejectedPaths.length}`);

console.log('\n--- NOTES ---');
for (const n of derived.notes) console.log(`  - ${n}`);

await prisma.$disconnect();
