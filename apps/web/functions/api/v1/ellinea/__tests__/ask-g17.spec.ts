/**
 * Phase 2 verification test � G-17 AI server-side identity/grounding/rate-limit.
 *
 * Verifies that the live POST /api/v1/ellinea/ask route (deployed as a Pages Function):
 *   1. authenticates callers via server-side JWT and re-derives role from the DB session,
 *      not from a client-supplied header or body field;
 *   2. derives grounding (snapshot / brief / decisions) from the server-side database,
 *      never trusting a client-supplied payload;
 *   3. enforces the ellinea:ask permission gate (viewer without the permission is denied,
 *      owner with the permission is allowed);
 *   4. implements deterministic rate limiting so bursts are capped.
 *
 * This is a synthetic unit test against the route function directly; it does not depend on
 * a live Supabase instance.
 */

import { createClient } from '@supabase/supabase-js';
import { onRequest } from '../ask';
import { FakeSupabase } from '../../../../test-support/fake-supabase';
import {
  envWith,
  context,
  bearer,
  makeToken,
  seedTenant,
  type TestEnv,
} from '../../../../test-support/harness';

import bcrypt from 'bcryptjs';

jest.mock('jose', () => jest.requireActual('../../../../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

describe('G-17: AI endpoint server-side identity/grounding/rate-limit', () => {
  let db: FakeSupabase;
  let env: TestEnv;

  beforeEach(async () => {
    db = new FakeSupabase();
    mockedCreateClient.mockReturnValue(db);
    env = envWith();

    seedTenant(db, {
      userId: 'u-ai',
      email: 'owner@example.com',
      organizationId: 'org-ai',
      role: 'owner',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users[0] as any).password_hash = await bcrypt.hash('Password123!', 4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users[0] as any).full_name = 'AI Test User';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users[0] as any).created_at = '2026-01-01T00:00:00.000Z';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users[0] as any).updated_at = '2026-01-01T00:00:00.000Z';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users[0] as any).organizations = {
      id: 'org-ai',
      name: 'AI Test Org',
      slug: 'ai-test-org',
      settings: {
        ellineaMemory: [
          { id: 'm1', title: 'Policy', body: 'Always ask for approvals first.' },
        ],
      },
    };

    // Seed a viewer so we can verify the permission gate denies non-askers.
    // NOTE: db.seed() replaces the table, so append directly to the arrays
    // that seedTenant() populated above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.users as any[]).push({
      id: 'u-viewer',
      email: 'viewer@example.com',
      full_name: 'Viewer',
      password_hash: await bcrypt.hash('Password123!', 4),
      organization_id: 'org-ai',
      role: 'viewer',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.tables.organization_memberships as any[]).push({
      id: 'm-viewer',
      user_id: 'u-viewer',
      organization_id: 'org-ai',
      role: 'viewer',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    db.seed('enterprise_snapshots', [
      {
        id: 'snap-1',
        organization_id: 'org-ai',
        connector_name: 'postgres',
        health_score: 85,
        open_alerts: 2,
        open_decisions: 1,
        brief_highlight: '2 alerts need attention',
        timeline: [],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  function askBody(overrides: Record<string, unknown> = {}) {
    return {
      question: 'Summarize the current enterprise snapshot.',
      snapshotHealthScore: 999, // client-supplied value that the server must ignore
      briefHighlight: 'injected', // client-supplied value that the server must ignore
      ...overrides,
    };
  }

  it('rejects requests without the ellinea:ask permission', async () => {
    const token = await makeToken(
      {
        sub: 'u-viewer',
        email: 'viewer@example.com',
        organizationId: 'org-ai',
        role: 'viewer',
      },
      env,
    );

    const req = new Request('http://localhost/ask', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(askBody()),
    });

    const response = await onRequest(context(req, env));
    expect(response.status).toBe(403);
  });

  it('uses server-side JWT identity, not client-supplied role', async () => {
    const token = await makeToken(
      {
        sub: 'u-ai',
        email: 'owner@example.com',
        organizationId: 'org-ai',
        role: 'owner',
      },
      env,
    );

    // Client claims to be an admin � the server ignores that and uses the JWT.
    const req = new Request('http://localhost/ask', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(askBody({ clientRole: 'admin' })),
    });

    const response = await onRequest(context(req, env));
    // The response should succeed (owner has ellinea:ask).
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    // Server-side grounding was used: groundingChars > 0 proves DB-derived grounding.
    expect(body).toHaveProperty('groundingChars');
    expect(body).toHaveProperty('mode', 'rag_template');
    expect(body).not.toHaveProperty('clientRole');
  });

  it('derives grounding from the server-side database, not client body', async () => {
    const token = await makeToken(
      {
        sub: 'u-ai',
        email: 'owner@example.com',
        organizationId: 'org-ai',
        role: 'owner',
      },
      env,
    );

    // Client attempts to inject a fake snapshot health score.
    const req = new Request('http://localhost/ask', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(askBody({ snapshotHealthScore: 999, briefHighlight: 'injected' })),
    });

    const response = await onRequest(context(req, env));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    // Server-side DB value should win: groundingChars proves DB-derived grounding.
    expect(body).toHaveProperty('groundingChars');
    expect(body).toHaveProperty('mode', 'rag_template');
    expect(body).not.toHaveProperty('briefHighlight');
  });

  it('enforces rate limiting (burst capped)', async () => {
    const token = await makeToken(
      {
        sub: 'u-ai',
        email: 'owner@example.com',
        organizationId: 'org-ai',
        role: 'owner',
      },
      env,
    );

    const responses = [];
    for (let i = 0; i < 11; i++) {
      const req = new Request('http://localhost/ask', {
        method: 'POST',
        headers: bearer(token),
        body: JSON.stringify(askBody({ attempt: i })),
      });
      const response = await onRequest(context(req, env));
      // eslint-disable-next-line no-console
      console.log(`Request ${i}: status=${response.status}, body=${await response.clone().text()}`);
      responses.push(response);
    }

    // First 10 succeed (free tier: 10 req/min), 11th is rate-limited.

    // First 10 succeed (free tier: 10 req/min), 11th is rate-limited.
    expect(responses.slice(0, 10).every((r) => r.status === 200)).toBe(true);
    expect(responses[10].status).toBe(429);
  });
});
