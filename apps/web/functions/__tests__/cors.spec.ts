/**
 * CORS matrix (Phase 2 acceptance / spec 24.3 surface controls): allowed origins
 * succeed with credentialed headers, disallowed origins are rejected before the
 * route runs, preflight behaves per spec, and `Access-Control-Allow-Origin: *`
 * never appears anywhere.
 */
import { onRequest } from '../_middleware';
import { context, envWith, type TestEnv } from '../test-support/harness';

const ALLOWED_ORIGIN = 'https://eip.ellines.co.ke';
const ALSO_ALLOWED = 'https://ellines-eip.pages.dev';
const DISALLOWED_ORIGIN = 'https://evil.example';
const ROUTE_URL = 'https://eip.ellines.co.ke/api/v1/orgs/me';

function req(method: string, origin?: string): Request {
  const headers: Record<string, string> = {};
  if (origin) headers['Origin'] = origin;
  return new Request(ROUTE_URL, { method, headers });
}

function run(
  method: string,
  origin: string | undefined,
  env: TestEnv,
  next: () => Promise<Response> = async () => new Response('passed-through', { status: 200 }),
) {
  return onRequest(context(req(method, origin), env, { next }) as unknown as Parameters<typeof onRequest>[0]);
}

describe('CORS matrix — allowed origins', () => {
  it.each([ALLOWED_ORIGIN, ALSO_ALLOWED])(
    'passes %s through with credentialed CORS headers and never *',
    async (origin) => {
      const next = jest.fn(async () => new Response('passed-through', { status: 200 }));
      const response = await run('GET', origin, envWith(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('passed-through');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
      expect(response.headers.get('Vary')).toBe('Origin');
    },
  );

  it('passes requests without an Origin header through without CORS headers', async () => {
    const next = jest.fn(async () => new Response('passed-through', { status: 200 }));
    const response = await run('GET', undefined, envWith(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('honours CORS_ALLOWED_ORIGINS as a full replacement allowlist', async () => {
    const env = envWith({ CORS_ALLOWED_ORIGINS: 'https://custom.example, https://extra.example' });

    const custom = await run('GET', 'https://custom.example', env);
    expect(custom.status).toBe(200);
    expect(custom.headers.get('Access-Control-Allow-Origin')).toBe('https://custom.example');

    // Default-list origins are no longer allowed once the env overrides the list.
    const formerDefault = await run('GET', ALLOWED_ORIGIN, env);
    expect(formerDefault.status).toBe(403);
    expect(formerDefault.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('CORS matrix — disallowed origins', () => {
  it('rejects a disallowed origin with 403 before the route runs', async () => {
    const next = jest.fn(async () => new Response('passed-through', { status: 200 }));
    const response = await run('GET', DISALLOWED_ORIGIN, envWith(), next);
    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ statusCode: 403, message: 'Origin not allowed' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('CORS matrix — preflight (OPTIONS)', () => {
  it('answers an allowed preflight with headers, credentials and max-age', async () => {
    const next = jest.fn(async () => new Response('never', { status: 200 }));
    const response = await run('OPTIONS', ALLOWED_ORIGIN, envWith(), next);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('rejects a disallowed preflight with 403 and no CORS headers', async () => {
    const response = await run('OPTIONS', DISALLOWED_ORIGIN, envWith());
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.message).toBe('Origin not allowed');
  });

  it('answers a preflight without Origin with an empty 204', async () => {
    const response = await run('OPTIONS', undefined, envWith());
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
