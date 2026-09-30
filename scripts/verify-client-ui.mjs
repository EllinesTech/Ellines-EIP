/**
 * Real browser verification of the EIP client experience.
 *
 * Drives an actual headless Chrome over the DevTools Protocol — no npm
 * dependencies (scripts/cdp.mjs uses Node's native WebSocket).
 *
 * This closes the gap left by HTTP probes, which could not see the client UI:
 * auth is JWT-in-localStorage, so the sidebar, dashboard and connector health
 * only exist after a real login inside a real browser.
 *
 * Verifies:
 *   login -> client shell -> sidebar groups -> active route -> Command Center
 *   -> dashboard -> connector health (honest states) -> responsive sidebar
 *   -> Super Admin separation (/app/platform is NOT the client shell)
 *
 * Usage:
 *   $env:EIP_VERIFY_EMAIL="owner@example.com"
 *   $env:EIP_VERIFY_PASSWORD="..."
 *   node scripts/verify-client-ui.mjs
 */

import { launchBrowser } from './cdp.mjs';

const WEB = process.env.EIP_WEB_URL || 'http://localhost:3100';
const IDENTITY = process.env.EIP_IDENTITY_URL || 'http://localhost:3001';
const EMAIL = process.env.EIP_VERIFY_EMAIL;
const PASSWORD = process.env.EIP_VERIFY_PASSWORD;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    fail += 1;
    failures.push(name);
    process.stdout.write(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}\n`);
  }
}

function section(t) {
  process.stdout.write(`\n${t}\n${'-'.repeat(t.length)}\n`);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    process.stdout.write(
      'Set EIP_VERIFY_EMAIL and EIP_VERIFY_PASSWORD to run browser verification.\n',
    );
    process.exit(2);
  }

  // Real session from the real API, shaped exactly as AuthSession in lib/api.ts.
  const res = await fetch(`${IDENTITY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    process.stdout.write(`Login failed: HTTP ${res.status}\n`);
    process.exit(1);
  }
  const raw = await res.json();
  const session = {
    accessToken: raw.accessToken,
    expiresIn: raw.expiresIn,
    user: raw.user,
    organization: raw.organization,
    isPlatformAdmin: Boolean(raw.user?.isPlatformAdmin),
  };

  const browser = await launchBrowser({ port: 9333, headless: true });
  const page = await browser.newPage();

  try {
    // ── 1. LOGIN ───────────────────────────────────────────────────────────
    section('1. Login & session');
    await page.goto(`${WEB}/login/`, { waitMs: 1500 });
    const seeded = await page.evaluate((s) => {
      localStorage.setItem('eip_auth', JSON.stringify(s));
      return Boolean(localStorage.getItem('eip_auth'));
    }, session);
    check('Session stored under eip_auth', seeded);

    // ── 2. CLIENT SHELL + SIDEBAR ───────────────────────────────────────────
    section('2. Client shell & sidebar');
    await page.goto(`${WEB}/app/`, { waitMs: 4000 });
    const shell = await page.evaluate(() => {
      // Brand may live in the sidebar node or the document title.
      const bodyText = (document.body.innerText || '').toUpperCase();
      const title = (document.title || '').toUpperCase();
      const groups = [
        'COMMAND', 'BUSINESS', 'OPERATIONS', 'PEOPLE', 'INTEGRATIONS',
        'AUTOMATION', 'INTELLIGENCE', 'ADMINISTRATION',
      ];
      return {
        title: document.title,
        // Groups are collapsible and MOST START COLLAPSED by design — so assert the
        // group headers/toggle controls exist, not that every item is expanded.
        groupHeaders: groups.filter((g) => bodyText.includes(g)),
        navLinks: Array.from(document.querySelectorAll('a[href^="/app"]')).map((a) => a.getAttribute('href')),
        redirect: location.pathname,
        hasBrand: bodyText.includes('ELLINES') || title.includes('ELLINES'),
      };
    });
    check('Client shell rendered with brand', shell.hasBrand, `${shell.title} @ ${shell.redirect}`);
    check(
      'Sidebar section groups present (collapsible, collapsed-by-default is valid)',
      shell.groupHeaders.length >= 3,
      `groups: ${shell.groupHeaders.join(', ')}`,
    );
    check('Sidebar exposes navigation links', shell.navLinks.length > 0, `${shell.navLinks.length} links`);

    // ── 3. ACTIVE ROUTE STATE ───────────────────────────────────────────────
    section('3. Active route state');
    await page.goto(`${WEB}/app/connectors/health/`, { waitMs: 3500 });
    const active = await page.evaluate(() => {
      const el = document.querySelector('a[aria-current="page"]');
      return el ? el.getAttribute('href') : null;
    });
    check('Active route marked aria-current', Boolean(active), String(active));

    // ── 4. COMMAND CENTER / DASHBOARD ──────────────────────────────────────
    section('4. Command Center / dashboard');
    await page.goto(`${WEB}/app/dashboards/`, { waitMs: 4000 });
    const dash = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        length: text.length,
        stuckLoading: /^\s*loading/i.test(text.trim()) || /loading…/i.test(text),
        hasHeading: /command center|dashboard/i.test(text),
      };
    });
    check('Dashboard renders content', dash.length > 200, `${dash.length} chars`);
    check('Dashboard is not stuck loading', !dash.stuckLoading);
    check('Dashboard heading present', dash.hasHeading);

    // ── 5. CONNECTOR HEALTH (honest data states) ────────────────────────────
    section('5. Connector health');
    await page.goto(`${WEB}/app/connectors/health/`, { waitMs: 4000 });
    const health = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        hasHeading: /connector health/i.test(text),
        alerts: Array.from(document.querySelectorAll('[role="alert"]')).map((e) => (e.textContent || '').trim()),
        honestEmpty: /no connectors|install a connector|nothing to show|empty|no connected/i.test(text),
      };
    });
    check('Connector Health page renders', health.hasHeading);
    // Either it shows an explicit empty state, or real rows — never invented numbers.
    // NOTE: locally this currently surfaces the documented data-plane parity gap
    // ("Cannot GET /api/v1/connectors/health") because Pages-Functions-only routes
    // are proxied to NestJS by the dev rewrite. That is a real local defect, and
    // this assertion is what makes it visible rather than hiding it.
    check(
      'Connector Health shows an honest state (real rows or explicit empty)',
      health.alerts.length === 0 || health.honestEmpty,
      health.alerts.join(' | ').slice(0, 140),
    );

    // ── 6. RESPONSIVE SIDEBAR ──────────────────────────────────────────────
    section('6. Responsive behaviour (390px)');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await page.goto(`${WEB}/app/`, { waitMs: 4000 });
    const mobile = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      navLinks: document.querySelectorAll('a[href^="/app"]').length,
    }));
    check(
      'No horizontal overflow at 390px',
      mobile.scrollWidth <= mobile.clientWidth + 2,
      `scrollWidth=${mobile.scrollWidth} clientWidth=${mobile.clientWidth}`,
    );
    check('Navigation present at mobile width', mobile.navLinks > 0, `${mobile.navLinks} links`);
    await page.send('Emulation.clearDeviceMetricsOverride');

    // ── 7. SUPER ADMIN SEPARATION ──────────────────────────────────────────
    section('7. Super Admin separation');
    await page.goto(`${WEB}/app/platform/`, { waitMs: 4000 });
    const platform = await page.evaluate(() => {
      const text = (document.body.innerText || '').toUpperCase();
      return {
        hasPlatformSections: /ORGANIZATIONS|PLATFORM|CONNECTOR PACK|ACCESS CONTROL|ELLINES ORGANIZATION/.test(text),
        hasClientGroups: /CUSTOMER RELATIONSHIP/.test(text),
        // `/app/crm` is a CLIENT-ONLY route. `/app/people` is deliberately shared
        // (it is also a Super Admin rail destination), so it is not a valid probe.
        clientOnlyLinks: Array.from(document.querySelectorAll('a[href="/app/crm/"]')).length,
      };
    });
    check('/app/platform renders the platform control plane', platform.hasPlatformSections);
    check(
      '/app/platform is NOT the client business shell',
      !platform.hasClientGroups && platform.clientOnlyLinks === 0,
      `clientGroups=${platform.hasClientGroups} crmLinks=${platform.clientOnlyLinks}`,
    );
  } finally {
    await page.close();
    await browser.close();
  }

  section('RESULT');
  process.stdout.write(`  ${pass} passed, ${fail} failed\n`);
  if (failures.length) process.stdout.write(`  failed: ${failures.join(', ')}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  process.stdout.write(`FATAL: ${err?.stack || err}\n`);
  process.exit(1);
});

