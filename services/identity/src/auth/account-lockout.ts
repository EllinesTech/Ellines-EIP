/**
 * In-memory account-lockout store for the NestJS identity login (spec 24.4.1).
 *
 * Policy (thresholds + pure state machine) comes from the canonical shared
 * module so BOTH authentication endpoints enforce identical rules; this class
 * only owns storage. State is keyed by the NORMALIZED SUBMITTED EMAIL — unknown
 * addresses record failures too, so locked (429) and failed (401) responses are
 * indistinguishable for existing vs unknown accounts (§24.3 anti-enumeration).
 *
 * The injectable clock keeps window/expiry behaviour unit-testable.
 * Storage is per-process: acceptable for the single-instance dev/legacy NestJS
 * backend; the live Pages endpoint uses RATE_LIMIT_KV (shared/lockout.ts).
 */
import {
  LOCKOUT_LOCK_MS,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_WINDOW_MS,
  evaluateLockout,
  registerLockoutFailure,
  type LockoutRecord,
} from '@ellines-eip/shared';

export class AccountLockout {
  private readonly records = new Map<string, LockoutRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  /** True while the email's active lock blocks authentication (expiry clears state). */
  isLocked(email: string): boolean {
    const key = this.key(email);
    const decision = evaluateLockout(this.records.get(key), this.now());
    if (decision.expired) this.records.delete(key); // lock expiry resets failure state
    return decision.locked;
  }

  /** Record one failed attempt for the submitted email (existent or not). */
  recordFailure(email: string): void {
    const key = this.key(email);
    this.records.set(key, registerLockoutFailure(this.records.get(key), this.now()));
  }

  /** Clear failure/lock state after successful authentication (spec 24.4.1). */
  clear(email: string): void {
    this.records.delete(this.key(email));
  }

  /** Active lock's expiry instant (epoch-ms), or null when not locked. */
  lockedUntil(email: string): number | null {
    const record = this.records.get(this.key(email));
    if (!record) return null;
    return evaluateLockout(record, this.now()).locked ? (record.lockedUntil ?? null) : null;
  }
}

export { LOCKOUT_MAX_FAILURES, LOCKOUT_WINDOW_MS, LOCKOUT_LOCK_MS };