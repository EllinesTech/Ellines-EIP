/**
 * Stored timestamps are UTC, but they arrive WITHOUT a zone.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * A real sync of `Ellines Haven Main` completed, wrote `last_sync_at`, and was
 * read back by /connectors/health seconds later — which reported
 * `ageMinutes: 180, status: STALE` while the capability registry beside it (a
 * JSON column written as `new Date().toISOString()`, so it carries a `Z`)
 * reported `ageMinutes: 0, FRESH`.
 *
 * The cause is not the clock. Prisma maps `DateTime` to Postgres
 * `timestamp without time zone`, always storing UTC, and PostgREST returns the
 * column verbatim: `2026-10-01T04:24:10.027`. `new Date(...)` reads a zone-less
 * string as LOCAL time, so on the UTC+3 host where this was found a
 * seconds-old sync measured three hours old. Status is not allowed to depend on
 * the timezone of whoever reads the row.
 *
 * The fix is `toInstantMs` / `toUtcIso` in packages/shared/src/db-time.ts, used
 * on the freshness paths instead of raw `new Date(...)`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { effectiveSyncIntervalMinutes, freshnessFrom, toInstantMs, toUtcIso } from '@ellines-eip/shared';
import { toConnectorRow } from '../api/v1/orgs/me/sources';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The exact string the real endpoint returned for `last_sync_at`. */
const POSTGREST_NAIVE = '2026-10-01T04:24:10.027';
const SAME_INSTANT_UTC = '2026-10-01T04:24:10.027Z';

describe('a zone-less database timestamp is an instant in UTC', () => {
  it('reads the PostgREST form as UTC rather than host-local time', () => {
    // The single assertion that fails on any non-UTC host when the value is
    // parsed with `new Date(...)`: the instant must not shift by the offset.
    expect(toInstantMs(POSTGREST_NAIVE)).toBe(Date.parse(SAME_INSTANT_UTC));
  });

  it('reads the psql text form (`space` separator) as the same instant', () => {
    expect(toInstantMs('2026-10-01 04:24:10.027')).toBe(Date.parse(SAME_INSTANT_UTC));
  });

  it('trusts a value that already carries a zone', () => {
    expect(toInstantMs(SAME_INSTANT_UTC)).toBe(Date.parse(SAME_INSTANT_UTC));
    expect(toInstantMs('2026-10-01T07:24:10.027+03:00')).toBe(Date.parse(SAME_INSTANT_UTC));
  });

  it('reports an absent or unreadable timestamp as no measurement, not as now', () => {
    for (const v of [null, undefined, '', '   ', 'not-a-date']) {
      expect(toInstantMs(v)).toBeNull();
      expect(toUtcIso(v)).toBeNull();
    }
  });

  it('states the instant as explicit UTC so a consumer cannot re-shift it', () => {
    expect(toUtcIso(POSTGREST_NAIVE)).toBe(SAME_INSTANT_UTC);
  });
});

describe('freshness of a sync that just finished', () => {
  const NOW = Date.parse('2026-10-01T04:25:10.027Z'); // 60 s after the write

  it('is FRESH at one minute old, not 180 minutes STALE', () => {
    const f = freshnessFrom(POSTGREST_NAIVE, 15, NOW);
    expect(f.ageMinutes).toBe(1);
    expect(f.state).toBe('FRESH');
  });

  it('emits the sync time as explicit UTC', () => {
    expect(freshnessFrom(POSTGREST_NAIVE, 15, NOW).lastSuccessfulSyncAt).toBe(SAME_INSTANT_UTC);
  });

  it('still calls a genuinely old sync STALE', () => {
    // Three hours old in UTC is stale for a 15-minute connector — the fix must
    // not turn every connector fresh.
    const f = freshnessFrom('2026-10-01T01:24:10.027', 15, NOW);
    expect(f.ageMinutes).toBe(181);
    expect(f.state).toBe('STALE');
  });

  it('keeps UNKNOWN for a connector that has never synced', () => {
    const f = freshnessFrom(null, 15, NOW);
    expect(f.state).toBe('UNKNOWN');
    expect(f.ageMinutes).toBeNull();
  });

  it('lands FRESH when the zone-less value comes through the real row mapping', () => {
    // Same path the endpoint takes: snake_case installation row -> ConnectorRow
    // -> freshness. This is the sequence that reported 180 minutes / STALE.
    const c = toConnectorRow({
      id: '7d90d814-aaac-4f92-9c53-204b3e18ace3',
      organization_id: 'org-1',
      display_name: 'Ellines Haven Main',
      catalog_id: 'rest-api',
      status: 'synced',
      config: { syncIntervalMinutes: 15 },
      last_sync_at: POSTGREST_NAIVE,
      last_synced_at: POSTGREST_NAIVE,
      sync_interval_seconds: 3600,
    });
    const f = freshnessFrom(c.lastSyncAt ?? c.lastSyncedAt, effectiveSyncIntervalMinutes(c), NOW);
    expect(f.state).toBe('FRESH');
    expect(f.ageMinutes).toBe(1);
    expect(f.lastSuccessfulSyncAt).toBe(SAME_INSTANT_UTC);
  });
});

describe('the freshness paths do not parse stored timestamps with new Date()', () => {
  it('source-graph.ts converts before it compares', () => {
    const src = read('packages/shared/src/source-graph.ts');
    expect(src).toMatch(/toInstantMs\(/);
    expect(src).not.toMatch(/now - new Date\(lastSuccessfulSyncAt\)\.getTime\(\)/);
  });

  it('connectors/health.ts converts before it ages', () => {
    const src = read('apps/web/functions/api/v1/connectors/health.ts');
    expect(src).toMatch(/toInstantMs\(lastSyncAt\)/);
    expect(src).not.toMatch(/Date\.now\(\) - new Date\(lastSyncAt\)\.getTime\(\)/);
  });
});
