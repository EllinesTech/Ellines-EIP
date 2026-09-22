/**
 * Phase 2 tenant-isolation and negative-authorization suite (spec 36.1, 33.2, 20.7).
 *
 * Drives real Pages Function handlers against the service-role fake and asserts that a tenant
 * token can never reach another tenant's rows, that unauthorized actors get 401/403 with NO
 * data, and that the synthetic `ellines-platform` org stays out of platform metrics.
 */

import { createClient } from '@supabase/supabase-js';
import { onRequest as tenantAuditLogs } from '../api/v1/orgs/me/audit-logs';
import { onRequest as createChild } from '../api/v1/orgs/me/create-child';
import { onRequest as platformAuditLogs } from '../api/v1/platform/audit-logs';
import { onRequest as platformMetrics } from '../api/v1/platform/metrics';
import { FakeSupabase } from '../test-support/fake-supabase';
import {
  ORG_A,
  ORG_B,
  ORG_PLATFORM,
  PLATFORM_OPERATOR_EMAIL,
  bearer,
  context,
  envWith,
  jsonRequest,
  makeToken,
} from '../test-support/harness';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

const TENANT_AUDIT_URL = 'http://localhost/api/v1/orgs/me/audit-logs';
const CREATE_CHILD_URL = 'http://localhost/api/v1/orgs/me/create-child';
const PLATFORM_AUDIT_URL = 'http://localhost/api/v1/platform/audit-logs';
const PLATFORM_METRICS_URL = 'http://localhost/api/v1/platform/metrics';

function seedSharedData(db: FakeSupabase): void {
  db.seed('users', [
    { id: 'user-a', email: 'owner-a@example.com', is_active: true, organization_id: ORG_A, role: 'owner' },
    { id: 'user-b', email: 'owner-b@example.com', is_active: true, organization_id: ORG_B, role: 'owner' },
    { id: 'operator', email: PLATFORM_OPERATOR_EMAIL, is_active: true, organization_id: ORG_PLATFORM, role: 'owner' },
  ]);
  db.seed('organization_memberships', [
    { id: 'm-a', user_id: 'user-a', organization_id: ORG_A, role: 'owner', custom_role_id: null, is_active: true },
    { id: 'm-b', user_id: 'user-b', organization_id: ORG_B, role: 'owner', custom_role_id: null, is_active: true },
    { id: 'm-op', user_id: 'operator', organization_id: ORG_PLATFORM, role: 'owner', custom_role_id: null, is_active: true },
  ]);
  db.seed('organizations', [
    { id: ORG_A, name: 'Alpha Ltd', slug: 'alpha', settings: {} },
    { id: ORG_B, name: 'Beta Ltd', slug: 'beta', settings: {} },
    { id: ORG_PLATFORM, name: 'Ellines EIP Platform', slug: 'ellines-platform', settings: { systemTenant: true } },
  ]);
  db.seed('audit_logs', [
    {
      id: 'a-1', organization_id: ORG_A, user_id: 'user-a', action: 'org.settings.update',
      resource: 'settings', metadata: { marker: 'alpha-only' }, created_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'a-2', organization_id: ORG_B, user_id: 'user-b', action: 'org.settings.update',
      resource: 'settings', metadata: { marker: 'beta-only' }, created_at: '2026-09-02T10:00:00.000Z',
    },
  ]);
  db.seed('connector_installations', []);
  db.seed('enterprise_snapshots', []);
  db.seed('api_usage', []);
  db.seed('rate_limit_violations', []);
}

async function tenantAToken() {
  return makeToken({
    sub: 'user-a',
    email: 'owner-a@example.com',
    organizationId: ORG_A,
    role: 'owner',
  });
}

async function platformToken() {
  return makeToken({
    sub: 'operator',
    email: PLATFORM_OPERATOR_EMAIL,
    organizationId: ORG_PLATFORM,
    role: 'owner',
  });
}

