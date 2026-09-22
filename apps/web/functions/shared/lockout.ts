/**
 * Baseline account-lockout controls for authentication endpoints (spec 24.4.1).
 *
 * Policy (Phase 2 acceptance): 5 failed login attempts within a 15-minute window
 * lock the account for 15 minutes. State is keyed by the NORMALIZED SUBMITTED
 * EMAIL whether or not the account exists, so the locked (429) and failed (401)
 * responses are byte-identical for existing and unknown addresses — locking must
 * never become an account-enumeration oracle (spec 24.3 anti-enumeration).
 *
 * Backed by the same KV namespace as the IP rate limiter (`RATE_LIMIT_KV`).
 * When KV is not bound the control fails open, matching `checkRateLimit` — a
 * documented deployment requirement, not a bypass: production Pages binds
 * `RATE_LIMIT_KV`, and the IP limiter already relies on the same binding.
 *
 * Reset semantics (spec 24.4.1): failure state is cleared on successful
 * authentication and when a lock expires.
 */

import {
  LOCKOUT_LOCK_MS,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_WINDOW_MS,
  evaluateLockout,
  registerLockoutFailure,
  type LockoutRecord,
} from '@ellines-eip/shared';
import { json, type Env } from './auth';

// Single canonical policy lives in @ellines-eip/shared (spec 24.4.1) — re-exported
// here so endpoint code and tests keep a stable local import path.
export { LOCKOUT_MAX_FAILURES, LOCKOUT_WINDOW_MS, LOCKOUT_LOCK_MS };
export type { LockoutRecord };

type LockoutContext = { env: Env & { RATE_LIMIT_KV?: KVNamespace } };

export interface LockoutState {
  locked: boolean;
  /** Milliseconds remaining on an active lock (0 when not locked). */
  retryAfterMs: number;
}

function lockoutKey(email: string): string {
  return `lockout:login:${email.trim().toLowerCase()}`;
}

/**
 * Check whether `email` is currently locked. An expired lock is cleared here so
 * expiry resets failure state (spec 24.4.1).
 */
export async function checkLoginLockout(
  context: LockoutContext,
  email: string,
): Promise<LockoutState> {
  const kv = context.env.RATE_LIMIT_KV;
  if (!kv) return { locked: false, retryAfterMs: 0 };
  try {
    const key = lockoutKey(email);
    const raw = await kv.get(key);
    if (!raw) return { locked: false, retryAfterMs: 0 };
    const record = JSON.parse(raw) as LockoutRecord;
    const decision = evaluateLockout(record, Date.now());
    if (decision.expired) {
      // Lock expired — clear failure state entirely (fresh window after expiry).
      await kv.delete(key);
      return { locked: false, retryAfterMs: 0 };
    }
    if (decision.locked) return { locked: true, retryAfterMs: decision.retryAfterMs };
    return { locked: false, retryAfterMs: 0 };
  } catch (err) {
    console.error('[checkLoginLockout] KV error:', err);
    return { locked: false, retryAfterMs: 0 }; // fail open, consistent with checkRateLimit
  }
}

/**
 * Record one failed authentication attempt for `email`. Failures older than the
 * window are pruned; reaching LOCKOUT_MAX_FAILURES inside the window starts a
 * LOCKOUT_LOCK_MS lock (counted from the lock-triggering failure).
 */
export async function recordLoginFailure(
  context: LockoutContext,
  email: string,
): Promise<void> {
  const kv = context.env.RATE_LIMIT_KV;
  if (!kv) return;
  try {
    const key = lockoutKey(email);
    const now = Date.now();
    let record: LockoutRecord | null = null;
    const raw = await kv.get(key);
    if (raw) {
      const parsed = JSON.parse(raw) as LockoutRecord;
      // An expired lock resets the window entirely (spec 24.4.1).
      record = evaluateLockout(parsed, now).expired ? null : parsed;
    }
    const next = registerLockoutFailure(record, now);
    const ttlMs =
      next.lockedUntil !== undefined
        ? Math.max(next.lockedUntil - now, LOCKOUT_WINDOW_MS)
        : LOCKOUT_WINDOW_MS;
    await kv.put(key, JSON.stringify(next), {
      expirationTtl: Math.max(Math.ceil(ttlMs / 1000), 60),
    });
  } catch (err) {
    console.error('[recordLoginFailure] KV error:', err); // fail open, consistent with checkRateLimit
  }
}

/** Clear failure/lock state after successful authentication (spec 24.4.1). */
export async function clearLoginFailures(
  context: LockoutContext,
  email: string,
): Promise<void> {
  const kv = context.env.RATE_LIMIT_KV;
  if (!kv) return;
  try {
    await kv.delete(lockoutKey(email));
  } catch (err) {
    console.error('[clearLoginFailures] KV error:', err);
  }
}

/**
 * Generic 429 for an active lock. The body is identical for existing and
 * unknown accounts (anti-enumeration) because failure counting is keyed on the
 * submitted email alone.
 */
export function lockoutResponse(retryAfterMs: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return json(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many failed login attempts. Try again later.',
    },
    429,
    { 'Retry-After': String(retryAfterSeconds) },
  );
}
