/**
 * Bootstrap the platform staff registry from the configured allowlist.
 *
 *   POST /api/v1/platform/staff/bootstrap   { reason, dryRun? }
 *
 * This is the ONE place where PLATFORM_ADMIN_EMAILS still grants anything, and it
 * is a migration tool, not the authorization source: once an operator has a row,
 * the registry decides their access and the allowlist cannot lift a suspension.
 *
 * Properties:
 *  - idempotent — an operator who already has a row is reported as skipped, never
 *    duplicated (enforced by the unique email index plus the function's check);
 *  - never resurrects a suspended or revoked operator (reported separately as
 *    skippedInactive) — otherwise revocation would be reversible by re-running a
 *    bootstrap, which would make revocation meaningless;
 *  - grants exactly the capability set the allowlist implied, no more;
 *  - supports `dryRun`, which writes nothing at all;
 *  - always writes an audit row, including when nothing changed.
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
import { bootstrapPlatformStaff, requirePlatformStaff } from '../../../../shared/platform-staff';
import type { PagesFunction } from '@cloudflare/workers-types';

/** Same parsing (and the same sanity bound) the authorizer applies. */
function allowlistFromEnv(env: Env): string[] {
  return (env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    // An empty body is acceptable here: the safeguard below still requires a reason.
    body = {};
  }

  const reasonError = await enforceSafeguards(context, 'platform.staff.bootstrap', body);
  if (reasonError) return reasonError;

  const staffContext = await requirePlatformStaff(context.env, auth, 'platform.staff.manage');
  if (staffContext instanceof Response) return staffContext;

  const allowlist = allowlistFromEnv(context.env);
  const dryRun = body.dryRun === true;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const correlationId = crypto.randomUUID();

  const writeAudit = async (result: string, report: unknown, error?: string) => {
    try {
      await getAdminClient(context.env).from('audit_logs').insert(auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'platform.staff.bootstrap',
        resource: 'platform_staff_member',
        metadata: {
          correlationId,
          reason: reason || 'platform staff bootstrap',
          dryRun,
          allowlistSize: allowlist.length,
          report,
          result,
          ...(error ? { error } : {}),
        },
        ip: getClientIp(context.request),
      }));
    } catch (err) {
      console.error('[platform-staff] audit write failed', err instanceof Error ? err.message : String(err));
    }
  };

  if (allowlist.length === 0) {
    await writeAudit('failure', null, 'empty_allowlist');
    return json(
      { statusCode: 400, message: 'PLATFORM_ADMIN_EMAILS is empty — nothing to bootstrap' },
      400,
    );
  }

  const result = await bootstrapPlatformStaff(context.env, {
    allowlist,
    reason,
    actorEmail: auth.email,
    dryRun,
  });

  if (!result.ok) {
    await writeAudit('failure', null, result.code);
    return json(
      { statusCode: result.httpStatus, message: 'Unable to bootstrap platform staff', error: result.code },
      result.httpStatus,
    );
  }

  // Audited even when nothing changed: "we checked and nothing needed doing" is a
  // result worth recording.
  await writeAudit('success', result.data);

  return json({
    statusCode: 200,
    data: {
      ...result.data,
      dryRun,
      actor: { email: staffContext.email, source: staffContext.source },
    },
  });
};
