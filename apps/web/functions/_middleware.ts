import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from './shared/auth';

const DEFAULT_ALLOWED_ORIGINS = ['https://eip.ellines.co.ke','https://ellines-eip.pages.dev','http://localhost:3100'];

function allowedOrigins(env: Env): Set<string> {
  const raw = env.CORS_ALLOWED_ORIGINS?.split(',').map((v) => v.trim()).filter(Boolean);
  return new Set(raw?.length ? raw : DEFAULT_ALLOWED_ORIGINS);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const origin = context.request.headers.get('Origin');
  const allowed = allowedOrigins(context.env);
  if (origin && !allowed.has(origin)) {
    return new Response(JSON.stringify({ statusCode: 403, message: 'Origin not allowed' }), {
      status: 403, headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  if (context.request.method === 'OPTIONS') {
    if (!origin) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-EIP-Organization-Id, X-EIP-Webhook-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400', Vary: 'Origin',
    }});
  }
  const response = await context.next();
  const out = new Response(response.body, response);
  if (origin) {
    out.headers.set('Access-Control-Allow-Origin', origin);
    out.headers.set('Access-Control-Allow-Credentials', 'true');
    out.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-EIP-Organization-Id, X-EIP-Webhook-Secret');
    out.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    out.headers.set('Vary', 'Origin');
  }
  return out;
};