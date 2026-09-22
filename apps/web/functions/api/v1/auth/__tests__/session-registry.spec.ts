/**
 * Session-registry groundwork + revocation foundation (Phase 2 acceptance /
 * spec 24.2.3): login associates issued tokens with a session row, logout
 * revokes it, `requireAuth` rejects revoked tokens, and a missing/failing
 * sessions table (migration 0003 transitional state) never breaks authentication.
 */
import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { onRequest as login } from '../login';
import { onRequest as logout } from '../logout';
import { hashToken, requireAuth } from '../../../../shared/auth';
import { FakeSupabase } from '../../../../test-support/fake-supabase';
import { FakeKV } from '../../../../test-support/fake-kv';
import {
  ORG_A,
  bearer,
  context,
  envWith,
  jsonRequest,
  makeToken,
  seedTenant,
  type TestEnv,
} from '../../../../test-support/harness';

jest.mock('jose', () => jest.requireActual('../../../../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;
const LOGIN_URL = 'http://localhost/api/v1/auth/login';
const LOGOUT_URL = 'http://localhost/api/v1/auth/logout';
const PROBE_URL = 'http://localhost/api/v1/orgs/me';
const EMAIL = 'session.user@example.com';
const PASSWORD = 'SessionPass123!';

describe('session registry groundwork (spec 24.2.3)', () => {
  let db: FakeSupabase;
  let env: TestEnv;
  let ipSeq = 0;

  beforeEach(async () => {
    db = new FakeSupabase();
    ipSeq = 0;
    mockedCreateClient.mockReturnValue(db);
    env = envWith({ RATE_LIMIT_KV: new FakeKV().asNamespace() });

    seedTenant(db, { userId: 'u-sess', email: EMAIL, organizationId: ORG_A, role: 'owner' });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    Object.assign(db.tables.users[0], {
      password_hash: passwordHash,
      full_name: 'Session User',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      organizations: { id: ORG_A, name: ORG_A, slug: ORG_A, settings: {} },
    });
  });

  function doLogin(email: string, password: string): Promise<Response> {
    ipSeq += 1;
    const request = jsonRequest(LOGIN_URL, { email, password }, { 'cf-connecting-ip': `10.2.0.${ipSeq}` });
    return login(context(request, env) as unknown as Parameters<typeof login>[0]);
  }

  function doLogout(token: string): Promise<Response> {
    const request = jsonRequest(LOGOUT_URL, {}, bearer(token));
    return logout(context(request, env) as unknown as Parameters<typeof logout>[0]);
  }

  function probe(token: string) {
    return requireAuth(env, new Request(PROBE_URL, { headers: bearer(token) }));
  }

  it('associates the issued access token with a session row at login', async () => {
    const response = await doLogin(EMAIL, PASSWORD);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string };

    const rows = db.tables.sessions ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(await hashToken(body.accessToken));
    expect(rows[0].user_id).toBe('u-sess');
    expect(rows[0].organization_id).toBe(ORG_A);
    expect(rows[0].revoked_at).toBeUndefined();
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(db.callsTo('sessions', 'insert')).toHaveLength(1);
  });

  it('revokes the session on logout; requireAuth rejects the token afterwards', async () => {
    const loginResponse = await doLogin(EMAIL, PASSWORD);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    const before = await probe(accessToken);
    expect(before).not.toBeInstanceOf(Response); // active session authenticates

    const logoutResponse = await doLogout(accessToken);
    expect(logoutResponse.status).toBe(200);
    expect(await logoutResponse.json()).toEqual({ message: 'Signed out' });
    expect(db.tables.sessions[0].revoked_at).toBeTruthy();

    const after = await probe(accessToken);
    expect(after).toBeInstanceOf(Response);
    expect((after as Response).status).toBe(401);
    expect(await (after as Response).json()).toEqual({
      statusCode: 401,
      message: 'Session has been revoked',
    });
  });

  it('is idempotent: a revoked session can be logged out again (signature still valid)', async () => {
    const loginResponse = await doLogin(EMAIL, PASSWORD);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    expect((await doLogout(accessToken)).status).toBe(200);
    expect((await doLogout(accessToken)).status).toBe(200);
  });

  it('logout requires a verifiable bearer token', async () => {
    expect((await doLogout('')).status).toBe(401);
    expect((await doLogout('not-a-real-token')).status).toBe(401);
    expect(db.callsTo('sessions', 'update')).toHaveLength(0);
  });

  it('pre-registry tokens without a session row still authenticate (no lockout of legacy sessions)', async () => {
    const token = await makeToken({ sub: 'u-sess', email: EMAIL, organizationId: ORG_A, role: 'owner' });
    const result = await probe(token);
    expect(result).not.toBeInstanceOf(Response);
    expect(db.callsTo('sessions', 'select')).toHaveLength(1); // lookup ran, no row → allowed
    expect(db.tables.sessions ?? []).toHaveLength(0);
  });

  it('keeps login, logout and requireAuth working while the sessions table is unavailable', async () => {
    // Migration 0003 not yet applied: every sessions access errors.
    db.failTable('sessions', 'relation "sessions" does not exist');

    const loginResponse = await doLogin(EMAIL, PASSWORD);
    expect(loginResponse.status).toBe(200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    expect((await doLogout(accessToken)).status).toBe(200);

    const result = await probe(accessToken);
    expect(result).not.toBeInstanceOf(Response); // registry unavailable → transitional continue
  });
});
