/**
 * Connector capability authorization — END-TO-END enforcement (spec section 4).
 *
 * Drives the REAL `POST /api/v1/connectors/proxy` handler and asserts that the
 * capability gate is actually enforced on the request path, not merely present
 * as an unused utility. A connector that declares only READ must not be able to
 * issue a write against the source system, even for an Owner with full
 * connector permissions.
 */

import { createClient } from '@supabase/supabase-js';
import { onRequest as connectorProxy } from '../api/v1/connectors/proxy';
import { FakeSupabase } from '../test-support/fake-supabase';
import { ORG_A, bearer, context, envWith, jsonRequest, makeToken, seedTenant } from '../test-support/harness';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

const PROXY_URL = 'http://localhost/api/v1/connectors/proxy';
const SAFE_TARGET = 'https://api.example.com/data';

let db: FakeSupabase;

function seedInstallation(config: Record<string, unknown>, id = 'inst-1') {
  db.seed('connector_installations', [
    {
      id,
      organization_id: ORG_A,
      catalog_id: 'rest-api',
      display_name: 'Example',
      config,
      status: 'synced',
    },
  ]);
}

async function callProxy(body: Record<string, unknown>, role = 'owner') {
  const token = await makeToken({
    sub: `user-${role}`,
    email: `${role}@example.com`,
    organizationId: ORG_A,
    role,
  });
  const res = await connectorProxy(
    context(jsonRequest(PROXY_URL, body, bearer(token)), envWith()),
  );
  return res;
}

beforeEach(() => {
  db = new FakeSupabase();
  mockedCreateClient.mockReturnValue(db);
  seedTenant(db, { userId: 'user-owner', email: 'owner@example.com', organizationId: ORG_A, role: 'owner' });
});

/** The proxy must never reach the network in these tests. */
beforeEach(() => {
  (globalThis as any).fetch = jest.fn(() => {
    throw new Error('network must not be reached in capability tests');
  });
});

describe('connector proxy — capability authorization', () => {
  it('DENIES a DELETE when the connector declares READ/SYNC only', async () => {
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ', 'SYNC'] });
    const res = await callProxy({ installationId: 'inst-1', method: 'DELETE' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    // The effective set is READ/SYNC, so DELETE is not in it.
    expect(['connector', 'permission']).toContain(body.deniedBy);
    expect(body.message).toMatch(/DELETE/i);
  });

  it('DENIES a POST when the connector declares READ only', async () => {
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ'] });
    const res = await callProxy({ installationId: 'inst-1', method: 'POST', body: '{"x":1}' });
    expect(res.status).toBe(403);
  });

  it('DENIES a write when the connector declares NO capabilities at all (fail closed)', async () => {
    seedInstallation({ endpoint: SAFE_TARGET });
    const res = await callProxy({ installationId: 'inst-1', method: 'PUT', body: '{"x":1}' });
    expect(res.status).toBe(403);
  });

  it('a READ-only connector cannot be escalated by a user requesting write capabilities inline', async () => {
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ'] });
    // The client cannot widen the connector's declared capability set.
    const res = await callProxy({
      installationId: 'inst-1',
      method: 'POST',
      body: '{}',
      capabilities: ['READ', 'CREATE', 'DELETE'],
    });
    expect(res.status).toBe(403);
  });

  it('allows a read when the connector declares READ', async () => {
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ', 'SYNC'] });
    const res = await callProxy({ installationId: 'inst-1', method: 'GET' });
    // It gets past the capability gate — the failure then comes from the
    // deliberately network-less fetch, never from a 403 capability denial.
    expect(res.status).not.toBe(403);
  });

  it('allows a DELETE when the connector explicitly declares DELETE', async () => {
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ', 'DELETE'] });
    const res = await callProxy({ installationId: 'inst-1', method: 'DELETE' });
    expect(res.status).not.toBe(403);
  });

  it('rejects an unsupported HTTP method outright', async () => {
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ', 'CREATE', 'UPDATE', 'DELETE'] });
    const res = await callProxy({ installationId: 'inst-1', method: 'TRACE' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-org-admin caller before any capability evaluation', async () => {
    // Seed a real member so requireAuth succeeds and the failure is the
    // authorization gate (403), not a missing-session 401.
    seedTenant(db, { userId: 'user-member', email: 'member@example.com', organizationId: ORG_A, role: 'member' });
    seedInstallation({ endpoint: SAFE_TARGET, capabilities: ['READ', 'DELETE'] });
    const res = await callProxy({ installationId: 'inst-1', method: 'GET' }, 'member');
    expect(res.status).toBe(403);
  });
});
