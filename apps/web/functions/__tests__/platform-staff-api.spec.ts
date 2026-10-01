/**
 * P4 slice B — platform staff API: authorization, reason capture, audit contract.
 *
 * What is deliberately proven here (in order of blast radius):
 *  - the registry, not the allowlist, decides: an allowlisted but SUSPENDED
 *    operator is refused by every platform route;
 *  - a registry we cannot read is a DENY (fail closed), never an implicit allow;
 *  - org-scoped grants never authorize a platform-wide operation;
 *  - expired and revoked grants never authorize anything;
 *  - every mutation requires a reason, calls the transactional RPC exactly once,
 *    writes an audit row (including on failure) and answers with persisted state;
 *  - bootstrap is idempotent by construction and never resurrects an inactive row;
 *  - no /api/v1 route still authorizes with platformAdminFromEnv.
 *
 * The plpgsql itself is verified against the real database by the slice-B
 * integration run, not by re-implementing it here.
 */

import { createClient } from '@supabase/supabase-js';
import { onRequest as staffIndex } from '../api/v1/platform/staff/index';
import { onRequest as staffItem } from '../api/v1/platform/staff/[id]';
import { onRequest as staffBootstrap } from '../api/v1/platform/staff/bootstrap';
import { onRequest as metricsOnRequest } from '../api/v1/platform/metrics';
import { makeToken, bearer, envWith, context, seedTenant } from '../test-support/harness';
import { FakeSupabase } from '../test-support/fake-supabase';
import type { TestEnv } from '../test-support/harness';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

jest.mock('jose', () => jest.requireActual('../test-support/fake-jose'));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = createClient as unknown as jest.Mock;

const OPERATOR = 'operator@ellines.co.ke'; // allowlisted by TEST_ENV
const OTHER = 'someone@client.co';
const PLATFORM_ORG = 'org-platform';

const RPC_INVITE = 'eip_platform_staff_invite';
const RPC_GRANT = 'eip_platform_staff_set_grant';
const RPC_STATUS = 'eip_platform_staff_set_status';
const RPC_BOOTSTRAP = 'eip_platform_staff_bootstrap';

let db: FakeSupabase;
let env: TestEnv;

function staffRow(overrides: Record<string, unknown> = {}, grants: Array<Record<string, unknown>> = []) {
  return {
    id: 'staff-self',
    email: OPERATOR,
    status: 'active',
    expires_at: null,
    revoked_at: null,
    full_name: 'Ellines Operator',
    title: null,
    invited_by_email: null,
    bootstrapped: true,
    created_at: '2026-09-30T00:00:00',
    ...overrides,
    platform_staff_grants: grants,
  };
}

function grant(capability: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `g-${capability}`,
    capability,
    scope_org_id: '',
    expires_at: null,
    revoked_at: null,
    reason: null,
    granted_by_email: null,
    ...overrides,
  };
}

function get(path: string, token: string) {
  return new Request(`http://localhost${path}`, { method: 'GET', headers: bearer(token) });
}

