/**
 * Dev-only auth helper for Next.js Pages API routes.
 * Mirrors the JWT verification logic from functions/shared/auth.ts but
 * uses process.env (available in Next.js server context) instead of
 * Cloudflare Workers env bindings.
 *
 * Only used in local dev — production uses real Pages Functions.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';
import type { NextApiRequest, NextApiResponse } from 'next';

export function devJson(res: NextApiResponse, data: unknown, status = 200) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'Content-Type, Authorization');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.status(status).json(data);
}

export function getDevSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthClaims = {
  sub: string;
  email: string;
  organizationId: string;
  role: string;
};

export async function requireDevAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<AuthClaims | null> {
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) { devJson(res, { statusCode: 401, message: 'Unauthorized' }, 401); return null; }

  const secret = process.env.JWT_SECRET;
  if (!secret) { devJson(res, { statusCode: 500, message: 'JWT_SECRET not configured' }, 500); return null; }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const organizationId = typeof payload.organizationId === 'string' ? payload.organizationId : '';
    const role = typeof payload.role === 'string' ? payload.role : '';
    if (!sub || !email || !organizationId || !role) {
      devJson(res, { statusCode: 401, message: 'Invalid token payload' }, 401); return null;
    }
    return { sub, email, organizationId, role };
  } catch {
    devJson(res, { statusCode: 401, message: 'Unauthorized' }, 401); return null;
  }
}

export function isOrgAdmin(role: string) {
  return role === 'owner' || role === 'admin';
}
