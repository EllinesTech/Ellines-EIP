/**
 * Phase 4 — Ellines internal platform staff, roles and scoped grants.
 *
 * WHAT PROBLEM THIS SOLVES
 * ------------------------
 * Platform Super Admin access has until now been decided entirely by the
 * `PLATFORM_ADMIN_EMAILS` environment variable: every listed email implicitly
 * held *every* platform capability, with no record of who granted it, no scope,
 * no expiry and no way to revoke one operator without editing a secret and
 * redeploying. That is an allowlist, not an authorization model.
 *
 * This module is the single source of truth for the *decision* half: given a
 * staff row and its grant rows, which capabilities does this operator hold right
 * now? It is deliberately pure (no I/O, no clock of its own) so the exact same
 * rules run in the NestJS identity service, in Cloudflare Pages Functions and in
 * tests.
 *
 * FAIL CLOSED, ALWAYS
 * -------------------
 *  - Staff absent, suspended, revoked or past `expiresAt` → no capabilities.
 *  - Grant revoked, or expired, or carrying an unreadable `expiresAt` → ignored.
 *    (An unreadable expiry is not "no expiry"; we cannot prove the grant is
 *    still valid, so it is not.)
 *  - Capability strings outside the known set are ignored on read and rejected
 *    on write, so a typo can never widen access.
 * Any timestamp that cannot be read denies access; it is never read as "now" —
 * the same rule as `db-time.ts`.
 */

import { toInstantMs } from './db-time';

/** Capabilities an Ellines operator can hold. Scoped reads/writes by domain. */
export type PlatformStaffCapability =
  | 'platform.tenants.read'
  | 'platform.tenants.manage'
  | 'platform.connectors.manage'
  | 'platform.staff.manage'
  | 'platform.security.manage'
  | 'platform.settings.manage'
  | 'platform.audit.read';

/** Canonical capability list — the only strings that can be granted. */
export const PLATFORM_STAFF_CAPABILITIES: readonly PlatformStaffCapability[] = [
  'platform.tenants.read',
  'platform.tenants.manage',
  'platform.connectors.manage',
  'platform.staff.manage',
  'platform.security.manage',
  'platform.settings.manage',
  'platform.audit.read',
];

/** Human labels for the control plane. */
export const PLATFORM_STAFF_CAPABILITY_LABELS: Record<PlatformStaffCapability, string> = {
  'platform.tenants.read': 'View client organizations',
  'platform.tenants.manage': 'Govern client organizations (suspend, package, delete)',
  'platform.connectors.manage': 'Manage connectors and connector packs',
  'platform.staff.manage': 'Manage Ellines platform staff and grants',
  'platform.security.manage': 'Security operations (sessions, encryption, CORS)',
  'platform.settings.manage': 'Platform settings and feature flags',
  'platform.audit.read': 'Read and export cross-tenant audit logs',
};

/**
 * Every capability an allowlisted operator holds when the database says nothing
 * about them yet. Bootstrap grants exactly this set so the historical
 * `PLATFORM_ADMIN_EMAILS` behaviour is preserved during the transition, and
 * narrowing access becomes editing a row rather than editing a secret.
 */
export const PLATFORM_STAFF_BOOTSTRAP_CAPABILITIES: readonly PlatformStaffCapability[] = [
  ...PLATFORM_STAFF_CAPABILITIES,
];

export type PlatformStaffStatus = 'active' | 'suspended' | 'revoked';

export const PLATFORM_STAFF_STATUSES: readonly PlatformStaffStatus[] = [
  'active',
  'suspended',
  'revoked',
];

export function isPlatformStaffStatus(value: unknown): value is PlatformStaffStatus {
  return typeof value === 'string' && (PLATFORM_STAFF_STATUSES as readonly string[]).includes(value);
}

export function isPlatformStaffCapability(value: unknown): value is PlatformStaffCapability {
  return typeof value === 'string' && (PLATFORM_STAFF_CAPABILITIES as readonly string[]).includes(value);
}

/** Platform-wide scope marker. `''` (never null) so the unique index can bite. */
export const PLATFORM_STAFF_PLATFORM_SCOPE = '';

