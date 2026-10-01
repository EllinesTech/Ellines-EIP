/**
 * Source graph — the separation between WEBSITE, BUSINESS_SYSTEM and CONNECTOR.
 *
 * These are the rules the dashboards depend on. They are pinned here because the
 * failure mode is silent: if a connector starts standing in for a system, or a
 * website starts reporting business record counts, every surface that reads this
 * graph quietly tells the client something false, and no test notices because
 * nothing threw.
 */

import {
  buildSourceGraph,
  countSourcesByType,
  type ConnectorRow,
  type RegistryRow,
  type SourceRow,
  type WebsiteMeasurementRow,
} from '../source-graph';
import type { DiscoveredResource } from '../capability-registry';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

/** A discovered resource with the fields the persisted registry always carries. */
function resource(overrides: Partial<DiscoveredResource> = {}): DiscoveredResource {
  return {
    id: 'resource',
    path: '/resource',
    label: 'Resource',
    operations: ['GET'],
    pagination: 'unknown',
    availability: 'AVAILABLE',
    ...overrides,
  };
}

function connector(overrides: Partial<ConnectorRow> = {}): ConnectorRow {
  return {
    id: 'conn-1',
    organizationId: 'org-1',
    displayName: 'Haven Main',
    catalogId: 'rest-api',
    status: 'synced',
    config: { authType: 'bearerToken', bearerToken: 'secret-value', syncIntervalMinutes: 60 },
    lastSyncedAt: iso(-5),
    ...overrides,
  };
}

/** A capability registry as discovery persists it (the books resource + extras). */
function capabilityRegistry(extra: DiscoveredResource[] = []): RegistryRow['registry'] {
  return {
    systemName: 'Haven API',
    discoveryMethod: 'openapi',
    discoveredAt: iso(-5),
    relationships: [],
    resources: [
      resource({
        id: 'books',
        path: '/books',
        label: 'Books',
        complete: true,
        lastRetrievedAt: iso(-5),
        reportedRecordCount: 15,
        retrievedRecordCount: 15,
      }),
      ...extra,
    ],
  };
}

/** One real resource discovered through the connector, exactly as persisted. */
function registry(
  resources: DiscoveredResource[],
  installationId = 'conn-1',
): RegistryRow {
  return { installationId, registry: capabilityRegistry(resources) };
}

function businessSystem(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: 'src-biz',
    organizationId: 'org-1',
    sourceType: 'BUSINESS_SYSTEM',
    name: 'Ellines Haven Main',
    websiteUrl: null,
    metadata: { connectorId: 'conn-1' },
    ...overrides,
  };

}

function graph(overrides: Partial<Parameters<typeof buildSourceGraph>[0]> = {}) {
  return buildSourceGraph({
    organizationId: 'org-1',
    organizationName: 'Ellines Haven',
    sources: [businessSystem()],
    connectors: [connector()],
    registries: [registry([])],
    measurements: [],
    now: NOW,
    ...overrides,
  });
}

