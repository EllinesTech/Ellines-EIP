/**
 * Platform staff registry — single operator.
 *
 *   GET    /api/v1/platform/staff/{id}   detail + effective access
 *   PATCH  /api/v1/platform/staff/{id}   grant | revoke_grant | suspend | activate | revoke
 *
 * Requires `platform.staff.manage` from the DB-backed registry. Grant changes are
 * transactional (PostgREST RPC) and the response is the persisted row, re-read
 * from the database rather than echoed from the request.
 *
 * Self-lockout guard: an operator may not suspend/revoke themselves, nor strip
 * their own `platform.staff.manage` grant. Losing the last staff manager to a
 * mis-click has no self-service recovery, because bootstrap deliberately refuses
 * to resurrect an inactive operator.
 */

import {
  auditRow,
  enforceSafeguards,
  getAdminClient,
  getClientIp,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import {
  getPlatformStaff,
  requirePlatformStaff,
  setPlatformStaffGrant,
  setPlatformStaffStatus,
  type PlatformStaffView,
} from '../../../../shared/platform-staff';
import { isPlatformStaffCapability } from '@ellines-eip/shared';
import type { PagesFunction } from '@cloudflare/workers-types';

const ACTIONS = ['grant', 'revoke_grant', 'suspend', 'activate', 'revoke'] as const;
type Action = (typeof ACTIONS)[number];

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function audit(
  env: Env,
  auth: { organizationId: string; sub: string },
  request: Request,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await getAdminClient(env).from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action,
      resource: 'platform_staff_member',
      metadata,
      ip: getClientIp(request),
    }));
  } catch (err) {
    console.error('[platform-staff] audit write failed', err instanceof Error ? err.message : String(err));
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // Cloudflare types a dynamic route param as `string | string[]`; a path segment
  // is never repeated here, so take the first value and reject an empty one.
  const rawId = context.params?.id;
  const id = (Array.isArray(rawId) ? rawId[0] : rawId) ?? '';
  if (!id) return json({ statusCode: 400, message: 'id is required' }, 400);

  if (context.request.method === 'GET') {
    const staffContext = await requirePlatformStaff(context.env, auth, 'platform.staff.manage');
    if (staffContext instanceof Response) return staffContext;

    const staff = await getPlatformStaff(context.env, id);
    if (!staff) return json({ statusCode: 404, message: 'Platform staff not found' }, 404);
    return json({ data: staff });
  }

  if (context.request.method !== 'PATCH') {
    return json({ message: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ statusCode: 400, message: 'Invalid request body' }, 400);
  }

  const action = str(body.action) as Action;
  if (!ACTIONS.includes(action)) {
    return json({ statusCode: 400, message: `action must be one of ${ACTIONS.join(', ')}` }, 400);
  }

  const reason = str(body.reason);
  // Grant and revoke are separate registry operations so the UI (and the audit
  // trail) can state exactly which safeguard class applied.
  const safeguardId = action === 'grant' ? 'platform.staff.grant' : 'platform.staff.revoke';
  const reasonError = await enforceSafeguards(context, safeguardId, body);
  if (reasonError) return reasonError;

  const staffContext = await requirePlatformStaff(context.env, auth, 'platform.staff.manage');
  if (staffContext instanceof Response) return staffContext;

  const correlationId = crypto.randomUUID();
  const target = await getPlatformStaff(context.env, id);
  if (!target) {
    await audit(context.env, auth, context.request, `platform.staff.${action}`, {
      correlationId, reason, target: id, result: 'failure', error: 'not_found',
    });
    return json({ statusCode: 404, message: 'Platform staff not found' }, 404);
  }

  // Self-lockout guard (see the file header).
  const isSelf = staffContext.staffId !== null && staffContext.staffId === id;
  const stripsOwnStaffManagement =
    action === 'revoke_grant' && str(body.capability) === 'platform.staff.manage';
  if (isSelf && (action === 'suspend' || action === 'revoke' || stripsOwnStaffManagement)) {
    await audit(context.env, auth, context.request, `platform.staff.${action}`, {
      correlationId,
      reason,
      target: id,
      result: 'failure',
      error: 'self_lockout_blocked',
    });
    return json(
      { statusCode: 409, message: 'You cannot remove your own platform staff access' },
      409,
    );
  }

  // ── apply the action ────────────────────────────────────────────────────
  let mutation;
  let auditAction: string;

  if (action === 'grant' || action === 'revoke_grant') {
    const capability = str(body.capability);
    if (!isPlatformStaffCapability(capability)) {
      await audit(context.env, auth, context.request, `platform.staff.${action}`, {
        correlationId, reason, target: id, capability, result: 'failure', error: 'invalid_capability',
      });
      return json({ statusCode: 400, message: `Unknown capability: ${capability || '(missing)'}` }, 400);
    }

    auditAction = action === 'grant' ? 'platform.staff.grant' : 'platform.staff.revoke';
    mutation = await setPlatformStaffGrant(context.env, {
      staffId: id,
      capability,
      scopeOrgId: str(body.scopeOrgId ?? body.scope_org_id),
      expiresAt: str(body.expiresAt ?? body.expires_at) || null,
      reason,
      actorEmail: auth.email,
      granted: action === 'grant',
    });
  } else {
    auditAction = 'platform.staff.revoke';
    mutation = await setPlatformStaffStatus(context.env, {
      staffId: id,
      status: action === 'suspend' ? 'suspended' : action === 'revoke' ? 'revoked' : 'active',
      reason,
      actorEmail: auth.email,
    });
  }

  if (!mutation.ok) {
    await audit(context.env, auth, context.request, auditAction, {
      correlationId,
      reason,
      target: id,
      action,
      result: 'failure',
      error: mutation.code,
    });
    return json(
      { statusCode: mutation.httpStatus, message: 'Unable to update platform staff', error: mutation.code },
      mutation.httpStatus,
    );
  }

  // Answer with the persisted state, re-read from the database.
  const persisted = await getPlatformStaff(context.env, id);

  await audit(context.env, auth, context.request, auditAction, {
    correlationId,
    reason,
    target: id,
    action,
    before: { status: target.status, effectiveCapabilities: target.effectiveCapabilities },
    after: persisted ?? mutation.data,
    result: 'success',
  });

  return json({ statusCode: 200, data: (persisted ?? mutation.data) as PlatformStaffView });
};
