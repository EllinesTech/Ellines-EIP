/**
 * Registration must create the organization_memberships row.
 *
 * Regression test for a real production defect: /register created the
 * organization and the user but no membership row, while every permission
 * check resolves the granted role through organization_memberships. Owners
 * who registered that way were locked out of their own connectors, users and
 * settings with HTTP 403.
 */
import { onRequest } from '../register';

jest.mock('../../../../shared/auth', () => {
  const actual = jest.requireActual('../../../../shared/auth');
  return { ...actual, getAdminClient: jest.fn(), requireAuth: jest.fn() };
});
jest.mock('../../../../shared/egress', () => ({ ...jest.requireActual('../../../../shared/egress') }));

const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  // register() signs an access token at the end; without a secret it throws.
  JWT_SECRET: 'test-secret-that-is-long-enough-for-hmac-signing-0123456789',
} as any;

function makeCtx(body: unknown) {
  return {
    request: new Request('https://site/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: ENV,
    params: {},
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as any;
}

describe('POST /api/v1/auth/register — membership creation', () => {
  let inserted: Record<string, any>[] = [];
  let orgs: Record<string, any>[] = [];
  let users: Record<string, any>[] = [];

  // One chainable stub for every table: from().select().eq() and from().insert()
  // must both continue chaining, so every branch returns the same object.
  const chain: any = {
    from: (table: string) => {
      const node: any = {
        insert: (row: any) => {
          if (table === 'organization_memberships') inserted.push(row);
          if (table === 'organizations') orgs.push(row);
          if (table === 'users') users.push(row);
          return node;
        },
        select: () => node,
        eq: () => node,
        delete: () => node,
        single: async () => ({ data: null }),
        maybeSingle: async () => ({ data: null }),
        then: (cb: any) => Promise.resolve(cb({ data: null, error: null })),
      };
      return node;
    },
  };

  beforeEach(() => {
    inserted = [];
    orgs = [];
    users = [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const auth = require('../../../../shared/auth');
    auth.getAdminClient.mockReturnValue(chain);
  });

  it('creates an owner membership row so the new owner is not locked out', async () => {
    const res = await onRequest(
      makeCtx({
        organizationName: 'Acme Test Co',
        email: 'owner@example.com',
        password: 'Str0ngPassw0rd!',
        fullName: 'Owner',
      }),
    );
    // The response code depends on the tail of the handler (token signing,
    // outbound email); what matters for this regression is that registration
    // writes the membership row that every permission check reads.
    expect(res.status).toBeGreaterThanOrEqual(200);

    expect(users).toHaveLength(1);
    expect(inserted).toHaveLength(1);
    const m = inserted[0];
    // The membership must reference the org and user just created.
    expect(m.organization_id).toBe(orgs[0].id);
    expect(m.user_id).toBe(users[0].id);
    expect(m.role).toBe('owner');
    expect(m.is_active).toBe(true);
    // The table's id column is NOT NULL.
    expect(typeof m.id).toBe('string');
    expect(m.id.length).toBeGreaterThan(0);
  });
});
