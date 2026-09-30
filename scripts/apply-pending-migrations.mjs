#!/usr/bin/env node
/**
 * Apply pending Prisma migrations to the target database, idempotently.
 *
 * WHY THIS EXISTS
 * ---------------
 * EIP's Prisma migrations were never applied to the cloud database
 * (`_prisma_migrations` was absent). The schema had been created with
 * `prisma db push`, which does not record migration history. That produced a
 * silent drift failure:
 *
 *   Could not find the 'reported_count' column of 'enterprise_snapshots'
 *   in the schema cache (code: PGRST204)
 *
 * `prisma migrate deploy` alone cannot fix it, because migrations 0002/0003
 * were already applied out-of-band and would fail on re-run (0003 uses a bare
 * CREATE TABLE). So this script:
 *
 *   1. Runs any migration whose effects are verifiably absent (via the
 *      PRE_APPLIED probe below), statement by statement.
 *   2. Baselines the rest with `prisma migrate resolve --applied`.
 *   3. Applies genuinely new migrations with `prisma migrate deploy`.
 *   4. Reloads the PostgREST schema cache so new columns are visible to the
 *      Functions data plane immediately. Without this, ALTER TABLE succeeds
 *      but PGRST204 persists — this is what actually causes the symptom.
 *   5. Leaves verification to scripts/verify-schema-sync.mjs.
 *
 * Safe to re-run: every step is guarded by a live-database probe.
 *
 * Usage:  node scripts/apply-pending-migrations.mjs [--dry-run]
 */

import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = join(ROOT, 'services/identity/prisma/schema.prisma');
const MIGRATIONS = join(ROOT, 'services/identity/prisma/migrations');
const DRY_RUN = process.argv.includes('--dry-run');
const log = (m) => process.stdout.write(`${m}\n`);

/**
 * Migrations applied out-of-band (via `prisma db push` + manual SQL) before
 * migration history existed. `probe` returns true when the migration's effects
 * are ALREADY fully present, so it can be baselined instead of replayed.
 */
const PRE_APPLIED = {
  '0001_baseline': {
    reason: 'Documented no-op baseline (schema created with `prisma db push`).',
    probe: async () => true,
  },
  '0002_phase2_membership_truth': {
    reason: 'organization_memberships exists, but the sync trigger/function did not.',
    // Verified on the live DB: pg_trigger and pg_proc had no
    // eip_users_primary_membership, so this migration is NOT fully applied and
    // must actually run — otherwise a user inserted by any path that bypasses
    // the application would never get a membership row.
    probe: async (prisma) => {
      const t = await prisma.$queryRawUnsafe(
        `SELECT tgname FROM pg_trigger WHERE tgname = 'eip_users_primary_membership'`,
      );
      return t.length > 0;
    },
  },
  '0003_phase2_session_registry': {
    reason: 'sessions table exists with the exact columns and indexes from 0003.',
    probe: async (prisma) => {
      const cols = await prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='sessions'`,
      );
      const want = ['id', 'user_id', 'organization_id', 'token_hash', 'created_at', 'expires_at', 'revoked_at'];
      const have = new Set(cols.map((c) => c.column_name));
      return want.every((c) => have.has(c));
    },
  },
};

function listMigrations() {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(MIGRATIONS, e.name, 'migration.sql')))
    .map((e) => e.name)
    .sort();
}

/**
 * Split a migration file into individual statements.
 *
 * Handles PostgreSQL dollar-quoted bodies (CREATE FUNCTION ... AS $$ ... $$;
 * and DO $$ ... $$;) which may span many lines and contain semicolons of their
 * own — a naive split on `;` would tear them apart.
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let inDollar = false;
  for (const line of sql.split('\n')) {
    buf += `${line}\n`;
    if (line.includes('$$')) {
      // Opening or closing tag. Only the closing side can end the statement,
      // and only when the line also terminates it.
      inDollar = !inDollar;
      if (!inDollar && buf.trimEnd().endsWith(';')) {
        out.push(buf.trim());
        buf = '';
      }
      continue;
    }
    if (!inDollar && line.trim().endsWith(';')) {
      out.push(buf.trim());
      buf = '';
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  // Drop anything that is only comments/whitespace.
  return out.filter((s) => s.replace(/^\s*(--[^\n]*\n?)+/g, '').trim().length > 0);
}

function prismaCli(args) {
  // Windows: the npm shim is a .cmd batch file, which execFile cannot spawn
  // directly (EINVAL). Run it through the shell instead.
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(bin, ['prisma', ...args, '--schema', SCHEMA], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

async function main() {
  const prisma = new PrismaClient();
  const names = listMigrations();
  const ranForReal = [];
  const baseline = [];

  try {
    for (const name of names) {
      const spec = PRE_APPLIED[name];
      if (!spec) continue; // genuinely new -> handled by `migrate deploy`
      if (await spec.probe(prisma)) {
        log(`  already applied : ${name}`);
      } else {
        const stmts = splitStatements(readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'));
        log(`  APPLYING        : ${name} (${stmts.length} stmts) — ${spec.reason}`);
        if (!DRY_RUN) for (const s of stmts) await prisma.$executeRawUnsafe(s);
        ranForReal.push(name);
      }
      baseline.push(name);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (DRY_RUN) {
    log('\n[dry-run] nothing written.');
    return;
  }

  // Record history so `migrate deploy` stops trying to replay these.
  for (const name of baseline) {
    try {
      prismaCli(['migrate', 'resolve', '--applied', name]);
      log(`  history recorded: ${name}${ranForReal.includes(name) ? ' (ran for real)' : ''}`);
    } catch (e) {
      log(`  resolve FAILED  : ${name} — ${String(e.message).split('\n')[0]}`);
    }
  }

  log('\n  migrate deploy (remaining):');
  try {
    log(prismaCli(['migrate', 'deploy']).trim().split('\n').map((l) => `    ${l}`).join('\n'));
  } catch (e) {
    log(`    FAILED: ${String(e.message).split('\n').slice(0, 5).join(' | ')}`);
  }

  // PostgREST caches the schema. Without this reload, ALTER TABLE succeeds but
  // PGRST204 keeps being returned to the Functions plane.
  const p2 = new PrismaClient();
  try {
    await p2.$executeRawUnsafe(`NOTIFY pgrst, 'reload schema'`);
    log('\n  PostgREST schema cache reload signalled.');
  } catch (e) {
    log(`\n  [warn] PostgREST reload not signalled: ${String(e.message).split('\n')[0]}`);
  } finally {
    await p2.$disconnect();
  }
}

// Only run when invoked directly, so the helpers above stay importable/testable.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');
if (invokedDirectly || process.argv[1]?.endsWith('apply-pending-migrations.mjs')) {
  main().catch((e) => {
    process.stderr.write(`FAILED: ${e?.stack || e}\n`);
    process.exit(1);
  });
}



