/**
 * Real-source retrieval and status honesty.
 *
 * These tests pin the defects found against the REAL Ellines Haven source:
 *
 *  1. The real payload puts its records under `books` — a container name no
 *     fixed key list contains. The old extractor returned null, EIP discarded
 *     all the real books, and reported a COMPLETE retrieval of zero.
 *  2. The source-reported total was read only AFTER the early-exit branch, so a
 *     real `count` was thrown away.
 *  3. `last_sync_at` was read by the health and capability endpoints but written
 *     by no sync path, so freshness could never be verified.
 *  4. `health_score` was coerced to 0, turning UNKNOWN into a real reading.
 *
 * They also pin the rules that must survive: no AVAILABLE over an empty read,
 * no fabricated record counts, and no health state derived from a stored flag.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractRecords, findRecordArray, retrieveAllPages } from '../shared/pagination';
import { applyOutcomes } from '../shared/capability-store';
import {
  toConnectorRow,
  toRegistryRow,
  toSourceRow,
} from '../api/v1/orgs/me/sources';
import {
  buildSourceGraph,
  effectiveSyncIntervalMinutes,
  freshnessFrom,
  type ConnectorRow,
  type SourceRow,
} from '@ellines-eip/shared';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * The REAL shape returned by the Ellines Haven catalogue API, captured from a
 * live request. It is a structural fixture: no assertion depends on the
 * specific records, and nothing here is invented beyond what the live payload
 * demonstrated (a `count` plus a `books` array of objects).
 */
const REAL_HAVEN_PAYLOAD = {
  success: true,
  api: 'ellines-haven-catalogue',
  version: '1',
  business: 'Ellines Haven',
  currency: 'KES',
  count: 2,
  books: [
    { id: '1', title: 'Marriage Is a Scam', price: 350, type: 'novel' },
    { id: '2', title: 'The Debt Collector', price: 420, type: 'novel' },
  ],
};

/** A fetchPage serving one fixed body, standing in for the real transport. */
function serving(body: unknown, status = 200) {
  return async () => ({ body, headers: {}, status });
}

/**
 * A timestamp N minutes before the run. Freshness fixtures must be relative: a
 * fixed date turns FRESH into STALE the moment the suite runs later.
 */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// ── 1. Record extraction is evidence-based, not a key list ───────────────────

describe('real-source record extraction', () => {
  it('reads records from the source OWN collection name (the real Haven shape)', () => {
    const records = extractRecords(REAL_HAVEN_PAYLOAD);
    expect(records).not.toBeNull();
    expect(records).toHaveLength(2);
  });

  it('preserves the source own resource name so retrieval binds to the capability', () => {
    // `books` is what ties a record count to a capability. An EIP-invented
    // label would decouple the two.
    expect(findRecordArray(REAL_HAVEN_PAYLOAD).name).toBe('books');
  });

  it('still reads the conventional envelopes', () => {
    expect(extractRecords({ data: [{ id: 1 }] })).toHaveLength(1);
    expect(extractRecords({ results: { items: [{ id: 1 }, { id: 2 }] } })).toHaveLength(2);
    expect(extractRecords([{ id: 1 }])).toHaveLength(1);
  });

  it('does not treat a scalar list as records', () => {
    // ids or tags are not rows. Presenting them as records would manufacture
    // entries the source never described, so there is no record array at all.
    expect(extractRecords({ tags: ['a', 'b', 'c'] })).toBeNull();
  });

  it('returns no name for a body with no record collection', () => {
    // A bare acknowledgement has no collection. If EIP cannot name the
    // resource it cannot bind a count to a capability, so it must say so.
    const found = findRecordArray({ ok: true, message: 'catalogue online' });
    expect(found.records).toEqual([]);
    expect(found.name).toBeNull();
  });

  it('does not guess a collection name from an object-shaped body', () => {
    expect(findRecordArray({ book: { id: '1' } }).name).toBeNull();
  });
});

// ── 2. Retrieval carries the real counts and keeps the reported total ────────

