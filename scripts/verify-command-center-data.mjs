/**
 * Command Center REAL browser verification.
 *
 * Drives a real browser against the running app as a real authenticated tenant
 * and captures what the Command Center actually renders. It reports the raw
 * observed values so they can be traced, and FAILS if anything demo/fabricated
 * is present.
 *
 * Usage:
 *   $env:EIP_VERIFY_EMAIL="..."; $env:EIP_VERIFY_PASSWORD="..."
 *   node scripts/verify-command-center-data.mjs
 */
import { launchBrowser } from './cdp.mjs';

const WEB = process.env.EIP_WEB_URL || 'http://localhost:3100';
const IDENTITY = process.env.EIP_IDENTITY_URL || 'http://localhost:3001';
const EMAIL = process.env.EIP_VERIFY_EMAIL;
const PASSWORD = process.env.EIP_VERIFY_PASSWORD;

/** Strings that must never appear in a tenant's own Command Center. */
const FORBIDDEN = [
  'Nairobi HQ', 'Mombasa Ops', 'Mombasa Office', 'Kisumu Clinic', 'Kisumu Branch',
  'Nakuru Depot', 'Eldoret Site', 'Demo JSON Systems', 'Ellines Demo Org',
  'Add Dashboard', 'Create dashboard', 'Add dashboard', 'No dashboards yet',
];

let pass = 0;
let fail = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; process.stdout.write(`  PASS  ${name}\n`); }
  else { fail++; failures.push(name); process.stdout.write(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}\n`); }
};
const section = (t) => process.stdout.write(`\n${t}\n${'-'.repeat(t.length)}\n`);
/** trailingSlash: true means the live pathname carries a trailing slash. */
const norm = (v) => (v && v.length > 1 && v.endsWith('/') ? v.slice(0, -1) : v);

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
  process.stdout.write(`TENANT: ${session.organization?.name ?? '(none)'} / role ${session.user?.role}\n`);

  const browser = await launchBrowser({ port: 9351, headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`${WEB}/login/`, { waitMs: 1500 });
    await page.evaluate((s) => localStorage.setItem('eip_auth', JSON.stringify(s)), session);

    // ── Navigate to the Command Center ────────────────────────────────────
    section('1. Command Center route');
    await page.goto(`${WEB}/app/`, { waitMs: 5000 });
    const view = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        path: location.pathname,
        text,
        h1: document.querySelector('h1')?.innerText ?? null,
        activeHref: document.querySelector('a[aria-current="page"]')?.getAttribute('href') ?? null,
      };
    });
    check('URL is /app', norm(view.path) === '/app', view.path);
    check('Sidebar marks Command Center active', view.activeHref === '/app/', String(view.activeHref));
    check('Renders a Command Center heading', Boolean(view.h1), String(view.h1));

    // ── No demo / fabricated content ──────────────────────────────────────
    section('2. No demo or fabricated content');
    const found = FORBIDDEN.filter((s) => view.text.includes(s));
    check('No demo/fake strings rendered', found.length === 0, found.join(', '));
    check('No Add/Create Dashboard UI', !/add dashboard|create dashboard/i.test(view.text));

    // ── Observed KPI values (for tracing, not assertion) ──────────────────
    section('3. Observed Command Center values (trace output)');
    const kpis = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('section, .card, [class*="card"]').forEach((el) => {
        const t = (el.innerText || '').trim();
        if (t && t.length < 400) out.push(t);
      });
      return out.slice(0, 40);
    });
    for (const k of kpis) process.stdout.write(`    | ${k.replace(/\n/g, ' ⏎ ').slice(0, 150)}\n`);

    // ── Raw API truth vs rendered truth ───────────────────────────────────
    section('4. API truth for the same tenant');
    const headers = { authorization: `Bearer ${session.accessToken}` };
    for (const ep of ['/api/v1/enterprise/summary', '/api/v1/connectors/health', '/api/v1/dashboards/attention']) {
      const res = await fetch(`${WEB}${ep}`, { headers });
      const body = await res.text();
      process.stdout.write(`    ${ep} -> HTTP ${res.status}\n      ${body.slice(0, 260)}\n`);
      check(`${ep} responds 200`, res.status === 200, String(res.status));
    }

    // ── Failure states: a failed request must not become a healthy reading ─
    section('5. Failure states (requests forced to fail)');
    // Inject a fetch stub BEFORE the app mounts so the data layer genuinely fails.
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const real = window.fetch;
          window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('/api/v1/dashboards/attention') ||
                url.includes('/api/v1/connectors/health') ||
                url.includes('/api/v1/enterprise/summary')) {
              return Promise.reject(new TypeError('Simulated network failure'));
            }
            return real.apply(this, arguments);
          };
        })();
      `,
    });
    await page.goto(`${WEB}/app/`, { waitMs: 6000 });
    const failed = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        text,
        showsUnavailable: /could not be loaded|data could not be loaded/i.test(text),
        namesUnavailableSource: /alerts|connector health|enterprise summary/i.test(text),
        // A failure must NOT be presented as a confident healthy zero.
        claimsZeroAlertsHealthy: /0 open alerts/i.test(text),
      };
    });
    check('Failed loads surface an explicit "could not be loaded" state',
      failed.showsUnavailable, failed.text.slice(0, 160).replace(/\n/g, ' '));
    check('The unavailable state names the affected source(s)',
      failed.namesUnavailableSource);
    check('A failure is NOT rendered as a healthy "0 open alerts"',
      !failed.claimsZeroAlertsHealthy);
    process.stdout.write(`    observed while failing:\n      ${failed.text.slice(0, 300).replace(/\n/g, ' ⏎ ')}\n`);
  } finally {
    await page.close();
    await browser.close();
  }

  section('RESULT');
  process.stdout.write(`  ${pass} passed, ${fail} failed\n`);
  if (failures.length) process.stdout.write(`  failed: ${failures.join(', ')}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { process.stdout.write(`FATAL: ${e?.stack || e}\n`); process.exit(1); });
