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
  isPlatformStaffGrantActive,
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

/**
 * Boolean form of the same decision, for the endpoints that used to do
 * `if (!platformAdminFromEnv(env, auth.email)) return 403`.
 *
 * Fails closed: a lookup error, an unknown operator, a suspended operator and a
 * missing capability are all `false`. It never throws — an authorization helper
 * that throws would turn a database hiccup into a 500 with a stack trace instead
 * of a clean 403.
 *
 * `scopeOrgId` is passed when the decision is about ONE organization. Leave it
 * undefined for platform-wide checks: an org-scoped grant must not satisfy those.
 */
export async function platformStaffHas(
  env: Env,
  email: string | null | undefined,
  capability: PlatformStaffCapability,
  scopeOrgId?: string | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const context = await loadPlatformStaff(env, email, nowMs);
  if (!context.active) return false;
  const staff: PlatformStaffRecord = { status: 'active', grants: context.grants };
  return platformStaffCan(staff, capability, nowMs, scopeOrgId);
}

// ─── transactional mutations (PostgREST RPC) ────────────────────────────────

/**
 * Staff mutations go through Postgres functions (migration 0010) rather than a
 * sequence of PostgREST writes, because PostgREST can only make one table atomic
 * per request and a half-applied authorization change is worse than a failed one.
 *
 * Every helper returns a discriminated result. Callers MUST check `ok` — a failed
 * mutation is never reported as a success.
 */
export type StaffMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; httpStatus: number };

/** Map a database error to an HTTP status without leaking SQL internals. */
function classifyStaffMutationError(message: string): { code: string; httpStatus: number } {
  const text = String(message || '');
  if (text.includes('eip_staff_exists')) return { code: 'already_exists', httpStatus: 409 };
  if (text.includes('eip_staff_not_found') || text.includes('eip_grant_not_found')) {
    return { code: 'not_found', httpStatus: 404 };
  }
  if (
    text.includes('eip_invalid_capability') ||
    text.includes('eip_invalid_status') ||
    text.includes('eip_invalid_email') ||
    text.includes('eip_invalid_timestamp') ||
    text.includes('eip_revoked_is_terminal')
  ) {
    return { code: 'invalid_request', httpStatus: 400 };
  }
  return { code: 'mutation_failed', httpStatus: 500 };
}

async function callStaffRpc<T>(env: Env, fn: string, params: Record<string, unknown>): Promise<StaffMutationResult<T>> {
  const supabase = getAdminClient(env);
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const { code, httpStatus } = classifyStaffMutationError(error.message);
    return { ok: false, code, message: error.message, httpStatus };
  }
  // A null payload from a mutating function is not a success: refuse to invent one.
  if (data === null || data === undefined) {
    return {
      ok: false,
      code: 'empty_result',
      message: `${fn} returned no persisted state`,
      httpStatus: 500,
    };
  }
  return { ok: true, data: data as T };
}

// ─── reads ──────────────────────────────────────────────────────────────────

export interface PlatformStaffGrantView {
  id: string | null;
  capability: string;
  scopeOrgId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  grantedByEmail: string | null;
  /** Whether this grant counts toward access right now (expiry/revocation aware). */
  effective: boolean;
}

export interface PlatformStaffView {
  id: string | null;
  email: string;
  fullName: string | null;
  title: string | null;
  status: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  invitedByEmail: string | null;
  bootstrapped: boolean;
  createdAt: string | null;
  grants: PlatformStaffGrantView[];
  /** Effective capabilities, computed from the same rules the authorizer uses. */
  effectiveCapabilities: PlatformStaffCapability[];
  deniedReason: PlatformStaffDenied | null;
}

const LIST_COLUMNS =
  'id, email, status, expires_at, revoked_at, full_name, title, invited_by_email, bootstrapped, created_at, ' +
  'platform_staff_grants(id, capability, scope_org_id, expires_at, revoked_at, reason, granted_by_email)';

/** Map one raw row into the API view, evaluating access at `nowMs`. */
export function toPlatformStaffView(row: unknown, nowMs: number): PlatformStaffView | null {
  const mapped = toStaffRecord(row);
  const raw = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
  if (!mapped || !raw) return null;

  const nested = raw.platform_staff_grants ?? raw.grants;
  const rawGrants = Array.isArray(nested) ? nested : [];

  const grants: PlatformStaffGrantView[] = rawGrants.map((entry): PlatformStaffGrantView => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const capability = typeof source.capability === 'string' ? source.capability : '';
    const scopeOrgId =
      typeof source.scope_org_id === 'string' ? source.scope_org_id
        : typeof source.scopeOrgId === 'string' ? source.scopeOrgId
          : '';
    const expiresAt =
      typeof source.expires_at === 'string' ? source.expires_at
        : typeof source.expiresAt === 'string' ? source.expiresAt
          : null;
    const revokedAt =
      typeof source.revoked_at === 'string' ? source.revoked_at
        : typeof source.revokedAt === 'string' ? source.revokedAt
          : null;
    return {
      id: typeof source.id === 'string' ? source.id : null,
      capability,
      scopeOrgId,
      expiresAt,
      revokedAt,
      reason: typeof source.reason === 'string' ? source.reason : null,
      grantedByEmail: typeof source.granted_by_email === 'string' ? source.granted_by_email : null,
      // Same rule the authorizer applies, so the list cannot disagree with access.
      effective: isPlatformStaffGrantActive({ capability, scopeOrgId, expiresAt, revokedAt }, nowMs),
    };
  });

  const summary = summarisePlatformStaffAccess(mapped.record, nowMs);
  return {
    id: mapped.id,
    email: typeof raw.email === 'string' ? raw.email : '',
    fullName: typeof raw.full_name === 'string' ? raw.full_name : null,
    title: typeof raw.title === 'string' ? raw.title : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    expiresAt: mapped.record.expiresAt ?? null,
    revokedAt: mapped.record.revokedAt ?? null,
    revokedReason: typeof raw.revoked_reason === 'string' ? raw.revoked_reason : null,
    invitedByEmail: typeof raw.invited_by_email === 'string' ? raw.invited_by_email : null,
    bootstrapped: raw.bootstrapped === true,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
    grants,
    effectiveCapabilities: summary.capabilities,
    deniedReason: summary.denialReason,
  };
}

