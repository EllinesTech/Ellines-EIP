/**
 * Health-probe failure injection (Phase 2 acceptance / spec 40.9.3 row 9):
 * when the database probe fails the public probe reports `down` with a minimized
 * payload (no dependency internals), the platform summary reports `down`
 * dependencies, and an unconfigured mail provider degrades (not down).
 */
import { createClient } from '@supabase/supabase-js';
import { onRequest } from './health';
import { onRequest as summary } from './platform/health/summary';
import { FakeSupabase } from '../../test-support/fake-supabase';
import {
  ORG_PLATFORM,
  PLATFORM_OPERATOR_EMAIL,
  TEST_ENV,
  bearer,
  context,
  makeToken,
  seedTenant,
} from '../../test-support/harness';

jest.mock('jose', () => jest.requireActual('../../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;
const HEALTH_URL = 'http://localhost/api/v1/health';
const SUMMARY_URL = 'http://localhost/api/v1/platform/health/summary';

function get(url: string, headers: Record<string, string> = {}) {
  const request = new Request(url, { method: 'GET', headers });
  return { request };
}

describe('GET /api/v1/health — database probe failure injection', () => {
  let db: FakeSupabase;

  beforeEach(() => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
  });

  it('reports a minimized public payload when the database probe succeeds', async () => {
    const { request } = get(HEALTH_URL);
    const response = await onRequest(context(request, TEST_ENV) as unknown as Parameters<typeof onRequest>[0]);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    // Payload minimization: only status/service/timestamp — no dependency internals.
    expect(Object.keys(body).sort()).toEqual(['service', 'status', 'timestamp']);
  });

  it('reports status down when the database probe fails (failure injection)', async () => {
    db.failTable('organizations', 'connection refused');
    const { request } = get(HEALTH_URL);
    const response = await onRequest(context(request, TEST_ENV) as unknown as Parameters<typeof onRequest>[0]);
    expect(response.status).toBe(200); // liveness-style endpoint stays reachable
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('down');
    expect(Object.keys(body).sort()).toEqual(['service', 'status', 'timestamp']);
    expect(JSON.stringify(body)).not.toContain('connection refused'); // error detail never leaks publicly
  });
});

describe('GET /api/v1/platform/health/summary — degraded/down matrix', () => {
  let db: FakeSupabase;

  beforeEach(() => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
    seedTenant(db, {
      userId: 'op1',
      email: PLATFORM_OPERATOR_EMAIL,
      organizationId: ORG_PLATFORM,
      role: 'owner',
    });
  });

  async function fetchSummary() {
    const token = await makeToken({
      sub: 'op1',
      email: PLATFORM_OPERATOR_EMAIL,
      organizationId: ORG_PLATFORM,
      role: 'owner',
    });
    const { request } = get(SUMMARY_URL, bearer(token));
    return summary(context(request, TEST_ENV) as unknown as Parameters<typeof summary>[0]);
  }

  it('reports down dependencies when the database probe fails', async () => {
    db.failTable('organizations', 'database unreachable');
    const response = await fetchSummary();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      dependencies: Array<{ name: string; status: string; error?: string }>;
    };
    expect(body.status).toBe('down');
    const database = body.dependencies.find((d) => d.name === 'database');
    expect(database?.status).toBe('down');
    expect(database?.error).toBeTruthy();
  });

  it('reports degraded (not down) when only the mail provider is unconfigured', async () => {
    const response = await fetchSummary();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      dependencies: Array<{ name: string; status: string }>;
    };
    expect(body.status).toBe('degraded'); // TEST_ENV carries no mail provider secrets
    expect(body.dependencies.find((d) => d.name === 'database')?.status).toBe('up');
    expect(body.dependencies.find((d) => d.name === 'email')?.status).toBe('unconfigured');
  });
});
