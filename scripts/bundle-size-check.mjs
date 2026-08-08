#!/usr/bin/env node
/**
 * Bundle size checker — reads Next.js build output and enforces size budgets.
 * Runs after `npm run build -w @ellines-eip/web`.
 *
 * Usage:
 *   node scripts/bundle-size-check.mjs
 *   node scripts/bundle-size-check.mjs --ci        # exit 1 on budget exceeded
 *   node scripts/bundle-size-check.mjs --json      # print JSON report
 */

import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const NEXT_DIR = join(ROOT, 'apps', 'web', '.next');

const args = process.argv.slice(2);
const CI_MODE = args.includes('--ci');
const JSON_OUTPUT = args.includes('--json');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

// Size budgets (uncompressed raw JS; gzip reduces ~3-4x in production)
// Cloudflare Pages serves with Brotli/gzip — actual transfer sizes are much smaller.
const BUDGETS = {
  // Max raw (uncompressed) JS per category
  frameworkChunkKb: 200,    // React 19 + Next 15 internals (~50 KB gzipped)
  appChunkKb: 150,          // App-level shared code
  singlePageKb: 500,        // Any single page/shared chunk (Recharts etc.)
  totalStaticKb: 3000,      // Everything in .next/static/chunks (~750 KB gzipped)
  totalServerKb: 5120,      // Everything in .next/server
};

let exitCode = 0;
const warnings = [];
const errors = [];

