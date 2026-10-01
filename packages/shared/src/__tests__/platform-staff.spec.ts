/**
 * Phase 4 — platform staff access decisions.
 *
 * These tests are the reason the decision logic is pure: suspension, expiry,
 * scope and revocation are the parts that must never be "approximately right".
 */

import {
  PLATFORM_STAFF_CAPABILITIES,
  isPlatformStaffActive,
  isPlatformStaffGrantActive,
  normalizePlatformStaffEmail,
  platformStaffCan,
  resolvePlatformStaffCapabilities,
  summarisePlatformStaffAccess,
  type PlatformStaffRecord,
} from '../platform-staff';
import { getOperation, operationRequiresReason, operationSupportsDryRun } from '../safeguards';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const ISO = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();

function staff(overrides: Partial<PlatformStaffRecord> = {}): PlatformStaffRecord {
  return {
    status: 'active',
    expiresAt: null,
    revokedAt: null,
    grants: [{ capability: 'platform.tenants.read', scopeOrgId: '', expiresAt: null, revokedAt: null }],
    ...overrides,
  };
}

describe('platform staff capability resolution', () => {
  it('resolves a platform-wide grant for an active operator', () => {
    expect(resolvePlatformStaffCapabilities(staff(), NOW)).toEqual(['platform.tenants.read']);
    expect(summarisePlatformStaffAccess(staff(), NOW)).toEqual({
      active: true,
      capabilities: ['platform.tenants.read'],
      denialReason: null,
    });
  });

  it('fails closed for absent, suspended and revoked staff', () => {
    expect(resolvePlatformStaffCapabilities(null, NOW)).toEqual([]);
    expect(resolvePlatformStaffCapabilities(undefined, NOW)).toEqual([]);
    expect(summarisePlatformStaffAccess(null, NOW).denialReason).toBe('no_staff_row');

    const suspended = staff({ status: 'suspended' });
    expect(resolvePlatformStaffCapabilities(suspended, NOW)).toEqual([]);
    expect(summarisePlatformStaffAccess(suspended, NOW).denialReason).toBe('not_active');

    const revoked = staff({ status: 'revoked', revokedAt: ISO(-60) });
    expect(resolvePlatformStaffCapabilities(revoked, NOW)).toEqual([]);
    expect(summarisePlatformStaffAccess(revoked, NOW).denialReason).toBe('revoked');
  });

  it('treats a past staff expiry as no access and a future one as still valid', () => {
    expect(resolvePlatformStaffCapabilities(staff({ expiresAt: ISO(-1) }), NOW)).toEqual([]);
    expect(summarisePlatformStaffAccess(staff({ expiresAt: ISO(-1) }), NOW).denialReason).toBe('expired');
    // Exactly at the boundary the access is already gone (<= now).
    expect(isPlatformStaffActive(staff({ expiresAt: ISO(0) }), NOW)).toBe(false);
    expect(isPlatformStaffActive(staff({ expiresAt: ISO(1) }), NOW)).toBe(true);
  });

  it('drops revoked, expired and unreadable-expiry grants but keeps the valid ones', () => {
    const record = staff({
      grants: [
        { capability: 'platform.tenants.read', scopeOrgId: '', expiresAt: null, revokedAt: null },
        { capability: 'platform.audit.read', scopeOrgId: '', expiresAt: ISO(-5), revokedAt: null },
        { capability: 'platform.security.manage', scopeOrgId: '', expiresAt: null, revokedAt: ISO(-5) },
        // Unreadable expiry is not "no expiry" — we cannot prove validity.
        { capability: 'platform.settings.manage', scopeOrgId: '', expiresAt: 'not-a-date', revokedAt: null },
      ],
    });
    expect(resolvePlatformStaffCapabilities(record, NOW)).toEqual(['platform.tenants.read']);
    expect(
      isPlatformStaffGrantActive({ capability: 'platform.tenants.read', expiresAt: 'not-a-date' }, NOW),
    ).toBe(false);
  });

  it('ignores capability strings that are not in the known set', () => {
    const record = staff({
      grants: [
        { capability: 'platform.root.everything', scopeOrgId: '' },
        { capability: 'platform.tenants.read', scopeOrgId: '' },
      ],
    });
    expect(resolvePlatformStaffCapabilities(record, NOW)).toEqual(['platform.tenants.read']);
  });

  it('reads zone-less database timestamps as UTC, not as host local time', () => {
    // Postgres returns `timestamp without time zone` verbatim; a UTC+3 host
    // reading this as local would see an expiry three hours in the future.
    const zonelessExpiry = '2026-09-30 11:30:00';
    expect(isPlatformStaffActive(staff({ expiresAt: zonelessExpiry }), NOW)).toBe(false);
    expect(isPlatformStaffActive(staff({ expiresAt: '2026-09-30 12:30:00' }), NOW)).toBe(true);
  });

  it('scopes grants to a single organization without widening them', () => {
    const scoped = staff({
      grants: [{ capability: 'platform.tenants.read', scopeOrgId: 'org-1' }],
    });
    expect(platformStaffCan(scoped, 'platform.tenants.read', NOW, 'org-1')).toBe(true);
    expect(platformStaffCan(scoped, 'platform.tenants.read', NOW, 'org-2')).toBe(false);
    // No org passed → only platform-wide grants count.
    expect(platformStaffCan(scoped, 'platform.tenants.read', NOW)).toBe(false);

    const platformWide = staff();
    expect(platformStaffCan(platformWide, 'platform.tenants.read', NOW, 'org-9')).toBe(true);
    expect(platformStaffCan(platformWide, 'platform.tenants.manage', NOW, 'org-9')).toBe(false);
  });
});

describe('platform staff registry contract', () => {
  it('normalises emails for storage and allowlist comparison', () => {
    expect(normalizePlatformStaffEmail('  Operator@Ellines.co.ke ')).toBe('operator@ellines.co.ke');
    expect(normalizePlatformStaffEmail(null)).toBe('');
  });

  it('declares every staff operation with reason, confirmation, audit and result capture', () => {
    for (const id of [
      'platform.staff.invite',
      'platform.staff.grant',
      'platform.staff.revoke',
      'platform.staff.bootstrap',
    ]) {
      const op = getOperation(id);
      expect(op).toBeDefined();
      expect(op?.operationClass).toBe('C-5');
      expect(op?.safeguards.safeguards).toEqual(
        expect.arrayContaining(['reason_required', 'confirmation_required', 'audit_always', 'result_enforced']),
      );
      expect(operationRequiresReason(id)).toBe(true);
    }
  });

  it('advertises dry-run only where the endpoint implements it', () => {
    expect(operationSupportsDryRun('platform.staff.bootstrap')).toBe(true);
    expect(operationSupportsDryRun('platform.staff.revoke')).toBe(false);
    expect(operationSupportsDryRun('platform.staff.grant')).toBe(false);
  });

  it('keeps the capability list aligned with the staff-management surface', () => {
    expect(PLATFORM_STAFF_CAPABILITIES).toContain('platform.staff.manage');
    expect(PLATFORM_STAFF_CAPABILITIES).toContain('platform.audit.read');
  });
});
