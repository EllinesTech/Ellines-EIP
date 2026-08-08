/**
 * Check current database configurations
 * Lists all database configs stored in the system
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env from root
config({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking database configurations...\n');

  // Check if we're connected
  try {
    await prisma.$connect();
    console.log('✅ Connected to database successfully\n');
  } catch (err) {
    console.error('❌ Failed to connect to database:', err);
    process.exit(1);
  }

  // List all organizations
  console.log('📊 Organizations:');
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (orgs.length === 0) {
    console.log('  No organizations found\n');
  } else {
    orgs.forEach((org, i) => {
      console.log(`  ${i + 1}. ${org.name} (${org.slug})`);
      console.log(`     ID: ${org.id}`);
      console.log(`     Created: ${org.createdAt.toISOString()}`);
    });
    console.log(`\n  Total: ${orgs.length} organization(s)\n`);
  }

  // Check database configurations
  console.log('💾 Database Configurations:');
  const dbConfigs = await prisma.databaseConfiguration.findMany({
    include: {
      organization: {
        select: { name: true, slug: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (dbConfigs.length === 0) {
    console.log('  No database configurations found');
    console.log('  All organizations are using the default DATABASE_URL from .env\n');
  } else {
    dbConfigs.forEach((config, i) => {
      console.log(`  ${i + 1}. ${config.name} (${config.type})`);
      console.log(`     Org: ${config.organization.name}`);
      console.log(`     Host: ${config.host || 'N/A'}`);
      console.log(`     Port: ${config.port}`);
      console.log(`     Database: ${config.databaseName || 'N/A'}`);
      console.log(`     Primary: ${config.isPrimary ? '✅' : '❌'}`);
      console.log(`     Active: ${config.isActive ? '✅' : '❌'}`);
      console.log(`     Test Status: ${config.testStatus}`);
    });
    console.log(`\n  Total: ${dbConfigs.length} configuration(s)\n`);
  }

  // Check organization tiers
  console.log('🎯 Organization Tiers:');
  const orgTiers = await prisma.organizationTier.findMany({
    include: {
      organization: {
        select: { name: true, slug: true },
      },
      tier: {
        select: { name: true, displayName: true, requestsPerDay: true },
      },
    },
  });

  if (orgTiers.length === 0) {
    console.log('  No tier assignments found');
    console.log('  All organizations will default to the "free" tier\n');
  } else {
    orgTiers.forEach((orgTier, i) => {
      console.log(`  ${i + 1}. ${orgTier.organization.name}`);
      console.log(`     Tier: ${orgTier.tier.displayName} (${orgTier.tier.name})`);
      console.log(`     Limit: ${orgTier.tier.requestsPerDay} req/day`);
      console.log(`     Started: ${orgTier.startedAt.toISOString()}`);
      console.log(`     Expires: ${orgTier.expiresAt?.toISOString() || 'Never'}`);
    });
    console.log(`\n  Total: ${orgTiers.length} assignment(s)\n`);
  }

  // Current database info
  console.log('📍 Current Database Connection:');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') || 'Not set'}`);
  console.log(`  Type: Supabase PostgreSQL (pooler)\n`);

  // Summary
  console.log('📝 Summary:');
  console.log(`  - You are currently using Supabase as your database`);
  console.log(`  - ${orgs.length} organization(s) exist`);
  console.log(`  - ${dbConfigs.length} database configuration(s) stored`);
  console.log(`  - ${orgTiers.length} tier assignment(s)`);
  
  if (dbConfigs.length === 0) {
    console.log('\n💡 Note:');
    console.log('  The multi-database feature is ready but not yet configured.');
    console.log('  All organizations are using the default Supabase database.');
    console.log('  You can configure additional databases via:');
    console.log('    - Settings → Database Configuration (UI)');
    console.log('    - POST /api/v1/orgs/me/database-config (API)');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
