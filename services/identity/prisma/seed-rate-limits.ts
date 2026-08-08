/**
 * Seed default rate limit tiers for B.3.2
 * Run with: npx tsx prisma/seed-rate-limits.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env from root
config({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

const RATE_LIMIT_TIERS = [
  {
    name: 'free',
    displayName: 'Free',
    requestsPerDay: 100,
    requestsPerHour: 20,
    requestsPerMinute: 5,
    burstLimit: 10,
    allowedEndpoints: [],
    blockedEndpoints: [],
    maxConnectors: 1,
    maxUsers: 3,
    maxDataExportPerDay: 1,
    enableWebhooks: false,
    enableSso: false,
    enableCustomRoles: false,
    enableAgents: false,
    enableAdvancedBI: false,
    priority: 1,
    monthlyPrice: 0,
  },
  {
    name: 'starter',
    displayName: 'Starter',
    requestsPerDay: 1000,
    requestsPerHour: 200,
    requestsPerMinute: 20,
    burstLimit: 50,
    allowedEndpoints: [],
    blockedEndpoints: [],
    maxConnectors: 5,
    maxUsers: 10,
    maxDataExportPerDay: 5,
    enableWebhooks: true,
    enableSso: false,
    enableCustomRoles: false,
    enableAgents: false,
    enableAdvancedBI: false,
    priority: 2,
    monthlyPrice: 2900, // $29/month
  },
  {
    name: 'professional',
    displayName: 'Professional',
    requestsPerDay: 10000,
    requestsPerHour: 2000,
    requestsPerMinute: 100,
    burstLimit: 200,
    allowedEndpoints: [],
    blockedEndpoints: [],
    maxConnectors: 20,
    maxUsers: 50,
    maxDataExportPerDay: 20,
    enableWebhooks: true,
    enableSso: true,
    enableCustomRoles: true,
    enableAgents: true,
    enableAdvancedBI: true,
    priority: 3,
    monthlyPrice: 9900, // $99/month
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    requestsPerDay: 100000,
    requestsPerHour: 20000,
    requestsPerMinute: 1000,
    burstLimit: 2000,
    allowedEndpoints: [],
    blockedEndpoints: [],
    maxConnectors: null, // unlimited
    maxUsers: null, // unlimited
    maxDataExportPerDay: null, // unlimited
    enableWebhooks: true,
    enableSso: true,
    enableCustomRoles: true,
    enableAgents: true,
    enableAdvancedBI: true,
    priority: 10,
    monthlyPrice: 29900, // $299/month (negotiable)
  },
];

async function main() {
  console.log('🌱 Seeding rate limit tiers...');

  for (const tier of RATE_LIMIT_TIERS) {
    const result = await prisma.rateLimitTier.upsert({
      where: { name: tier.name },
      update: tier,
      create: tier,
    });
    console.log(`✅ Tier "${result.displayName}" (${result.name}): ${result.requestsPerDay} req/day`);
  }

  console.log('🎉 Rate limit tiers seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
