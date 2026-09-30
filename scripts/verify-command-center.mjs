/**
 * Browser verification: the CLIENT "Command Center" navigation item.
 *
 * Confirms the fix in app-navigation.ts: the sidebar entry must point at
 * /app (the real CommandCenterPage) and NOT at /app/dashboards (the Dashboard
 * Engine management screen). Also confirms /app/dashboards still loads.
 *
 * Usage:
 *   $env:EIP_VERIFY_EMAIL="..."; $env:EIP_VERIFY_PASSWORD="..."
 *   node scripts/verify-command-center.mjs
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
  const login = await fetch(`${IDENTITY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: HTTP ${login.status}`);
  const raw = await login.json();
  const session = {
    accessToken: raw.accessToken,
    expiresIn: raw.expiresIn,
    user: raw.user,
    organization: raw.organization,
    isPlatformAdmin: Boolean(raw.user?.isPlatformAdmin),
  };

  const browser = await launchBrowser({ port: 9345, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${WEB}/login/`, { waitMs: 1500 });
    await page.evaluate((s) => localStorage.setItem('eip_auth', JSON.stringify(s)), session);

    // ── 1. The sidebar link target ──────────────────────────────────────────
    section('1. Sidebar Command Center link target');
    await page.goto(`${WEB}/app/`, { waitMs: 4000 });
    const link = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href^="/app"]')).find((el) =>
        (el.textContent || '').trim().toLowerCase().startsWith('command center'),
      );
      return a ? { href: a.getAttribute('href'), text: (a.textContent || '').trim() } : null;
    });
    check('Command Center sidebar item exists', Boolean(link), JSON.stringify(link));
    // trailingSlash: true means the live href carries a trailing slash.
    const norm = (v) => (v && v.length > 1 && v.endsWith('/') ? v.slice(0, -1) : v);
    check('Its href is /app (not /app/dashboards)', norm(link?.href) === '/app', String(link?.href));

    // ── 2. Click it ─────────────────────────────────────────────────────────
    section('2. Click Command Center');
    await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href^="/app"]')).find((el) =>
        (el.textContent || '').trim().toLowerCase().startsWith('command center'),
      );
      if (a) a.click();
    });
    await new Promise((r) => setTimeout(r, 4000));

    const after = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        path: location.pathname,
        text,
        isAddDashboard: /add dashboard|create dashboard|new dashboard|no dashboards yet/i.test(text),
        looksLikeCommandCenter:
          /command center|welcome back/i.test(text) ||
          Boolean(document.querySelector('h1')),
        activeHref: document.querySelector('a[aria-current="page"]')?.getAttribute('href') ?? null,
      };
    });

    check('URL after click is /app', norm(after.path) === '/app', after.path);
    check(
      'Does NOT show Add/Create Dashboard UI',
      !after.isAddDashboard,
      after.text.slice(0, 120).replace(/\n/g, ' '),
    );
    check('Renders Command Center content', after.looksLikeCommandCenter, after.text.slice(0, 120).replace(/\n/g, ' '));
    check('Command Center sidebar item is active', norm(after.activeHref) === '/app', String(after.activeHref));

    // ── 3. /app/dashboards still works as the management screen ─────────────
    section('3. /app/dashboards still loads (Dashboard Engine management)');
    await page.goto(`${WEB}/app/dashboards/`, { waitMs: 4000 });
    const mgmt = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return { path: location.pathname, text, isManagement: /new dashboard|no dashboards yet/i.test(text) };
    });
    check('/app/dashboards still loads', norm(mgmt.path) === '/app/dashboards', mgmt.path);
    check(
      'It is still the Dashboard Engine management screen',
      mgmt.isManagement,
      mgmt.text.slice(0, 120).replace(/\n/g, ' '),
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

