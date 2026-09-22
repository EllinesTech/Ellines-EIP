import { AccountLockout, LOCKOUT_MAX_FAILURES } from './account-lockout';

describe('AccountLockout (spec 24.4.1 —5 failures / 15 min → 15 min lock)', () => {
  const MINUTE = 60_000;
  const T0 = 1_700_000_000_000;

  function makeLockout() {
    const clock = { now: T0 };
    const lockout = new AccountLockout(() => clock.now);
    return { clock, lockout };
  }

  it('does not lock below the threshold', () => {
    const { clock, lockout } = makeLockout();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES - 1; i += 1) {
      lockout.recordFailure('user@example.com');
      clock.now += 1_000;
      expect(lockout.isLocked('user@example.com')).toBe(false);
    }
    expect(lockout.lockedUntil('user@example.com')).toBeNull();
  });

  it('locks at the 5th failure inside the window', () => {
    const { clock, lockout } = makeLockout();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      lockout.recordFailure('user@example.com');
      clock.now += 1_000;
    }
    expect(lockout.isLocked('user@example.com')).toBe(true);
    expect(lockout.lockedUntil('user@example.com')).toBe(
      T0 + (LOCKOUT_MAX_FAILURES - 1) * 1_000 + 15 * MINUTE,
    );
  });

  it('keys state on the normalized submitted email (case + whitespace)', () => {
    const { lockout } = makeLockout();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      lockout.recordFailure('  User@Example.COM ');
    }
    expect(lockout.isLocked('user@example.com')).toBe(true);
    expect(lockout.isLocked('USER@example.com')).toBe(true);
  });

  it('unlocks after the 15-minute lock expires and resets failure state', () => {
    const { clock, lockout } = makeLockout();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      lockout.recordFailure('user@example.com');
      clock.now += 1_000;
    }
    expect(lockout.isLocked('user@example.com')).toBe(true);

    clock.now += 15 * MINUTE + 1_000; // lock expired
    expect(lockout.isLocked('user@example.com')).toBe(false);

    // Pre-expiry failures were cleared: one fresh failure must not relock.
    lockout.recordFailure('user@example.com');
    expect(lockout.isLocked('user@example.com')).toBe(false);
  });

  it('prunes failures outside the 15-minute counting window', () => {
    const { clock, lockout } = makeLockout();
    for (let i = 0; i < 4; i += 1) {
      lockout.recordFailure('user@example.com');
      clock.now += 1_000;
    }
    clock.now += 16 * MINUTE; // the four failures age out of the window
    lockout.recordFailure('user@example.com');
    expect(lockout.isLocked('user@example.com')).toBe(false); // count restarted at 1

    for (let i = 0; i < 4; i += 1) {
      lockout.recordFailure('user@example.com');
      clock.now += 1_000;
    }
    expect(lockout.isLocked('user@example.com')).toBe(true); // 1 + 4 fresh = 5
  });

  it('clear() resets state after successful authentication', () => {
    const { lockout } = makeLockout();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      lockout.recordFailure('user@example.com');
    }
    expect(lockout.isLocked('user@example.com')).toBe(true);

    lockout.clear('user@example.com');
    expect(lockout.isLocked('user@example.com')).toBe(false);
    expect(lockout.lockedUntil('user@example.com')).toBeNull();

    lockout.recordFailure('user@example.com');
    expect(lockout.isLocked('user@example.com')).toBe(false); // counter restarted
  });

  it('unknown addresses lock under the same rules as real ones (no enumeration oracle)', () => {
    const { lockout } = makeLockout();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      lockout.recordFailure('ghost@example.com'); // account does not exist
    }
    expect(lockout.isLocked('ghost@example.com')).toBe(true);
  });
});