describe('retrieval against a real-source payload', () => {
  it('retrieves every record and keeps the source-reported total', async () => {
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue',
      fetchPage: serving(REAL_HAVEN_PAYLOAD),
    });

    expect(result.retrievedRecordCount).toBe(2);
    // The total the SOURCE published, not one derived from what EIP kept.
    expect(result.reportedRecordCount).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports the real resource name', async () => {
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue',
      fetchPage: serving(REAL_HAVEN_PAYLOAD),
    });
    expect(result.resourceName).toBe('books');
  });

  it('does NOT claim a complete retrieval of zero when records were present', async () => {
    // This is the exact failure: HTTP 200, real books, zero persisted,
    // complete: true. An unreadable body is a failure, not an empty page.
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue',
      fetchPage: serving({ ok: true, message: 'nothing useful here' }),
    });
    expect(result.retrievedRecordCount).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('does not claim complete when the source reported records but returned none', async () => {
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue',
      fetchPage: serving({ count: 15 }),
    });
    expect(result.retrievedRecordCount).toBe(0);
    expect(result.reportedRecordCount).toBe(15);
    expect(result.complete).toBe(false);
  });

  it('surfaces a real transport failure instead of an empty success', async () => {
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue',
      fetchPage: async () => ({ body: null, headers: {}, status: 503 }),
    });
    expect(result.complete).toBe(false);
    expect(result.errors[0].reason).toContain('503');
  });

  it('reports a genuine empty collection as complete with zero records', async () => {
    // An empty array is a real answer, distinguishable from an unreadable body.
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue',
      fetchPage: serving({ success: true, count: 0, books: [] }),
    });
    expect(result.retrievedRecordCount).toBe(0);
    expect(result.reportedRecordCount).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.stopReason).toBe('empty-page');
  });

  it('follows real pagination when the source provides it', async () => {
    const pages: Record<string, unknown> = {
      'https://source.example/catalogue?page=1': { success: true, count: 3, books: [{ id: '1' }, { id: '2' }] },
      'https://source.example/catalogue?page=2': { success: true, count: 3, books: [{ id: '3' }] },
    };
    const result = await retrieveAllPages({
      startUrl: 'https://source.example/catalogue?page=1',
      fetchPage: async (url) => ({
        body: {
          ...pages[url] as object,
          // The source publishes its own next link, so EIP follows the source
          // rather than guessing a page parameter it never advertised.
          next: url.endsWith('page=1') ? 'https://source.example/catalogue?page=2' : null,
        },
        headers: {},
        status: 200,
      }),
    });
    expect(result.retrievedRecordCount).toBe(3);
    expect(result.pagesFetched).toBe(2);
    expect(result.strategy).toBe('next-link');
    expect(result.complete).toBe(true);
  });
});

// ── 3. No AVAILABLE over an empty read ──────────────────────────────────────

describe('capability availability from a real retrieval', () => {
  const registry = (availability: string) =>
    ({
      systemName: 'test',
      discoveryMethod: 'openapi',
      discoveredAt: '2026-01-01T00:00:00.000Z',
      relationships: [],
      resources: [
        {
          id: 'books',
          label: 'Books',
          path: '/books',
          operations: ['GET'],
          pagination: 'unknown',
          availability,
        },
      ],
    }) as never;

  it('marks AVAILABLE only when records were actually retrieved', () => {
    const out = applyOutcomes(registry('NOT_YET_SUPPORTED'), [
      {
        resource: 'books',
        ok: true,
        retrievedRecordCount: 15,
        reportedRecordCount: 15,
        complete: true,
        stopReason: 'complete',
      },
    ]);
    expect(out.resources[0].availability).toBe('AVAILABLE');
    expect(out.resources[0].retrievedRecordCount).toBe(15);
  });

  it('refuses AVAILABLE over a zero-record read', () => {
    // The live defect: AVAILABLE with retrievedRecordCount 0.
    const out = applyOutcomes(registry('NOT_YET_SUPPORTED'), [
      {
        resource: 'books',
        ok: true,
        retrievedRecordCount: 0,
        reportedRecordCount: 0,
        complete: true,
        stopReason: 'empty-page',
      },
    ]);
    expect(out.resources[0].availability).toBe('UNAVAILABLE');
  });

  it('marks a truncated read PARTIAL, never AVAILABLE', () => {
    const out = applyOutcomes(registry('NOT_YET_SUPPORTED'), [
      {
        resource: 'books',
        ok: true,
        retrievedRecordCount: 5,
        reportedRecordCount: 15,
        complete: false,
        stopReason: 'max-pages',
      },
    ]);
    expect(out.resources[0].availability).toBe('PARTIAL');
  });

  it('ignores an outcome for a resource discovery never found', () => {
    const out = applyOutcomes(registry('NOT_YET_SUPPORTED'), [
      {
        resource: 'orders',
        ok: true,
        retrievedRecordCount: 10,
        reportedRecordCount: 10,
        complete: true,
        stopReason: 'complete',
      },
    ]);
    // Inventing an `orders` resource here is the exact capability fabrication
    // the capability model exists to prevent.
    expect(out.resources.map((r) => r.id)).toEqual(['books']);
  });
});

