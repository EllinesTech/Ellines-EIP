import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
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
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
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
