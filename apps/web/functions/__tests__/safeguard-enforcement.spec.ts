/**
 * Phase 3 contract tests — safeguard enforcement (reason capture) on privileged
 * platform operations (spec §9.1/§9.3 operation-class registry).
 *
 * These are behavioural tests against the real handlers: a privileged mutation that
 * carries no reason must be refused before it touches data, and an accepted reason must
 * land on the audit row. They also pin the registry invariant that every
 * `reason_required` operation documents a reason placeholder for the UI.
 */

import { createClient } from '@supabase/supabase-js';
import { OPERATION_REGISTRY, operationRequiresReason } from '@ellines-eip/shared';
import { onRequest as flagsOnRequest } from '../api/v1/platform/flags';
import { onRequest as packagesOnRequest } from '../api/v1/platform/packages';
import { onRequest as packageItemOnRequest } from '../api/v1/platform/packages/[id]';
import {
  onRequest as packsOnRequest,
  onItemRequest as packItemOnRequest,
} from '../api/v1/platform/connector-packs';
import { makeToken, bearer, envWith, context, seedTenant } from '../test-support/harness';
import { FakeSupabase } from '../test-support/fake-supabase';
import type { TestEnv } from '../test-support/harness';
import type { PagesFunction } from '@cloudflare/workers-types';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

type Fn = PagesFunction<Record<string, unknown>>;

async function call(
  fn: Fn,
  method: string,
  path: string,
  token: string,
  env: TestEnv,
  body?: unknown,
  params?: Record<string, string>,
): Promise<Response> {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return fn(context(request, env, { params }) as unknown as Parameters<Fn>[0]);
}

function auditInserts(db: FakeSupabase, action: string) {
  return db
    .insertsTo('audit_logs')
    .filter((row) => row.action === action)
    .map((row) => row.metadata as Record<string, unknown>);
}

