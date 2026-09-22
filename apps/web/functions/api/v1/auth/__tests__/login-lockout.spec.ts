/**
 * Baseline authentication abuse controls (Phase 2 acceptance / spec 24.4.1):
 * 5 failed login attempts within 15 minutes → a 15-minute lock; authentication
 * is prevented while locked; successful authentication and lock expiry both
 * reset failure state; locked responses are indistinguishable between existing
 * and unknown accounts (anti-enumeration, spec 24.3).
 */
import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { onRequest } from '../login';
import { FakeSupabase } from '../../../../test-support/fake-supabase';
import { FakeKV } from '../../../../test-support/fake-kv';
import { context, envWith, jsonRequest, type TestEnv } from '../../../../test-support/harness';
import {
  LOCKOUT_LOCK_MS,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_WINDOW_MS,
} from '../../../../shared/lockout';

jest.mock('jose', () => jest.requireActual('../../../../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;
const LOGIN_URL = 'http://localhost/api/v1/auth/login';

const KNOWN_EMAIL = 'locked.user@example.com';
const UNKNOWN_EMAIL = 'nobody@example.com';
const PASSWORD = 'CorrectHorse123!';

function lockoutKey(email: string): string {
  return `lockout:login:${email.trim().toLowerCase()}`;
}

describe('POST /api/v1/auth/login — account lockout (5 / 15 min → 15 min)', () => {
  let db: FakeSupabase;
  let kv: FakeKV;
  let env: TestEnv;
  let ipSeq = 0;

  beforeEach(async () => {
    db = new FakeSupabase();
    kv = new FakeKV();
    ipSeq = 0;
    mockedCreateClient.mockReturnValue(db);
    env = envWith({ RATE_LIMIT_KV: kv.asNamespace() });

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    db.seed('users', [
      {
        id: 'u-known',
        email: KNOWN_EMAIL,
        password_hash: passwordHash,
        full_name: 'Known User',
        organization_id: 'org-lock',
        role: 'owner',
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        organizations: { id: 'org-lock', name: 'Lock Org', slug: 'lock-org', settings: {} },
      },
    ]);
    db.seed('organizations', [{ id: 'org-lock', name: 'Lock Org', slug: 'lock-org', settings: {} }]);
  });

  /** One attempt per unique IP so the IP rate limiter never interferes. */
  function attempt(email: string, password: string): Promise<Response> {
    ipSeq += 1;
    const request = jsonRequest(LOGIN_URL, { email, password }, { 'cf-connecting-ip': `10.0.0.${ipSeq}` });
    return onRequest(context(request, env) as unknown as Parameters<typeof onRequest>[0]);
  }

  it('exposes the Phase 2 policy constants (5 / 15 minutes / 15 minutes)', () => {
    expect(LOCKOUT_MAX_FAILURES).toBe(5);
    expect(LOCKOUT_WINDOW_MS).toBe(15 * 60_000);
    expect(LOCKOUT_LOCK_MS).toBe(15 * 60_000);
  });

  it('returns generic 401s for the first five failures, then blocks with 429 + Retry-After', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      const failure = await attempt(UNKNOWN_EMAIL, 'WrongPassword1!');
      expect(failure.status).toBe(401);
      expect(await failure.json()).toEqual({ statusCode: 401, message: 'Invalid email or password' });
    }

    const locked = await attempt(UNKNOWN_EMAIL, PASSWORD);
    expect(locked.status).toBe(429);
    const retryAfter = Number(locked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LOCKOUT_LOCK_MS / 1000);
    const body = (await locked.json()) as Record<string, unknown>;
    expect(body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many failed login attempts. Try again later.',
    });
    expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken/);

    const record = kv.read(lockoutKey(UNKNOWN_EMAIL)) as { failures: number[]; lockedUntil?: number };
    expect(record.failures).toHaveLength(LOCKOUT_MAX_FAILURES);
    expect(typeof record.lockedUntil).toBe('number');
  });

  it('preserves anti-enumeration: locked bodies are identical for known vs unknown accounts', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      expect((await attempt(KNOWN_EMAIL, 'WrongPassword1!')).status).toBe(401);
    }
    const knownLocked = await attempt(KNOWN_EMAIL, PASSWORD);
    expect(knownLocked.status).toBe(429);
    const knownBody = await knownLocked.json();

    kv.store.clear(); // fresh state, then repeat for an address that does not exist
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      expect((await attempt(UNKNOWN_EMAIL, PASSWORD)).status).toBe(401);
    }
    const unknownLocked = await attempt(UNKNOWN_EMAIL, PASSWORD);
    expect(unknownLocked.status).toBe(429);
    const unknownBody = await unknownLocked.json();

    expect(knownBody).toEqual(unknownBody);
  });

  it('prevents authentication while locked, even with the correct password', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      await attempt(KNOWN_EMAIL, 'WrongPassword1!');
    }
    const withCorrectPassword = await attempt(KNOWN_EMAIL, PASSWORD);
    expect(withCorrectPassword.status).toBe(429);
    const body = (await withCorrectPassword.json()) as Record<string, unknown>;
    expect(body.message).toBe('Too many failed login attempts. Try again later.');
    expect(JSON.stringify(body)).not.toContain('accessToken');
    expect(db.callsTo('sessions', 'insert')).toHaveLength(0); // no session minted while locked
    expect(db.callsTo('audit_logs', 'insert')).toHaveLength(0);
  });

  it('clears failure state on successful authentication (spec 24.4.1 reset)', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES - 1; i += 1) {
      expect((await attempt(KNOWN_EMAIL, 'WrongPassword1!')).status).toBe(401);
    }
    const success = await attempt(KNOWN_EMAIL, PASSWORD);
    expect(success.status).toBe(200);
    const successBody = (await success.json()) as { accessToken?: string };
    expect(successBody.accessToken).toBeTruthy();
    expect(kv.store.has(lockoutKey(KNOWN_EMAIL))).toBe(false); // state cleared

    // Counter restarted: four pre-success failures + these post-success failures
    // would lock (≥5 cumulative) if the old count had persisted.
    expect((await attempt(KNOWN_EMAIL, 'WrongPassword1!')).status).toBe(401);
    expect((await attempt(KNOWN_EMAIL, 'WrongPassword1!')).status).toBe(401);
    expect((await attempt(KNOWN_EMAIL, 'WrongPassword1!')).status).toBe(401);
    const probe = await attempt(KNOWN_EMAIL, PASSWORD);
    expect(probe.status).toBe(200);
  });

  it('resets failure state when the lock expires (spec 24.4.1)', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      await attempt(KNOWN_EMAIL, 'WrongPassword1!');
    }
    expect((await attempt(KNOWN_EMAIL, PASSWORD)).status).toBe(429);

    // Move the recorded lock into the past (expiry reached).
    const key = lockoutKey(KNOWN_EMAIL);
    const record = kv.read(key) as { failures: number[]; lockedUntil?: number };
    kv.write(key, { ...record, lockedUntil: Date.now() - 1_000 });

    const afterExpiry = await attempt(KNOWN_EMAIL, PASSWORD);
    expect(afterExpiry.status).toBe(200);
    expect(kv.store.has(key)).toBe(false); // expiry cleared the failure state entirely
  });

  it('ignores failures older than the 15-minute window when counting', async () => {
    const now = Date.now();
    kv.write(lockoutKey(KNOWN_EMAIL), {
      failures: [
        now - LOCKOUT_WINDOW_MS - 60_000,
        now - LOCKOUT_WINDOW_MS - 30_000,
        now - LOCKOUT_WINDOW_MS - 20_000,
        now - LOCKOUT_WINDOW_MS - 10_000,
        now - LOCKOUT_WINDOW_MS - 5_000,
      ],
    });
    const response = await attempt(KNOWN_EMAIL, PASSWORD);
    expect(response.status).toBe(200); // all five recorded failures pruned by the window
  });
});
