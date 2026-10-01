/**
 * Platform staff registry — collection endpoint.
 *
 *   GET  /api/v1/platform/staff   list operators with their effective access
 *   POST /api/v1/platform/staff   invite an operator (atomic, audited)
 *
 * Authorization comes from the DB-backed registry (slice A), never from the
 * environment allowlist: `platform.staff.manage` is required for both verbs. An
 * operator whose row is suspended/revoked loses access here even while still
 * listed in PLATFORM_ADMIN_EMAILS, and a registry we cannot read denies.
 *
 * Mutation order is deliberate: authenticate → authorize → capture reason →
 * mutate transactionally → audit → answer with the PERSISTED state. The audit row
 * is written on failure too, so a rejected staff change is as visible as a
 * successful one.
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
  invitePlatformStaff,
  listPlatformStaff,
  requirePlatformStaff,
  type PlatformStaffView,
} from '../../../../shared/platform-staff';
import { PLATFORM_STAFF_CAPABILITIES, isPlatformStaffCapability } from '@ellines-eip/shared';
import type { PagesFunction } from '@cloudflare/workers-types';

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Write the staff-management audit event. Never throws into the request path. */
async function audit(
  env: Env,
  auth: { organizationId: string; sub: string },
  request: Request,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await getAdminClient(env).from('audit_logs').insert(auditRow({
      organizationId: auth.organizationId,
      userId: auth.sub,
      action: 'platform.staff.invite',
      resource: 'platform_staff_member',
      metadata,
      ip: getClientIp(request),
    }));
  } catch (err) {
    // A failed audit write must be visible in the logs, but it must never be
    // turned into a reported success for the mutation itself.
    console.error('[platform-staff] audit write failed', err instanceof Error ? err.message : String(err));
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // ── list ────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const staffContext = await requirePlatformStaff(context.env, auth, 'platform.staff.manage');
    if (staffContext instanceof Response) return staffContext;

    const staff = await listPlatformStaff(context.env);
    return json({
      data: staff,
      capabilities: PLATFORM_STAFF_CAPABILITIES,
      actor: {
        email: staffContext.email,
        source: staffContext.source,
        capabilities: staffContext.capabilities,
      },
    });
  }

  // ── invite ──────────────────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = (await context.request.json()) as Record<string, unknown>;
    } catch {
      return json({ statusCode: 400, message: 'Invalid request body' }, 400);
    }

    // Reason capture happens before the mutation so the change is attributable;
    // authorization follows so only registry holders can act.
    const reasonError = await enforceSafeguards(context, 'platform.staff.invite', body);
    if (reasonError) return reasonError;

    const staffContext = await requirePlatformStaff(context.env, auth, 'platform.staff.manage');
    if (staffContext instanceof Response) return staffContext;

    const email = str(body.email);
    const reason = str(body.reason);
    if (!email) return json({ statusCode: 400, message: 'email is required' }, 400);

    const normalizedGrants = (Array.isArray(body.grants) ? body.grants : []).map((raw) => {
      const grant = (raw ?? {}) as Record<string, unknown>;
      return {
        capability: str(grant.capability),
        scopeOrgId: str(grant.scopeOrgId ?? grant.scope_org_id),
        expiresAt: str(grant.expiresAt ?? grant.expires_at) || null,
      };
    });

    // Reject unknown capabilities here so the caller gets a precise 400 rather
    // than a 500 from a raised SQL exception.
    const unknown = normalizedGrants.find((grant) => !isPlatformStaffCapability(grant.capability));
    if (unknown) {
      return json({ statusCode: 400, message: `Unknown capability: ${unknown.capability}` }, 400);
    }

    const correlationId = crypto.randomUUID();
    const result = await invitePlatformStaff(context.env, {
      email,
      fullName: str(body.fullName) || null,
      title: str(body.title) || null,
      expiresAt: str(body.expiresAt) || null,
      reason,
      actorEmail: auth.email,
      grants: normalizedGrants,
    });

    if (!result.ok) {
      await audit(context.env, auth, context.request, {
        correlationId,
        reason: reason || 'platform staff invite',
        target: email,
        result: 'failure',
        error: result.code,
      });
      return json(
        { statusCode: result.httpStatus, message: 'Unable to create platform staff', error: result.code },
        result.httpStatus,
      );
    }

    const persisted = result.data;
    await audit(context.env, auth, context.request, {
      correlationId,
      reason: reason || 'platform staff invite',
      target: email,
      after: persisted,
      grants: normalizedGrants,
      result: 'success',
    });

    return json({ statusCode: 201, data: persisted as PlatformStaffView }, 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};