/** Normalise an operator email for comparison and storage. */
export function normalizePlatformStaffEmail(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * A grant row as it reaches the decision functions. Timestamps stay strings:
 * they arrive zone-less from Postgres (see `db-time.ts`) or as ISO strings from
 * the identity service, and both must resolve to the same instant.
 */
export interface PlatformStaffGrantRecord {
  capability: string;
  /** `''` = platform-wide; otherwise the single org this grant is limited to. */
  scopeOrgId?: string | null;
  /** Absent/empty = no expiry. Unreadable = treated as expired (fail closed). */
  expiresAt?: string | null;
  revokedAt?: string | null;
}

export interface PlatformStaffRecord {
  status?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  grants?: readonly PlatformStaffGrantRecord[] | null;
}

function hasStarted(value: string | null | undefined, nowMs: number): boolean {
  const ms = toInstantMs(value);
  if (ms === null) return false;
  return ms <= nowMs;
}

function hasExpired(value: string | null | undefined, nowMs: number): boolean {
  if (value === null || value === undefined || value === '') return false;
  const ms = toInstantMs(value);
  // Unreadable expiry: we cannot prove the row is still valid, so we do not.
  if (ms === null) return true;
  return ms <= nowMs;
}

/**
 * Whether the staff row itself is currently valid (status + own expiry).
 *
 * Declared as a type predicate so callers that guard on it get `staff` narrowed
 * to a non-null record — the resolution helpers rely on that.
 */
export function isPlatformStaffActive(
  staff: PlatformStaffRecord | null | undefined,
  nowMs: number,
): staff is PlatformStaffRecord {
  if (!staff) return false;
  if (staff.status !== 'active') return false;
  if (hasStarted(staff.revokedAt, nowMs)) return false;
  if (hasExpired(staff.expiresAt, nowMs)) return false;
  return true;
}

/** Whether a single grant is currently valid. Unknown capabilities are ignored. */
export function isPlatformStaffGrantActive(
  grant: PlatformStaffGrantRecord | null | undefined,
  nowMs: number,
): boolean {
  if (!grant) return false;
  if (!isPlatformStaffCapability(grant.capability)) return false;
  if (hasStarted(grant.revokedAt, nowMs)) return false;
  if (hasExpired(grant.expiresAt, nowMs)) return false;
  return true;
}

/**
 * The active grant rows for this operator (valid capability, not revoked, not
 * expired), preserving scope and expiry. Scope matters: collapsing to capability
 * names alone would turn a grant scoped to one organization into a platform-wide
 * one, which is exactly the widening this registry exists to prevent.
 */
export function resolvePlatformStaffGrants(
  staff: PlatformStaffRecord | null | undefined,
  nowMs: number,
): PlatformStaffGrantRecord[] {
  if (!isPlatformStaffActive(staff, nowMs)) return [];
  const out: PlatformStaffGrantRecord[] = [];
  for (const grant of staff.grants ?? []) {
    if (!isPlatformStaffGrantActive(grant, nowMs)) continue;
    out.push({
      capability: grant.capability,
      scopeOrgId: grant.scopeOrgId ? grant.scopeOrgId : PLATFORM_STAFF_PLATFORM_SCOPE,
      expiresAt: grant.expiresAt ?? null,
      revokedAt: grant.revokedAt ?? null,
    });
  }
  return out;
}

/**
 * The capabilities this operator holds right now, derived only from their own
 * staff row plus their grants. Empty for unknown/suspended/revoked/expired staff.
 */
export function resolvePlatformStaffCapabilities(
  staff: PlatformStaffRecord | null | undefined,
  nowMs: number,
): PlatformStaffCapability[] {
  const held = new Set<PlatformStaffCapability>();
  for (const grant of resolvePlatformStaffGrants(staff, nowMs)) {
    held.add(grant.capability as PlatformStaffCapability);
  }
  return [...held].sort();
}

/**
 * Scope-aware check. A platform-wide grant (empty `scopeOrgId`) allows every org;
 * a scoped grant allows only its own org. When the caller passes no org, only
 * platform-wide grants count — a scoped operator is never silently widened.
 */
export function platformStaffCan(
  staff: PlatformStaffRecord | null | undefined,
  capability: PlatformStaffCapability,
  nowMs: number,
  scopeOrgId?: string | null,
): boolean {
  if (!isPlatformStaffActive(staff, nowMs)) return false;
  const target = scopeOrgId ? scopeOrgId : null;
  for (const grant of staff.grants ?? []) {
    if (grant.capability !== capability) continue;
    if (!isPlatformStaffGrantActive(grant, nowMs)) continue;
    const grantScope = grant.scopeOrgId ? grant.scopeOrgId : PLATFORM_STAFF_PLATFORM_SCOPE;
    if (grantScope === PLATFORM_STAFF_PLATFORM_SCOPE) return true;
    if (target && grantScope === target) return true;
  }
  return false;
}

export type PlatformStaffDenialReason =
  | 'no_staff_row'
  | 'not_active'
  | 'revoked'
  | 'expired'
  | 'no_capabilities';

export interface PlatformStaffAccessSummary {
  active: boolean;
  capabilities: PlatformStaffCapability[];
  /** Null when access is held; otherwise why it is not. */
  denialReason: PlatformStaffDenialReason | null;
}

/** Explain an access decision (used by the staff list UI and by tests). */
export function summarisePlatformStaffAccess(
  staff: PlatformStaffRecord | null | undefined,
  nowMs: number,
): PlatformStaffAccessSummary {
  if (!staff) return { active: false, capabilities: [], denialReason: 'no_staff_row' };
  if (staff.status !== 'active') {
    return {
      active: false,
      capabilities: [],
      denialReason: staff.status === 'revoked' ? 'revoked' : 'not_active',
    };
  }
  if (hasStarted(staff.revokedAt, nowMs)) {
    return { active: false, capabilities: [], denialReason: 'revoked' };
  }
  if (hasExpired(staff.expiresAt, nowMs)) {
    return { active: false, capabilities: [], denialReason: 'expired' };
  }
  const capabilities = resolvePlatformStaffCapabilities(staff, nowMs);
  if (capabilities.length === 0) {
    return { active: false, capabilities: [], denialReason: 'no_capabilities' };
  }
  return { active: true, capabilities, denialReason: null };
}
