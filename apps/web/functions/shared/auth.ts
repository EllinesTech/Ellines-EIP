import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  matchPermission,
  normalizePermission as canonicalNormalizePermission,
  isValidPermission as canonicalIsValidPermission,
  getOperation,
} from '@ellines-eip/shared';

export type UserRole = 'owner' | 'admin' | 'executive' | 'manager' | 'member' | 'viewer';

/**
 * bcrypt cost for Pages Functions. Cost 12 exceeds Cloudflare Worker CPU
 * (error 1102). Cost 8 is still strong enough for MVP and fits Workers.
 */
export const BCRYPT_ROUNDS = 8;

export const EIP_ROLES: UserRole[] = [
  'owner',
  'admin',
  'executive',
  'manager',
  'member',
  'viewer',
];

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
  /** Required 256-bit+ master secret for encrypting tenant credentials. */
  EIP_ENCRYPTION_MASTER_KEY?: string;
  /** Comma-separated Ellines operator emails (platform Super Admin). */
  PLATFORM_ADMIN_EMAILS?: string;
  CORS_ALLOWED_ORIGINS?: string;
  /** Optional OpenAI-compatible key for Ellinea Ask (4.10). */
  ELLINEA_LLM_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ELLINEA_LLM_BASE_URL?: string;
  ELLINEA_LLM_MODEL?: string;
  /** Notification outbound email (Resend preferred on Pages; SMTP_* / ELLINEA_SMTP_* optional). */
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: string;
  ELLINEA_SMTP_HOST?: string;
  ELLINEA_SMTP_PORT?: string;
  ELLINEA_SMTP_USER?: string;
  ELLINEA_SMTP_PASS?: string;
  ELLINEA_SMTP_FROM?: string;
  ELLINEA_SMTP_SECURE?: string;
  /** Alias for RESEND_API_KEY when using Ellinea-prefixed secrets. */
  ELLINEA_SMTP_API_KEY?: string;
  /** Web Push VAPID (optional; without keys push stays simulated). */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Base URL for SSO redirects and callbacks. */
  BASE_URL?: string;
  VAPID_SUBJECT?: string;
  ELLINEA_VAPID_PUBLIC_KEY?: string;
  ELLINEA_VAPID_PRIVATE_KEY?: string;
  ELLINEA_VAPID_SUBJECT?: string;
}

export function getAdminClient(env: Env): SupabaseClient {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Pages');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export function options(): Response {
  return json({ ok: true });
}

