#!/usr/bin/env node
/**
 * db-sync-tables.mjs — Three-tier table classification for local ↔ Supabase sync
 *
 * Tier 1 — PLATFORM tables
 *   Always synced in both directions. These are platform-wide configuration rows
 *   (connector templates, rate limit tiers) that must be identical on every database
 *   that hosts EIP. Seeded from seed-demo.ts and seed-rate-limits.ts; never contain
 *   per-org business data or credentials.
 *
 * Tier 2 — DEMO tables
 *   Synced when --include-demo flag is passed. Contains the demo organisation, demo
 *   user, and their associated rows. Useful to make sure the same demo account works
 *   against any target DB. Re-seeding is safer than pg_dump for these rows because
 *   bcrypt hashes are deterministic from the seed constant.
 *
 * Tier 3 — USER DATA tables
 *   Never synced automatically. These are per-organisation rows created by real
 *   clients and may contain sensitive / encrypted credential data. They can be
 *   exported explicitly with --include-user-data (confirmation required).
 *
 * Import this module from db-sync.mjs to get the table lists.
 */

// ── Tier 1: Platform / seed tables ───────────────────────────────────────────
// Safe to copy unconditionally in either direction. Truncate-then-insert.
export const PLATFORM_TABLES = [
  'connector_templates',
  'rate_limit_tiers',
  'platform_config',
];

// ── Tier 2: Demo org tables (ordered by FK dependency) ───────────────────────
// Copy only when --include-demo is supplied. Includes the demo org + its children.
// These are identified by slug = 'ellines-demo'.
export const DEMO_TABLES_ORDERED = [
  'organizations',           // parent
  'users',                   // FK → organizations
  'organization_memberships',// FK → organizations, users
  'audit_logs',              // FK → organizations
  'dashboards',              // FK → organizations
  'widgets',                 // FK → dashboards
  'workflow_rules',          // FK → organizations
  'rule_schedules',          // FK → workflow_rules
  'agent_templates',         // FK → organizations (global templates seeded here)
];

// ── Tier 3: User / business data (never auto-synced) ─────────────────────────
// Listed here for documentation. Requires explicit --include-user-data flag.
export const USER_DATA_TABLES = [
  'connector_installations', // contains encrypted credentials
  'enterprise_snapshots',
  'branches',
  'departments',
  'approval_requests',
  'approval_steps',
  'business_rules',
  'scheduled_reports',
  'enterprise_events',
  'sessions',
  'password_reset_tokens',
  'sso_providers',
  'sso_provider_users',
  'custom_roles',
  'role_audit_logs',
  'ellinea_agents',
  'agent_executions',
  'agent_audit_logs',
  'agent_webhook_subscriptions',
  'database_configurations',
  'database_switch_logs',
  'api_usage',
  'organization_tiers',
  'rate_limit_violations',
  'integration_requests',
  'documents',
];

/**
 * Returns a human-readable summary of the tier classification.
 */
export function printTableSummary() {
  console.log('\n── Table sync classification ──────────────────────────────');
  console.log(`  Tier 1 — Platform (always):   ${PLATFORM_TABLES.join(', ')}`);
  console.log(`  Tier 2 — Demo org (--include-demo): ${DEMO_TABLES_ORDERED.length} tables`);
  console.log(`  Tier 3 — User data (--include-user-data): ${USER_DATA_TABLES.length} tables`);
  console.log('───────────────────────────────────────────────────────────\n');
}
