/**
 * Phase 2 authorization regression tests for the server-side membership resolver.
 *
 * Covers: membership truth wins over token claims, inactive membership fails closed, the
 * transitional primary-org fallback keeps users without a membership row working (migration
 * 0002 pending) WITHOUT allowing cross-tenant access, and custom-role resolution.
 */

import { createClient } from '@supabase/supabase-js';
import { canByRole, checkPermission, normalizePermission, requireAuth } from './auth';
import { matchPermission } from '@ellines-eip/shared';
import { FakeSupabase } from '../test-support/fake-supabase';
import {
  ORG_A,
  ORG_B,
  TEST_ENV,
  bearer,
  makeToken,
  seedTenant,
  type TestEnv,
} from '../test-support/harness';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/orgs/me', { headers });
}

async function resolve(headers: Record<string, string>, env: TestEnv = TEST_ENV) {
  return requireAuth(env, request(headers));
}

describe('requireAuth — membership truth with primary-org compatibility', () => {
  let db: FakeSupabase;

  beforeEach(() => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
  });

  it('rejects a request with no bearer token without touching the database', async () => {
    const result = await resolve({});
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects an unverifiable token', async () => {
    const result = await resolve(bearer('not-a-real-token'));
    expect((result as Response).status).toBe(401);
    expect(db.callsTo('organization_memberships')).toHaveLength(0);
  });

  it('takes organization and role from the membership row, not the token claim', async () => {
    seedTenant(db, {
      userId: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'admin',
    });

    const token = await makeToken({
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
    });
    const result = await resolve(bearer(token));

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ sub: 'u1', organizationId: ORG_A, role: 'admin' });
  });

  it('fails closed when the membership row is inactive, even if the user record is active', async () => {
    seedTenant(db, {
      userId: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
      membership: 'inactive',
    });

    const token = await makeToken({
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
    });
    const result = await resolve(bearer(token));

    expect((result as Response).status).toBe(401);
  });

  it('resolves the primary org for users with no membership row yet (no lockout before backfill)', async () => {
    seedTenant(db, {
      userId: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
      membership: 'absent',
    });

    const token = await makeToken({
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
    });
    const result = await resolve(bearer(token));

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ organizationId: ORG_A, role: 'owner' });
  });

  it('refuses the fallback when the token organization is not the user primary org', async () => {
    seedTenant(db, {
      userId: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
      membership: 'absent',
    });
    db.seed('audit_logs', [
      { id: 'b-1', organization_id: ORG_B, action: 'org.settings.update', metadata: { secretOfB: true } },
    ]);

    const token = await makeToken({
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_B,
      role: 'owner',
    });
    const result = await resolve(bearer(token));

    expect((result as Response).status).toBe(401);
    expect(db.callsTo('audit_logs', 'select')).toHaveLength(0);
  });

  it('rejects an inactive user', async () => {
    db.seed('users', [
      {
        id: 'u1',
        email: 'owner@example.com',
        is_active: false,
        organization_id: ORG_A,
        role: 'owner',
      },
    ]);

    const token = await makeToken({
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
    });
    const result = await resolve(bearer(token));

    expect((result as Response).status).toBe(401);
  });

  it('fails closed when the membership lookup itself errors', async () => {
    seedTenant(db, { userId: 'u1', email: 'owner@example.com', organizationId: ORG_A });
    db.failTable('organization_memberships', 'connection reset');

    const token = await makeToken({
      sub: 'u1',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
    });
    const result = await resolve(bearer(token));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it('resolves custom-role permissions through membership and denies when membership is missing', async () => {
    seedTenant(db, {
      userId: 'u1',
      email: 'analyst@example.com',
      organizationId: ORG_A,
      role: 'viewer',
      customRoleId: 'role-analyst',
    });
    db.seed('custom_roles', [
      { id: 'role-analyst', is_active: true, permissions: [{ permission: 'report:run' }] },
    ]);

    await expect(checkPermission(TEST_ENV, 'u1', ORG_A, 'viewer', 'report:run')).resolves.toBe(true);
    await expect(checkPermission(TEST_ENV, 'u1', ORG_A, 'viewer', 'org:update')).resolves.toBe(false);

    // No membership row => no custom-role binding => deny (documented G-15 behaviour).
    const orphan = new FakeSupabase();
    mockedCreateClient.mockReturnValue(orphan);
    await expect(checkPermission(TEST_ENV, 'u1', ORG_A, 'owner', 'report:run')).resolves.toBe(false);
  });

});

