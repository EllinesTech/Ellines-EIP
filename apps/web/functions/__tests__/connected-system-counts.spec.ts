/**
 * The "1 system connected" regression.
 *
 * THE BUG
 * -------
 * The dashboard banner read `enterprise_snapshots.connected_systems`, which the
 * sync writers fill with the number of CONNECTOR INSTALLATIONS. An organisation
 * whose only source is a WEBSITE, reached by one API connector, was therefore
 * shown as having one connected BUSINESS SYSTEM. For the real Ellines Haven
 * state that meant "1 system connected" when the honest answer is zero.
 *
 * THE RULE NOW ENFORCED
 * ---------------------
 *   websites        <- organization_sources WHERE source_type = 'WEBSITE'
 *   businessSystems <- organization_sources WHERE source_type = 'BUSINESS_SYSTEM'
 *   connectors      <- connector_installations
 *
 * A connector is the mechanism, never the system. A WEBSITE served by an API
 * connector stays WEBSITE + API and must never increment businessSystems.
 *
 * These are behavioural tests over the real counting rule, because the failure
 * was silent: nothing threw, a screen just said something false.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildSourceGraph, countSourcesByType } from '@ellines-eip/shared';
import { readAuthoritativeSourceCounts } from '../shared/source-counts';

const REPO = join(__dirname, '..', '..', '..', '..');
const read = (relative: string) => readFileSync(join(REPO, relative), 'utf8');

const NOW = Date.parse('2026-09-30T12:00:00Z');

/**
 * A minimal PostgREST double.
 *
 * It answers only the two tables the counting rule reads, applies the same
 * `.eq('organization_id', ...)` scoping a real client applies, and counts the
 * connector rows itself so a test that forgets tenant scoping fails loudly.
 */
function fakeSupabase(rows: {
  sources: Array<{ organization_id: string; source_type: string }>;
  connectors: Array<{ organization_id: string; status: string }>;
}) {
  const queries: string[] = [];
  const table = (name: string, data: Array<Record<string, unknown>>) => ({
    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      // Filters are kept structured so `!=` cannot be mis-parsed as a bare `=`.
      const filters: Array<{ column: string; value: string; negated: boolean }> = [];
      const head = Boolean(options?.head);
      const builder = {
        eq(column: string, value: string) {
          filters.push({ column, value, negated: false });
          return builder;
        },
        neq(column: string, value: string) {
          filters.push({ column, value, negated: true });
          return builder;
        },
        then(resolve: (result: unknown) => unknown) {
          const scoped = data.filter((row) =>
            filters.every(({ column, value, negated }) =>
              negated ? row[column] !== value : row[column] === value,
            ),
          );
          queries.push(
            `${name}[${filters.map((f) => `${f.column}${f.negated ? '!=' : '='}${f.value}`).join(',')}]`,
          );
          return Promise.resolve(
            head
              ? { data: null, count: scoped.length, error: null }
              : { data: scoped, count: null, error: null },
          ).then(resolve);
        },
      };
      return builder;
    },
  });

  const supabase = {
    from(name: string) {
      if (name === 'organization_sources') return table(name, rows.sources as Array<Record<string, unknown>>);
      if (name === 'connector_installations') return table(name, rows.connectors as Array<Record<string, unknown>>);
      throw new Error(`unexpected table read: ${name}`);
    },
  };
  return { supabase: supabase as never, queries };
}

const connectorRow = {
  id: 'conn-1',
  organizationId: 'org-1',
  displayName: 'Catalogue feed',
  catalogId: 'rest-api',
  status: 'synced',
  config: { authType: 'none' },
  lastSyncedAt: new Date(NOW).toISOString(),
};

