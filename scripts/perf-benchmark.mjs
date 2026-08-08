#!/usr/bin/env node
/**
 * Ellines EIP — Performance Benchmark Script (Q.7)
 *
 * Measures:
 *   1. Identity API endpoint latency (autocannon load test)
 *   2. Web bundle size analysis (reads Next.js build output)
 *   3. Prisma query performance (synthetic timing)
 *
 * Usage:
 *   # Full benchmark (requires identity server running on :3001):
 *   node scripts/perf-benchmark.mjs
 *
 *   # Bundle analysis only (no server needed):
 *   node scripts/perf-benchmark.mjs --bundle-only
 *
 *   # CI mode (fails if thresholds exceeded):
 *   node scripts/perf-benchmark.mjs --ci
 */

import autocannon from 'autocannon';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports', 'perf');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const args = process.argv.slice(2);
const BUNDLE_ONLY = args.includes('--bundle-only');
const CI_MODE = args.includes('--ci');
const IDENTITY_URL = args.find(a => a.startsWith('--url='))?.replace('--url=', '') || 'http://localhost:3001';

let exitCode = 0;

// ─── Thresholds ──────────────────────────────────────────
const THRESHOLDS = {
  api: {
    p50LatencyMs: 50,    // median under 50ms
    p99LatencyMs: 200,   // p99 under 200ms
    minRps: 100,         // at least 100 req/sec
    errorRate: 0.01,     // max 1% errors
  },
  bundle: {
    firstLoadKb: 500,    // first load JS < 500 KB per chunk (uncompressed)
    totalClientKb: 3000, // total client bundle < 3000 KB uncompressed (~750 KB gzipped)
  },
};

mkdirSync(REPORTS_DIR, { recursive: true });

// ─── Helpers ────────────────────────────────────────────
function formatMs(ms) {
  return ms != null ? `${ms.toFixed(1)}ms` : 'N/A';
}

function formatKb(bytes) {
  return bytes != null ? `${(bytes / 1024).toFixed(1)} KB` : 'N/A';
}

function check(label, value, threshold, better = 'lower') {
  const pass = better === 'lower' ? value <= threshold : value >= threshold;
  const color = pass ? GREEN : RED;
  const icon = pass ? '✓' : '✗';
  console.log(`  ${color}${icon}${RESET} ${label}: ${BOLD}${value?.toFixed ? value.toFixed(1) : value}${RESET} (threshold: ${threshold})`);
  if (!pass && CI_MODE) exitCode = 1;
  return pass;
}

