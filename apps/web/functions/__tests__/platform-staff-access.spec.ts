/**
 * Phase 4 — platform staff authorization behaviour.
 *
 * The security properties under test, in order of how badly they break if they
 * are wrong:
 *  1. A suspended/revoked operator stays locked out even while still listed in
 *     PLATFORM_ADMIN_EMAILS (the allowlist must not resurrect them).
 *  2. A database we cannot read is a DENY, not an implicit allow.
 *  3. A grant scoped to one organization never satisfies a platform-wide check.
 *  4. The allowlist still bootstraps access when the registry has no row for the
 *     operator (the transition path), and says so via `source`.
 */

import { loadPlatformStaff, requirePlatformStaff } from '../shared/platform-staff';
import { envWith } from '../test-support/harness';
import { FakeSupabase } from '../test-support/fake-supabase';
import { createClient } from '@supabase/supabase-js';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

const OPERATOR = 'operator@ellines.co.ke';
const NOW = Date.parse('2026-09-30T12:00:00Z');
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function grant(capability: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `g-${capability}`,
    capability,
    scope_org_id: '',
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

function staffRow(overrides: Record<string, unknown> = {}, grants: Array<Record<string, unknown>> = []) {
  return {
    id: 'staff-1',
    email: OPERATOR,
    status: 'active',
    expires_at: null,
    revoked_at: null,
    ...overrides,
    platform_staff_grants: grants,
  };
}

describe('loadPlatformStaff', () => {
  let db: FakeSupabase;
  const env = envWith();

  beforeEach(() => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
  });

  it('bootstraps an allowlisted operator that has no registry row yet', async () => {
    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.source).toBe('env_bootstrap');
    expect(context.active).toBe(true);
    expect(context.capabilities).toContain('platform.staff.manage');
    expect(context.staffId).toBeNull();
  });

  it('denies an authenticated user who is neither allowlisted nor in the registry', async () => {
    const context = await loadPlatformStaff(env, 'someone@client.co', NOW);
    expect(context.active).toBe(false);
    expect(context.deniedReason).toBe('not_allowlisted');
    expect(context.capabilities).toEqual([]);
  });

  it('resolves exactly the granted capabilities from the database, scope preserved', async () => {
    db.seed('platform_staff_members', [
      staffRow({}, [
        grant('platform.tenants.read'),
        grant('platform.connectors.manage', { scope_org_id: 'org-1' }),
      ]),
    ]);

    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.source).toBe('database');
    expect(context.staffId).toBe('staff-1');
    expect(context.capabilities).toEqual(['platform.connectors.manage', 'platform.tenants.read']);
    const scoped = context.grants.find((g) => g.capability === 'platform.connectors.manage');
    expect(scoped?.scopeOrgId).toBe('org-1');
  });

  it('does not let the allowlist override a suspended operator', async () => {
    db.seed('platform_staff_members', [staffRow({ status: 'suspended' })]);
    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.active).toBe(false);
    expect(context.deniedReason).toBe('not_active');
    expect(context.capabilities).toEqual([]);
  });

  it('reports a revoked operator as revoked, not merely inactive', async () => {
    db.seed('platform_staff_members', [staffRow({ status: 'revoked', revoked_at: iso(-60) })]);
    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.active).toBe(false);
    expect(context.deniedReason).toBe('revoked');
  });

  it('drops expired grants, so the capability is not presented as held', async () => {
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.tenants.read', { expires_at: iso(-1) })])]);
    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.capabilities).toEqual([]);
    expect(context.active).toBe(false);
    expect(context.deniedReason).toBe('no_capabilities');
  });

  it('fails closed when the registry cannot be read, even for an allowlisted operator', async () => {
    db.failTable('platform_staff_members', 'connection reset');
    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.active).toBe(false);
    expect(context.lookupFailed).toBe(true);
    expect(context.deniedReason).toBe('lookup_failed');
  });

  it('still bootstraps when the registry table does not exist yet', async () => {
    db.failTable('platform_staff_members', 'relation "platform_staff_members" does not exist');
    const context = await loadPlatformStaff(env, OPERATOR, NOW);
    expect(context.active).toBe(true);
    expect(context.source).toBe('env_bootstrap');
  });
});

describe('requirePlatformStaff', () => {
  let db: FakeSupabase;
  const env = envWith();

  beforeEach(() => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
  });

  it('returns 403 (not data) for a non-operator', async () => {
    const result = await requirePlatformStaff(
      env,
      { email: 'someone@client.co' },
      'platform.staff.manage',
      null,
      NOW,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it('refuses a capability that is only granted for one organization', async () => {
    db.seed('platform_staff_members', [
      staffRow({}, [grant('platform.tenants.read', { scope_org_id: 'org-1' })]),
    ]);

    const scoped = await requirePlatformStaff(env, { email: OPERATOR }, 'platform.tenants.read', 'org-1', NOW);
    expect(scoped).not.toBeInstanceOf(Response);

    const platformWide = await requirePlatformStaff(
      env,
      { email: OPERATOR },
      'platform.tenants.read',
      null,
      NOW,
    );
    expect(platformWide).toBeInstanceOf(Response);
    expect((platformWide as Response).status).toBe(403);
  });

  it('requires the specific capability, not merely platform membership', async () => {
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.tenants.read')])]);

    const denied = await requirePlatformStaff(
      env,
      { email: OPERATOR },
      'platform.staff.manage',
      null,
      NOW,
    );
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);
  });
});
