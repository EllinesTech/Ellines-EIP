/**
 * Connector INSTALL path — encryption-at-rest integration (spec Phase 7).
 *
 * Drives the REAL `POST /api/v1/connectors/installations` handler and proves:
 *  1. Credentials are encrypted BEFORE persistence (never stored as plaintext).
 *  2. The response never echoes the secret back.
 *  3. Missing EIP_ENCRYPTION_MASTER_KEY fails CLOSED (no silent plaintext write).
 *  4. Platform-admin gating and targetOrgId gating still hold.
 *
 * This is the requirement "encryption must actually be wired into the connector
 * installation path" — asserted against the real handler, not a utility.
 */

import { createClient } from '@supabase/supabase-js';
import { onRequest as installations } from '../api/v1/connectors/installations';
import { FakeSupabase } from '../test-support/fake-supabase';
import {
  ORG_A,
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

const URL_INSTALL = 'http://localhost/api/v1/connectors/installations';
const MASTER_KEY = 'local-dev-master-key-that-is-long-enough-32b';

let db: FakeSupabase;

beforeEach(() => {
  db = new FakeSupabase();
  mockedCreateClient.mockReturnValue(db);
  // NOTE: `FakeSupabase.seed()` REPLACES a table, so both tenants are seeded in
  // a single call per table — otherwise the second seed wipes the first.
  db.seed('users', [
    { id: 'operator', email: PLATFORM_OPERATOR_EMAIL, is_active: true, organization_id: 'org-platform', role: 'owner' },
    { id: 'user-owner', email: 'owner@example.com', is_active: true, organization_id: ORG_A, role: 'owner' },
  ]);
  db.seed('organizations', [
    { id: 'org-platform', name: 'Ellines', slug: 'ellines', settings: {} },
    { id: ORG_A, name: 'Haven Proof Org', slug: 'haven-proof-org', settings: {} },
  ]);
  db.seed('organization_memberships', [
    { id: 'm-op', user_id: 'operator', organization_id: 'org-platform', role: 'owner', custom_role_id: null, is_active: true },
    { id: 'm-own', user_id: 'user-owner', organization_id: ORG_A, role: 'owner', custom_role_id: null, is_active: true },
  ]);
});

async function callInstall(body: Record<string, unknown>, envOverrides: Record<string, unknown> = {}) {
  const token = await makeToken({
    sub: 'operator',
    email: PLATFORM_OPERATOR_EMAIL,
    organizationId: 'org-platform',
    role: 'owner',
  });
  return installations(
    context(
      jsonRequest(URL_INSTALL, body, bearer(token)),
      envWith({ EIP_ENCRYPTION_MASTER_KEY: MASTER_KEY, ...envOverrides }),
    ),
  );
}

const INSTALL_BODY = {
  targetOrgId: ORG_A,
  catalogId: 'rest-api',
  displayName: 'Haven API',
  config: {
    endpoint: 'https://api.example.com/data',
    authType: 'apiKey',
    apiKey: 'SUPER-SECRET-API-KEY',
  },
};

describe('connector install — encryption at rest', () => {
  it('stores the credential ENCRYPTED, never as plaintext', async () => {
    const res = await callInstall(INSTALL_BODY);
    expect(res.status).toBe(201);

    const rows = db.rows('connector_installations');
    expect(rows.length).toBe(1);
    const stored = rows[0].config as Record<string, unknown>;

    expect(stored.apiKey).not.toBe('SUPER-SECRET-API-KEY');
    expect(stored.apiKey).not.toContain('SUPER-SECRET');
    expect(JSON.parse(stored.apiKey as string)).toMatchObject({ encrypted: true, version: 2 });

    // Non-secret config is preserved verbatim.
    expect(stored.endpoint).toBe('https://api.example.com/data');
  });

  it('never echoes the secret back in the response', async () => {
    const res = await callInstall(INSTALL_BODY);
    const text = await res.text();
    expect(text).not.toContain('SUPER-SECRET-API-KEY');
    expect(text).toContain('***');
  });

  it('FAILS CLOSED when EIP_ENCRYPTION_MASTER_KEY is absent (no plaintext write)', async () => {
    const res = await callInstall(INSTALL_BODY, { EIP_ENCRYPTION_MASTER_KEY: undefined });
    expect(res.status).toBe(500);
    // The error must name the missing setting but must never echo the secret.
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.detail)).toContain('EIP_ENCRYPTION_MASTER_KEY');
    expect(JSON.stringify(body)).not.toContain('SUPER-SECRET-API-KEY');
    expect(db.rows('connector_installations').length).toBe(0);
  });

  it('FAILS CLOSED when the master key is too short', async () => {
    const res = await callInstall(INSTALL_BODY, { EIP_ENCRYPTION_MASTER_KEY: 'too-short' });
    expect(res.status).toBe(500);
    expect(db.rows('connector_installations').length).toBe(0);
  });

  it('still requires targetOrgId', async () => {
    const res = await callInstall({ catalogId: 'rest-api', displayName: 'x' });
    expect(res.status).toBe(400);
  });

  it('still rejects a non-platform-admin caller', async () => {
    const token = await makeToken({
      sub: 'user-owner',
      email: 'owner@example.com',
      organizationId: ORG_A,
      role: 'owner',
    });
    const res = await installations(
      context(jsonRequest(URL_INSTALL, INSTALL_BODY, bearer(token)), envWith({ EIP_ENCRYPTION_MASTER_KEY: MASTER_KEY })),
    );
    expect(res.status).toBe(403);
    expect(db.rows('connector_installations').length).toBe(0);
  });
});