describe('safeguard enforcement — reason capture (Phase 3)', () => {
  let env: TestEnv;
  let db: FakeSupabase;
  let token: string;

  beforeEach(async () => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
    env = envWith();
    seedTenant(db, {
      userId: 'u-admin',
      email: 'operator@ellines.co.ke',
      organizationId: 'org-platform',
      role: 'platform-admin',
    });
    token = await makeToken(
      {
        sub: 'u-admin',
        email: 'operator@ellines.co.ke',
        organizationId: 'org-platform',
        role: 'platform-admin',
      },
      env,
    );
  });

  it('flags: PATCH without a reason is refused and writes nothing', async () => {
    const response = await call(
      flagsOnRequest,
      'PATCH',
      '/api/v1/platform/flags',
      token,
      env,
      { key: 'sso_login', enabled: false },
    );

    expect(response.status).toBe(400);
    expect(db.callsTo('audit_logs', 'insert')).toHaveLength(0);
  });

  it('flags: PATCH with a reason is accepted and the reason reaches the audit row', async () => {
    const response = await call(
      flagsOnRequest,
      'PATCH',
      '/api/v1/platform/flags',
      token,
      env,
      { key: 'sso_login', enabled: false, reason: 'incident response' },
    );

    expect(response.status).toBe(200);
    const [metadata] = auditInserts(db, 'platform.feature_flag.update');
    expect(metadata.reason).toBe('incident response');
  });

  it('packages: POST without a reason is refused before the insert', async () => {
    const response = await call(
      packagesOnRequest,
      'POST',
      '/api/v1/platform/packages',
      token,
      env,
      { name: 'starter', displayName: 'Starter' },
    );

    expect(response.status).toBe(400);
    expect(db.callsTo('rate_limit_tiers', 'insert')).toHaveLength(0);
  });

  it('packages: POST with a reason returns 201 and records the reason', async () => {
    const response = await call(
      packagesOnRequest,
      'POST',
      '/api/v1/platform/packages',
      token,
      env,
      { name: 'starter', displayName: 'Starter', reason: 'new commercial tier' },
    );

    expect(response.status).toBe(201);
    const [metadata] = auditInserts(db, 'platform.package.create');
    expect(metadata.reason).toBe('new commercial tier');
  });


  it('packages: DELETE without a reason is refused and the package survives', async () => {
    db.seed('rate_limit_tiers', [{ id: 'pkg-1', name: 'starter' }]);
    db.seed('organization_tiers', []);

    const response = await call(
      packageItemOnRequest,
      'DELETE',
      '/api/v1/platform/packages/pkg-1',
      token,
      env,
      undefined,
      { id: 'pkg-1' },
    );

    expect(response.status).toBe(400);
    expect(db.rows('rate_limit_tiers')).toHaveLength(1);
  });

  it('packages: DELETE with a reason deletes the package and records the reason', async () => {
    db.seed('rate_limit_tiers', [{ id: 'pkg-1', name: 'starter' }]);
    db.seed('organization_tiers', []);

    const response = await call(
      packageItemOnRequest,
      'DELETE',
      '/api/v1/platform/packages/pkg-1',
      token,
      env,
      { reason: 'superseded by professional' },
      { id: 'pkg-1' },
    );

    expect(response.status).toBe(200);
    expect(db.rows('rate_limit_tiers')).toHaveLength(0);
    const [metadata] = auditInserts(db, 'platform.package.delete');
    expect(metadata.reason).toBe('superseded by professional');
  });


  it('connector packs: POST without a reason is refused before the insert', async () => {
    const response = await call(
      packsOnRequest,
      'POST',
      '/api/v1/platform/connector-packs',
      token,
      env,
      { slug: 'sap-erp', name: 'SAP ERP', catalogId: 'sap' },
    );

    expect(response.status).toBe(400);
    expect(db.callsTo('connector_packs', 'insert')).toHaveLength(0);
  });

  it('connector packs: PATCH publish requires a reason and records it', async () => {
    db.seed('connector_packs', [
      {
        id: 'pack-1',
        slug: 'sap-erp',
        name: 'SAP ERP',
        published: false,
        template_config: {},
        catalog_id: 'sap',
      },
    ]);

    const refused = await call(
      packItemOnRequest,
      'PATCH',
      '/api/v1/platform/connector-packs/pack-1',
      token,
      env,
      { action: 'publish' },
      { id: 'pack-1' },
    );
    expect(refused.status).toBe(400);
    expect(db.rows('connector_packs')[0].published).toBe(false);

    const accepted = await call(
      packItemOnRequest,
      'PATCH',
      '/api/v1/platform/connector-packs/pack-1',
      token,
      env,
      { action: 'publish', reason: 'approved for tenant install' },
      { id: 'pack-1' },
    );
    expect(accepted.status).toBe(200);
    expect(db.rows('connector_packs')[0].published).toBe(true);
    const [metadata] = auditInserts(db, 'platform.connector_pack.publish');
    expect(metadata.reason).toBe('approved for tenant install');
  });

  it('connector packs: DELETE (item route) without a reason leaves the pack intact', async () => {
    db.seed('connector_packs', [
      { id: 'pack-1', slug: 'sap-erp', name: 'SAP ERP', published: true },
    ]);
    db.seed('connector_installations', []);

    const response = await call(
      packItemOnRequest,
      'DELETE',
      '/api/v1/platform/connector-packs/pack-1',
      token,
      env,
      undefined,
      { id: 'pack-1' },
    );

    expect(response.status).toBe(400);
    expect(db.rows('connector_packs')).toHaveLength(1);
  });

  it('registry: every reason-required operation documents a reason placeholder', () => {
    const requiresReason = OPERATION_REGISTRY.filter((op) => operationRequiresReason(op.id));
    expect(requiresReason.length).toBeGreaterThan(0);
    for (const op of requiresReason) {
      expect({ id: op.id, placeholder: Boolean(op.reasonPlaceholder?.trim()) }).toEqual({
        id: op.id,
        placeholder: true,
      });
    }
  });


  it('connector packs: PATCH field update requires a reason and records it', async () => {
    db.seed('connector_packs', [
      { id: 'pack-1', slug: 'sap-erp', name: 'SAP ERP', published: true, template_config: {} },
    ]);

    const refused = await call(
      packItemOnRequest,
      'PATCH',
      '/api/v1/platform/connector-packs/pack-1',
      token,
      env,
      { description: 'ERP integration template' },
      { id: 'pack-1' },
    );
    expect(refused.status).toBe(400);
    expect(db.rows('connector_packs')[0].description).toBeUndefined();

    const accepted = await call(
      packItemOnRequest,
      'PATCH',
      '/api/v1/platform/connector-packs/pack-1',
      token,
      env,
      { description: 'ERP integration template', reason: 'document the pack' },
      { id: 'pack-1' },
    );
    expect(accepted.status).toBe(200);
    expect(db.rows('connector_packs')[0].description).toBe('ERP integration template');
    const [metadata] = auditInserts(db, 'platform.connector_pack.update');
    expect(metadata.reason).toBe('document the pack');
  });

  it('connector packs: DELETE (item route) with a reason deletes the pack and records it', async () => {
    db.seed('connector_packs', [
      { id: 'pack-1', slug: 'sap-erp', name: 'SAP ERP', published: true },
    ]);
    db.seed('connector_installations', []);

    const response = await call(
      packItemOnRequest,
      'DELETE',
      '/api/v1/platform/connector-packs/pack-1',
      token,
      env,
      { reason: 'vendor contract ended' },
      { id: 'pack-1' },
    );

    expect(response.status).toBe(200);
    expect(db.rows('connector_packs')).toHaveLength(0);
    const [metadata] = auditInserts(db, 'platform.connector_pack.delete');
    expect(metadata.reason).toBe('vendor contract ended');
  });

});
