/**
 * Canonical §12.2 permission-grammar unit tests — ONE grammar + evaluator for
 * tenant and platform permissions, shared by both auth backends
 * (Pages Functions `shared/auth.ts` and NestJS `permission.service.ts`).
 */
import {
  LOCKOUT_LOCK_MS,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_WINDOW_MS,
  evaluateLockout,
  isValidPermission,
  matchPermission,
  normalizePermission,
  registerLockoutFailure,
  ttlToMs,
} from '../index';

describe('permission grammar (§12.2)', () => {
  describe('normalizePermission — valid grants', () => {
    it.each([
      '*',
      'connector:install',
      'connector:*',
      'report:run',
      'platform.tenants:create',
      'platform.*:read',
      'platform.audit.*:export',
      'platform.tenants.*:*',
    ])('accepts %s', (permission) => {
      expect(normalizePermission(permission)).toBe(permission);
    });

    it('trims and lowercases before validating', () => {
      expect(normalizePermission('  Org:View  ')).toBe('org:view');
      expect(normalizePermission('Platform.Tenants:Create')).toBe('platform.tenants:create');
    });
  });

  describe('normalizePermission — invalid grants fail closed (null)', () => {
    it.each([
      '',
      '   ',
      'platform.tenants', // action-less (rule 4)
      'platform.*', // action-less wildcard (rule 4)
      'connector', // action-less legacy-style
      'platform.ten*:read', // partial-segment wildcard (rule 5)
      'connector:instal*', // partial action wildcard (rule 5)
      'connector:', // empty action
      ':install', // empty domain
      'foo bar:read', // whitespace inside
      'connector:install:extra', // extra colon
      ':',
    ])('rejects %p', (permission) => {
      expect(normalizePermission(permission)).toBeNull();
      expect(isValidPermission(permission)).toBe(false);
    });

    it('rejects non-string input', () => {
      expect(normalizePermission(undefined as unknown as string)).toBeNull();
      expect(normalizePermission(42 as unknown as string)).toBeNull();
    });
  });

  describe('matchPermission — rules 1–6', () => {
    it('rule 1: bare * matches every valid target', () => {
      expect(matchPermission('*', 'connector:install')).toBe(true);
      expect(matchPermission('*', 'platform.tenants:create')).toBe(true);
      expect(matchPermission('*', 'anything invalid')).toBe(false); // invalid target fails closed
    });

    it('rule 2: action wildcard or exact action', () => {
      expect(matchPermission('platform.tenants:*', 'platform.tenants:create')).toBe(true);
      expect(matchPermission('platform.tenants:create', 'platform.tenants:create')).toBe(true);
      expect(matchPermission('platform.tenants:create', 'platform.tenants:read')).toBe(false);
      expect(matchPermission('connector:*', 'connector:install')).toBe(true);
      expect(matchPermission('connector:*', 'org:view')).toBe(false);
    });

    it('rule 3: trailing * matches any resource within the domain', () => {
      expect(matchPermission('platform.*:read', 'platform.tenants:read')).toBe(true);
      expect(matchPermission('platform.*:read', 'platform.audit:read')).toBe(true);
      expect(matchPermission('platform.*:read', 'platform.tenants.export:read')).toBe(true);
      expect(matchPermission('platform.*:read', 'platform.tenants:create')).toBe(false);
      // A resource wildcard requires an actual resource segment.
      expect(matchPermission('platform.*:read', 'platform:read')).toBe(false);
    });

    it('rule 4: action-less grants are rejected, never prefix-matched', () => {
      expect(matchPermission('platform.*', 'platform.tenants:read')).toBe(false);
      expect(matchPermission('platform.tenants', 'platform.tenants:read')).toBe(false);
      expect(matchPermission('connector', 'connector:install')).toBe(false);
      expect(matchPermission('platform.tenants:read', 'not-a-valid-target')).toBe(false);
    });

    it('rule 5: wildcards are only valid as whole segments', () => {
      expect(matchPermission('platform.ten*:read', 'platform.tenants:read')).toBe(false);
      expect(matchPermission('plat*:read', 'platform.tenants:read')).toBe(false);
    });

    it('rule 6: no implicit prefix matching', () => {
      expect(matchPermission('platform.tenants:read', 'platform.tenants.export:read')).toBe(false);
      expect(matchPermission('platform:read', 'platform.tenants:read')).toBe(false);
      expect(matchPermission('platform.tenants.*:read', 'platform.tenants.export:read')).toBe(true);
    });

    it('normalizes case on both grant and target', () => {
      expect(matchPermission('Connector:*', 'connector:install')).toBe(true);
    });
  });

  describe('backward compatibility with the stored fixed-role vocabulary', () => {
    it.each([
      ['org:view', 'org:view'],
      ['org:*', 'org:view'],
      ['ellinea:*', 'ellinea:ask'],
      ['document:upload', 'document:upload'],
    ])('%s → %s', (grant, target) => {
      expect(matchPermission(grant, target)).toBe(true);
    });

    it('keeps cross-domain negatives negative', () => {
      expect(matchPermission('report:run', 'org:view')).toBe(false);
      expect(matchPermission('org:view', 'platform.tenants:create')).toBe(false);
    });
  });

  describe('ttlToMs — session-registry expiry derivation', () => {
    it('parses JWT-style TTLs', () => {
      expect(ttlToMs('24h')).toBe(86_400_000);
      expect(ttlToMs('15m')).toBe(900_000);
      expect(ttlToMs('3600s')).toBe(3_600_000);
      expect(ttlToMs('7d')).toBe(604_800_000);
    });

    it('falls back to 24h for missing or malformed values', () => {
      expect(ttlToMs(undefined)).toBe(86_400_000);
      expect(ttlToMs('')).toBe(86_400_000);
      expect(ttlToMs('soon')).toBe(86_400_000);
    });
  });
});

