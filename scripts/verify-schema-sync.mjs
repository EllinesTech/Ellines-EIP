#!/usr/bin/env node
/**
 * Verify the live database matches prisma/schema.prisma.
 *
 * Catches the silent drift that caused
 *   PGRST204 "Could not find the 'reported_count' column ... in the schema cache"
 * — code that writes a column the database does not have. Tests and builds
 * cannot catch this, because it only fails at runtime against the real DB.
 *
 * Compares every `model X { ... @@map("table") }` and its `@map("column")`
 * fields against information_schema. Exits 1 on any drift.
 *
 * Usage:  node scripts/verify-schema-sync.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const mapped = line.match(/@map\("([^"]+)"\)/);
      if (mapped) columns.add(mapped[1]);
    }
    if (columns.size) models.push({ model: name, table, columns: [...columns] });
  }
  return models;
}

async function main() {
  const models = parseMappedModels(readFileSync(SCHEMA_FILE, 'utf8'));
  const prisma = new PrismaClient();
  let missingTables = 0;
  let missingColumns = 0;
  try {
    const live = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`,
    );
    const byTable = new Map();
    for (const r of live) {
      if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set());
      byTable.get(r.table_name).add(r.column_name);
    }
    for (const m of models) {
      const have = byTable.get(m.table);
      if (!have) {
        missingTables += 1;
        process.stdout.write(`MISSING TABLE  ${m.table}  (model ${m.model})\n`);
        continue;
      }
      const miss = m.columns.filter((c) => !have.has(c));
      if (miss.length) {
        missingColumns += miss.length;
        process.stdout.write(`MISSING COLS   ${m.table}: ${miss.join(', ')}\n`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write(
    `\nchecked ${models.length} mapped models — ` +
      `${missingTables} missing tables, ${missingColumns} missing columns\n`,
  );
  if (missingTables || missingColumns) {
    process.stdout.write(
      'SCHEMA DRIFT DETECTED. Apply it with:\n' +
        '  node scripts/apply-pending-migrations.mjs\n',
    );
    process.exit(1);
  }
  process.stdout.write('OK — database matches schema.prisma.\n');
}

main().catch((e) => {
  process.stderr.write(`FAILED: ${e?.stack || e}\n`);
  process.exit(1);
});
