/**
 * Phase 4 — DB-backed platform staff lookup for Pages Functions.
 *
 * The control plane used to answer "is this an Ellines operator?" with one
 * question: is the email in `PLATFORM_ADMIN_EMAILS`? That allowlist had no
 * record of who granted access, no scope, no expiry, and no revocation short of
 * editing the secret and redeploying Pages. It also had no way to express
 * "this operator may read tenants but not touch connectors".
 *
 * This module resolves the answer from the platform staff registry
 * (`platform_staff_members` + `platform_staff_grants`) and keeps the allowlist
 * only as a bootstrap source.
 *
 * TRANSITION RULE (and why it is safe)
 * ------------------------------------
 *  - A staff row exists → the DATABASE decides, always. A suspended or revoked
 *    operator is denied even if still allowlisted, so revocation actually
 *    revokes.
 *  - No staff row, table missing (pre-migration environment) → the allowlist
 *    still works, with the full bootstrap capability set, reported as
 *    `source: 'env_bootstrap'` so the UI can show which access has not been
 *    materialised into the registry yet.
 *  - Any other lookup error → DENY. A transient database failure must not revive
 *    an operator whose access was revoked: "cannot check" is not "allowed".
 */

import {
  PLATFORM_STAFF_BOOTSTRAP_CAPABILITIES,
  normalizePlatformStaffEmail,
  platformStaffCan,
  resolvePlatformStaffCapabilities,
  resolvePlatformStaffGrants,
  summarisePlatformStaffAccess,
  type PlatformStaffCapability,
  type PlatformStaffDenialReason,
  type PlatformStaffGrantRecord,
  type PlatformStaffRecord,
} from '@ellines-eip/shared';
import { getAdminClient, json, platformAdminFromEnv, type Env } from './auth';

export type PlatformStaffSource = 'database' | 'env_bootstrap' | 'none';

export type PlatformStaffDenied = PlatformStaffDenialReason | 'lookup_failed' | 'not_allowlisted';

export interface PlatformStaffContext {
  email: string;
  staffId: string | null;
  source: PlatformStaffSource;
  active: boolean;
  capabilities: PlatformStaffCapability[];
  /** Active grant rows, scope preserved (never collapsed to names alone). */
  grants: PlatformStaffGrantRecord[];
  /** Null when access is held; otherwise why it is not. */
  deniedReason: PlatformStaffDenied | null;
  /** True when the database itself was unreadable (as opposed to a denial). */
  lookupFailed: boolean;
}