describe('unified permission grammar (§12.2) — G-15 authorization regression', () => {
  it('normalizePermission accepts canonical dotted platform grants', () => {
    expect(normalizePermission('platform.tenants:create')).toBe('platform.tenants:create');
    expect(normalizePermission('platform.*:read')).toBe('platform.*:read');
    expect(normalizePermission('connector:*')).toBe('connector:*');
    expect(normalizePermission('*')).toBe('*');
  });

  it('normalizePermission fails closed on action-less and partial-wildcard grants (rules 4–5)', () => {
    expect(normalizePermission('platform.tenants')).toBeNull(); // action-less
    expect(normalizePermission('platform.*')).toBeNull(); // action-less
    expect(normalizePermission('platform.ten*:read')).toBeNull(); // partial segment wildcard
    expect(normalizePermission('connector:')).toBeNull();
    expect(normalizePermission('')).toBeNull();
  });

  it('canByRole evaluates dotted platform grants through the shared matcher', () => {
    expect(
      canByRole('member', 'platform.tenants:create', undefined, [
        { permission: 'platform.tenants:create' },
      ]),
    ).toBe(true);
    expect(
      canByRole('member', 'platform.tenants:read', undefined, [
        { permission: 'platform.*:read' },
      ]),
    ).toBe(true);
    expect(
      canByRole('member', 'platform.audit:read', undefined, [
        { permission: 'platform.*:read' },
      ]),
    ).toBe(true);
  });

  it('rule 6: narrower grants never match broader targets (no implicit prefix matching)', () => {
    expect(
      canByRole('member', 'platform.tenants.export:read', undefined, [
        { permission: 'platform.tenants:read' },
      ]),
    ).toBe(false);
  });

  it('rule 4: invalid grants match nothing (fail closed, never prefix-matched)', () => {
    expect(
      canByRole('member', 'platform.tenants:read', undefined, [
        { permission: 'platform.*' },
      ]),
    ).toBe(false);
    expect(
      canByRole('member', 'platform.tenants:read', undefined, [
        { permission: 'platform.tenants' },
      ]),
    ).toBe(false);
  });

  it('keeps fixed-role vocabulary behaviour intact', () => {
    expect(canByRole('owner', 'platform.tenants:create')).toBe(true); // bare *
    expect(canByRole('admin', 'connector:install')).toBe(true);
    expect(canByRole('admin', 'platform.tenants:create')).toBe(false); // not in admin's fixed grants
    expect(canByRole('viewer', 'connector:install')).toBe(false);
    expect(canByRole('member', 'org:view')).toBe(true);
  });

  it('resource-ID scope (§12.3) still applies after the string match', () => {
    const custom = [{ permission: 'connector:read', resources: ['c1'] }];
    expect(canByRole('member', 'connector:read', 'c1', custom)).toBe(true);
    expect(canByRole('member', 'connector:read', 'c99', custom)).toBe(false);
    expect(canByRole('member', 'connector:read', undefined, custom)).toBe(true);
  });

  it('the shared matcher (used by both backends) agrees with normalizePermission', () => {
    expect(matchPermission('platform.*:read', 'platform.tenants:read')).toBe(true);
    expect(matchPermission('platform.*', 'platform.tenants:read')).toBe(false);
    expect(matchPermission('connector:*', 'connector:install')).toBe(true);
    expect(matchPermission('*', 'org:view')).toBe(true);
  });
});