/** Read the whole registry. Returns [] rather than throwing on a read failure. */
export async function listPlatformStaff(env: Env, nowMs: number = Date.now()): Promise<PlatformStaffView[]> {
  const supabase = getAdminClient(env);
  const { data, error } = await supabase.from('platform_staff_members').select(LIST_COLUMNS);
  if (error) {
    console.error('[platform-staff] list failed', error.message);
    return [];
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => toPlatformStaffView(row, nowMs))
    .filter((view): view is PlatformStaffView => view !== null);
}

/** Read one operator by id, or null when it does not exist. */
export async function getPlatformStaff(
  env: Env,
  id: string,
  nowMs: number = Date.now(),
): Promise<PlatformStaffView | null> {
  const supabase = getAdminClient(env);
  const { data, error } = await supabase
    .from('platform_staff_members')
    .select(LIST_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[platform-staff] detail failed', error.message);
    return null;
  }
  return toPlatformStaffView(data, nowMs);
}

// ─── mutations ──────────────────────────────────────────────────────────────

export interface StaffGrantInput {
  capability: string;
  /** '' = platform-wide. */
  scopeOrgId?: string | null;
  expiresAt?: string | null;
}

/** Create an operator and their grants in one transaction. */
export function invitePlatformStaff(
  env: Env,
  input: {
    email: string;
    fullName?: string | null;
    title?: string | null;
    expiresAt?: string | null;
    reason: string;
    actorEmail: string;
    grants?: StaffGrantInput[];
  },
): Promise<StaffMutationResult<PlatformStaffView>> {
  return callStaffRpc<PlatformStaffView>(env, 'eip_platform_staff_invite', {
    p_email: normalizePlatformStaffEmail(input.email),
    p_full_name: input.fullName ?? '',
    p_title: input.title ?? '',
    p_expires_at: input.expiresAt ?? '',
    p_reason: input.reason,
    p_actor_email: normalizePlatformStaffEmail(input.actorEmail),
    p_grants: (input.grants ?? []).map((grant) => ({
      capability: grant.capability,
      scopeOrgId: grant.scopeOrgId ?? '',
      expiresAt: grant.expiresAt ?? null,
    })),
  });
}

/** Grant or revoke one capability (transactional; returns the persisted grant). */
export function setPlatformStaffGrant(
  env: Env,
  input: {
    staffId: string;
    capability: string;
    scopeOrgId?: string | null;
    expiresAt?: string | null;
    reason: string;
    actorEmail: string;
    granted: boolean;
  },
): Promise<StaffMutationResult<PlatformStaffGrantView>> {
  return callStaffRpc<PlatformStaffGrantView>(env, 'eip_platform_staff_set_grant', {
    p_staff_id: input.staffId,
    p_capability: input.capability,
    p_scope_org_id: input.scopeOrgId ?? '',
    p_expires_at: input.expiresAt ?? '',
    p_reason: input.reason,
    p_actor_email: normalizePlatformStaffEmail(input.actorEmail),
    p_granted: input.granted,
  });
}

/** Suspend / activate / revoke an operator (revocation is terminal). */
export function setPlatformStaffStatus(
  env: Env,
  input: { staffId: string; status: 'active' | 'suspended' | 'revoked'; reason: string; actorEmail: string },
): Promise<StaffMutationResult<PlatformStaffView>> {
  return callStaffRpc<PlatformStaffView>(env, 'eip_platform_staff_set_status', {
    p_staff_id: input.staffId,
    p_status: input.status,
    p_reason: input.reason,
    p_actor_email: normalizePlatformStaffEmail(input.actorEmail),
  });
}

export interface BootstrapReport {
  dryRun: boolean;
  created: string[];
  wouldCreate: string[];
  skippedExisting: string[];
  skippedInactive: string[];
}

/**
 * Materialise the configured allowlist into real staff rows. Idempotent: an
 * operator who already has a row is skipped, and a suspended/revoked operator is
 * never revived. Bootstrap grants exactly the capability set the allowlist used
 * to imply — never more.
 */
export function bootstrapPlatformStaff(
  env: Env,
  input: { allowlist: string[]; reason: string; actorEmail: string; dryRun?: boolean },
): Promise<StaffMutationResult<BootstrapReport>> {
  return callStaffRpc<BootstrapReport>(env, 'eip_platform_staff_bootstrap', {
    p_allowlist: input.allowlist.map(normalizePlatformStaffEmail).filter(Boolean),
    p_reason: input.reason,
    p_actor_email: normalizePlatformStaffEmail(input.actorEmail),
    p_dry_run: input.dryRun === true,
  });
}