// ── 4. Freshness is measured, not assumed ──────────────────────────────────

describe('freshness', () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z');

  it('is UNKNOWN when nothing was ever retrieved', () => {
    const f = freshnessFrom(null, 15, now);
    expect(f.state).toBe('UNKNOWN');
    // Age stays unknown — rendering it as 0 minutes would read as "just now".
    expect(f.ageMinutes).toBeNull();
    expect(f.lastSuccessfulSyncAt).toBeNull();
  });

// ── 5. No fake health, no fake counts in the graph ──────────────────────────

  it('is UNKNOWN for an unparsable timestamp, not "just now"', () => {
    const f = freshnessFrom('not-a-date', 15, now);
    expect(f.state).toBe('UNKNOWN');
  });

  it('is FRESH inside the configured interval', () => {
    const f = freshnessFrom('2026-09-30T11:50:00.000Z', 15, now);
    expect(f.state).toBe('FRESH');
    expect(f.ageMinutes).toBe(10);
  });

  it('is STALE past twice the configured interval', () => {
    const f = freshnessFrom('2026-09-30T11:00:00.000Z', 15, now);
    expect(f.state).toBe('STALE');
  });

  it('prefers the configured interval over the stale default column', () => {
    // The live defect: the real connector stores syncIntervalMinutes 15 while
    // its column still read 3600, so freshness was judged against 60 minutes.
    const connector = {
      id: 'c1',
      organizationId: 'o1',
      displayName: 'Ellines Haven Main',
      catalogId: 'rest-api',
      status: 'synced',
      config: { syncIntervalMinutes: 15 },
      syncIntervalSeconds: 3600,
    } as ConnectorRow;
    expect(effectiveSyncIntervalMinutes(connector)).toBe(15);
  });

  it('falls back to the column when no interval is configured', () => {
    const connector = {
      id: 'c1',
      organizationId: 'o1',
      displayName: 'X',
      catalogId: 'rest-api',
      status: 'synced',
      config: {},
      syncIntervalSeconds: 1800,
    } as ConnectorRow;
    expect(effectiveSyncIntervalMinutes(connector)).toBe(30);
  });
});

// ── 5. No fake health, no fake counts in the graph ──────────────────────────

