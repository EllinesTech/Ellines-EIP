#!/usr/bin/env node
/**
 * db-sync.mjs — Local ↔ Supabase data synchronisation for Ellines EIP
 *
 * USAGE
 * ──────────────────────────────────────────────────────────────────
 *   node scripts/db-sync.mjs <direction> [options]
 *
 * Directions:
 *   to-cloud          Push local → Supabase  (default dev workflow)
 *   from-cloud        Pull Supabase → local  (restore local from cloud)
 *   status            Show which DB .env points to + row counts
 *
 * Options:
 *   --include-demo    Also sync Tier 2 demo org rows
 *   --include-user-data  Sync ALL tables including encrypted credentials
 *                     (requires explicit confirmation prompt)
 *   --dry-run         Print what would be done without executing
 *   --skip-schema     Skip npm run db:push (schema already in sync)
 *   --no-confirm      Skip interactive confirmation (CI use)
 *   --verbose         Print each SQL command before running
 *
 * WHAT GETS SYNCED
 * ──────────────────────────────────────────────────────────────────
 * By default (no extra flags):
 *   ✓ connector_templates   — 16 pre-built connector templates
 *   ✓ rate_limit_tiers      — 4 subscription tiers (free/starter/pro/enterprise)
 *   ✓ platform_config       — platform-level key/value settings
 *
 * With --include-demo:
 *   ✓ The demo organisation (slug=ellines-demo) and its users, dashboards,
 *     workflow rules, agent templates — everything seeded by seed-demo.ts
 *
 * With --include-user-data (DANGEROUS — contains encrypted credentials):
 *   ✓ All remaining tables (connector_installations, enterprise_snapshots, etc.)
 *
 * MECHANISM
 * ──────────────────────────────────────────────────────────────────
 * Uses pg_dump with --data-only --table=<name> to export rows, then pipes
 * the SQL through psql into the target database. The target schema must
 * already exist (ensured by running npm run db:push beforehand).
 *
 * For Tier 1 (platform) tables: TRUNCATE … CASCADE then re-insert.
 * For Tier 2 (demo) tables: DELETE WHERE org slug = 'ellines-demo' then insert.
 * Tier 3: full table dump (user confirms before execution).
 *
 * HYBRID CLIENT USE CASE
 * ──────────────────────────────────────────────────────────────────
 * Clients who run on-premise + cloud simultaneously can use:
 *   npm run db:sync:to-cloud   — push their on-premise data up to Supabase
 *   npm run db:sync:from-cloud — pull Supabase data down to their local server
 * The --include-user-data flag enables full bidirectional replication when
 * the operator confirms they understand the credential exposure risk.
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

import {
  PLATFORM_TABLES,
  DEMO_TABLES_ORDERED,
  USER_DATA_TABLES,
  printTableSummary,
} from './db-sync-tables.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DIRECTION = args.find((a) => ['to-cloud', 'from-cloud', 'status'].includes(a)) || null;
const INCLUDE_DEMO = args.includes('--include-demo');
const INCLUDE_USER_DATA = args.includes('--include-user-data');
const DRY_RUN = args.includes('--dry-run');
const SKIP_SCHEMA = args.includes('--skip-schema');
const NO_CONFIRM = args.includes('--no-confirm');
const VERBOSE = args.includes('--verbose');

// ── Colour helpers ────────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// ── Connection constants ──────────────────────────────────────────────────────
const LOCAL_URL  = 'postgresql://postgres:80802424@localhost:5432/ellines_eip_local';
const CLOUD_URL  = 'postgresql://postgres.difrqfciratkwwvjlngp:Mwasblac808024242022@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30';

const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const PG_DUMP = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';

// ── URL parsing ───────────────────────────────────────────────────────────────
function parseUrl(url) {
  // Handle ?sslmode=... suffix
  const bare = url.split('?')[0];
  const m = bare.match(/^postgresql:\/\/([^:]+):([^@]*)@([^:/]+):(\d+)\/(.+)$/);
  if (!m) throw new Error(`Cannot parse database URL: ${url}`);
  return { user: m[1], password: m[2], host: m[3], port: m[4], database: m[5] };
}

// ── .env reader ───────────────────────────────────────────────────────────────
function readEnvActiveUrl() {
  if (!existsSync(ENV_PATH)) throw new Error('.env not found at ' + ENV_PATH);
  const content = readFileSync(ENV_PATH, 'utf8');
  const m = content.match(/^DATABASE_URL=(.*)$/m);
  return m ? m[1].trim() : null;
}

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ── Row count query ───────────────────────────────────────────────────────────
function rowCount(dbUrl, table) {
  const conn = parseUrl(dbUrl);
  // Build sslmode suffix for Supabase URLs
  const sslmode = dbUrl.includes('supabase') ? 'require' : 'disable';
  const result = spawnSync(
    PSQL,
    [
      '-U', conn.user,
      '-h', conn.host,
      '-p', conn.port,
      '-d', conn.database,
      '--no-password',
      '-tAc', `SELECT COUNT(*) FROM "${table}"`,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD:  conn.password,
        PGSSLMODE:   sslmode,
        PGCONNECT_TIMEOUT: '10',
      },
      encoding: 'utf8',
      timeout: 15000,
    }
  );
  const raw = (result.stdout || '').trim();
  const n = parseInt(raw, 10);
  return isNaN(n) ? '?' : n;
}

// ── Exec helper ───────────────────────────────────────────────────────────────
function run(label, cmd, opts = {}) {
  if (VERBOSE || DRY_RUN) console.log(c.dim(`  $ ${cmd}`));
  if (DRY_RUN) return;
  try {
    execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', env: { ...process.env, ...opts.env } });
  } catch (err) {
    console.error(c.red(`  ✗ ${label} failed`));
    if (err.stderr) console.error(c.dim(err.stderr.toString().slice(0, 400)));
    if (!opts.ignoreError) throw err;
  }
}

// ── pg_dump a single table (data only) ───────────────────────────────────────
function dumpTable(srcUrl, table, destUrl) {
  const src = parseUrl(srcUrl);
  const dst = parseUrl(destUrl);

  // pg_dump: data-only, no owner, no privileges, disable triggers during restore
  const dumpCmd =
    `"${PG_DUMP}" -U ${src.user} -h ${src.host} -p ${src.port} -d ${src.database}` +
    ` --data-only --no-privileges --no-owner --disable-triggers` +
    ` --table="${table}"`;

  // psql: pipe the dump directly into the target
  const psqlCmd =
    `"${PSQL}" -U ${dst.user} -h ${dst.host} -p ${dst.port} -d ${dst.database}`;

  const fullCmd = `${dumpCmd} | ${psqlCmd}`;

  if (VERBOSE || DRY_RUN) console.log(c.dim(`  $ ${fullCmd}`));
  if (DRY_RUN) return;

  const env = {
    ...process.env,
    PGPASSWORD: src.password,
  };

  try {
    // We need two separate PGPASSWORD values (source and dest may differ).
    // Use a temp batch approach: dump to stdout, pass to psql via shell pipe.
    // On Windows, PowerShell handles | correctly between two executables.
    const dumpResult = spawnSync(
      PG_DUMP,
      ['-U', src.user, '-h', src.host, '-p', src.port, '-d', src.database,
       '--data-only', '--no-privileges', '--no-owner', '--disable-triggers',
       `--table=${table}`],
      { env: { ...process.env, PGPASSWORD: src.password }, encoding: 'buffer' }
    );

    if (dumpResult.status !== 0) {
      const errText = (dumpResult.stderr || Buffer.alloc(0)).toString().slice(0, 500);
      // Table may not exist in source — warn and skip rather than abort
      if (errText.includes('does not exist') || errText.includes('No matching tables')) {
        console.log(c.yellow(`    ↳ skipped (table not in source): ${table}`));
        return;
      }
      throw new Error(`pg_dump failed for ${table}: ${errText}`);
    }

    const sql = dumpResult.stdout;

    const psqlResult = spawnSync(
      PSQL,
      ['-U', dst.user, '-h', dst.host, '-p', dst.port, '-d', dst.database],
      {
        input: sql,
        env: { ...process.env, PGPASSWORD: dst.password },
        encoding: 'buffer',
      }
    );

    if (psqlResult.status !== 0) {
      const errText = (psqlResult.stderr || Buffer.alloc(0)).toString().slice(0, 500);
      throw new Error(`psql restore failed for ${table}: ${errText}`);
    }
  } catch (err) {
    if (!err.message?.includes('already handled')) throw err;
  }
}

// ── Truncate a table on target (CASCADE) ─────────────────────────────────────
function truncateTable(dbUrl, table) {
  const conn = parseUrl(dbUrl);
  const sql = `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`;
  if (VERBOSE || DRY_RUN) console.log(c.dim(`  TRUNCATE ${table}`));
  if (DRY_RUN) return;

  const result = spawnSync(
    PSQL,
    ['-U', conn.user, '-h', conn.host, '-p', conn.port, '-d', conn.database, '-c', sql],
    { env: { ...process.env, PGPASSWORD: conn.password }, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    const err = (result.stderr || '').slice(0, 300);
    if (err.includes('does not exist')) {
      console.log(c.yellow(`    ↳ skipped (not in target yet): ${table}`));
      return;
    }
    throw new Error(`TRUNCATE failed for ${table}: ${err}`);
  }
}

// ── Delete demo org rows from a table ────────────────────────────────────────
function deleteDemoRows(dbUrl, table) {
  const conn = parseUrl(dbUrl);
  // Different tables need different delete strategies
  const orgSlug = 'ellines-demo';
  const sqls = {
    organizations: `DELETE FROM organizations WHERE slug = '${orgSlug}';`,
    users: `DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}');`,
    organization_memberships: `DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}');`,
    audit_logs: `DELETE FROM audit_logs WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}');`,
    dashboards: `DELETE FROM dashboards WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}');`,
    widgets: `DELETE FROM widgets WHERE dashboard_id IN (SELECT id FROM dashboards WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}'));`,
    workflow_rules: `DELETE FROM workflow_rules WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}');`,
    rule_schedules: `DELETE FROM rule_schedules WHERE rule_id IN (SELECT id FROM workflow_rules WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}'));`,
    agent_templates: `DELETE FROM agent_templates WHERE organization_id IN (SELECT id FROM organizations WHERE slug = '${orgSlug}');`,
  };
  const sql = sqls[table];
  if (!sql) {
    console.log(c.yellow(`    ↳ no delete strategy for ${table}, skipping`));
    return;
  }
  if (VERBOSE || DRY_RUN) console.log(c.dim(`  DELETE demo rows from ${table}`));
  if (DRY_RUN) return;

  const result = spawnSync(
    PSQL,
    ['-U', conn.user, '-h', conn.host, '-p', conn.port, '-d', conn.database, '-c', sql],
    { env: { ...process.env, PGPASSWORD: conn.password }, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    const err = (result.stderr || '').slice(0, 300);
    if (err.includes('does not exist')) return; // table may not exist yet
    console.warn(c.yellow(`    ↳ warning deleting from ${table}: ${err}`));
  }
}

// ── Ensure pg_dump + psql are available ──────────────────────────────────────
function checkTools() {
  for (const tool of [PSQL, PG_DUMP]) {
    if (!existsSync(tool)) {
      console.error(c.red(`✗ Required tool not found: ${tool}`));
      console.error(c.yellow('  Install PostgreSQL 18 at C:\\Program Files\\PostgreSQL\\18\\'));
      process.exit(1);
    }
  }
}

// ── Sync schema (db:push) to the target ──────────────────────────────────────
function syncSchema(targetUrl) {
  if (SKIP_SCHEMA) {
    console.log(c.dim('  → --skip-schema: skipping npm run db:push'));
    return;
  }
  console.log(c.cyan('\n  Syncing Prisma schema to target…'));

  // Temporarily point .env at the target URL
  const content = readFileSync(ENV_PATH, 'utf8');
  const patched = content
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${targetUrl}`)
    .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL=${targetUrl}`);
  writeFileSync(ENV_PATH, patched, 'utf8');

  try {
    execSync('npm run db:push', { cwd: ROOT, stdio: 'inherit' });
  } finally {
    // Always restore
    writeFileSync(ENV_PATH, content, 'utf8');
  }
  console.log(c.green('  ✓ Schema in sync'));
}

// ── Status command ────────────────────────────────────────────────────────────
async function runStatus() {
  const activeUrl = readEnvActiveUrl();
  const isLocal = activeUrl?.includes('localhost:5432');
  const isCloud = activeUrl?.includes('supabase.com') || activeUrl?.includes('pooler.supabase');

  console.log(c.bold('\n═══ Ellines EIP Database Status ════════════════════════'));
  console.log(`  Active .env target: ${isLocal ? c.green('LOCAL') : isCloud ? c.cyan('SUPABASE') : c.yellow('CUSTOM')}`);
  console.log();

  console.log('  Checking row counts…');
  console.log();

  const checks = [
    { label: 'LOCAL  (ellines_eip_local)', url: LOCAL_URL },
    { label: 'CLOUD  (Supabase)',           url: CLOUD_URL },
  ];

  for (const { label, url } of checks) {
    console.log(c.bold(`  ── ${label}`));
    for (const t of PLATFORM_TABLES) {
      const n = rowCount(url, t);
      console.log(`     ${t.padEnd(30)} ${String(n).padStart(5)} rows`);
    }
    // Demo org
    const orgConn = parseUrl(url);
    const demoCheck = spawnSync(
      PSQL,
      ['-U', orgConn.user, '-h', orgConn.host, '-p', orgConn.port,
       '-d', orgConn.database, '-tAc',
       `SELECT COUNT(*) FROM organizations WHERE slug='ellines-demo'`],
      { env: { ...process.env, PGPASSWORD: orgConn.password }, encoding: 'utf8' }
    );
    const demoOrg = parseInt((demoCheck.stdout || '').trim(), 10);
    console.log(`     ${'demo org (ellines-demo)'.padEnd(30)} ${isNaN(demoOrg) ? '?' : demoOrg > 0 ? c.green('present') : c.yellow('absent')}`);
    console.log();
  }
  printTableSummary();
}

// ── Core sync function ────────────────────────────────────────────────────────
async function runSync(srcUrl, dstUrl, direction) {
  const srcLabel = srcUrl.includes('localhost') ? 'LOCAL' : 'SUPABASE';
  const dstLabel = dstUrl.includes('localhost') ? 'LOCAL' : 'SUPABASE';

  console.log(c.bold(`\n═══ Ellines EIP Sync: ${srcLabel} → ${dstLabel} ${ DRY_RUN ? c.yellow('[DRY RUN]') : '' }══`));
  printTableSummary();

  const tablesToSync = [...PLATFORM_TABLES];
  if (INCLUDE_DEMO) tablesToSync.push(...DEMO_TABLES_ORDERED);
  if (INCLUDE_USER_DATA) tablesToSync.push(...USER_DATA_TABLES);

  // Warn about user data
  if (INCLUDE_USER_DATA && !NO_CONFIRM) {
    console.log(c.red('\n⚠  WARNING: --include-user-data will sync connector credentials'));
    console.log(c.red('   and other sensitive data (encrypted but still sensitive).'));
    const ans = await prompt('   Type YES to continue: ');
    if (ans !== 'YES') {
      console.log(c.yellow('\nAborted.'));
      process.exit(0);
    }
  }

  // Final confirmation
  if (!DRY_RUN && !NO_CONFIRM) {
    console.log(c.yellow(`\n  About to push data from ${srcLabel} → ${dstLabel}`));
    console.log(c.yellow(`  Tables: ${tablesToSync.join(', ')}`));
    const ans = await prompt('  Proceed? (y/N): ');
    if (ans.toLowerCase() !== 'y') {
      console.log(c.yellow('\nAborted.'));
      process.exit(0);
    }
  }

  // Step 1: Sync schema to target
  syncSchema(dstUrl);

  // Step 2: Sync Tier 1 — platform tables (truncate + reimport)
  console.log(c.cyan('\n  ── Tier 1: Platform tables'));
  for (const table of PLATFORM_TABLES) {
    process.stdout.write(`    ${table.padEnd(32)}`);
    truncateTable(dstUrl, table);
    dumpTable(srcUrl, table, dstUrl);
    console.log(DRY_RUN ? c.dim('dry-run') : c.green('✓'));
  }

  // Step 3: Sync Tier 2 — demo org tables
  if (INCLUDE_DEMO) {
    console.log(c.cyan('\n  ── Tier 2: Demo org tables'));
    for (const table of DEMO_TABLES_ORDERED) {
      process.stdout.write(`    ${table.padEnd(32)}`);
      deleteDemoRows(dstUrl, table);
      dumpTable(srcUrl, table, dstUrl);
      console.log(DRY_RUN ? c.dim('dry-run') : c.green('✓'));
    }
  }

  // Step 4: Sync Tier 3 — user data tables
  if (INCLUDE_USER_DATA) {
    console.log(c.cyan('\n  ── Tier 3: User data tables (full copy)'));
    for (const table of USER_DATA_TABLES) {
      process.stdout.write(`    ${table.padEnd(32)}`);
      truncateTable(dstUrl, table);
      dumpTable(srcUrl, table, dstUrl);
      console.log(DRY_RUN ? c.dim('dry-run') : c.green('✓'));
    }
  }

  console.log(c.green(`\n  ✓ Sync complete: ${srcLabel} → ${dstLabel}`));
  if (INCLUDE_DEMO) {
    console.log(c.dim('    Demo login: demo@ellines.co.ke / EllinesDemo2026!'));
  }
  console.log();
}

// ── Main entry ────────────────────────────────────────────────────────────────
async function main() {
  if (!DIRECTION || args.includes('--help') || args.includes('-h')) {
    console.log(`
${c.bold('Ellines EIP — DB Sync')}

Usage:
  node scripts/db-sync.mjs <direction> [options]

Directions:
  to-cloud          Push local  → Supabase
  from-cloud        Pull cloud  → local
  status            Show row counts on both databases

Options:
  --include-demo       Also sync demo org rows (users, dashboards, rules)
  --include-user-data  Sync ALL tables including encrypted credentials
  --dry-run            Print what would run without executing
  --skip-schema        Skip npm run db:push (schema already identical)
  --no-confirm         Skip confirmation prompts (use in CI/scripts)
  --verbose            Print each SQL command

Examples:
  node scripts/db-sync.mjs to-cloud                   # platform tables only
  node scripts/db-sync.mjs to-cloud --include-demo    # platform + demo org
  node scripts/db-sync.mjs from-cloud --include-demo  # pull cloud → local
  node scripts/db-sync.mjs status                     # show counts on both

npm shortcuts:
  npm run db:sync:to-cloud
  npm run db:sync:from-cloud
  npm run db:sync:status
`);
    process.exit(0);
  }

  checkTools();

  if (DIRECTION === 'status') {
    await runStatus();
    process.exit(0);
  }

  const srcUrl = DIRECTION === 'to-cloud' ? LOCAL_URL : CLOUD_URL;
  const dstUrl = DIRECTION === 'to-cloud' ? CLOUD_URL : LOCAL_URL;

  await runSync(srcUrl, dstUrl, DIRECTION);
}

main().catch((err) => {
  console.error(c.red('\n✗ Sync failed:'), err.message || err);
  process.exit(1);
});
