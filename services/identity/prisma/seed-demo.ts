/**
 * Seeds the demo organization and owner for live / local smoke tests.
 * Idempotent: safe to re-run.
 *
 * Usage (from repo root, with DATABASE_URL in .env):
 *   npm run seed:demo
 */
import { config } from 'dotenv';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

config({ path: join(__dirname, '..', '..', '..', '.env'), override: true });
config({ path: join(__dirname, '..', '.env'), override: true });

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@ellines.co.ke').toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'EllinesDemo2026!';
const DEMO_ORG = process.env.DEMO_ORG_NAME || 'Ellines Demo Org';
const DEMO_SLUG = process.env.DEMO_ORG_SLUG || 'ellines-demo';
const DEMO_NAME = process.env.DEMO_FULL_NAME || 'Demo Executive';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const org = await prisma.organization.upsert({
    where: { slug: DEMO_SLUG },
    update: { name: DEMO_ORG },
    create: { name: DEMO_ORG, slug: DEMO_SLUG },
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash,
      fullName: DEMO_NAME,
      organizationId: org.id,
      role: 'owner',
      isActive: true,
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      fullName: DEMO_NAME,
      organizationId: org.id,
      role: 'owner',
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      action: 'seed.demo',
      resource: 'organization',
      metadata: { email: DEMO_EMAIL, slug: DEMO_SLUG },
    },
  });

  console.log('Demo user ready');
  console.log(`  org:   ${org.name} (${org.slug})`);
  console.log(`  email: ${DEMO_EMAIL}`);
  console.log(`  pass:  ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