function formatKb(bytes) {
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`;
  return `${kb.toFixed(1)} KB`;
}

function budget(label, valueBytes, budgetKb, warn = false) {
  const kb = valueBytes / 1024;
  const pct = ((kb / budgetKb) * 100).toFixed(0);
  const bar = '█'.repeat(Math.min(Math.floor(kb / budgetKb * 20), 20)) +
               '░'.repeat(Math.max(0, 20 - Math.floor(kb / budgetKb * 20)));

  let icon, color;
  if (kb <= budgetKb * 0.75) { icon = '✓'; color = GREEN; }
  else if (kb <= budgetKb) { icon = '~'; color = YELLOW; }
  else { icon = '✗'; color = RED; if (!warn) { exitCode = 1; errors.push(`${label}: ${formatKb(valueBytes)} > ${budgetKb} KB budget`); } else { warnings.push(`${label}: ${formatKb(valueBytes)} > ${budgetKb} KB budget`); } }

  if (!JSON_OUTPUT) {
    console.log(`  ${color}${icon}${RESET} ${label}`);
    console.log(`    ${DIM}${bar}${RESET} ${BOLD}${formatKb(valueBytes)}${RESET} / ${budgetKb} KB (${pct}%)`);
  }

  return { label, bytes: valueBytes, budgetKb, pct: parseFloat(pct), passed: kb <= budgetKb };
}

function scanDir(dir, ext = '.js') {
  if (!existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    try {
      const entries = readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = join(d, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (e.name.endsWith(ext)) {
          try {
            const size = statSync(full).size;
            results.push({ path: full.replace(ROOT, ''), name: e.name, size });
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(dir);
  return results;
}

if (!existsSync(NEXT_DIR)) {
  console.error(`${RED}✗ No .next build output found.${RESET}`);
  console.error(`  Run: npm run build -w @ellines-eip/web`);
  process.exit(CI_MODE ? 1 : 0);
}

if (!JSON_OUTPUT) {
  console.log(`\n${BOLD}${CYAN}▶ Bundle Size Analysis${RESET}`);
  console.log(`  Build: ${NEXT_DIR}\n`);
}

// Read BUILD_ID
const buildId = existsSync(join(NEXT_DIR, 'BUILD_ID'))
  ? readFileSync(join(NEXT_DIR, 'BUILD_ID'), 'utf8').trim()
  : 'unknown';

// ── Static chunks ──────────────────────────────────────
const chunksDir = join(NEXT_DIR, 'static', 'chunks');
const allChunks = scanDir(chunksDir);

const totalStaticBytes = allChunks.reduce((s, c) => s + c.size, 0);
const frameworkChunks = allChunks.filter(c => c.name.includes('framework'));
const mainChunks = allChunks.filter(c => c.name.includes('main'));
const appChunks = allChunks.filter(c => c.name.includes('app-'));
const pageChunks = allChunks.filter(c =>
  !c.name.includes('framework') && !c.name.includes('main') && !c.name.includes('webpack')
);

const frameworkBytes = frameworkChunks.reduce((s, c) => s + c.size, 0);
const appBytes = appChunks.reduce((s, c) => s + c.size, 0);
const largestPage = pageChunks.reduce((max, c) => c.size > (max?.size || 0) ? c : max, null);

const budgetResults = [];

if (!JSON_OUTPUT) console.log(`${BOLD}  Static chunks (${allChunks.length} files)${RESET}`);
budgetResults.push(budget('Framework bundle (React+Next)', frameworkBytes, BUDGETS.frameworkChunkKb));
budgetResults.push(budget('App shared bundle', appBytes, BUDGETS.appChunkKb, true));
if (largestPage) {
  budgetResults.push(budget(`Largest page chunk (${largestPage.name})`, largestPage.size, BUDGETS.singlePageKb, true));
}
budgetResults.push(budget('Total static JS', totalStaticBytes, BUDGETS.totalStaticKb));

// ── Server chunks ──────────────────────────────────────
const serverDir = join(NEXT_DIR, 'server');
const serverChunks = scanDir(serverDir);
const totalServerBytes = serverChunks.reduce((s, c) => s + c.size, 0);

if (!JSON_OUTPUT) console.log(`\n${BOLD}  Server output (${serverChunks.length} files)${RESET}`);
budgetResults.push(budget('Total server JS', totalServerBytes, BUDGETS.totalServerKb));

// ── Top 10 largest chunks ──────────────────────────────
const top10 = [...allChunks].sort((a, b) => b.size - a.size).slice(0, 10);
if (!JSON_OUTPUT && top10.length > 0) {
  console.log(`\n${BOLD}  Top 10 largest client chunks${RESET}`);
  for (const c of top10) {
    const bar = '█'.repeat(Math.min(Math.floor(c.size / (top10[0].size) * 20), 20));
    console.log(`  ${DIM}${bar}${RESET} ${formatKb(c.size).padStart(9)}  ${c.name}`);
  }
}

// ── Comparison with baseline ──────────────────────────
const baselinePath = join(ROOT, 'reports', 'perf', 'bundle-baseline.json');
let baseline = null;
if (existsSync(baselinePath)) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const diff = totalStaticBytes - baseline.totalStaticBytes;
    const diffKb = diff / 1024;
    if (!JSON_OUTPUT) {
      const color = diffKb > 50 ? RED : diffKb > 0 ? YELLOW : GREEN;
      const sign = diff >= 0 ? '+' : '';
      console.log(`\n${BOLD}  vs baseline (${baseline.buildId})${RESET}`);
      console.log(`  Total static: ${color}${sign}${formatKb(Math.abs(diff))}${RESET} (${diff >= 0 ? 'grew' : 'shrank'})`);
      if (diffKb > 100 && CI_MODE) {
        exitCode = 1;
        errors.push(`Bundle grew by ${formatKb(diff)} vs baseline (> 100 KB threshold)`);
      }
    }
  } catch { /* skip */ }
}

// ── Write report ──────────────────────────────────────
const report = {
  timestamp: new Date().toISOString(),
  buildId,
  commit: process.env.GITHUB_SHA || 'local',
  branch: process.env.GITHUB_REF_NAME || 'local',
  totalStaticBytes,
  totalServerBytes,
  chunkCount: allChunks.length,
  frameworkBytes,
  appBytes,
  largestPageBytes: largestPage?.size || 0,
  largestPageName: largestPage?.name || null,
  top10: top10.map(c => ({ name: c.name, bytes: c.size })),
  budgets: budgetResults,
  errors,
  warnings,
};

mkdirSync(join(ROOT, 'reports', 'perf'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'perf', 'bundle-latest.json'), JSON.stringify(report, null, 2));

// Save as baseline if --save-baseline flag
if (args.includes('--save-baseline')) {
  writeFileSync(baselinePath, JSON.stringify(report, null, 2));
  if (!JSON_OUTPUT) console.log(`\n  ${GREEN}Baseline saved.${RESET}`);
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  // Summary
  console.log(`\n${BOLD}════════════════════════════════════════${RESET}`);
  if (errors.length === 0) {
    console.log(`${GREEN}${BOLD}  Bundle sizes within budget ✓${RESET}`);
  } else {
    console.log(`${RED}${BOLD}  Budget exceeded:${RESET}`);
    errors.forEach(e => console.log(`  ${RED}✗ ${e}${RESET}`));
  }
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(`  ${YELLOW}⚠ ${w}${RESET}`));
  }
  console.log(`${BOLD}════════════════════════════════════════${RESET}`);
  console.log(`\n  Report: reports/perf/bundle-latest.json`);
  console.log(`  Tip: Run with --save-baseline to set a new baseline\n`);
}

process.exit(exitCode);