/** PostgREST/PG tells us the table (rather than the data) is missing. */
function isMissingTableError(message: string): boolean {
  return /relation .* does not exist|could not find the table|schema cache|PGRST205|PGRST204|42P01/i.test(message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Normalise the nested PostgREST payload. Accepts `platform_staff_grants` (the
 * nested table name) and a camelCase `grants` alias so the identity service and
 * the test fakes can hand in the same shape.
 */
export function toGrantRecords(raw: unknown): PlatformStaffGrantRecord[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: PlatformStaffGrantRecord[] = [];
  for (const entry of rows) {
    const grant = asRecord(entry);
    if (!grant) continue;
    const capability = asString(grant.capability);
    if (!capability) continue;
    out.push({
      capability,
      scopeOrgId: asString(grant.scope_org_id) ?? asString(grant.scopeOrgId) ?? '',
      expiresAt: asString(grant.expires_at) ?? asString(grant.expiresAt) ?? null,
      revokedAt: asString(grant.revoked_at) ?? asString(grant.revokedAt) ?? null,
    });
  }
  return out;
}

/** Map a staff row (from the DB or a test fake) onto the decision record. */
export function toStaffRecord(
  row: unknown,
): { id: string | null; record: PlatformStaffRecord } | null {
  const source = asRecord(row);
  if (!source) return null;
  return {
    id: asString(source.id),
    record: {
      status: asString(source.status),
      expiresAt: asString(source.expires_at) ?? asString(source.expiresAt) ?? null,
      revokedAt: asString(source.revoked_at) ?? asString(source.revokedAt) ?? null,
      grants: toGrantRecords(source.platform_staff_grants ?? source.grants),
    },
  };
}

const STAFF_COLUMNS =
  'id, email, status, expires_at, revoked_at, platform_staff_grants(capability, scope_org_id, expires_at, revoked_at)';

/** Columns selected for a staff list/detail read (no secrets exist in these rows). */
export const PLATFORM_STAFF_SELECT = STAFF_COLUMNS;

/**
 * Resolve the platform access held by `email` right now.
 *
 * `nowMs` is injected so tests (and future expiry reporting) can evaluate a
 * decision at a fixed instant rather than depending on the wall clock.
 */
export async function loadPlatformStaff(
  env: Env,
  email: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<PlatformStaffContext> {
  const normalized = normalizePlatformStaffEmail(email);
  if (!normalized) {
    return {
      email: '',
      staffId: null,
      source: 'none',
      active: false,
      capabilities: [],
      grants: [],
      deniedReason: 'not_allowlisted',
      lookupFailed: false,
    };
  }

  let row: unknown = null;
  let lookupFailed = false;
  let tableMissing = false;

  try {
    const supabase = getAdminClient(env);
    const { data, error } = await supabase
      .from('platform_staff_members')
      .select(STAFF_COLUMNS)
      .eq('email', normalized)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error.message)) tableMissing = true;
      else lookupFailed = true;
    } else {
      row = data;
    }
  } catch (err) {
    lookupFailed = true;
    console.error('[platform-staff] lookup failed', err instanceof Error ? err.message : String(err));
  }

  const mapped = toStaffRecord(row);
  if (mapped) {
    // The database is authoritative the moment a row exists for this email.
    const summary = summarisePlatformStaffAccess(mapped.record, nowMs);
    return {
      email: normalized,
      staffId: mapped.id,
      source: 'database',
      active: summary.active,
      capabilities: summary.capabilities,
      grants: resolvePlatformStaffGrants(mapped.record, nowMs),
      deniedReason: summary.denialReason,
      lookupFailed: false,
    };
  }

  if (lookupFailed && !tableMissing) {
    return {
      email: normalized,
      staffId: null,
      source: 'none',
      active: false,
      capabilities: [],
      grants: [],
      deniedReason: 'lookup_failed',
      lookupFailed: true,
    };
  }

  // No staff row (or the registry does not exist yet): the allowlist still
  // bootstraps the original behaviour, and reports itself as such.
  if (platformAdminFromEnv(env, normalized)) {
    return {
      email: normalized,
      staffId: null,
      source: 'env_bootstrap',
      active: true,
      capabilities: [...PLATFORM_STAFF_BOOTSTRAP_CAPABILITIES],
      grants: PLATFORM_STAFF_BOOTSTRAP_CAPABILITIES.map((capability) => ({
        capability,
        scopeOrgId: '',
        expiresAt: null,
        revokedAt: null,
      })),
      deniedReason: null,
      lookupFailed: false,
    };
  }

  return {
    email: normalized,
    staffId: null,
    source: 'none',
    active: false,
    capabilities: [],
    grants: [],
    deniedReason: 'not_allowlisted',
    lookupFailed: false,
  };
}

/**
 * Resolve staff access and, when `capability` is given, require it.
 * Returns a 403 Response (never echoing registry contents) when denied.
 */
export async function requirePlatformStaff(
  env: Env,
  auth: { email: string },
  capability?: PlatformStaffCapability,
  scopeOrgId?: string | null,
  nowMs: number = Date.now(),
): Promise<PlatformStaffContext | Response> {
  const context = await loadPlatformStaff(env, auth.email, nowMs);
  if (!context.active) {
    return json(
      {
        statusCode: 403,
        message: context.lookupFailed
          ? 'Platform staff lookup unavailable'
          : 'Platform staff access required',
      },
      403,
    );
  }
  if (capability) {
    // Check against the operator's own resolved grants so a grant scoped to one
    // organization is never treated as platform-wide.
    const staff: PlatformStaffRecord = { status: 'active', grants: context.grants };
    if (!platformStaffCan(staff, capability, nowMs, scopeOrgId)) {
      return json({ statusCode: 403, message: `Platform capability required: ${capability}` }, 403);
    }
  }
  return context;
}