describe('account-lockout policy (§24.4.1)', () => {
  const T0 = 1_700_000_000_000;

  it('encodes the Phase 2 acceptance thresholds (5 / 15 min / 15 min)', () => {
    expect(LOCKOUT_MAX_FAILURES).toBe(5);
    expect(LOCKOUT_WINDOW_MS).toBe(15 * 60_000);
    expect(LOCKOUT_LOCK_MS).toBe(15 * 60_000);
  });

  it('stays unlocked below the threshold', () => {
    let record = registerLockoutFailure(null, T0);
    record = registerLockoutFailure(record, T0 + 1_000);
    record = registerLockoutFailure(record, T0 + 2_000);
    record = registerLockoutFailure(record, T0 + 3_000);
    expect(record.lockedUntil).toBeUndefined();
    expect(evaluateLockout(record, T0 + 4_000).locked).toBe(false);
  });

  it('locks at the 5th failure inside the window', () => {
    let record = registerLockoutFailure(null, T0);
    for (let i = 1; i < LOCKOUT_MAX_FAILURES; i += 1) {
      record = registerLockoutFailure(record, T0 + i * 1_000);
    }
    expect(record.lockedUntil).toBe(T0 + 4_000 + LOCKOUT_LOCK_MS);
    const decision = evaluateLockout(record, T0 + 5_000);
    expect(decision.locked).toBe(true);
    expect(decision.retryAfterMs).toBe(LOCKOUT_LOCK_MS - 1_000);
  });

  it('prunes failures older than the 15-minute window', () => {
    let record = registerLockoutFailure(null, T0);
    for (let i = 1; i < LOCKOUT_MAX_FAILURES; i += 1) {
      record = registerLockoutFailure(record, T0 + i * 1_000);
    }
    const muchLater = T0 + LOCKOUT_WINDOW_MS + 10_000;
    record = registerLockoutFailure(record, muchLater);
    expect(record.lockedUntil).toBeUndefined(); // four old failures pruned → fresh count = 1
    expect(evaluateLockout(record, muchLater).locked).toBe(false);
  });

  it('does not extend an active lock with further failures', () => {
    let record = registerLockoutFailure(null, T0);
    for (let i = 1; i < LOCKOUT_MAX_FAILURES; i += 1) {
      record = registerLockoutFailure(record, T0 + i * 1_000);
    }
    const originalExpiry = record.lockedUntil;
    record = registerLockoutFailure(record, T0 + 10_000);
    expect(record.lockedUntil).toBe(originalExpiry);
  });

  it('clears the lock and resets failure state at expiry (caller must reset)', () => {
    let record = registerLockoutFailure(null, T0);
    for (let i = 1; i < LOCKOUT_MAX_FAILURES; i += 1) {
      record = registerLockoutFailure(record, T0 + i * 1_000);
    }
    const afterExpiry = (record.lockedUntil ?? 0) + 1;
    const decision = evaluateLockout(record, afterExpiry);
    expect(decision.locked).toBe(false);
    expect(decision.expired).toBe(true);

    // A fresh window starts after the reset: pre-expiry failures no longer count.
    const fresh = registerLockoutFailure(null, afterExpiry);
    expect(fresh.lockedUntil).toBeUndefined();
    expect(fresh.failures).toHaveLength(1);
  });

  it('treats a null/undefined record as unlocked', () => {
    expect(evaluateLockout(null, T0)).toEqual({ locked: false, retryAfterMs: 0, expired: false });
    expect(evaluateLockout(undefined, T0)).toEqual({ locked: false, retryAfterMs: 0, expired: false });
  });
});
