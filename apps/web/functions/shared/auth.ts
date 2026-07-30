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

export async function signAccessToken(
  env: Env,
  payload: { sub: string; email: string; organizationId: string; role: string },
): Promise<{ accessToken: string; expiresIn: string }> {
  const secret = env.JWT_SECRET || 'ellines-eip-dev-secret';
  const expiresIn = env.JWT_EXPIRES_IN || '24h';
  const jose = await import('jose');
  const key = new TextEncoder().encode(secret);
  const accessToken = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
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
  const secret = env.JWT_SECRET || 'ellines-eip-dev-secret';
  const jose = await import('jose');
  const key = new TextEncoder().encode(secret);
  const { payload } = await jose.jwtVerify(token, key);
  return {
    sub: String(payload.sub || ''),
    email: String(payload.email || ''),
    organizationId: String(payload.organizationId || ''),
    role: String(payload.role || ''),
  };
}