/** A WEBSITE source reached by an API connector: the exact Haven-only shape. */
const webApiSource = {
  id: 'src-web',
  organizationId: 'org-1',
  sourceType: 'WEBSITE' as const,
  sourceKind: 'API' as const,
  name: 'Catalogue API',
  websiteUrl: 'https://catalogue.example.test/api',
  metadata: { connectorId: 'conn-1' },
};
describe('WEBSITE + API is a website, never a business system', () => {
  it('reports 1 website, 0 business systems and 1 connector', async () => {
    const { supabase } = fakeSupabase({
      sources: [{ organization_id: 'org-1', source_type: 'WEBSITE' }],
      connectors: [{ organization_id: 'org-1', status: 'synced' }],
    });

    const counts = await readAuthoritativeSourceCounts(supabase, 'org-1');

    expect(counts.websites).toBe(1);
    // THE assertion this whole fix exists for.
    expect(counts.businessSystems).toBe(0);
    expect(counts.connectors).toBe(1);
  });

  it('a WEBSITE + API connector never increments businessSystems', () => {
    // The same state through the graph builder the Connected Systems page reads.
    const graph = buildSourceGraph({
      organizationId: 'org-1',
      sources: [webApiSource],
      connectors: [connectorRow],
      registries: [],
      measurements: [],
      now: NOW,
    });

    expect(graph.businessSystems).toHaveLength(0);
    expect(graph.counts.businessSystems).toBe(0);
    expect(graph.counts.websites).toBe(1);
    expect(graph.counts.connectors).toBe(1);
    // The API connector is fully visible as inventory, just not as a system.
    expect(graph.connectors[0].sourceType).toBe('WEBSITE');
  });

  it('a BUSINESS_SYSTEM + connector reports 1 system, 0 websites, 1 connector', async () => {
    const { supabase } = fakeSupabase({
      sources: [{ organization_id: 'org-1', source_type: 'BUSINESS_SYSTEM' }],
      connectors: [{ organization_id: 'org-1', status: 'synced' }],
    });

    const counts = await readAuthoritativeSourceCounts(supabase, 'org-1');

    expect(counts.businessSystems).toBe(1);
    expect(counts.websites).toBe(0);
    expect(counts.connectors).toBe(1);
  });

  it('counts each category from its own rows only', () => {
    // A website and two systems: neither count borrows from the other.
    const counts = countSourcesByType([
      { sourceType: 'WEBSITE' },
      { sourceType: 'BUSINESS_SYSTEM' },
      { sourceType: 'BUSINESS_SYSTEM' },
    ]);
    expect(counts).toEqual({ websites: 1, businessSystems: 2 });
  });
});

describe('an unassigned connector creates no synthetic business system', () => {
  it('stays connector inventory only', () => {
    const graph = buildSourceGraph({
      organizationId: 'org-1',
      sources: [],
      connectors: [connectorRow],
      registries: [],
      measurements: [],
      now: NOW,
    });

    expect(graph.businessSystems).toHaveLength(0);
    expect(graph.counts.businessSystems).toBe(0);
    expect(graph.counts.connectors).toBe(1);
    expect(graph.connectors[0].sourceId).toBeNull();
  });

  it('a connector with no source rows contributes 0 systems to the counts', async () => {
    const { supabase } = fakeSupabase({
      sources: [],
      connectors: [{ organization_id: 'org-1', status: 'active' }],
    });

    const counts = await readAuthoritativeSourceCounts(supabase, 'org-1');

    expect(counts.businessSystems).toBe(0);
    expect(counts.websites).toBe(0);
    expect(counts.connectors).toBe(1);
  });
});

