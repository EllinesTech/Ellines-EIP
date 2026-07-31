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

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers':
        'Content-Type, Authorization, X-EIP-Organization-Id, X-EIP-Webhook-Secret',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
): Promise<{ sub: string; email: string; organizationId: string; role: string } | Response> {
  const token = bearerToken(request);
  if (!token) {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }
  try {
    return await verifyAccessToken(env, token);
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
