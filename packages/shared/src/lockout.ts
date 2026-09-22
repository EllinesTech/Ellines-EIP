/**
 * Baseline account-lockout policy (spec §24.4.1):
 * 5 failed login attempts within a 15-minute window → a 15-minute lock.
 *
 * This module holds the SINGLE canonical policy (thresholds + pure state
 * machine) shared by both authentication endpoints:
 * - Pages Functions `apps/web/functions/shared/lockout.ts` (KV-backed storage)
 * - NestJS identity `services/identity/src/auth/account-lockout.ts`
 *   (in-memory storage)
 * State is keyed by the normalized SUBMITTED EMAIL whether or not the account
 * exists, so locked and failed responses stay byte-identical for existing and
 * unknown addresses — lockout must never become an enumeration oracle (§24.3).
 *
 * Storage is intentionally NOT defined here: this package must stay free of
 * runtime-specific types (Workers KV / Nest DI). Callers persist the
 * `LockoutRecord` and feed it back with a `now` timestamp.
 */

/** Failed attempts inside this rolling window count toward the lock. */
export const LOCKOUT_MAX_FAILURES = 5;
/** Rolling window for counting failures (15 minutes). */
export const LOCKOUT_WINDOW_MS = 15 * 60_000;
/** Lock duration once the threshold is reached (15 minutes). */
export const LOCKOUT_LOCK_MS = 15 * 60_000;

/** Persisted lockout state for one email key. */
export interface LockoutRecord {
  /** Epoch-ms timestamps of failures inside the rolling window. */
  failures: number[];
  /** Epoch-ms instant until which authentication is blocked, when locked. */
  lockedUntil?: number;
}

export interface LockoutDecision {
  locked: boolean;
  /** Milliseconds remaining on an active lock (0 when not locked). */
  retryAfterMs: number;
  /** True when a previously recorded lock has expired and state must reset. */
  expired: boolean;
}

/**
 * Decide lock state for a record at `now`. An expired lock reports
 * `expired: true` so callers clear it — lock expiry resets failure state
 * (§24.4.1 reset semantics).
 */
export function evaluateLockout(
  record: LockoutRecord | null | undefined,
  now: number,
): LockoutDecision {
  if (!record) return { locked: false, retryAfterMs: 0, expired: false };
  if (record.lockedUntil !== undefined) {
    if (now < record.lockedUntil) {
      return { locked: true, retryAfterMs: record.lockedUntil - now, expired: false };
    }
    return { locked: false, retryAfterMs: 0, expired: true };
  }
  return { locked: false, retryAfterMs: 0, expired: false };
}

/**
 * Record one failed attempt at `now`, pruning failures outside the rolling
 * window. Reaching LOCKOUT_MAX_FAILURES inside the window starts a
 * LOCKOUT_LOCK_MS lock from this failure. Calling this while already locked is
 * a no-op (the endpoint rejects locked attempts before credentials are checked).
 */
export function registerLockoutFailure(
  record: LockoutRecord | null | undefined,
  now: number,
): LockoutRecord {
  const current = record ?? { failures: [] };
  if (current.lockedUntil !== undefined && now < current.lockedUntil) {
    return current; // already locked — state unchanged
  }
  const cutoff = now - LOCKOUT_WINDOW_MS;
  const failures = (current.failures ?? []).filter((t) => t > cutoff);
  failures.push(now);
  if (failures.length >= LOCKOUT_MAX_FAILURES) {
    return { failures, lockedUntil: now + LOCKOUT_LOCK_MS };
  }
  return { failures };
}
