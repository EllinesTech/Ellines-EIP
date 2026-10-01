/**
 * Source-separation contract for the dashboard surfaces.
 *
 * These are SOURCE-SHAPE assertions on purpose. The failure this guards against
 * is not a crash — it is a screen that quietly tells a client something false
 * ("your website is fine" when nothing measured it, "0/100 health" when no
 * metric exists, "connect your first system" when they have a live system).
 * None of those throw, so only an explicit contract pins them.
 *
 * Behavioural truth (freshness, scope, capability counts) is proven in
 * packages/shared/src/__tests__/source-graph.spec.ts and the Phase 1/4 engine
 * specs; this file proves the UI cannot quietly undo it.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..', '..', '..');
const read = (relative: string) => readFileSync(join(REPO, relative), 'utf8');

const COMMAND_CENTER = read('apps/web/src/app/app/page.tsx');
const SOURCE_CARDS = read('apps/web/src/components/source-graph/SourceCards.tsx');
const SUPER_ADMIN = read('apps/web/src/app/app/platform/page.tsx');
const ORG_OVERVIEW = read('apps/web/src/components/source-graph/OrgSourceOverview.tsx');

describe('client Command Center presents sources, not connectors', () => {
  it('renders the source-separated cards above the connector strip', () => {
    expect(COMMAND_CENTER).toMatch(/import \{ SourceCards \}/);
    const cardsAt = COMMAND_CENTER.indexOf('<SourceCards />');
    const stripAt = COMMAND_CENTER.indexOf('aria-label="Connector health"');
    expect(cardsAt).toBeGreaterThan(-1);
    expect(stripAt).toBeGreaterThan(-1);
    expect(cardsAt).toBeLessThan(stripAt); // sources first, technical detail after
  });

  it('does not head the page with connector health', () => {
    // The connector strip still exists, but only labelled as the technical layer.
    expect(COMMAND_CENTER).toMatch(/Connector health · technical connections/);
  });

  it('does not decide "connect your first system" from a sync flag', () => {
    // The removed banner was `{!synced ? ... 'Connect your first system' ...}`:
    // it claimed a client had no source purely because a snapshot was missing.
    // That copy is gone; the invitation now lives in SourceCards, gated on real
    // source state. ("Sync a connector" survives elsewhere as honest copy for a
    // panel that has genuinely not been synced yet.)
    expect(COMMAND_CENTER).not.toMatch(/Open Connectors to install your first system/);
    expect(COMMAND_CENTER).not.toMatch(/isOwner \? 'Connect your first system'/);
  });

  it('shows the invitation only when there is genuinely no source', () => {
    expect(SOURCE_CARDS).toMatch(/hasAnySource/);
    expect(SOURCE_CARDS).toMatch(/NO SOURCES CONFIGURED/);
    expect(SOURCE_CARDS).toMatch(/Connect your first system/);
    // ...and a failed read is not an empty result.
    expect(SOURCE_CARDS).toMatch(/UNAVAILABLE/);
  });
});

describe('website, systems and connectors are three different cards', () => {
  it('has all three, each with its own heading', () => {
    expect(SOURCE_CARDS).toMatch(/title="Connected website"/);
    expect(SOURCE_CARDS).toMatch(/title="Connected systems"/);
    expect(SOURCE_CARDS).toMatch(/title="Connectors"/);
  });

  it('never shows business record counts on the website card', () => {
    const websiteCard = SOURCE_CARDS.slice(
      SOURCE_CARDS.indexOf('function WebsiteCard'),
      SOURCE_CARDS.indexOf('function SystemsCard'),
    );
    expect(websiteCard).toMatch(/httpStatus/);
    expect(websiteCard).toMatch(/tls/i);
    // Record counts are the SYSTEM's fact and must not be copied up.
    expect(websiteCard).not.toMatch(/retrievedRecordCount|reportedRecordCount/);
  });

  it('never shows probe measurements on the systems card', () => {
    const systemsCard = SOURCE_CARDS.slice(
      SOURCE_CARDS.indexOf('function SystemsCard'),
      SOURCE_CARDS.indexOf('function ConnectorsCard'),
    );
    expect(systemsCard).toMatch(/resources/i);
    // HTTP status / TLS are website facts.
    expect(systemsCard).not.toMatch(/httpStatus|responseTimeMs|tls/i);
  });

  it('shows a connector as the mechanism that serves a source', () => {
    const connectorsCard = SOURCE_CARDS.slice(SOURCE_CARDS.indexOf('function ConnectorsCard'));
    expect(connectorsCard).toMatch(/Connects to/);
    expect(connectorsCard).toMatch(/sourceName/);
    expect(connectorsCard).toMatch(/Authentication/);
    expect(connectorsCard).toMatch(/Last successful sync/);
  });

  it('states the website is not configured rather than borrowing system data', () => {
    expect(SOURCE_CARDS).toMatch(/WEBSITE NOT CONFIGURED/);
  });
});

describe('Super Admin organisation overview reflects real sources', () => {
  it('renders the same source overview the client sees', () => {
    expect(SUPER_ADMIN).toMatch(/<OrgSourceOverview orgId=\{orgId\} \/>/);
  });

  it('breaks the overview down by real source counts', () => {
    expect(ORG_OVERVIEW).toMatch(/Source \/ Capability Summary/);
    expect(ORG_OVERVIEW).toMatch(/Websites/);
    expect(ORG_OVERVIEW).toMatch(/Business systems/);
    expect(ORG_OVERVIEW).toMatch(/Capabilities available/);
    expect(ORG_OVERVIEW).toMatch(/Capabilities partial/);
    expect(ORG_OVERVIEW).toMatch(/Capabilities unavailable/);
  });

  it('renders not-connected and not-configured as explicit states', () => {
    expect(ORG_OVERVIEW).toMatch(/NOT CONFIGURED/);
    expect(ORG_OVERVIEW).toMatch(/NOT CONNECTED/);
  });
});

describe('no fabricated KPI or health values', () => {
  it('never coerces an unknown health score to 0/100', () => {
    expect(SUPER_ADMIN).not.toMatch(/healthScore\?\?0/);
    expect(SUPER_ADMIN).toMatch(/Not measured/);
  });

  it('never renders an unmeasured count as zero in the source surfaces', () => {
    for (const surface of [SOURCE_CARDS, ORG_OVERVIEW]) {
      // `?? 0` on a source fact would turn "not established" into a real zero.
      expect(surface).not.toMatch(/RecordCount \?\? 0|resourceCount \?\? 0|httpStatus \?\? 0/);
    }
  });

  it('renders unknown measurements as UNKNOWN, not as a number', () => {
    expect(SOURCE_CARDS).toMatch(/unknownLabel="UNKNOWN"/);
    expect(SOURCE_CARDS).toMatch(/UNKNOWN/i);
  });
});

describe('no hardcoded client data and no demo tenants', () => {
  const surfaces = [COMMAND_CENTER, SOURCE_CARDS, ORG_OVERVIEW, SUPER_ADMIN];

  it('contains no hardcoded Ellines Haven values', () => {
    for (const surface of surfaces) {
      expect(surface).not.toMatch(/ellines-haven|Ellines Haven/);
    }
  });

  it('references no demo or proof tenant', () => {
    for (const surface of surfaces) {
      expect(surface).not.toMatch(/haven-proof-org|demo-org|proof-org/);
    }
  });

  it('creates no organisation from the dashboard surfaces', () => {
    // The client Command Center must read, not author.
    expect(COMMAND_CENTER).not.toMatch(/insert\s*\(\s*\{\s*name/);
  });
});
