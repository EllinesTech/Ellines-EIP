#!/usr/bin/env node
/**
 * Set Cloudflare Pages environment secrets for ellines-eip.
 *
 * Usage (from repo root):
 *   node scripts/set-pages-secrets.mjs
 *
 * Requires:
 *   CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in environment OR in .env
 *   All other secrets pulled from .env automatically.
 *
 * This sets the runtime secrets that Cloudflare Pages Functions read.
 * These are NOT build-time env vars — they are the server-side secrets
 * available to functions/api/v1/** at request time.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env from repo root
function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && val) env[key] = val;
  }
  return env;
}

const dotenv = loadEnv(join(root, '.env'));

function get(key) {
  return process.env[key] || dotenv[key] || '';
}

const PROJECT = 'ellines-eip';

// Secrets to push to Cloudflare Pages
const secrets = {
  // Required — Pages Functions won't authenticate without these
  SUPABASE_URL:             get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: get('SUPABASE_SERVICE_ROLE_KEY'),
  JWT_SECRET:               get('JWT_SECRET'),
  PLATFORM_ADMIN_EMAILS:    get('PLATFORM_ADMIN_EMAILS'),

  // Optional — email delivery (simulated if absent)
  ...(get('RESEND_API_KEY')     ? { RESEND_API_KEY:     get('RESEND_API_KEY')     } : {}),
  ...(get('VAPID_PUBLIC_KEY')   ? { VAPID_PUBLIC_KEY:   get('VAPID_PUBLIC_KEY')   } : {}),
  ...(get('VAPID_PRIVATE_KEY')  ? { VAPID_PRIVATE_KEY:  get('VAPID_PRIVATE_KEY')  } : {}),
  ...(get('VAPID_SUBJECT')      ? { VAPID_SUBJECT:      get('VAPID_SUBJECT')      } : {}),
};

const cfToken   = get('CLOUDFLARE_API_TOKEN');
const cfAccount = get('CLOUDFLARE_ACCOUNT_ID') || 'ed3a8105e49e881d9d586a57da0f42bf';

if (!cfToken) {
  console.error('❌  CLOUDFLARE_API_TOKEN not set. Add it to .env or export it.');
  process.exit(1);
}

console.log(`\nSetting Cloudflare Pages secrets for project: ${PROJECT}`);
console.log(`Account: ${cfAccount}\n`);

let ok = 0;
let skip = 0;

for (const [key, val] of Object.entries(secrets)) {
  if (!val) {
    console.log(`  ⚠  ${key} — empty, skipping`);
    skip++;
    continue;
  }
  try {
    execSync(
      `npx wrangler pages secret put ${key} --project-name=${PROJECT}`,
      {
        input: val,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: cfToken,
          CLOUDFLARE_ACCOUNT_ID: cfAccount,
        },
        cwd: join(root, 'apps', 'web'),
      },
    );
    console.log(`  ✓  ${key}`);
    ok++;
  } catch (err) {
    const msg = err.stderr?.toString() || err.message || '';
    console.error(`  ✗  ${key} — ${msg.split('\n')[0]}`);
  }
}

console.log(`\nDone: ${ok} set, ${skip} skipped.\n`);
if (ok > 0) {
  console.log('Pages Functions will pick up the new secrets on next request.');
  console.log('Redeploy with: git commit --allow-empty -m "chore: trigger deploy" && git push origin main');
}