function post(path: string, token: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(path: string, token: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Authenticate `email` as a real user so requireAuth passes. */
async function tokenFor(email: string, sub: string) {
  seedTenant(db, {
    userId: sub,
    email,
    organizationId: PLATFORM_ORG,
    role: 'owner',
    orgSettings: {},
  });
  return makeToken({ sub, email, organizationId: PLATFORM_ORG, role: 'owner' }, env);
}

async function run(
  handler: (c: unknown) => Promise<Response>,
  request: Request,
  params?: Record<string, string>,
): Promise<Response> {
  return handler(context(request, env, params ? { params } : {}));
}

function auditRows(): Array<Record<string, unknown>> {
  return (db.tables.audit_logs as Array<Record<string, unknown>>) ?? [];
}

beforeEach(() => {
  db = new FakeSupabase();
  mockedCreateClient.mockReturnValue(db);
  env = envWith();
});

describe('platform staff listing is registry-authorized', () => {
  it('lets an authorized operator list the registry', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({}, [grant('platform.staff.manage'), grant('platform.tenants.read')]),
    ]);

    const res = await run(staffIndex, get('/api/v1/platform/staff', token));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: Array<{ email: string; effectiveCapabilities: string[] }>;
      actor: { source: string };
    };
    expect(body.actor.source).toBe('database');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe(OPERATOR);
    expect(body.data[0].effectiveCapabilities).toEqual(['platform.staff.manage', 'platform.tenants.read']);
  });

  it('refuses a user who is neither allowlisted nor in the registry', async () => {
    const token = await tokenFor(OTHER, 'u-other');
    const res = await run(staffIndex, get('/api/v1/platform/staff', token));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Platform staff access required' });
  });

  it('refuses an ALLOWLISTED operator whose registry row is suspended', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({ status: 'suspended' }, [grant('platform.staff.manage')])]);
    expect((await run(staffIndex, get('/api/v1/platform/staff', token))).status).toBe(403);
  });

  it('refuses a revoked operator', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({ status: 'revoked', revoked_at: '2026-09-30T09:00:00' }, [grant('platform.staff.manage')]),
    ]);
    expect((await run(staffIndex, get('/api/v1/platform/staff', token))).status).toBe(403);
  });

  it('fails closed when the registry cannot be read', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.failTable('platform_staff_members', 'connection reset');

    const res = await run(staffIndex, get('/api/v1/platform/staff', token));
    expect(res.status).toBe(403);
    expect((await res.json() as { message: string }).message).toBe('Platform staff lookup unavailable');
  });

  it('refuses when the only staff.manage grant has expired', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({}, [grant('platform.staff.manage', { expires_at: '2020-01-01T00:00:00' })]),
    ]);
    expect((await run(staffIndex, get('/api/v1/platform/staff', token))).status).toBe(403);
  });

  it('refuses when the only staff.manage grant was revoked', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({}, [grant('platform.staff.manage', { revoked_at: '2026-09-29T00:00:00' })]),
    ]);
    expect((await run(staffIndex, get('/api/v1/platform/staff', token))).status).toBe(403);
  });

  it('refuses when staff.manage is granted only for ONE organization', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({}, [grant('platform.staff.manage', { scope_org_id: 'org-1' })]),
    ]);
    expect((await run(staffIndex, get('/api/v1/platform/staff', token))).status).toBe(403);
  });

  it('refuses an operator holding only a read capability', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.tenants.read')])]);
    expect((await run(staffIndex, get('/api/v1/platform/staff', token))).status).toBe(403);
  });

  it('still bootstraps an allowlisted operator who has no registry row yet', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    const res = await run(staffIndex, get('/api/v1/platform/staff', token));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { actor: { source: string } }).actor.source).toBe('env_bootstrap');
  });
});

describe('platform staff invite', () => {
  it('requires a reason before touching the database', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    const res = await run(staffIndex, post('/api/v1/platform/staff', token, { email: 'new@ellines.co.ke' }));
    expect(res.status).toBe(400);
    expect(db.rpcCallsTo(RPC_INVITE)).toHaveLength(0);
  });

  it('persists the staff record with its grants and audits the change', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.respondToRpc(RPC_INVITE, {
      id: 'staff-new',
      email: 'new@ellines.co.ke',
      status: 'active',
      grants: [{ capability: 'platform.tenants.read', scopeOrgId: '' }],
    });

    const res = await run(
      staffIndex,
      post('/api/v1/platform/staff', token, {
        email: '  New@Ellines.co.KE ',
        fullName: 'New Operator',
        reason: 'joining the platform team',
        grants: [{ capability: 'platform.tenants.read' }],
      }),
    );
    expect(res.status).toBe(201);

    const [call] = db.rpcCallsTo(RPC_INVITE);
    expect(call.params.p_email).toBe('new@ellines.co.ke'); // normalized
    expect(call.params.p_reason).toBe('joining the platform team');
    expect(call.params.p_actor_email).toBe(OPERATOR);
    expect(call.params.p_grants).toEqual([
      { capability: 'platform.tenants.read', scopeOrgId: '', expiresAt: null },
    ]);

    const audited = auditRows().filter((r) => r.action === 'platform.staff.invite');
    expect(audited).toHaveLength(1);
    const metadata = audited[0].metadata as Record<string, unknown>;
    expect(metadata.result).toBe('success');
    expect(metadata.reason).toBe('joining the platform team');
    expect((metadata.after as { id: string }).id).toBe('staff-new');
  });

  it('rejects an unknown capability without calling the database', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    const res = await run(
      staffIndex,
      post('/api/v1/platform/staff', token, {
        email: 'new@ellines.co.ke',
        reason: 'x',
        grants: [{ capability: 'platform.root.everything' }],
      }),
    );
    expect(res.status).toBe(400);
    expect(db.rpcCallsTo(RPC_INVITE)).toHaveLength(0);
  });

  it('reports a database refusal as a failure and audits it', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.failRpc(RPC_INVITE, 'eip_staff_exists: new@ellines.co.ke');

    const res = await run(
      staffIndex,
      post('/api/v1/platform/staff', token, { email: 'new@ellines.co.ke', reason: 'x' }),
    );
    expect(res.status).toBe(409); // never a silent 200

    const metadata = auditRows()[0].metadata as Record<string, unknown>;
    expect(metadata.result).toBe('failure');
    expect(metadata.error).toBe('already_exists');
  });

  it('refuses an invite from an operator without staff.manage', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.tenants.read')])]);

    const res = await run(
      staffIndex,
      post('/api/v1/platform/staff', token, { email: 'x@ellines.co.ke', reason: 'x' }),
    );
    expect(res.status).toBe(403);
    expect(db.rpcCallsTo(RPC_INVITE)).toHaveLength(0);
  });
});

