/**
 * Apply a numbered migration's SQL directly.
 *
 * The Prisma CLI path (apply-pending-migrations.mjs) shells out to `npx prisma`,
 * which is unreliable on this host. This runs the SAME migration.sql through the
 * already-generated Prisma client instead, so the database and the schema stay
 * in step, then reloads the PostgREST cache so the Functions plane can see the
 * new tables immediately.
 *
 * Usage: node scripts/apply-0006-source-model.mjs [0006_source_model 0007_...]
 * Defaults to 0006_source_model. Each migration it applies is idempotent.
 *
 * Loads the root .env itself: the Prisma CLI prints "Environment variables loaded
 * from .env", but a bare `node` process has no such loader and the client fails
 * with "Environment variable not found: DATABASE_URL".
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['0006_source_model'];

for (const name of names) {
const sql = readFileSync(`services/identity/prisma/migrations/${name}/migration.sql`, 'utf8');

// Postgres refuses multiple commands in a prepared statement, so the migration
// is executed statement by statement. Comments and blank lines are dropped;
// dollar-quoted DO blocks are kept whole.
const statements = [];
{
  const stripped = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  let buf = '';
  let inDollar = false;
  for (const line of stripped.split('\n')) {
    if (/\$\$/.test(line)) inDollar = !inDollar;
    buf += `${line}\n`;
    if (!inDollar && line.trim().endsWith(';')) {
      statements.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) statements.push(buf.trim());
}

for (const [i, stmt] of statements.entries()) {
  await prisma.$executeRawUnsafe(stmt);
  console.log(`  [${i + 1}/${statements.length}] ok`);
}
console.log(`migration ${name} applied (${statements.length} statements)`);
}


const sources = await prisma.$queryRawUnsafe(
  `SELECT id, organization_id, source_type, name, website_url, metadata
     FROM organization_sources ORDER BY created_at`,
);
console.log('\n--- organization_sources ---');
console.log(JSON.stringify(sources, null, 1));

const counts = await prisma.$queryRawUnsafe(
  `SELECT
     (SELECT COUNT(*) FROM organization_sources)::int                       AS sources,
     (SELECT COUNT(*) FROM source_website_measurements)::int                AS measurements,
     (SELECT COUNT(*) FROM connector_installations WHERE status <> 'deleted')::int AS connectors`,
);
const health = await prisma.$queryRawUnsafe(
  `SELECT column_name, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_name = 'enterprise_snapshots' AND column_name = 'health_score'`,
);
console.log('\n--- counts ---');
console.log(JSON.stringify(counts, null, 1));
console.log('\n--- enterprise_snapshots.health_score ---');
console.log(JSON.stringify(health, null, 1));

await prisma.$disconnect();
