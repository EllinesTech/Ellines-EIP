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

/**
 * Source classification contract.
 *
 * A web/API endpoint can be a WEBSITE source; a REST connector can serve either
 * category. The failure this guards against is silent classification: inferring
 * "it's REST, so it's a business system" (or the reverse), duplicating one API
 * into two sources, and reclassifying production rows as a side effect of a
 * deploy. These are contract assertions on the SQL and the endpoint that owns the
 * decision.
 */

const MIGRATION_CLASSIFICATION = read(
  'services/identity/prisma/migrations/0011_source_classification/migration.sql',
);
const MIGRATION_NAME = read(
  'services/identity/prisma/migrations/0012_source_classification_name/migration.sql',
);
const ENDPOINT = read('apps/web/functions/api/v1/orgs/me/sources/[id].ts');
const SOURCES_ENDPOINT = read('apps/web/functions/api/v1/orgs/me/sources.ts');
const WEBSITE_CHECK = read('apps/web/functions/api/v1/orgs/me/sources/website/check.ts');

describe('the source vocabulary distinguishes a web API from a business system', () => {
  it('constrains kind to HTML | API, and only on a WEBSITE row', () => {
    expect(MIGRATION_CLASSIFICATION).toMatch(/source_kind" IN \('HTML', 'API'\)/);
    // A business system carries NULL: the category of a row has one answer.
    expect(MIGRATION_CLASSIFICATION).toMatch(
      /"source_kind" IS NULL AND "source_type" = 'BUSINESS_SYSTEM'/,
    );
  });

  it('keeps the existing closed vocabulary for source_type', () => {
    expect(MIGRATION_CLASSIFICATION).toContain('source_kind');
    // It adds a column; it must not loosen or replace the type constraint.
    expect(MIGRATION_CLASSIFICATION).not.toMatch(/DROP CONSTRAINT IF EXISTS "organization_sources_source_type_check"/);
  });

  it('contains no tenant, endpoint or special case for any real organisation', () => {
    for (const sql of [MIGRATION_CLASSIFICATION, MIGRATION_NAME]) {
      expect(sql).not.toMatch(/ellines-haven|Ellines Haven|cloudfunctions\.net/);
    }
    for (const file of [ENDPOINT, SOURCES_ENDPOINT, WEBSITE_CHECK]) {
      expect(file).not.toMatch(/ellines-haven|cloudfunctions\.net/);
    }
  });

  it('does not silently reclassify existing rows during deploy', () => {
    // Everything before the function definition runs at deploy time. It must not
    // rewrite any existing source row: the only row the migration touches is
    // registry ATTRIBUTION (evidence points at the source it describes).
    // Classification stays an explicit operator action, so the UPDATE that exists
    // must live INSIDE the function and nowhere else.
    const runsAtDeploy = MIGRATION_CLASSIFICATION.split('CREATE OR REPLACE FUNCTION')[0];
    expect(runsAtDeploy).not.toMatch(/UPDATE\s+"?organization_sources"?/i);
    expect(runsAtDeploy).not.toMatch(/DELETE\s+FROM\s+"?organization_sources"?/i);
    expect(MIGRATION_CLASSIFICATION).toMatch(/CREATE OR REPLACE FUNCTION eip_classify_source/);
    // Attribution is scoped to the same organisation, so evidence is never moved
    // across tenants.
    expect(MIGRATION_CLASSIFICATION).toMatch(/s\."organization_id" = r\."organization_id"/);
  });
});

describe('classification is an explicit, authorized, audited operation', () => {
  it('requires a reason and refuses to guess a category', () => {
    expect(MIGRATION_NAME).toMatch(/eip_reason_required/);
    expect(MIGRATION_NAME).toMatch(/eip_kind_requires_website/);
    expect(MIGRATION_NAME).toMatch(/eip_website_url_required/);
    // A website must carry the URL it will actually be measured against.
    expect(MIGRATION_NAME).toMatch(/"website_url" = CASE WHEN p_source_type = 'WEBSITE' THEN v_url/);
  });

  it('preserves existing evidence when the classification changes', () => {
    // Capabilities, measurements and connector links are not touched by the UPDATE.
    const update = MIGRATION_NAME.slice(MIGRATION_NAME.indexOf('UPDATE "organization_sources"'));
    const statement = update.slice(0, update.indexOf('RETURNING'));
    expect(statement).not.toMatch(/connector_capability_registries/);
    expect(statement).not.toMatch(/source_website_measurements/);
    expect(statement).not.toMatch(/connector_installations/);
  });

  it('authorises the caller against the source\'s own organisation', () => {
    expect(ENDPOINT).toMatch(/requireOrgAdmin/);
    expect(ENDPOINT).toMatch(/existing\.organization_id !== organizationId/);
    // Cross-tenant reads are refused as "not found", not as "forbidden": a caller
    // must not be able to learn that another organisation's source exists.
    expect(ENDPOINT).toMatch(/Source not found/);
  });

  it('writes an audit record for success and for refusal', () => {
    const audits = ENDPOINT.match(/org\.source\.classify/g) ?? [];
    expect(audits.length).toBeGreaterThanOrEqual(3); // failure, empty result, success
    expect(ENDPOINT).toMatch(/result: 'success'/);
    expect(ENDPOINT).toMatch(/result: 'failure'/);
  });

  it('does not report a mutating call that returned nothing as success', () => {
    expect(ENDPOINT).toMatch(/if \(!data\)/);
  });

  it('returns the row that was actually persisted', () => {
    expect(ENDPOINT).toMatch(/p_source_id/);
    expect(ENDPOINT).toMatch(/p_source_kind/);
    expect(ENDPOINT).toMatch(/return json\(\{ statusCode: 200, data: persisted \}\)/);
  });
});

describe('the website probe measures the configured source, not a substitute', () => {
  it('probes the persisted website URL and never a fallback', () => {
    expect(WEBSITE_CHECK).toMatch(/eq\('source_type', 'WEBSITE'\)/);
    expect(WEBSITE_CHECK).toMatch(/No website is configured for this organisation/);
    // Layer 1 only: reachability and TLS. It must not turn a 200 into a capability.
    expect(WEBSITE_CHECK).not.toMatch(/resources\s*:\s*\[/);
  });

  it('reads the persisted kind rather than deriving it', () => {
    expect(SOURCES_ENDPOINT).toMatch(/source_type, source_kind,/);
    // An unrecognised stored value degrades to null instead of becoming a guess.
    expect(SOURCES_ENDPOINT).toMatch(/kind === 'HTML' \|\| kind === 'API' \? kind : null/);
  });
});

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

  it('shows a website card capabilities only from that source\'s own evidence', () => {
    const websiteCard = SOURCE_CARDS.slice(
      SOURCE_CARDS.indexOf('function WebsiteCard'),
      SOURCE_CARDS.indexOf('function SystemsCard'),
    );
    expect(websiteCard).toMatch(/httpStatus/);
    expect(websiteCard).toMatch(/tls/i);
    // A WEBSITE source may be an API (kind = API), and an API can genuinely expose
    // capabilities. When it does, they are shown from ITS OWN resources — the record
    // it actually returned — not lifted from a business system.
    expect(websiteCard).toMatch(/website\.resources/);
    // The conflation this guards against: reading counts off a system and printing
    // them under the website, which is how a system gets "copied" into a website.
    expect(websiteCard).not.toMatch(/businessSystems/);
  });

  it('never claims capabilities from an HTTP 200 alone', () => {
    const websiteCard = SOURCE_CARDS.slice(
      SOURCE_CARDS.indexOf('function WebsiteCard'),
      SOURCE_CARDS.indexOf('function SystemsCard'),
    );
    // With no discovered resource the card says so; reachability is not capability.
    expect(websiteCard).toMatch(/No capabilities discovered for this source yet/);
    expect(websiteCard).toMatch(/a 200\s+from this endpoint does not create a resource/);
  });

  it('labels the website with its persisted kind, never a guess', () => {
    const websiteCard = SOURCE_CARDS.slice(
      SOURCE_CARDS.indexOf('function WebsiteCard'),
      SOURCE_CARDS.indexOf('function SystemsCard'),
    );
    expect(websiteCard).toMatch(/kind === 'API' \? 'WEBSITE API' : 'WEBSITE'/);
    // No inference from the URL shape or the connector catalog.
    expect(websiteCard).not.toMatch(/includes\('api'\)|startsWith\('https?:.*\/api/);
  });

  it('never shows business record counts copied from another source', () => {
    // The website card may print counts for its own resources, so the invariant is
    // now narrower and stricter: those counts come from `website.resources` and from
    // nowhere else.
    const websiteCard = SOURCE_CARDS.slice(
      SOURCE_CARDS.indexOf('function WebsiteCard'),
      SOURCE_CARDS.indexOf('function SystemsCard'),
    );
    expect(websiteCard).toMatch(/website\.resources\.map/);
    expect(websiteCard).toMatch(/resource\.retrievedRecordCount/);
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