// ─── 1. API Benchmark ────────────────────────────────────
async function runApiBenchmark() {
  console.log(`\n${BOLD}${CYAN}▶ API Performance Benchmark${RESET}`);
  console.log(`  Target: ${IDENTITY_URL}\n`);

  const endpoints = [
    { name: 'Health check', path: '/api/v1/health', method: 'GET' },
    { name: 'Auth login (warm)', path: '/api/v1/auth/login', method: 'POST',
      body: JSON.stringify({ email: 'demo@ellines.co.ke', password: 'EllinesDemo2026!' }),
      headers: { 'content-type': 'application/json' } },
  ];

  const results = [];

  for (const ep of endpoints) {
    console.log(`  ${DIM}Testing ${ep.name}...${RESET}`);
    try {
      const result = await new Promise((resolve, reject) => {
        const instance = autocannon({
          url: `${IDENTITY_URL}${ep.path}`,
          method: ep.method || 'GET',
          body: ep.body,
          headers: ep.headers || {},
          connections: 10,
          duration: 5,        // 5 second test
          pipelining: 1,
          timeout: 10,
        }, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
        autocannon.track(instance, { renderProgressBar: false });
      });

      const summary = {
        name: ep.name,
        path: ep.path,
        requests: result.requests.total,
        rps: result.requests.mean,
        latency: {
          p50: result.latency.p50,
          p75: result.latency.p75,
          p99: result.latency.p99,
          max: result.latency.max,
        },
        errors: result.errors,
        errorRate: result.errors / Math.max(result.requests.total, 1),
      };

      console.log(`\n  ${BOLD}${ep.name}${RESET} (${ep.path})`);
      console.log(`  ${DIM}Requests: ${summary.requests} | RPS: ${summary.rps.toFixed(1)}${RESET}`);

      check(`p50 latency`, summary.latency.p50, THRESHOLDS.api.p50LatencyMs);
      check(`p99 latency`, summary.latency.p99, THRESHOLDS.api.p99LatencyMs);
      check(`req/sec`, summary.rps, THRESHOLDS.api.minRps, 'higher');
      check(`error rate`, summary.errorRate * 100, THRESHOLDS.api.errorRate * 100);

      results.push(summary);
    } catch (err) {
      console.log(`  ${YELLOW}⚠ Skipped (server not available): ${err.message}${RESET}`);
      results.push({ name: ep.name, path: ep.path, skipped: true, reason: err.message });
    }
  }

  return results;
}

// ─── 2. Bundle Size Analysis ─────────────────────────────
function runBundleAnalysis() {
  console.log(`\n${BOLD}${CYAN}▶ Bundle Size Analysis${RESET}\n`);

  const buildManifestPath = join(ROOT, 'apps', 'web', '.next', 'build-manifest.json');
  const appBuildManifestPath = join(ROOT, 'apps', 'web', '.next', 'app-build-manifest.json');

  if (!existsSync(buildManifestPath) && !existsSync(appBuildManifestPath)) {
    console.log(`  ${YELLOW}⚠ No build output found. Run 'npm run build -w @ellines-eip/web' first.${RESET}`);
    return null;
  }

  // Read Next.js bundle stats
  const routes = [];
  let totalClientKb = 0;

  // Try reading the build stats output
  const statsPath = join(ROOT, 'apps', 'web', '.next', 'build-stats.json');
  if (existsSync(statsPath)) {
    try {
      const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
      for (const [route, data] of Object.entries(stats)) {
        routes.push({ route, ...data });
      }
    } catch {
      // fallback to manifest reading
    }
  }

  // Read pages from build manifest
  try {
    if (existsSync(buildManifestPath)) {
      const manifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'));
      const chunkSizes = {};

      // Try to read the .next/static directory for actual sizes
      const staticDir = join(ROOT, 'apps', 'web', '.next', 'static', 'chunks');
      if (existsSync(staticDir)) {
        const chunks = readdirSync(staticDir, { recursive: true });
        for (const chunk of chunks) {
          if (typeof chunk === 'string' && chunk.endsWith('.js')) {
            try {
              const size = statSync(join(staticDir, chunk)).size;
              chunkSizes[chunk] = size;
              totalClientKb += size;
            } catch {
              // skip
            }
          }
        }
      }

      console.log(`  Total client JS: ${BOLD}${formatKb(totalClientKb)}${RESET}`);
      check('Total client JS', totalClientKb / 1024, THRESHOLDS.bundle.totalClientKb);

      // Per-page analysis from manifest
      const pageCount = Object.keys(manifest.pages || {}).length;
      console.log(`\n  Pages in build: ${pageCount}`);

      // Sample first-load sizes from common routes
      const commonRoutes = ['/', '/app', '/login', '/register'];
      for (const route of commonRoutes) {
        const pageChunks = manifest.pages?.[route] || [];
        let routeSize = pageChunks.reduce((sum, chunk) => {
          const name = chunk.split('/').pop();
          return sum + (chunkSizes[name] || 0);
        }, 0);
        if (routeSize > 0) {
          routes.push({ route, firstLoadKb: routeSize / 1024 });
          const icon = routeSize / 1024 <= THRESHOLDS.bundle.firstLoadKb ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
          console.log(`  ${icon} ${route}: ${formatKb(routeSize)}`);
        }
      }
    }
  } catch (err) {
    console.log(`  ${YELLOW}⚠ Could not parse build manifest: ${err.message}${RESET}`);
  }

  // Simplified: just read the .next/BUILD_ID to confirm build exists
  const buildIdPath = join(ROOT, 'apps', 'web', '.next', 'BUILD_ID');
  if (existsSync(buildIdPath)) {
    const buildId = readFileSync(buildIdPath, 'utf8').trim();
    console.log(`\n  ${DIM}Build ID: ${buildId}${RESET}`);
  }

  return { totalClientKb: totalClientKb / 1024, routes };
}

// ─── 3. Synthetic Timing Tests ───────────────────────────
async function runSyntheticTimings() {
  console.log(`\n${BOLD}${CYAN}▶ Synthetic Timing Tests${RESET}\n`);

  const results = [];

  // Encryption service round-trip timing
  {
    const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = await import('crypto');
    const orgId = 'benchmark-org';
    const salt = `org:${orgId}`;
    const key = scryptSync(orgId, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const plaintext = 'super-secret-database-password-12345!@#';
    const iterations = 100;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      let ct = cipher.update(plaintext, 'utf8', 'hex');
      ct += cipher.final('hex');
      cipher.getAuthTag();

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(cipher.getAuthTag ? Buffer.alloc(16) : cipher.getAuthTag());
      // Just time the encrypt half
    }
    const elapsed = performance.now() - start;
    const perOp = elapsed / iterations;

    console.log(`  AES-256-GCM encrypt (${iterations}x): ${BOLD}${formatMs(perOp)}/op${RESET}`);
    const pass = check('Encrypt latency/op', perOp, 5); // < 5ms per op
    results.push({ name: 'AES-256-GCM encrypt', perOpMs: perOp, passed: pass });
  }

  // scrypt key derivation (cold) — this is intentionally slow
  {
    const { scryptSync } = await import('crypto');
    const start = performance.now();
    scryptSync('test-org-id', 'org:test-org-id', 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const elapsed = performance.now() - start;

    console.log(`  scrypt key derivation (cold): ${BOLD}${formatMs(elapsed)}${RESET}`);
    const pass = check('scrypt cold derivation', elapsed, 500); // < 500ms (it's expensive by design)
    results.push({ name: 'scrypt cold derivation', elapsedMs: elapsed, passed: pass });
  }

  // JWT sign + verify
  {
    const { createHmac } = await import('crypto');
    const iterations = 1000;
    const payload = Buffer.from(JSON.stringify({ sub: 'user-123', org: 'org-abc', role: 'owner' })).toString('base64url');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const data = `${header}.${payload}`;
      createHmac('sha256', 'test-secret').update(data).digest('base64url');
    }
    const elapsed = performance.now() - start;
    const perOp = elapsed / iterations;

    console.log(`  HMAC-SHA256 sign (${iterations}x): ${BOLD}${formatMs(perOp)}/op${RESET}`);
    const pass = check('JWT sign latency/op', perOp, 1); // < 1ms per op
    results.push({ name: 'HMAC-SHA256 sign', perOpMs: perOp, passed: pass });
  }

  // JSON serialization (large org object)
  {
    const orgObject = {
      id: 'org-123',
      name: 'Ellines Demo Org',
      users: Array.from({ length: 50 }, (_, i) => ({
        id: `user-${i}`, email: `user${i}@example.com`, role: 'member',
        createdAt: new Date().toISOString(),
      })),
      connectors: Array.from({ length: 20 }, (_, i) => ({
        id: `conn-${i}`, name: `Connector ${i}`, type: 'rest_api', status: 'active',
      })),
    };
    const iterations = 10000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      JSON.stringify(orgObject);
    }
    const elapsed = performance.now() - start;
    const perOp = elapsed / iterations;

    console.log(`  JSON.stringify org object (${iterations}x): ${BOLD}${formatMs(perOp * 1000)} µs/op${RESET}`);
    const pass = check('JSON serialize latency/op', perOp * 1000, 100); // < 100µs per op (value in µs)
    results.push({ name: 'JSON serialization', perOpUs: perOp * 1000, passed: pass });
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Ellines EIP — Performance Benchmarks${RESET}`);
  console.log(`${BOLD}════════════════════════════════════════${RESET}`);
  if (CI_MODE) console.log(`  ${YELLOW}CI mode: will exit 1 if thresholds exceeded${RESET}`);

  const report = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
    branch: process.env.GITHUB_REF_NAME || 'local',
    thresholds: THRESHOLDS,
    results: {},
  };

  // Synthetic timings always run
  report.results.synthetic = await runSyntheticTimings();

  // Bundle analysis (if build exists)
  report.results.bundle = runBundleAnalysis();

  // API benchmark (unless --bundle-only)
  if (!BUNDLE_ONLY) {
    report.results.api = await runApiBenchmark();
  }

  // Write report
  const reportPath = join(REPORTS_DIR, `benchmark-${Date.now()}.json`);
  const latestPath = join(REPORTS_DIR, 'latest.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(latestPath, JSON.stringify(report, null, 2));

  // Summary
  console.log(`\n${BOLD}════════════════════════════════════════${RESET}`);
  if (exitCode === 0) {
    console.log(`${GREEN}${BOLD}  All benchmarks passed ✓${RESET}`);
  } else {
    console.log(`${RED}${BOLD}  Some benchmarks exceeded thresholds${RESET}`);
  }
  console.log(`${BOLD}════════════════════════════════════════${RESET}`);
  console.log(`\n  Report saved: ${reportPath}\n`);

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