describe('website and business system are separate source types', () => {
  it('reports website: null when the organisation configured none', () => {
    const g = graph();
    expect(g.website).toBeNull();
    expect(g.counts.websites).toBe(0);
    expect(g.businessSystems).toHaveLength(1);
  });

  it('exposes a configured website with only measured facts', () => {
    const websiteSource: SourceRow = {
      id: 'src-web',
      organizationId: 'org-1',
      sourceType: 'WEBSITE',
      name: 'Company site',
      websiteUrl: 'https://example.test',
    };
    const measurement: WebsiteMeasurementRow = {
      sourceId: 'src-web',
      checkedAt: iso(-3),
      outcome: 'ONLINE',
      httpStatus: 200,
      responseTimeMs: 143,
      redirected: false,
      finalUrl: 'https://example.test',
      tlsValid: true,
      tlsIssuer: 'Test CA',
      tlsSubject: 'example.test',
      tlsValidTo: null,
      message: null,
    };

    const g = graph({ sources: [websiteSource, businessSystem()], measurements: [measurement] });

    expect(g.website?.url).toBe('https://example.test');
    expect(g.website?.outcome).toBe('ONLINE');
    expect(g.website?.httpStatus).toBe(200);
    expect(g.website?.responseTimeMs).toBe(143);
    expect(g.website?.freshness.state).toBe('FRESH');
    expect(g.counts.websites).toBe(1);
    // The website is still a website: the business system below is untouched.
    expect(g.businessSystems).toHaveLength(1);
  });

  it('keeps website monitoring out of the business system view', () => {
    const g = graph();
    const system = g.businessSystems[0];
    // The system carries retrieval facts, never probe facts.
    expect(JSON.stringify(system)).not.toMatch(/httpStatus|responseTimeMs|tls/);
    expect(g.website).toBeNull();
  });

  it('keeps business record counts out of the website view', () => {
    const g = graph();
    expect(g.website).toBeNull();
    expect(JSON.stringify(g.website)).not.toMatch(/retrievedRecordCount|reportedRecordCount/);
    // ...while the system really does carry them, because they were retrieved.
    expect(g.businessSystems[0].resources[0].retrievedRecordCount).toBe(15);
  });

  it('never turns an unchecked website into a healthy one', () => {
    const websiteSource: SourceRow = {
      id: 'src-web',
      organizationId: 'org-1',
      sourceType: 'WEBSITE',
      name: 'Company site',
      websiteUrl: 'https://example.test',
    };
    const g = graph({ sources: [websiteSource, businessSystem()], measurements: [] });
    expect(g.website?.outcome).toBeNull();
    expect(g.website?.httpStatus).toBeNull();
    expect(g.website?.lastCheckedAt).toBeNull();
    expect(g.website?.freshness.state).toBe('UNKNOWN');
  });

  it('reports a real failure as a failure, not as a missing value', () => {
    const websiteSource: SourceRow = {
      id: 'src-web',
      organizationId: 'org-1',
      sourceType: 'WEBSITE',
      name: 'Company site',
      websiteUrl: 'https://example.test',
    };
    const measurement: WebsiteMeasurementRow = {
      sourceId: 'src-web',
      checkedAt: iso(-200),
      outcome: 'DNS_FAILURE',
      httpStatus: null,
      responseTimeMs: null,
      redirected: null,
      finalUrl: null,
      tlsValid: null,
      tlsIssuer: null,
      tlsSubject: null,
      tlsValidTo: null,
      message: 'getaddrinfo ENOTFOUND',
    };
    const g = graph({ sources: [websiteSource, businessSystem()], measurements: [measurement] });
    expect(g.website?.outcome).toBe('DNS_FAILURE');
    expect(g.website?.httpStatus).toBeNull(); // no response was received — not 0
    expect(g.website?.tls.valid).toBeNull(); // not measurable — UNKNOWN
    expect(g.website?.freshness.state).toBe('STALE');
  });
});