describe('Phase 2 tenant isolation and negative authorization', () => {
  let db: FakeSupabase;

  beforeEach(() => {
    db = new FakeSupabase();
    seedSharedData(db);
    mockedCreateClient.mockReturnValue(db);
  });

  it('returns 401 and reads nothing when no token is presented', async () => {
    const res = await tenantAuditLogs(context(new Request(TENANT_AUDIT_URL), envWith()));
    expect(res.status).toBe(401);
    expect(db.callsTo('audit_logs', 'select')).toHaveLength(0);
  });

  it('scopes tenant audit reads to the caller organization and leaks nothing cross-tenant', async () => {
    const token = await tenantAToken();
    const res = await tenantAuditLogs(
      context(new Request(TENANT_AUDIT_URL, { headers: bearer(token) }), envWith()),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ metadata: Record<string, unknown> }>;
    expect(body).toHaveLength(1);
    expect(body[0].metadata.marker).toBe('alpha-only');
    expect(JSON.stringify(body)).not.toContain('beta-only');

    for (const call of db.callsTo('audit_logs', 'select')) {
      expect(call.filters).toContainEqual({
        column: 'organization_id',
        operator: 'eq',
        value: ORG_A,
      });
    }
  });

  it('refuses a token whose organization does not match the user primary org', async () => {
    const forged = await makeToken({
      sub: 'user-a',
      email: 'owner-a@example.com',
      organizationId: ORG_B,
      role: 'owner',
    });
    const res = await tenantAuditLogs(
      context(new Request(TENANT_AUDIT_URL, { headers: bearer(forged) }), envWith()),
    );

    expect(res.status).toBe(401);
    expect(db.callsTo('audit_logs', 'select')).toHaveLength(0);
  });

  it('gives a second tenant only its own rows (scoping follows the token, not the request)', async () => {
    const token = await makeToken({
      sub: 'user-b',
      email: 'owner-b@example.com',
      organizationId: ORG_B,
      role: 'owner',
    });
    const res = await tenantAuditLogs(
      context(new Request(TENANT_AUDIT_URL, { headers: bearer(token) }), envWith()),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ metadata: Record<string, unknown> }>;
    expect(body[0].metadata.marker).toBe('beta-only');
    expect(JSON.stringify(body)).not.toContain('alpha-only');
  });

  it('denies a tenant token on the cross-tenant platform audit surface', async () => {
    const token = await tenantAToken();
    const res = await platformAuditLogs(
      context(new Request(PLATFORM_AUDIT_URL, { headers: bearer(token) }), envWith()),
    );

    expect(res.status).toBe(403);
    expect(db.callsTo('audit_logs')).toHaveLength(0);
  });

  it('denies a platform operator whose membership is inactive (negative authorization)', async () => {
    db.seed('organization_memberships', [
      { id: 'm-op', user_id: 'operator', organization_id: ORG_PLATFORM, role: 'owner', custom_role_id: null, is_active: false },
    ]);
    const token = await platformToken();
    const res = await platformMetrics(
      context(new Request(PLATFORM_METRICS_URL, { headers: bearer(token) }), envWith()),
    );

    expect(res.status).toBe(401);
    expect(db.callsTo('organizations', 'select')).toHaveLength(0);
  });

  it('excludes the synthetic ellines-platform org from platform metrics (spec 20.7)', async () => {
    const token = await platformToken();
    const res = await platformMetrics(
      context(new Request(PLATFORM_METRICS_URL, { headers: bearer(token) }), envWith()),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { platform: { businesses: number } };
    // 3 seeded orgs minus the synthetic platform org.
    expect(body.platform.businesses).toBe(2);
    expect(db.callsTo('organizations', 'select')[0].filters).toContainEqual({
      column: 'slug',
      operator: 'neq',
      value: 'ellines-platform',
    });
  });

  it('creates a child org under the actor organization, ignoring any body organizationId', async () => {
    const token = await tenantAToken();
    const res = await createChild(
      context(
        jsonRequest(CREATE_CHILD_URL, { name: 'Alpha Subsidiary', organizationId: ORG_B }, bearer(token)),
        envWith(),
      ),
    );

    expect(res.status).toBe(200);
    const created = (await res.json()) as { id: string; parentOrgId: string };
    expect(created.parentOrgId).toBe(ORG_A);

    const orgInsert = db.callsTo('organizations', 'insert')[0].payload as Record<string, unknown>;
    expect(orgInsert).toMatchObject({ name: 'Alpha Subsidiary', parent_org_id: ORG_A });

    const membershipInsert = db.callsTo('organization_memberships', 'insert')[0]
      .payload as Record<string, unknown>;
    expect(membershipInsert).toMatchObject({
      user_id: 'user-a',
      organization_id: created.id,
      role: 'owner',
    });
    expect(db.rows('organizations').some((row) => row.parent_org_id === ORG_B)).toBe(false);
  });

  it('refuses child-org creation for a non-owner member', async () => {
    db.seed('organization_memberships', [
      { id: 'm-a', user_id: 'user-a', organization_id: ORG_A, role: 'member', custom_role_id: null, is_active: true },
    ]);
    const token = await tenantAToken();
    const res = await createChild(
      context(jsonRequest(CREATE_CHILD_URL, { name: 'Nope Inc' }, bearer(token)), envWith()),
    );

    expect(res.status).toBe(403);
    expect(db.callsTo('organizations', 'insert')).toHaveLength(0);
  });
});
