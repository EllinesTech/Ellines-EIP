#!/usr/bin/env node
/**
 * Verify the live database matches prisma/schema.prisma.
 *
 * Catches the silent drift that caused
 *   PGRST204 "Could not find the 'reported_count' column ... in the schema cache"
 * — code that writes a column the database does not have. Tests and builds
 * cannot catch this, because it only fails at runtime against the real DB.
 *
 * It also catches the *inverse* drift, which is just as silent and just as
 * expensive:
 *
 *   null value in column "health_score" of relation "enterprise_snapshots"
 *   violates not-null constraint (code: 23502)
 *
 * The schema declared `healthScore Int?` (the honest "timeliness was never
 * measured" encoding) while the live column was still NOT NULL, because the
 * migration that dropped the constraint had not been applied to that database.
 * A missing-column check cannot see this — the column exists, it is just
 * narrower than the code believes — so nullability is verified too.
 *
 * Compares every `model X { ... @@map("table") }` and its `@map("column")`
 * fields against information_schema (existence + nullability). Exits 1 on drift.
 *
 * Usage:  node scripts/verify-schema-sync.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PrismaClient } from '@prisma/client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = join(ROOT, 'services/identity/prisma/schema.prisma');

/** Parse "@@map"-annotated models into { table, columns[] }. */
export function parseMappedModels(src) {
  const models = [];
  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    const table = (body.match(/@@map\("([^"]+)"\)/) || [])[1];
    if (!table) continue;
    const columns = new Set();
    const optional = new Set();
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const mapped = line.match(/@map\("([^"]+)"\)/);
      if (!mapped) continue;
      columns.add(mapped[1]);
      // `fieldName Type? @map(...)` means the schema promises NULL is allowed.
      // List fields (`Type[]`) are required in Prisma and are excluded.
      const typeToken = line.match(/^\w+\s+([A-Za-z][\w.]*(?:\[\])?\??)/);
      if (typeToken && typeToken[1].endsWith('?')) optional.add(mapped[1]);
    }
    if (columns.size) {
      models.push({ model: name, table, columns: [...columns], optionalColumns: [...optional] });
    }
  }
  return models;
}

/**
 * Pure drift comparison, separated from the database I/O so it can be reasoned
 * about (and unit-tested) without a live connection.
 *
 * @param models      output of parseMappedModels
 * @param liveColumns rows of { table_name, column_name, is_nullable }
 */
export function findSchemaDrift(models, liveColumns) {
  const byTable = new Map();
  for (const r of liveColumns) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Map());
    byTable.get(r.table_name).set(r.column_name, r.is_nullable);
  }

  const missingTables = [];
  const missingColumns = [];
  const nullability = [];

  for (const m of models) {
    const have = byTable.get(m.table);
    if (!have) {
      missingTables.push({ table: m.table, model: m.model });
      continue;
    }
    const miss = m.columns.filter((c) => !have.has(c));
    if (miss.length) missingColumns.push({ table: m.table, columns: miss });

    for (const column of m.optionalColumns ?? []) {
      // A column that is absent entirely is already reported above.
      if (!have.has(column)) continue;
      if (have.get(column) === 'YES') continue;
      nullability.push({ table: m.table, column, model: m.model });
    }
  }

  return { missingTables, missingColumns, nullability };
}

async function main() {
  const models = parseMappedModels(readFileSync(SCHEMA_FILE, 'utf8'));
  const prisma = new PrismaClient();
  let drift = { missingTables: [], missingColumns: [], nullability: [] };
  try {
    const live = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema='public'`,
    );
    drift = findSchemaDrift(models, live);
    for (const t of drift.missingTables) {
      process.stdout.write(`MISSING TABLE  ${t.table}  (model ${t.model})\n`);
    }
    for (const c of drift.missingColumns) {
      process.stdout.write(`MISSING COLS   ${c.table}: ${c.columns.join(', ')}\n`);
    }
    for (const n of drift.nullability) {
      process.stdout.write(
        `NOT NULL       ${n.table}.${n.column}: schema says optional (?), database says NOT NULL — ` +
          `a NULL write will fail with 23502 (model ${n.model})\n`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write(
    `\nchecked ${models.length} mapped models — ` +
      `${drift.missingTables.length} missing tables, ${drift.missingColumns.length} missing columns, ` +
      `${drift.nullability.length} nullability mismatches\n`,
  );
  if (drift.missingTables.length || drift.missingColumns.length || drift.nullability.length) {
    process.stdout.write(
      'SCHEMA DRIFT DETECTED. Apply it with:\n' +
        '  node scripts/apply-pending-migrations.mjs\n',
    );
    process.exit(1);
  }
  process.stdout.write('OK — database matches schema.prisma.\n');
}

// Only run the live check when executed directly, so the pure helpers above can
// be imported by tests without opening a database connection.
const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((e) => {
    process.stderr.write(`FAILED: ${e?.stack || e}\n`);
    process.exit(1);
  });
}