describe('connector is infrastructure, separate from source identity', () => {
  it('names the source a connector serves instead of standing in for it', () => {
    const g = graph();
    expect(g.connectors).toHaveLength(1);
    expect(g.connectors[0].name).toBe('Haven Main');
    expect(g.connectors[0].sourceName).toBe('Ellines Haven Main');
    expect(g.connectors[0].sourceType).toBe('BUSINESS_SYSTEM');
    // A connector is never classified as a website just because it made requests.
    expect(g.connectors[0].sourceType).not.toBe('WEBSITE');
  });

  it('reports authentication state without claiming validity', () => {
    const g = graph();
    expect(g.connectors[0].authentication.authType).toBe('bearerToken');
    expect(g.connectors[0].authentication.hasCredential).toBe(true);

    // An auth TYPE alone is not a stored credential — claiming otherwise would
    // tell an operator their secret is configured when nothing is stored.
    const typeOnly = graph({
      connectors: [connector({ config: { authType: 'bearerToken' } })],
    });
    expect(typeOnly.connectors[0].authentication.hasCredential).toBe(false);
  });

  it('keeps a system NOT_CONNECTED until a retrieval really happened', () => {
    const g = graph({ registries: [] });
    expect(g.businessSystems[0].status).toBe('NOT_CONNECTED');
    expect(g.businessSystems[0].lastSuccessfulRetrievalAt).toBeNull();
    expect(g.businessSystems[0].freshness.state).toBe('UNKNOWN');
    // The connector still exists — that alone never means "connected".
    expect(g.connectors).toHaveLength(1);
  });

  it('marks a system CONNECTED only with retrieval evidence', () => {
    const system = graph().businessSystems[0];
    expect(system.status).toBe('CONNECTED');
    expect(system.statusEvidence).toMatch(/read successfully/i);
    expect(system.completeness).toBe('COMPLETE');
  });
});

describe('one connection can expose many capabilities', () => {
  it('groups several resources under the single connector that read them', () => {
    const g = graph({
      registries: [
        registry([
          resource({
            id: 'orders',
            path: '/orders',
            label: 'Orders',
            availability: 'PARTIAL',
            complete: false,
            retrievedRecordCount: 3,
            reportedRecordCount: 10,
          }),
          resource({
            id: 'staff',
            path: '/staff',
            label: 'Staff',
            availability: 'NOT_AUTHORIZED',
            reason: 'HTTP 401 for /staff',
          }),
        ]),
      ],
    });

    // ONE connector, three resources.
    expect(g.connectors).toHaveLength(1);
    expect(g.businessSystems[0].resources).toHaveLength(3);
    expect(g.businessSystems[0].resources.every((r) => r.connectorId === 'conn-1')).toBe(true);

    // Completeness is PARTIAL because not everything was readable.
    expect(g.businessSystems[0].completeness).toBe('PARTIAL');
    expect(g.businessSystems[0].errors.join(' ')).toMatch(/401/);
  });

  it('counts capabilities by what discovery actually reported', () => {
    const g = graph({
      registries: [
        registry([
          resource({ id: 'orders', path: '/orders', label: 'Orders', availability: 'PARTIAL' }),
          resource({
            id: 'staff',
            path: '/staff',
            label: 'Staff',
            availability: 'NOT_AUTHORIZED',
            reason: 'HTTP 401',
          }),
        ]),
      ],
    });
    const { capabilities } = g.counts;
    expect(capabilities.total).toBe(3);
    expect(capabilities.available).toBe(1);
    expect(capabilities.partial).toBe(1);
    expect(capabilities.unavailable).toBe(1);
  });

  it('reports capability counts as UNKNOWN (null), not zero, when nothing was discovered', () => {
    const g = graph({ registries: [] });
    expect(g.counts.capabilities.total).toBeNull();
    expect(g.counts.capabilities.available).toBeNull();
    expect(g.counts.capabilities.partial).toBeNull();
    expect(g.counts.capabilities.unavailable).toBeNull();
    expect(g.counts.discoveredResources).toBe(0);
  });
});

