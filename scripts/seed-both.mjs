#!/usr/bin/env node
/**
 * seed-both.mjs — Seed demo data + rate-limit tiers into BOTH databases
 *                 (local PostgreSQL AND Supabase) in a single command.
 *
 * Usage:
 *   node scripts/seed-both.mjs            # seeds both, restores .env
 *   node scripts/seed-both.mjs --local    # local only
 *   node scripts/seed-both.mjs --cloud    # cloud only
 *   node scripts/seed-both.mjs --dry-run  # print steps without executing
 *
 * What it does (per target):
 *   1. Switches .env DATABASE_URL to the target
 *   2. npm run seed:demo         — upserts demo org, user, 16 connector
 *                                  templates, dashboards, workflow rules,
 *                                  agent templates  (idempotent)
 *   3. npm run seed:rate-limits  — upserts 4 rate-limit tiers (idempotent)
 *   4. Restores .env to original URL
 *
 * Both seed scripts use Prisma upsert — safe to re-run any number of times.
 * This script always restores .env even if a step fails.
 *
 * WHY THIS EXISTS
 * ──────────────────────────────────────────────────────────────────
 * The dev workflow requires both databases to carry identical platform seed
 * data so that switching between local and Supabase never causes missing-row
 * errors. Previously you had to manually switch .env, run two seed commands,
 * switch back, and remember to do it for Supabase too. This script does all
 * of that atomically.
 *
 * HYBRID CLIENT NOTE
 * ──────────────────────────────────────────────────────────────────
 * When a client runs EIP on-premise + cloud simultaneously, running
 * `npm run seed:both` ensures their local server carries the same
 * connector templates and rate tiers as the cloud instance, so
 * offline-capable workers see the full connector catalogue even when
 * the Supabase connection is unavailable.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const ENV_PATH  = resolve(ROOT, '.env');

// ── Connection URLs ───────────────────────────────────────────────────────────
const LOCAL_URL = 'postgresql://postgres:80802424@localhost:5432/ellines_eip_local';
const CLOUD_URL =
  'postgresql://postgres.difrqfciratkwwvjlngp:Mwasblac808024242022@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30';

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const LOCAL_ONLY = args.includes('--local');
const CLOUD_ONLY = args.includes('--cloud');
const DRY_RUN   = args.includes('--dry-run');

// ── Colour helpers ────────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// ── .env helpers ──────────────────────────────────────────────────────────────
function readEnv() {
  if (!existsSync(ENV_PATH)) throw new Error('.env not found at ' + ENV_PATH);
  return readFileSync(ENV_PATH, 'utf8');
}

function patchEnv(original, targetUrl) {
  return original
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${targetUrl}`)
    .replace(/^DIRECT_URL=.*$/m,   `DIRECT_URL=${targetUrl}`);
}

function writeEnv(content) {
  writeFileSync(ENV_PATH, content, 'utf8');
}

// ── Run a seed against a target URL ──────────────────────────────────────────
function seedTarget(label, targetUrl) {
  const originalEnv = readEnv();
  const currentUrl  = (originalEnv.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim() ?? '';
  const alreadySet  = currentUrl === targetUrl;

  console.log(c.bold(`\n  ── Seeding: ${label}`));
  console.log(c.dim(`     ${targetUrl.replace(/:[^:@]+@/, ':****@')}`));

  if (!alreadySet) {
    if (DRY_RUN) {
      console.log(c.dim('     [dry-run] would patch .env → ' + label));
    } else {
      writeEnv(patchEnv(originalEnv, targetUrl));
    }
  }

  const steps = [
    { name: 'seed:demo',        label: 'Demo org + connector templates + dashboards + rules' },
    { name: 'seed:rate-limits', label: '4 rate-limit tiers (free / starter / pro / enterprise)' },
  ];

  let failed = false;
  try {
    for (const step of steps) {
      process.stdout.write(`     ${step.label.padEnd(58)}`);
      if (DRY_RUN) {
        console.log(c.dim('dry-run'));
        continue;
      }
      try {
        execSync(`npm run ${step.name}`, { cwd: ROOT, stdio: 'pipe' });
        console.log(c.green('✓'));
      } catch (err) {
        console.log(c.red('✗'));
        const msg = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
        console.error(c.red(`\n     Error in ${step.name}:\n`) + c.dim(msg.slice(0, 600)));
        failed = true;
        break;
      }
    }
  } finally {
    // Always restore .env even on failure
    if (!alreadySet && !DRY_RUN) {
      writeEnv(originalEnv);
    }
  }

  if (failed) throw new Error(`Seed failed for ${label}`);
  console.log(c.green(`  ✓ ${label} seeded successfully`));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(c.bold('\n═══ Ellines EIP — seed:both' + (DRY_RUN ? c.yellow(' [DRY RUN]') : '') + ' ════════════════════'));
  console.log(c.dim('  Seeds demo org + rate-limit tiers into local and/or Supabase.'));
  console.log(c.dim('  All seed scripts are idempotent — safe to run repeatedly.\n'));

  const targets = [];
  if (!CLOUD_ONLY) targets.push({ label: 'LOCAL  (ellines_eip_local)', url: LOCAL_URL });
  if (!LOCAL_ONLY) targets.push({ label: 'CLOUD  (Supabase)',          url: CLOUD_URL });

  if (targets.length === 0) {
    console.error(c.red('No targets selected. Use --local, --cloud, or neither (both).'));
    process.exit(1);
  }

  for (const { label, url } of targets) {
    seedTarget(label, url);
  }

  console.log(c.bold(c.green('\n  ✓ All targets seeded.')));
  console.log(c.dim('  Demo login: demo@ellines.co.ke / EllinesDemo2026!\n'));
}

main().catch((err) => {
  console.error(c.red('\n✗ seed:both failed:'), err.message || err);
  // Make sure .env is restored — read current state
  // (individual seedTarget calls restore on failure, but just in case)
  process.exit(1);
});
