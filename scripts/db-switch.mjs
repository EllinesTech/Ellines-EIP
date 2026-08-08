#!/usr/bin/env node
/**
 * db-switch.mjs -- switch DATABASE_URL in .env between local PostgreSQL and Supabase
 *
 * Usage:
 *   node scripts/db-switch.mjs local   -- point .env at ellines_eip_local
 *   node scripts/db-switch.mjs cloud   -- point .env at Supabase
 *   node scripts/db-switch.mjs status  -- show which DB is currently active
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

const LOCAL_URL =
  'postgresql://postgres:80802424@localhost:5432/ellines_eip_local';
const CLOUD_URL =
  'postgresql://postgres.difrqfciratkwwvjlngp:Mwasblac808024242022@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30';

const target = process.argv[2];

if (!['local', 'cloud', 'status'].includes(target)) {
  console.error('Usage: node scripts/db-switch.mjs <local|cloud|status>');
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.error('[ERROR] .env not found at', envPath);
  process.exit(1);
}

const content = readFileSync(envPath, 'utf8');

// Find current DATABASE_URL line
const dbMatch = content.match(/^DATABASE_URL=(.*)$/m);
const currentUrl = dbMatch ? dbMatch[1].trim() : '';
const isLocal = currentUrl.includes('localhost:5432/ellines_eip_local');
const isCloud = currentUrl.includes('pooler.supabase.com');

if (target === 'status') {
  if (isLocal) {
    console.log('[ACTIVE] Local  --> postgresql://postgres@localhost:5432/ellines_eip_local');
  } else if (isCloud) {
    console.log('[ACTIVE] Cloud  --> Supabase (aws-1-eu-west-2.pooler.supabase.com)');
  } else {
    console.log('[ACTIVE] Custom -->', currentUrl || '(not set)');
  }
  process.exit(0);
}

if (target === 'local') {
  if (isLocal) {
    console.log('[ALREADY] Already pointing at local DB');
    process.exit(0);
  }
  const updated = content
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${LOCAL_URL}`)
    .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL=${LOCAL_URL}`);
  writeFileSync(envPath, updated, 'utf8');
  console.log('[SWITCHED] .env --> ellines_eip_local (localhost:5432)');
  console.log('  Run: npm run dev:identity');
}

if (target === 'cloud') {
  if (isCloud) {
    console.log('[ALREADY] Already pointing at Supabase');
    process.exit(0);
  }
  const updated = content
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${CLOUD_URL}`)
    .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL=${CLOUD_URL}`);
  writeFileSync(envPath, updated, 'utf8');
  console.log('[SWITCHED] .env --> Supabase (cloud)');
  console.log('  Live site at eip.ellines.co.ke also uses Supabase.');
}