describe('freshness is honest in both directions', () => {
  it('reports FRESH only against the connector\'s configured interval', () => {
    expect(graph().businessSystems[0].freshness.state).toBe('FRESH');
  });

  it('reports STALE rather than hiding an old retrieval', () => {
    const g = graph({
      connectors: [connector({ lastSyncedAt: iso(-600) })],
      registries: [
        {
          installationId: 'conn-1',
          registry: {
            ...capabilityRegistry(),
            resources: [
              resource({
                id: 'books',
                path: '/books',
                label: 'Books',
                complete: true,
                lastRetrievedAt: iso(-600),
                retrievedRecordCount: 15,
                reportedRecordCount: 15,
              }),
            ],
          },
        },
      ],
    });
    expect(g.businessSystems[0].freshness.state).toBe('STALE');
    expect(g.connectors[0].freshness.state).toBe('STALE');
  });

  it('reads a zone-less stored timestamp as UTC (a sync that just ran is not 3h old)', () => {
    // Postgres returns `timestamp without time zone`; a UTC+3 host reading it as
    // local made a just-completed sync read as hours stale.
    const g = graph({ connectors: [connector({ lastSyncedAt: '2026-09-30 11:58:00' })] });
    expect(g.connectors[0].freshness.state).toBe('FRESH');
  });

  it('updates freshness only from a real retrieval timestamp', () => {
    const later = graph({
      registries: [
        {
          installationId: 'conn-1',
          registry: {
            ...capabilityRegistry(),
            resources: [
              resource({
                id: 'books',
                path: '/books',
                label: 'Books',
                complete: true,
                lastRetrievedAt: iso(-1),
                retrievedRecordCount: 16,
                reportedRecordCount: 16,
              }),
            ],
          },
        },
      ],
    });
    expect(later.businessSystems[0].freshness.state).toBe('FRESH');
    expect(later.businessSystems[0].resources[0].retrievedRecordCount).toBe(16);
  });
});

describe('no invented values', () => {
  it('never manufactures zeros for facts that were not established', () => {
    const g = graph({ registries: [] });
    expect(g.counts.availableResources).toBeNull();
    expect(g.businessSystems[0].availableResourceCount).toBeNull();
    expect(g.businessSystems[0].resources).toEqual([]);
  });

  it('never defaults an un-retrieved resource count to 0', () => {
    const g = graph({
      registries: [
        {
          installationId: 'conn-1',
          registry: {
            ...capabilityRegistry(),
            resources: [resource({ id: 'books', path: '/books', label: 'Books' })],
          },
        },
      ],
    });
    const [booksResource] = g.businessSystems[0].resources;
    expect(booksResource.retrievedRecordCount).toBeNull();
    expect(booksResource.reportedRecordCount).toBeNull();
  });

  it('reports an empty organisation honestly rather than erroring', () => {
    const g = graph({ sources: [], connectors: [], registries: [], measurements: [] });
    expect(g.website).toBeNull();
    expect(g.businessSystems).toEqual([]);
    expect(g.connectors).toEqual([]);
    expect(g.counts.businessSystems).toBe(0);
    expect(g.counts.connectors).toBe(0);
  });
});

/**
 * A WEBSITE source may be that organisation's own web API. When it is, it is a
 * WEBSITE (not a business system) AND it owns the capabilities it genuinely
 * provides. These rules stop the same API being reported twice — once as a website
 * and once as a system — or its data being copied between them.
 */