describe('platform staff grant / revoke / status', () => {
  it('requires a reason for a grant', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.staff.manage')])]);

    const res = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-other', token, {
        action: 'grant',
        capability: 'platform.audit.read',
      }),
      { id: 'staff-other' },
    );
    expect(res.status).toBe(400);
    expect(db.rpcCallsTo(RPC_GRANT)).toHaveLength(0);
  });

  it('persists the granted capability and audits it', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({ id: 'staff-other', email: 'other@ellines.co.ke' }, [grant('platform.staff.manage')]),
    ]);
    db.respondToRpc(RPC_GRANT, { id: 'g1', capability: 'platform.audit.read', revokedAt: null });

    const res = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-other', token, {
        action: 'grant',
        capability: 'platform.audit.read',
        scopeOrgId: '',
        reason: 'audit export support',
      }),
      { id: 'staff-other' },
    );
    expect(res.status).toBe(200);

    const [call] = db.rpcCallsTo(RPC_GRANT);
    expect(call.params.p_staff_id).toBe('staff-other');
    expect(call.params.p_capability).toBe('platform.audit.read');
    expect(call.params.p_granted).toBe(true);
    expect(call.params.p_reason).toBe('audit export support');

    const metadata = auditRows()[0].metadata as Record<string, unknown>;
    expect(metadata.result).toBe('success');
    expect(metadata.action).toBe('grant');
    expect(metadata.before).toBeDefined();
    expect(metadata.after).toBeDefined();
  });

  it('revokes by clearing the grant, and audits it under the revoke action', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({ id: 'staff-other', email: 'other@ellines.co.ke' }, [grant('platform.staff.manage')]),
    ]);
    db.respondToRpc(RPC_GRANT, { id: 'g1', capability: 'platform.audit.read', revokedAt: '2026-09-30T12:00:00' });

    const res = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-other', token, {
        action: 'revoke_grant',
        capability: 'platform.audit.read',
        reason: 'no longer needed',
      }),
      { id: 'staff-other' },
    );
    expect(res.status).toBe(200);

    const [call] = db.rpcCallsTo(RPC_GRANT);
    expect(call.params.p_granted).toBe(false);
    expect(auditRows()[0].action).toBe('platform.staff.revoke');
  });

  it('suspends through the transactional status function', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({ id: 'staff-other', email: 'other@ellines.co.ke' }, [grant('platform.staff.manage')]),
    ]);
    db.respondToRpc(RPC_STATUS, { id: 'staff-other', status: 'suspended' });

    const res = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-other', token, { action: 'suspend', reason: 'investigation' }),
      { id: 'staff-other' },
    );
    expect(res.status).toBe(200);
    expect(db.rpcCallsTo(RPC_STATUS)[0].params.p_status).toBe('suspended');
  });

  it('refuses an unknown action and an unknown capability', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({}, [grant('platform.staff.manage')]),
      staffRow({ id: 'staff-other', email: 'other@ellines.co.ke' }, []),
    ]);

    const badAction = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-other', token, { action: 'promote', reason: 'x' }),
      { id: 'staff-other' },
    );
    expect(badAction.status).toBe(400);

    const badCapability = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-other', token, {
        action: 'grant',
        capability: 'platform.root.everything',
        reason: 'x',
      }),
      { id: 'staff-other' },
    );
    expect(badCapability.status).toBe(400);
    expect(db.rpcCallsTo(RPC_GRANT)).toHaveLength(0);
  });

  it('blocks an operator from removing their own access', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.staff.manage')])]);

    const res = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-self', token, { action: 'suspend', reason: 'oops' }),
      { id: 'staff-self' },
    );
    expect(res.status).toBe(409);
    expect(db.rpcCallsTo(RPC_STATUS)).toHaveLength(0);
    expect((auditRows()[0].metadata as Record<string, unknown>).error).toBe('self_lockout_blocked');
  });

  it('surfaces a database error instead of reporting success', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.staff.manage')])]);
    db.failRpc(RPC_STATUS, 'eip_revoked_is_terminal: staff-self');

    const res = await run(
      staffItem,
      patch('/api/v1/platform/staff/staff-self', token, { action: 'activate', reason: 'x' }),
      { id: 'staff-self' },
    );
    expect(res.status).toBe(400);
    expect((auditRows()[0].metadata as Record<string, unknown>).result).toBe('failure');
  });

  it('404s for an unknown operator', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    const res = await run(staffItem, get('/api/v1/platform/staff/nope', token), { id: 'nope' });
    expect(res.status).toBe(404);
  });
});