describe('connector count is independent from source counts', () => {
  it('a deleted connector is excluded without changing either source count', async () => {
    const { supabase } = fakeSupabase({
      sources: [{ organization_id: 'org-1', source_type: 'WEBSITE' }],
      connectors: [
        { organization_id: 'org-1', status: 'synced' },
        { organization_id: 'org-1', status: 'deleted' },
      ],
    });

    const counts = await readAuthoritativeSourceCounts(supabase, 'org-1');

    expect(counts.connectors).toBe(1);
    // Source counts are untouched by connector lifecycle.
    expect(counts.websites).toBe(1);
    expect(counts.businessSystems).toBe(0);
  });

  it('many connectors for one website still yield exactly 0 business systems', async () => {
    const { supabase } = fakeSupabase({
      sources: [{ organization_id: 'org-1', source_type: 'WEBSITE' }],
      connectors: [
        { organization_id: 'org-1', status: 'synced' },
        { organization_id: 'org-1', status: 'active' },
        { organization_id: 'org-1', status: 'synced' },
      ],
    });

    const counts = await readAuthoritativeSourceCounts(supabase, 'org-1');

    expect(counts.connectors).toBe(3);
    expect(counts.businessSystems).toBe(0);
    expect(counts.websites).toBe(1);
  });
});
describe('classification is never inferred, and tenants stay isolated', () => {
  it('reads only source_type - no connector, URL, name or status inference', () => {
    const source = read('apps/web/functions/shared/source-counts.ts');
    // The counting module must not reach for anything but the classification.
    expect(source).not.toMatch(/catalogId|catalog_id/);
    expect(source).not.toMatch(/websiteUrl|website_url/);
    // No floor of 1, which is what turned "no system" into "1 system".
    expect(source).not.toMatch(/Math\.max\(/);
  });

  it('scopes every count query to the requested organisation', async () => {
    const { supabase, queries } = fakeSupabase({
      sources: [
        { organization_id: 'org-1', source_type: 'WEBSITE' },
        { organization_id: 'org-2', source_type: 'BUSINESS_SYSTEM' },
      ],
      connectors: [
        { organization_id: 'org-1', status: 'synced' },
        { organization_id: 'org-2', status: 'synced' },
      ],
    });

    const counts = await readAuthoritativeSourceCounts(supabase, 'org-1');

    // Another tenant's BUSINESS_SYSTEM row must not leak into this count.
    expect(counts.businessSystems).toBe(0);
    expect(counts.websites).toBe(1);
    expect(counts.connectors).toBe(1);
    // Both reads were tenant-scoped, not just the source read.
    expect(queries).toEqual([
      'organization_sources[organization_id=org-1]',
      'connector_installations[organization_id=org-1,status!=deleted]',
    ]);
  });
});

describe('every system-count surface uses the authoritative source', () => {
  const SUMMARY = read('apps/web/functions/api/v1/enterprise/summary.ts');
  const GROUP_SUMMARY = read('apps/web/functions/api/v1/orgs/me/group-summary.ts');
  const PLATFORM_SNAPSHOT = read('apps/web/functions/api/v1/platform/orgs/[id]/snapshot.ts');
  const GLANCE = read('apps/web/src/app/app/glance/page.tsx');
  const BUSINESS = read('apps/web/src/app/app/business/page.tsx');

  it('the summary API reports businessSystems, not the snapshot column', () => {
    // The bug lived here: `connectedSystems: snap.connected_systems`.
    expect(SUMMARY).not.toMatch(/connectedSystems:\s*!?snap\.connected_systems/);
    expect(SUMMARY).toMatch(/connectedSystems:\s*counts\.businessSystems/);
    expect(SUMMARY).toMatch(/readAuthoritativeSourceCounts/);
  });

  it('the group and platform views do not reinterpret connectors as systems', () => {
    for (const surface of [GROUP_SUMMARY, PLATFORM_SNAPSHOT]) {
      expect(surface).not.toMatch(/connectedSystems:\s*!?snap\??\.connected_systems/);
      expect(surface).toMatch(/readAuthoritativeSourceCounts/);
    }
  });

  it('the dashboard banner and cards read businessSystems', () => {
    // The glance banner is the "N system(s) connected" the customer reads.
    expect(GLANCE).toMatch(/sources\.businessSystems\.length/);
    expect(BUSINESS).toMatch(/summary\?\.connectedSystems/);
    // Neither may present the connector count as a system count.
    expect(BUSINESS).not.toMatch(/sub="Active connectors"/);
  });

  it('no real Haven endpoint is hardcoded into production code', () => {
    // The fix reads classification, so it needs no endpoint-specific knowledge.
    const surfaces = [
      SUMMARY,
      GROUP_SUMMARY,
      PLATFORM_SNAPSHOT,
      GLANCE,
      BUSINESS,
      read('apps/web/functions/shared/source-counts.ts'),
    ];
    for (const surface of surfaces) {
      expect(surface).not.toMatch(/ellines-haven|Ellines Haven|cloudfunctions\.net/);
    }
  });
});