describe('WEBSITE + API is its own category, distinct from BUSINESS_SYSTEM', () => {
  const webApi: SourceRow = {
    id: 'src-web',
    organizationId: 'org-1',
    sourceType: 'WEBSITE',
    sourceKind: 'API',
    name: 'Haven API',
    websiteUrl: 'https://api.example.test/catalogue',
    // The connector that reaches it. This is technical provenance, not a category.
    metadata: { connectorId: 'conn-1' },
  };

  it('reports the kind exactly as configured', () => {
    const g = graph({ sources: [webApi] });
    expect(g.website?.kind).toBe('API');
    expect(g.businessSystems).toHaveLength(0);
  });

  it('never infers a kind from the URL, the connector catalog or the response', () => {
    // A REST connector pointed at a URL containing "api" is still just WEBSITE
    // until the organisation says otherwise.
    const g = graph({
      sources: [{ ...webApi, sourceKind: undefined, name: 'Api thing', websiteUrl: 'https://x.test/api/v1' }],
    });
    expect(g.website?.kind).toBeNull();
    expect(g.businessSystems).toHaveLength(0);
  });

  it('gives the website the capabilities its own source really provides', () => {
    const g = graph({
      sources: [webApi],
      // The SAME registry row the connector discovered through, now attributed to
      // the source. Not a second copy.
      registries: [{ installationId: 'conn-1', sourceId: 'src-web', registry: capabilityRegistry() }],
    });
    const ids = (g.website?.resources ?? []).map((r) => r.id);
    expect(ids).toEqual(['books']);
    const books = g.website!.resources[0];
    expect(books.retrievedRecordCount).toBe(15);
    expect(books.reportedRecordCount).toBe(15);
    expect(books.availability).toBe('AVAILABLE');
    expect(g.website?.completeness).toBe('COMPLETE');
    expect(g.website?.totalResourceCount).toBe(1);
    expect(g.website?.availableResourceCount).toBe(1);
    expect(g.website?.lastSuccessfulRetrievalAt).toBe(iso(-5));
  });

  it('invents no capability when only the probe succeeded', () => {
    // Online, HTTP 200, and still no resources: reachability is not capability.
    const g = graph({
      sources: [webApi],
      registries: [],
      measurements: [
        {
          sourceId: 'src-web',
          checkedAt: iso(-1),
          outcome: 'ONLINE',
          httpStatus: 200,
          responseTimeMs: 120,
          redirected: false,
          finalUrl: 'https://api.example.test/catalogue',
          tlsValid: true,
          tlsIssuer: 'CA',
          tlsSubject: 'api.example.test',
          tlsValidTo: null,
          message: null,
        },
      ],
    });
    expect(g.website?.httpStatus).toBe(200);
    expect(g.website?.resources).toEqual([]);
    // null, not 0: nothing was discovered, which is not the same as "none exist".
    expect(g.website?.totalResourceCount).toBeNull();
    expect(g.website?.completeness).toBeNull();
  });

  it('keeps probe freshness and capability freshness as separate facts', () => {
    const g = graph({
      sources: [webApi],
      registries: [{ installationId: 'conn-1', sourceId: 'src-web', registry: capabilityRegistry() }],
      measurements: [
        {
          sourceId: 'src-web',
          checkedAt: iso(-1),
          outcome: 'ONLINE',
          httpStatus: 200,
          responseTimeMs: 90,
          redirected: false,
          finalUrl: null,
          tlsValid: null,
          tlsIssuer: null,
          tlsSubject: null,
          tlsValidTo: null,
          message: null,
        },
      ],
    });
    expect(g.website?.freshness.state).toBe('FRESH');
    // The registry was read 5 minutes before NOW against a 60 minute interval.
    expect(g.website?.retrievalFreshness.state).toBe('FRESH');
  });

  it('reports unknown capability freshness as UNKNOWN, never FRESH', () => {
    const stale = graph({
      sources: [webApi],
      registries: [{ installationId: 'conn-1', sourceId: 'src-web', registry: capabilityRegistry() }],
      now: NOW + 48 * 60 * 60_000,
    });
    expect(stale.website?.retrievalFreshness.state).toBe('STALE');
    const never = graph({ sources: [webApi], registries: [] });
    expect(never.website?.retrievalFreshness.state).toBe('UNKNOWN');
  });
});

