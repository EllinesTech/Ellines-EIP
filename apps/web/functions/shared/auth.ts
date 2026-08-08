import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  /** Comma-separated Ellines operator emails (platform Super Admin). */
  PLATFORM_ADMIN_EMAILS?: string;
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
      'access-control-allow-origin': '*',
      'access-control-allow-headers':
        'Content-Type, Authorization, X-EIP-Organization-Id, X-EIP-Webhook-Secret',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
    // Capture IP from Cloudflare header for audit logs
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '';
    return { ...claims, ip };
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

/** Default permissions for each fixed role — mirrors PermissionService in NestJS identity. */
const FIXED_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner:     ['*'],
  admin:     ['org:*', 'connector:*', 'approval:*', 'rule:*', 'report:*', 'document:*', 'ellinea:*', 'audit:view', 'webhook:*', 'notification:*', 'sso:view'],
  executive: ['org:view', 'connector:read', 'approval:view', 'approval:decide', 'rule:view', 'report:view', 'report:create', 'report:run', 'document:view', 'document:upload', 'ellinea:ask', 'ellinea:view', 'audit:view', 'notification:view'],
  manager:   ['org:view', 'connector:read', 'approval:view', 'approval:request', 'rule:view', 'report:view', 'report:create', 'report:run', 'document:view', 'document:upload', 'ellinea:ask', 'notification:view'],
  member:    ['org:view', 'connector:read', 'approval:view', 'approval:request', 'report:view', 'document:view', 'ellinea:ask', 'notification:view'],
  viewer:    ['org:view', 'connector:read', 'report:view', 'document:view', 'notification:view'],
};

/** Evaluate a single permission entry against the requested permission + optional resourceId. */
function evalEntry(entry: PermissionEntry | string, permission: string, resourceId?: string): boolean {
  const perm = typeof entry === 'string' ? entry : entry.permission;
  const lowerPerm = perm.toLowerCase();
  const lowerTarget = permission.toLowerCase();

  if (lowerPerm === '*') return true;
  if (lowerPerm.endsWith(':*')) {
    if (!lowerTarget.startsWith(lowerPerm.slice(0, -1))) return false;
  } else if (lowerPerm !== lowerTarget) {
    return false;
  }

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
  // Owner always passes — fast path
  if (role === 'owner') return true;

  // Check if user has a custom role in this org
  const supabase = getAdminClient(env);
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('custom_role_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (membership?.custom_role_id) {
    const { data: customRole } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('id', membership.custom_role_id)
      .eq('is_active', true)
      .maybeSingle();

    if (customRole?.permissions) {
      const perms = customRole.permissions as PermissionEntry[];
      return perms.some((e) => evalEntry(e, permission, resourceId));
    }
  }

  // Fall back to fixed role
  return canByRole(role, permission, resourceId);
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
