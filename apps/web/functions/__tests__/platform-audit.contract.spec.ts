/**
 * Phase 2 contract tests — G-12 audit coverage for platform endpoints.
 *
 * Verifies that platform admin mutation endpoints (flags PATCH, connector-packs
 * POST, audit-logs export) emit audit rows under the platform admin
 * authorization path, per super-admin spec §33 ("Platform UI before...").
 */

import { createClient } from '@supabase/supabase-js';
import { onRequest as flagsOnRequest } from '../api/v1/platform/flags';
import { onRequest as connectorPacksOnRequest } from '../api/v1/platform/connector-packs';
import { onRequest as auditLogsOnRequest } from '../api/v1/platform/audit-logs';
import { makeToken, bearer, envWith, context, seedTenant } from '../test-support/harness';
import { FakeSupabase } from '../test-support/fake-supabase';
import type { TestEnv } from '../test-support/harness';
import type { PagesFunction } from '@cloudflare/workers-types';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

type Fn = PagesFunction<Record<string, unknown>>;

function patch(path: string, token: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function post(path: string, token: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(path: string, token: string) {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: bearer(token),
  });
}

function platformAdminToken(env: TestEnv, sub = 'u-admin') {
  return makeToken(
    {
      sub,
      email: 'operator@ellines.co.ke',
      organizationId: 'org-platform',
      role: 'platform-admin',
    },
    env,
  );
}

function countAuditRows(db: FakeSupabase, action: string): number {
  const rows = (db.tables.audit_logs as Array<Record<string, unknown>>) || [];
  return rows.filter((r) => r.action === action).length;
}

async function runTestCase(
  label: string,
  fn: Fn,
  req: Request,
  env: TestEnv,
  db: FakeSupabase,
  expectStatus: number,
  expectAuditAction: string | null,
) {
  const before = expectAuditAction ? countAuditRows(db, expectAuditAction) : 0;
  const response = await fn(context(req, env) as unknown as Parameters<Fn>[0]);
  expect(response.status).toBe(expectStatus);

  if (expectAuditAction && response.status >= 200 && response.status < 300) {
    const after = countAuditRows(db, expectAuditAction);
    expect(after).toBeGreaterThan(before);
  }
  return response;
}

describe('platform audit contract (G-12)', () => {
  let env: TestEnv;
  let db: FakeSupabase;

  beforeEach(() => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
    env = envWith();

    seedTenant(db, {
      userId: 'u-admin',
      email: 'operator@ellines.co.ke',
      organizationId: 'org-platform',
      role: 'platform-admin',
    });

    // Seed non-admin user — push to existing tables (db.seed replaces)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users as any[]).push({
      id: 'u-user',
      email: 'user@ellines.co.ke',
      is_active: true,
      organization_id: 'org-platform',
      role: 'viewer',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.organization_memberships as any[]).push({
      id: 'u-user_membership',
      user_id: 'u-user',
      organization_id: 'org-platform',
      role: 'viewer',
      is_active: true,
    });
  });

  it('flags: platform admin toggle emits an audit row', async () => {
    const token = await platformAdminToken(env);
    await runTestCase(
      'flags toggle',
      flagsOnRequest,
      patch('/api/v1/platform/flags', token, { key: 'sso_login', enabled: false, reason: 'G-12 contract test' }),
      env,
      db,
      200,
      'platform.feature_flag.update',
    );
  });

  it('flags: non-platform-admin is denied (no audit event)', async () => {
    const token = await makeToken(
      {
        sub: 'u-user',
        email: 'user@ellines.co.ke',
        organizationId: 'org-platform',
        role: 'viewer',
      },
      env,
    );
    await runTestCase(
      'flags denied',
      flagsOnRequest,
      patch('/api/v1/platform/flags', token, { key: 'sso_login', enabled: false, reason: 'denied-path probe' }),
      env,
      db,
      403,
      null,
    );
  });

  it('connector-packs: platform admin creation emits an audit row', async () => {
    const token = await platformAdminToken(env);
    await runTestCase(
      'connector pack create',
      connectorPacksOnRequest,
      post('/api/v1/platform/connector-packs', token, {
        slug: 'g12-test-pack',
        name: 'G12 Test Pack',
        catalogId: 'catalog-test',
        templateConfig: {},
        published: true,
        reason: 'G-12 contract test',
      }),
      env,
      db,
      201,
      'platform.connector_pack.create',
    );
  });

  it('connector-packs: non-platform-admin is denied (no audit event)', async () => {
    const token = await makeToken(
      {
        sub: 'u-user',
        email: 'user@ellines.co.ke',
        organizationId: 'org-platform',
        role: 'viewer',
      },
      env,
    );
    await runTestCase(
      'connector packs denied',
      connectorPacksOnRequest,
      post('/api/v1/platform/connector-packs', token, {
        slug: 'g12-test-pack',
        name: 'G12 Test Pack',
        catalogId: 'catalog-test',
        templateConfig: {},
        published: true,
      }),
      env,
      db,
      403,
      null,
    );
  });

  it('audit-logs: platform admin export emits an audit event', async () => {
    const token = await platformAdminToken(env);
    await runTestCase(
      'audit logs export',
      auditLogsOnRequest,
      get('/api/v1/platform/audit-logs?format=csv', token),
      env,
      db,
      200,
      'platform.audit.export',
    );
  });

  it('audit-logs: non-platform-admin is denied (no audit event)', async () => {
    const token = await makeToken(
      {
        sub: 'u-user',
        email: 'user@ellines.co.ke',
        organizationId: 'org-platform',
        role: 'viewer',
      },
      env,
    );
    await runTestCase(
      'audit logs denied',
      auditLogsOnRequest,
      get('/api/v1/platform/audit-logs?format=csv', token),
      env,
      db,
      403,
      null,
    );
  });
});