describe('website, system and connector counts are independent', () => {
  it('counts each category from its own rows', () => {
    const g = graph({
      sources: [
        {
          id: 'src-web',
          organizationId: 'org-1',
          sourceType: 'WEBSITE',
          sourceKind: 'API',
          name: 'Haven API',
          websiteUrl: 'https://api.example.test/catalogue',
          metadata: { connectorId: 'conn-1' },
        },
        {
          id: 'src-biz',
          organizationId: 'org-1',
          sourceType: 'BUSINESS_SYSTEM',
          name: 'Ledger',
          websiteUrl: null,
          metadata: { connectorId: 'conn-2' },
        },
      ],
      connectors: [connector(), connector({ id: 'conn-2', displayName: 'Ledger feed' })],
      registries: [
        { installationId: 'conn-1', sourceId: 'src-web', registry: capabilityRegistry() },
        { installationId: 'conn-2', sourceId: 'src-biz', registry: capabilityRegistry() },
      ],
    });
    expect(g.counts.websites).toBe(1);
    expect(g.counts.businessSystems).toBe(1);
    expect(g.counts.connectors).toBe(2);
  });

  it('counts a capability once even when a source and its connector both reference it', () => {
    const g = graph({
      sources: [
        {
          id: 'src-web',
          organizationId: 'org-1',
          sourceType: 'WEBSITE',
          sourceKind: 'API',
          name: 'Haven API',
          websiteUrl: 'https://api.example.test/catalogue',
          metadata: { connectorId: 'conn-1' },
        },
      ],
      connectors: [connector()],
      registries: [{ installationId: 'conn-1', sourceId: 'src-web', registry: capabilityRegistry() }],
    });
    expect(g.counts.discoveredResources).toBe(1);
    expect(g.counts.capabilities).toEqual({ total: 1, available: 1, partial: 0, unavailable: 0 });
  });

  it('does not promote an unassigned connector into a business system', () => {
    // A connector with no source row is technical inventory, not a system. Presenting
    // it as one is how an organisation ends up "having a system" it never configured.
    const g = graph({ sources: [], connectors: [connector()], registries: [registry([])] });
    expect(g.businessSystems).toHaveLength(0);
    expect(g.counts.businessSystems).toBe(0);
    expect(g.counts.connectors).toBe(1);
    // Still visible, just not as a system.
    expect(g.connectors[0].sourceId).toBeNull();
  });
});

/**
 * The counting rule in isolation.
 *
 * `buildSourceGraph` is the whole picture; this is the one decision the picture
 * rests on, so it is pinned directly. The bug this guards is a WEBSITE reached
 * by an API connector being reported as a connected BUSINESS SYSTEM, which is
 * how a website-only organisation came to read "1 system connected".
 */
describe('countSourcesByType counts each category from its own rows', () => {
  it('counts a WEBSITE + API source as a website only', () => {
    // The real Haven shape: one WEBSITE/API row and one API connector.
    const counts = countSourcesByType([{ sourceType: 'WEBSITE' }]);
    expect(counts).toEqual({ websites: 1, businessSystems: 0 });
  });

  it('counts a BUSINESS_SYSTEM row as a system only', () => {
    expect(countSourcesByType([{ sourceType: 'BUSINESS_SYSTEM' }])).toEqual({
      websites: 0,
      businessSystems: 1,
    });
  });

  it('never lets a website increment businessSystems, however many there are', () => {
    const counts = countSourcesByType([
      { sourceType: 'WEBSITE' },
      { sourceType: 'WEBSITE' },
      { sourceType: 'WEBSITE' },
    ]);
    expect(counts.businessSystems).toBe(0);
    expect(counts.websites).toBe(3);
  });

  it('reports zero for an organisation with no source rows', () => {
    expect(countSourcesByType([])).toEqual({ websites: 0, businessSystems: 0 });
  });

  it('is the same rule the graph itself uses', () => {
    // The graph must not re-derive its own count by a second route.
    const sources: SourceRow[] = [
      {
        id: 'src-web',
        organizationId: 'org-1',
        sourceType: 'WEBSITE',
        sourceKind: 'API',
        name: 'Haven API',
        websiteUrl: 'https://api.example.test/catalogue',
        metadata: { connectorId: 'conn-1' },
      },
    ];
    const g = graph({ sources, connectors: [connector()], registries: [] });
    expect(g.counts.websites).toBe(countSourcesByType(sources).websites);
    expect(g.counts.businessSystems).toBe(countSourcesByType(sources).businessSystems);
    expect(g.counts.businessSystems).toBe(0);
  });
});