describe('bootstrap from the allowlist', () => {
  it('requires a reason and never calls the database without one', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    const res = await run(staffBootstrap, post('/api/v1/platform/staff/bootstrap', token, {}));
    expect(res.status).toBe(400);
    expect(db.rpcCallsTo(RPC_BOOTSTRAP)).toHaveLength(0);
  });

  it('passes the REAL configured allowlist and supports a dry run', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.respondToRpc(RPC_BOOTSTRAP, { dryRun: true, created: [], wouldCreate: [OPERATOR], skippedExisting: [], skippedInactive: [] });

    const res = await run(
      staffBootstrap,
      post('/api/v1/platform/staff/bootstrap', token, { reason: 'initial registry migration', dryRun: true }),
    );
    expect(res.status).toBe(200);

    const [call] = db.rpcCallsTo(RPC_BOOTSTRAP);
    expect(call.params.p_allowlist).toEqual([OPERATOR]); // from PLATFORM_ADMIN_EMAILS
    expect(call.params.p_dry_run).toBe(true);
    expect(call.params.p_reason).toBe('initial registry migration');

    const metadata = auditRows()[0].metadata as Record<string, unknown>;
    expect(metadata.dryRun).toBe(true);
    expect(metadata.result).toBe('success');
  });

  it('reports a second run as idempotent (nothing created, nothing duplicated)', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.respondToRpc(RPC_BOOTSTRAP, {
      dryRun: false,
      created: [],
      wouldCreate: [],
      skippedExisting: [OPERATOR],
      skippedInactive: [],
    });

    const res = await run(
      staffBootstrap,
      post('/api/v1/platform/staff/bootstrap', token, { reason: 're-run' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { created: string[]; skippedExisting: string[] } };
    expect(body.data.created).toEqual([]);
    expect(body.data.skippedExisting).toEqual([OPERATOR]);
    // "We checked and nothing needed doing" is still an audited event.
    expect(auditRows()).toHaveLength(1);
  });

  it('never resurrects a suspended operator and says so in the report', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.respondToRpc(RPC_BOOTSTRAP, {
      dryRun: false,
      created: [],
      wouldCreate: [],
      skippedExisting: [],
      skippedInactive: [OPERATOR],
    });

    const res = await run(
      staffBootstrap,
      post('/api/v1/platform/staff/bootstrap', token, { reason: 're-run after suspension' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { skippedInactive: string[] } };
    expect(body.data.skippedInactive).toEqual([OPERATOR]);
  });

  it('refuses when the allowlist is empty instead of silently doing nothing', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    // Authorized via the registry (not the allowlist), so authorization passes and
    // the empty-allowlist guard is what actually answers.
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.staff.manage')])]);
    env = envWith({ PLATFORM_ADMIN_EMAILS: '' });

    const res = await run(
      staffBootstrap,
      post('/api/v1/platform/staff/bootstrap', token, { reason: 'x' }),
    );
    expect(res.status).toBe(400);
    expect(db.rpcCallsTo(RPC_BOOTSTRAP)).toHaveLength(0);
  });

  it('refuses bootstrap from an operator without staff.manage', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.tenants.read')])]);

    const res = await run(
      staffBootstrap,
      post('/api/v1/platform/staff/bootstrap', token, { reason: 'x' }),
    );
    expect(res.status).toBe(403);
    expect(db.rpcCallsTo(RPC_BOOTSTRAP)).toHaveLength(0);
  });
});

describe('platform routes no longer authorize from the environment', () => {
  it('denies an ALLOWLISTED but suspended operator on a migrated route', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [
      staffRow({ status: 'suspended' }, [grant('platform.system.read'), grant('platform.staff.manage')]),
    ]);

    const res = await run(metricsOnRequest, get('/api/v1/platform/metrics', token));
    expect(res.status).toBe(403);
  });

  it('still serves a migrated route to an active registry operator', async () => {
    const token = await tokenFor(OPERATOR, 'u-op');
    db.seed('platform_staff_members', [staffRow({}, [grant('platform.system.read')])]);

    const res = await run(metricsOnRequest, get('/api/v1/platform/metrics', token));
    expect(res.status).toBe(200);
  });

  it('has no remaining platformAdminFromEnv call sites under functions/api', () => {
    const root = join(__dirname, '..', 'api');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts')) {
          if (readFileSync(full, 'utf8').includes('platformAdminFromEnv(')) offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});