describe('source graph honesty', () => {
  const connector: ConnectorRow = {
    id: 'inst-1',
    organizationId: 'org-1',
    displayName: 'Ellines Haven Main',
    catalogId: 'rest-api',
    status: 'synced',
    config: { authType: 'none', syncIntervalMinutes: 15 },
    lastSyncAt: minutesAgo(2),
    lastSyncedAt: minutesAgo(2),
  };

  const source: SourceRow = {
    id: 'src-1',
    organizationId: 'org-1',
    sourceType: 'BUSINESS_SYSTEM',
    name: 'Ellines Haven Main',
    websiteUrl: null,
    metadata: { connectorId: 'inst-1' },
  };

  it('reports no website when none is configured, rather than inventing one', () => {
    const g = buildSourceGraph({
      organizationId: 'org-1',
      organizationName: 'Ellines Haven',
      sources: [source],
      connectors: [connector],
      registries: [],
      measurements: [],
    });
    expect(g.website).toBeNull();
    expect(g.counts.websites).toBe(0);
  });

  it('never reports CONNECTED merely because a connector row exists', () => {
    // No registry => nothing discovered => nothing read.
    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [source],
      connectors: [connector],
      registries: [],
      measurements: [],
    });
    const sys = g.businessSystems[0];
    expect(sys.status).toBe('NOT_CONNECTED');
    expect(sys.completeness).toBeNull();
    expect(sys.availableResourceCount).toBeNull();
    expect(sys.totalResourceCount).toBeNull();
  });

  it('separates the system from the connector that serves it', () => {
    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [source],
      connectors: [connector],
      registries: [],
      measurements: [],
    });
    const sys = g.businessSystems[0];
    expect(sys.name).toBe('Ellines Haven Main');
    expect(sys.connectorIds).toEqual(['inst-1']);
    // The connector is reported as a mechanism with its own auth and freshness.
    expect(g.connectors[0].authentication.authType).toBe('none');
    expect(g.connectors[0].freshness.state).toBe('FRESH');
  });

  it('lists ONLY the resources the real registry contains', () => {
    const registry = {
      installationId: 'inst-1',
      registry: {
        systemName: 'Ellines Haven Main API',
        discoveryMethod: 'openapi',
        discoveredAt: '2026-09-30T11:58:00.000Z',
        relationships: [],
        resources: [
          {
            id: 'books',
            label: 'Books',
            path: '/books',
            operations: ['GET'],
            pagination: 'unknown',
            availability: 'AVAILABLE',
            retrievedRecordCount: 15,
            reportedRecordCount: 15,
            complete: true,
            lastRetrievedAt: '2026-09-30T11:58:30.000Z',
          },
        ],
      },
    } as never;

    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [source],
      connectors: [connector],
      registries: [registry],
      measurements: [],
    });
    const sys = g.businessSystems[0];
    expect(sys.status).toBe('CONNECTED');
    expect(sys.resources.map((r) => r.id)).toEqual(['books']);
    // No Sales/Orders/HR/Fleet may appear: the source never returned them.
    expect(sys.resources.map((r) => r.id)).not.toContain('orders');
    expect(sys.resources.map((r) => r.id)).not.toContain('employees');
    expect(sys.availableResourceCount).toBe(1);
    expect(g.counts.availableResources).toBe(1);
  });

  it('carries many resources through ONE connector', () => {
    // Phase 1/4 guarantee: one connection, many capabilities. EIP must never
    // require a separate connector per business module.
    const registry = {
      installationId: 'inst-1',
      registry: {
        systemName: 'Acme Business System',
        discoveryMethod: 'openapi',
        discoveredAt: '2026-09-30T11:58:00.000Z',
        relationships: [],
        resources: ['employees', 'payroll', 'sales', 'inventory', 'fleet'].map((id) => ({
          id,
          label: id,
          path: `/${id}`,
          operations: ['GET'],
          pagination: 'none',
          availability: 'AVAILABLE',
          retrievedRecordCount: 3,
          reportedRecordCount: 3,
          complete: true,
          lastRetrievedAt: '2026-09-30T11:58:30.000Z',
        })),
      },
    } as never;

    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [source],
      connectors: [connector],
      registries: [registry],
      measurements: [],
    });
    const sys = g.businessSystems[0];
    expect(g.connectors).toHaveLength(1);
    expect(sys.connectors).toHaveLength(1);
    expect(sys.resources).toHaveLength(5);
    expect(sys.completeness).toBe('COMPLETE');
  });

  it('renders an unmeasured website as nulls, never as zero or healthy', () => {
    const websiteSource: SourceRow = {
      id: 'src-web',
      organizationId: 'org-1',
      sourceType: 'WEBSITE',
      name: 'Company site',
      websiteUrl: 'https://example.com',
    };
    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [websiteSource],
      connectors: [],
      registries: [],
      measurements: [],
    });
    const w = g.website!;
    expect(w.outcome).toBeNull();
    expect(w.httpStatus).toBeNull();
    expect(w.responseTimeMs).toBeNull();
    expect(w.tls.valid).toBeNull();
    expect(w.lastCheckedAt).toBeNull();
    expect(w.freshness.state).toBe('UNKNOWN');
  });

  it('surfaces a real failed website measurement verbatim', () => {
    const websiteSource: SourceRow = {
      id: 'src-web',
      organizationId: 'org-1',
      sourceType: 'WEBSITE',
      name: 'Company site',
      websiteUrl: 'https://example.com',
    };
    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [websiteSource],
      connectors: [],
      registries: [],
      measurements: [
        {
          sourceId: 'src-web',
          checkedAt: '2026-09-30T11:00:00.000Z',
          outcome: 'DNS_FAILURE',
          httpStatus: null,
          responseTimeMs: null,
          redirected: null,
          finalUrl: null,
          tlsValid: null,
          tlsIssuer: null,
          tlsSubject: null,
          tlsValidTo: null,
          message: 'DNS lookup failed',
        },
      ],
    });
    const w = g.website!;
    expect(w.outcome).toBe('DNS_FAILURE');
    // No response arrived, so there is no status and no latency — null, not 0.
    expect(w.httpStatus).toBeNull();
    expect(w.responseTimeMs).toBeNull();
  });
});

