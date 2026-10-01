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



