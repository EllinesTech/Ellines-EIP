/**
 * Verify the client API surface locally after the Pages-shim change.
 *
 * Proves the routes that used to 404 locally (`/api/v1/dashboards`,
 * `/api/v1/connectors/health`, …) are now served by the real Pages Functions,
 * and that routes NestJS owns still work.
 */

const WEB = process.env.EIP_WEB_URL || 'http://localhost:3100';
const IDENTITY = process.env.EIP_IDENTITY_URL || 'http://localhost:3001';
const EMAIL = process.env.EIP_VERIFY_EMAIL;
const PASSWORD = process.env.EIP_VERIFY_PASSWORD;

const ROUTES = [
  '/api/v1/dashboards/',
  '/api/v1/connectors/health/',
  '/api/v1/connectors/',
  '/api/v1/dashboards/attention/',
  '/api/v1/connectors/installations/',
  '/api/v1/orgs/me/',
  '/api/v1/orgs/me/approvals/',
  '/api/v1/enterprise/summary/',
];

let pass = 0;
let fail = 0;
const failures = [];

async function main() {
  const login = await fetch(`${IDENTITY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: HTTP ${login.status}`);
  const { accessToken } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };

  for (const route of ROUTES) {
    const res = await fetch(`${WEB}${route}`, { headers });
    const body = await res.text();
    // A 404 body from NestJS means the route fell through to the rewrite
    // instead of being served by the Pages Function shim.
    const ok = res.status === 200;
    if (ok) {
      pass += 1;
    } else {
      fail += 1;
      failures.push(`${route} -> ${res.status}`);
    }
    process.stdout.write(
      `${ok ? 'PASS' : 'FAIL'}  ${route}  ${res.status}  ${body.slice(0, 70)}\n`,
    );
  }

  process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
  if (failures.length) process.stdout.write(`failed: ${failures.join(', ')}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  process.stdout.write(`FATAL: ${err?.message || err}\n`);
  process.exit(1);
});
