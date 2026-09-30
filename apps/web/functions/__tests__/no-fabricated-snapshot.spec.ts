/**
 * Guards against the fabrication paths found during the real-data audit.
 *
 * 1. The manual "Ingest external snapshot" textarea must not come back: it let
 *    a human type healthScore/connectedSystems/openAlerts that the Command
 *    Center then rendered as the organization's real business data.
 * 2. The enterprise summary must never default an absent retrieval state to
 *    the healthy reading (`retrievalComplete ?? true`, `?? 'synced'`).
 * 3. The BYO ingest endpoint must record its payload as reported-but-unverified.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CONNECTORS_PAGE = 'apps/web/src/app/app/connectors/page.tsx';
const SUMMARY = 'apps/web/functions/api/v1/enterprise/summary.ts';
const INGEST = 'apps/web/functions/api/v1/enterprise/ingest.ts';

describe('no fabricated enterprise snapshot path', () => {
  it('Connectors page has no manual JSON snapshot ingest UI', () => {
    const src = read(CONNECTORS_PAGE);
    // Check the real constructs, not prose, so an explanatory comment cannot
    // trip the guard and a reintroduction cannot slip past it.
    expect(src).not.toMatch(/ingestEnterpriseSnapshot/);
    expect(src).not.toMatch(/byoJson/);
    // The example payload that advertised fake numbers must be gone too.
    expect(src).not.toMatch(/"healthScore":\s*\d/);
    expect(src).not.toMatch(/Your system summary here/);
  });

  it('enterprise summary defaults unknown retrieval state to unknown, not healthy', () => {
    const src = read(SUMMARY);
    expect(src).not.toMatch(/retrieval_complete[^;]*\?\?\s*true/);
    expect(src).not.toMatch(/sync_status[^;]*\?\?\s*'synced'/);
    expect(src).toMatch(/retrieval_complete[^;]*\?\?\s*false/);
  });

  it('BYO ingest records its payload as reported, never as a verified read', () => {
    const src = read(INGEST);
    expect(src).toMatch(/sync_status:\s*'reported'/);
    expect(src).toMatch(/retrieval_complete:\s*false/);
    expect(src).toMatch(/retrieval_stop_reason:\s*'reported-not-retrieved'/);
  });

  it('summary exposes reported and unknown as distinct states', () => {
    const src = read(SUMMARY);
    expect(src).toMatch(/'reported'/);
    expect(src).toMatch(/'unknown'/);
  });
});