// ── 6. The code itself must not reintroduce the defects ────────────────────

describe('no fabricated values on the sync and status paths', () => {
  const SYNC = 'apps/web/functions/api/v1/connectors/installations/[id]/sync.ts';
  const PLATFORM_SYNC =
    'apps/web/functions/api/v1/platform/orgs/[id]/connector-installations/[connId]/sync.ts';
  const HEALTH = 'apps/web/functions/api/v1/connectors/health.ts';
  const GRAPH = 'packages/shared/src/source-graph.ts';

  it('never coerces an unknown health score to 0', () => {
    expect(read(SYNC)).not.toMatch(/health_score:\s*aggHealthScore\s*\?\?\s*0/);
  });

  it('writes last_sync_at so freshness can be verified after a sync', () => {
    // No path wrote it before, so every connector drifted to STALE regardless
    // of how recently it had actually synced.
    expect(read(SYNC)).toMatch(/last_sync_at:\s*now/);
  });

  it('does not mutate connector state from the health GET', () => {
    // A read endpoint that rewrites `status` corrupts the state it reports.
    const src = read(HEALTH);
    const insideMap = src.slice(src.indexOf('const connectors = installations.map'));
    expect(insideMap).not.toMatch(/\.update\(\{\s*status:\s*'degraded'/);
  });

  it('the platform sync path uses the real retrieval engine', () => {
    // A Super Admin sync previously bypassed retrieveAllPages entirely, so it
    // persisted no retrieval evidence and never rebuilt the capability registry.
    const src = read(PLATFORM_SYNC);
    expect(src).toMatch(/retrieveAllPages/);
    expect(src).toMatch(/saveCapabilityRegistry/);
    expect(src).toMatch(/last_sync_at:\s*now/);
  });

  it('never hardcodes the real Haven endpoint into production logic', () => {
    for (const p of [SYNC, PLATFORM_SYNC, HEALTH]) {
      expect(read(p)).not.toContain('us-central1-ellines-haven-web');
    }
  });

  it('does not derive CONNECTED from the existence of a connector row', () => {
    // CONNECTED requires a genuinely AVAILABLE resource.
    expect(read(GRAPH)).toMatch(/available\.length > 0 \? 'CONNECTED' : 'NOT_CONNECTED'/);
  });

  it('never defaults a resource count to 0 in the graph', () => {
    const src = read(GRAPH);
    // Counts stay null until something was actually discovered or read.
    expect(src).not.toMatch(/retrievedRecordCount:\s*r\.retrievedRecordCount \?\? 0/);
    expect(src).not.toMatch(/reportedRecordCount:\s*r\.reportedRecordCount \?\? 0/);
  });
});

// ── 7. DB rows are mapped, never cast ────────────────────────────────────────
//
// Live defect found against the real database: the sources endpoint selected
// snake_case columns and cast the rows straight into the camelCase graph types.
// It compiled, ran, and returned `resources: []` for a registry that really
// contained `books` with 15 read records, and `lastSuccessfulSyncAt: null` for a
// connector whose `last_sync_at` was genuinely set.

describe('database rows reach the graph intact', () => {
  // The actual row shapes PostgREST returns for the real Haven org.
  const dbSource = {
    id: 'src_5f71030c94c68aca2bcc2c8758799983',
    organization_id: 'org-1',
    source_type: 'BUSINESS_SYSTEM',
    name: 'Ellines Haven Main',
    website_url: null,
    description: null,
    metadata: { connectorId: '7d90d814-aaac-4f92-9c53-204b3e18ace3' },
  };

  const dbConnector = {
    id: '7d90d814-aaac-4f92-9c53-204b3e18ace3',
    organization_id: 'org-1',
    display_name: 'Ellines Haven Main',
    catalog_id: 'rest-api',
    status: 'synced',
    config: { authType: 'none', syncIntervalMinutes: 15 },
    last_synced_at: minutesAgo(2),
    last_sync_at: minutesAgo(2),
    last_test_at: null,
    last_message: 'Synced — health unknown',
    last_error: null,
    error_count: 0,
    lifecycle_state: null,
    sync_interval_seconds: 3600,
  };

  const dbRegistry = {
    installation_id: '7d90d814-aaac-4f92-9c53-204b3e18ace3',
    discovered_at: minutesAgo(2),
    registry: {
      systemName: 'Ellines Haven Main API',
      discoveryMethod: 'openapi',
      discoveredAt: minutesAgo(2),
      relationships: [],
      resources: [
        {
          id: 'books',
          label: 'Books',
          path: '/books',
          operations: ['GET'],
          pagination: 'unknown',
          availability: 'AVAILABLE',
          reason: 'complete',
          complete: true,
          retrievedRecordCount: 15,
          reportedRecordCount: 15,
          lastRetrievedAt: minutesAgo(2),
        },
      ],
    },
  };

  it('maps a snake_case connector row without losing the sync timestamp', () => {
    const c = toConnectorRow(dbConnector);
    expect(c.lastSyncAt).toBe(dbConnector.last_sync_at);
    expect(c.displayName).toBe('Ellines Haven Main');
    // The column default is 3600s; the connector is configured to 15 minutes.
    expect(effectiveSyncIntervalMinutes(c)).toBe(15);
  });

  it('maps a snake_case source row onto its real type', () => {
    const s = toSourceRow(dbSource);
    expect(s.sourceType).toBe('BUSINESS_SYSTEM');
    expect(s.websiteUrl).toBeNull();
    expect(s.metadata?.connectorId).toBe(dbConnector.id);
  });

  it('does not drop a real registry that arrives as snake_case', () => {
    const r = toRegistryRow(dbRegistry);
    expect(r).not.toBeNull();
    expect(r!.installationId).toBe(dbConnector.id);
    expect(r!.registry.resources).toHaveLength(1);
  });

  it('renders the real read of 15 books once the rows are mapped', () => {
    const g = buildSourceGraph({
      organizationId: 'org-1',
      sources: [toSourceRow(dbSource)],
      connectors: [toConnectorRow(dbConnector)],
      registries: [toRegistryRow(dbRegistry)!].filter(Boolean),
      measurements: [],
    });
    const sys = g.businessSystems[0];
    // The cast bug produced `unassigned:<id>` and an empty resource list.
    expect(sys.id).toBe('src_5f71030c94c68aca2bcc2c8758799983');
    expect(sys.resources.map((r) => r.id)).toEqual(['books']);
    expect(sys.resources[0].retrievedRecordCount).toBe(15);
    expect(sys.resources[0].reportedRecordCount).toBe(15);
    expect(sys.status).toBe('CONNECTED');
    expect(sys.availableResourceCount).toBe(1);
    expect(g.connectors[0].freshness.state).toBe('FRESH');
    expect(g.connectors[0].sourceId).toBe('src_5f71030c94c68aca2bcc2c8758799983');
    expect(g.counts.availableResources).toBe(1);
  });

  it('a registry row whose payload is not a registry is skipped, not called empty', () => {
    expect(toRegistryRow({ installation_id: 'x', registry: null })).toBeNull();
    expect(toRegistryRow({ installation_id: 'x', registry: { resources: 'nope' } })).toBeNull();
  });
});