function requireJwtSecret(env: Env): Uint8Array {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set on Pages');
  }
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signAccessToken(
  env: Env,
  payload: { sub: string; email: string; organizationId: string; role: string },
): Promise<{ accessToken: string; expiresIn: string }> {
  const expiresIn = env.JWT_EXPIRES_IN || '24h';
  const jose = await import('jose');
  const accessToken = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(requireJwtSecret(env));
  return { accessToken, expiresIn };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function verifyAccessToken(
  env: Env,
  token: string,
): Promise<{ sub: string; email: string; organizationId: string; role: string }> {
  const jose = await import('jose');
  const { payload } = await jose.jwtVerify(token, requireJwtSecret(env));
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email : '';
  const organizationId =
    typeof payload.organizationId === 'string' ? payload.organizationId : '';
  const role = typeof payload.role === 'string' ? payload.role : '';
  if (!sub || !email || !organizationId || !role) {
    throw new Error('Invalid token payload');
  }
  return { sub, email, organizationId, role };
}

export async function requireAuth(
  env: Env,
  request: Request,
): Promise<{ sub: string; email: string; organizationId: string; role: string; ip: string } | Response> {
  const token = bearerToken(request);
  if (!token) {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }
  try {
    const claims = await verifyAccessToken(env, token);
    const supabase = getAdminClient(env);

    // Session-registry revocation check (spec 24.2.3 groundwork): reject tokens
    // whose session row is revoked. Tokens issued before the registry have no row
    // and stay valid; if the sessions table does not exist yet (migration 0003
    // unapplied) we warn and continue — same transitional treatment as the
    // membership fallback below. The signature check above always still applies.
    const sessionHash = await hashToken(token);
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .select('revoked_at').eq('token_hash', sessionHash).maybeSingle();
    if (sessionError) {
      console.warn('[requireAuth] session-registry lookup unavailable:', sessionError.message);
    } else if (session?.revoked_at) {
      return json({ statusCode: 401, message: 'Session has been revoked' }, 401);
    }

    const { data: user, error: userError } = await supabase.from('users')
      .select('id, email, is_active, organization_id, role').eq('id', claims.sub).maybeSingle();
    if (userError || !user || !user.is_active) return json({ statusCode: 401, message: 'Unauthorized' }, 401);
    const { data: membership, error: membershipError } = await supabase.from('organization_memberships')
      .select('organization_id, role, is_active')
      .eq('user_id', claims.sub).eq('organization_id', claims.organizationId).maybeSingle();

    if (membership) {
      // Membership truth wins: it carries the custom-role binding, so it fails closed.
      if (!membership.is_active) {
        return json({ statusCode: 401, message: 'Organization membership is inactive or missing' }, 401);
      }
      return { sub: claims.sub, email: user.email, organizationId: membership.organization_id, role: membership.role as string, ip: getClientIp(request) };
    }

    if (membershipError) return json({ statusCode: 401, message: 'Unauthorized' }, 401);

    // Transitional primary-org fallback (spec 33.1.2): memberships are backfilled by the
    // `eip_users_primary_membership` trigger in migration 0002, but until that migration is
    // applied some users have no membership row yet. Resolve from the SERVER-SIDE `users`
    // record — never client input — and only when it matches the token's organization, so a
    // stale or tampered token can never reach another tenant. Fails closed otherwise.
    // Remove this branch once membership truth is fully backfilled (33.1.2).
    if (!user.organization_id || !user.role || user.organization_id !== claims.organizationId) {
      return json({ statusCode: 401, message: 'Organization membership is inactive or missing' }, 401);
    }
    return { sub: claims.sub, email: user.email, organizationId: user.organization_id, role: user.role as string, ip: getClientIp(request) };
  } catch {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }
}

export function isOrgAdminRole(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function requireOrgAdmin(role: string): Response | null {
  if (!isOrgAdminRole(role)) {
    return json(
      { statusCode: 403, message: 'Only owners and admins can perform this action' },
      403,
    );
  }
  return null;
}

/**
 * Phase 3: Safeguard enforcement — validates required reason for privileged operations.
 *
 * Usage:
 *   const reasonErr = await enforceSafeguards(context, 'platform.feature_flag.update');
 *   if (reasonErr) return reasonErr;
 *
 * When the caller has already parsed the request body it MUST pass it as `parsedBody`:
 * a `Request` whose body has been read can no longer be cloned, so cloning inside this
 * helper would throw (fail-closed 400) even when a valid reason was supplied.
 */
export async function enforceSafeguards(
  context: { request: Request; env: Env },
  operationId: string,
  parsedBody?: unknown,
): Promise<Response | null> {
  const op = getOperation(operationId);
  if (!op) return null; // unknown operation — skip enforcement

  const needsReason = op.safeguards.safeguards.includes('reason_required');
  if (!needsReason) return null;

  let body = parsedBody;
  if (body === undefined) {
    try {
      body = await context.request.clone().json();
    } catch {
      // Body absent, unreadable, or already consumed — treated as a missing reason.
      body = undefined;
    }
  }

  const reason = extractReason(body);
  if (!reason) {
    return json(
      {
        statusCode: 400,
        message: `Operation "${op.label}" requires a non-empty reason.`,
        operationId,
      },
      400,
    );
  }
  return null;
}

/**
 * Pull a non-empty reason out of a request body. `flags` PATCH accepts an array of
 * `{ key, enabled, reason }` updates, so a collective reason is joined.
 */
function extractReason(body: unknown): string {
  if (Array.isArray(body)) {
    return body
      .map((entry) => (entry as Record<string, unknown> | null)?.reason)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join('; ');
  }
  if (!body || typeof body !== 'object') return '';
  const raw = (body as Record<string, unknown>).reason;
  return raw === undefined || raw === null ? '' : String(raw).trim();
}


export function assertCanAssignRole(actorRole: string, nextRole: UserRole): string | null {
  if (actorRole === 'owner') return null;
  if (actorRole === 'admin') {
    if (nextRole === 'owner' || nextRole === 'admin') {
      return 'Only the Owner can assign Owner or IT Admin';
    }
    const itRoles: UserRole[] = ['executive', 'manager', 'member', 'viewer'];
    if (!itRoles.includes(nextRole)) {
      return 'IT Admin cannot assign that role';
    }
    return null;
  }
  return 'Only Owner or IT Admin can assign roles';
}

export function assertCanManageOrgUser(
  actorRole: string,
  targetRole: string,
): string | null {
  if (actorRole === 'owner') return null;
  if (actorRole === 'admin') {
    if (targetRole === 'owner' || targetRole === 'admin') {
      return 'Only the Owner can manage Owner or IT Admin accounts';
    }
    return null;
  }
  return 'Only Owner or IT Admin can manage users';
}

export function parsePlatformAdminEmails(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function platformAdminFromEnv(env: Env, email: string): boolean {
  const allowlist = parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS);
  return allowlist.includes(email.trim().toLowerCase());
}

export async function hashToken(rawToken: string): Promise<string> {
  const data = new TextEncoder().encode(rawToken);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomTokenHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signSsoChallenge(
  env: Env,
  payload: { sub: string; email: string; organizationId: string; role: string },
): Promise<{ ssoToken: string; expiresIn: string }> {
  const expiresIn = '15m';
  const jose = await import('jose');
  const ssoToken = await new jose.SignJWT({
    ...payload,
    purpose: 'sso',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(requireJwtSecret(env));
  return { ssoToken, expiresIn };
}

export async function verifySsoChallenge(
  env: Env,
  token: string,
): Promise<{ sub: string; email: string; organizationId: string; role: string }> {
  const jose = await import('jose');
  const { payload } = await jose.jwtVerify(token, requireJwtSecret(env));
  if (payload.purpose !== 'sso') {
    throw new Error('Invalid SSO token');
  }
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email : '';
  const organizationId =
    typeof payload.organizationId === 'string' ? payload.organizationId : '';
  const role = typeof payload.role === 'string' ? payload.role : '';
  if (!sub || !email || !organizationId || !role) {
    throw new Error('Invalid SSO token payload');
  }
  return { sub, email, organizationId, role };
}

/**
 * Extract client IP from Cloudflare headers.
 * cf-connecting-ip is the most reliable on Cloudflare Workers/Pages.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  );
}

/**
 * Build an audit log row with optional IP.
 * Centralises the audit_logs insert shape so all call sites stay consistent.
 */
export function auditRow(params: {
  organizationId: string;
  userId?: string | null;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  return {
    id: crypto.randomUUID(),
    organization_id: params.organizationId,
    user_id: params.userId ?? null,
    action: params.action,
    resource: params.resource ?? null,
    metadata: params.metadata ?? null,
    ip_address: params.ip ?? null,
  };
}

// ─── Permission Evaluation (D.4) ─────────────────────────────────────────────

export interface PermissionEntry {
  permission: string;
  resources?: string[];
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Canonical §12.2 permission grammar — ONE implementation shared with the NestJS
 * evaluator (`services/identity/src/rbac/permission.service.ts`) via
 * `@ellines-eip/shared`. Invalid grants normalize to `null` and fail closed.
 */
export function normalizePermission(permission: string): string | null {
  return canonicalNormalizePermission(permission);
}
export function isValidPermission(permission: string): boolean {
  return canonicalIsValidPermission(permission);
}

/** Default permissions for each fixed role — mirrors PermissionService in NestJS identity. */
const FIXED_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner:     ['*'],
  admin:     ['org:*', 'connector:*', 'approval:*', 'rule:*', 'report:*', 'document:*', 'ellinea:*', 'audit:view', 'webhook:*', 'notification:*', 'sso:view'],
  executive: ['org:view', 'connector:read', 'approval:view', 'approval:decide', 'rule:view', 'report:view', 'report:create', 'report:run', 'document:view', 'document:upload', 'ellinea:ask', 'ellinea:view', 'audit:view', 'notification:view'],
  manager:   ['org:view', 'connector:read', 'approval:view', 'approval:request', 'rule:view', 'report:view', 'report:create', 'report:run', 'document:view', 'document:upload', 'ellinea:ask', 'notification:view'],
  member:    ['org:view', 'connector:read', 'approval:view', 'approval:request', 'report:view', 'document:view', 'ellinea:ask', 'notification:view'],
  viewer:    ['org:view', 'connector:read', 'report:view', 'document:view', 'notification:view'],
};

/**
 * Evaluate a single permission entry against the requested permission + optional resourceId.
 * String matching delegates to the canonical `matchPermission` evaluator (§12.2 rules 1–6,
 * fail-closed on invalid grants/targets); resource-ID scope (§12.3) is applied here.
 */
function evalEntry(entry: PermissionEntry | string, permission: string, resourceId?: string): boolean {
  const perm = typeof entry === 'string' ? entry : entry.permission;
  const lowerPerm = normalizePermission(perm);
  if (!lowerPerm) return false;

  if (lowerPerm === '*') return true;
  if (!matchPermission(perm, permission)) return false;

  if (typeof entry !== 'string' && resourceId && entry.resources?.length) {
    if (!entry.resources.includes(resourceId)) return false;
  }
  return true;
}

/**
 * Check whether a user (by role + optional customRolePermissions) can perform `permission`.
 * Cheap — no DB round-trip when called with JWT role only.
 */
export function canByRole(
  role: string,
  permission: string,
  resourceId?: string,
  customPermissions?: PermissionEntry[],
): boolean {
  // Custom role overrides fixed role if provided
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions.some((e) => evalEntry(e, permission, resourceId));
  }
  const perms = FIXED_ROLE_PERMISSIONS[role] ?? [];
  return perms.some((p) => evalEntry(p, permission, resourceId));
}

/**
 * Full permission check: reads customRoleId from org_memberships if needed.
 * Use when the JWT role alone isn't enough (i.e. user might have a custom role).
 */
export async function checkPermission(
  env: Env,
  userId: string,
  organizationId: string,
  role: string,
  permission: string,
  resourceId?: string,
): Promise<boolean> {
  const supabase = getAdminClient(env);
  const { data: membership } = await supabase.from('organization_memberships')
    .select('role, custom_role_id, is_active')
    .eq('user_id', userId).eq('organization_id', organizationId).maybeSingle();
  if (!membership || !membership.is_active) return false;
  if (membership.custom_role_id) {
    const { data: customRole } = await supabase.from('custom_roles')
      .select('permissions').eq('id', membership.custom_role_id).eq('is_active', true).maybeSingle();
    if (customRole?.permissions) {
      const perms = customRole.permissions as PermissionEntry[];
      return perms.some((e) => evalEntry(e, permission, resourceId));
    }
  }
  return canByRole(membership.role as string, permission, resourceId);
}

/** Return a 403 Response or null if allowed. Cheap role-only check — no DB. */
export function requirePermission(role: string, permission: string): Response | null {
  if (canByRole(role, permission)) return null;
  return json({ statusCode: 403, message: `Permission denied: ${permission}` }, 403);
}

/**
 * Full async permission check with custom role support.
 * Returns a 403 Response or null if allowed.
 * Use when the user might have a custom role assigned.
 */
export async function requirePermissionAsync(
  env: Env,
  userId: string,
  organizationId: string,
  role: string,
  permission: string,
  resourceId?: string,
): Promise<Response | null> {
  const allowed = await checkPermission(env, userId, organizationId, role, permission, resourceId);
  if (allowed) return null;
  return json(
    { statusCode: 403, message: `Permission denied: ${permission}${resourceId ? ` on ${resourceId}` : ''}` },
    403,
  );
}
