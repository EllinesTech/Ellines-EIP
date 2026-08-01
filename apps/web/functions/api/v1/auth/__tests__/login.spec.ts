/**
 * Test suite for POST /api/v1/auth/login
 * Critical path: auth, rate limiting, validation
 */

import { onRequest } from '../login';
import type { PagesFunction } from '@cloudflare/workers-types';

describe('POST /api/v1/auth/login', () => {
  // Mock context and environment
  const mockEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    JWT_SECRET: 'test-secret-key-min-32-chars-long',
    JWT_EXPIRES_IN: '24h',
  };

  const createMockRequest = (body: unknown, method = 'POST'): Request => {
    return new Request('http://localhost/api/v1/auth/login', {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
  };

  const createMockContext = (request: Request) => ({
    request,
    env: mockEnv,
    params: {},
  }) as unknown as Parameters<PagesFunction>[0];

  it('should reject GET requests', async () => {
    const req = createMockRequest(null, 'GET');
    const ctx = createMockContext(req);
    const res = await onRequest(ctx);
    expect(res.status).toBe(405);
  });

  it('should reject invalid JSON', async () => {
    const req = new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: 'invalid-json',
    });
    const ctx = createMockContext(req);
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.statusCode).toBe(400);
  });

  it('should reject missing email', async () => {
    const req = createMockRequest({ password: 'test123' });
    const ctx = createMockContext(req);
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.message).toContain('email');
  });

  it('should reject invalid email format', async () => {
    const req = createMockRequest({ email: 'not-an-email', password: 'test123' });
    const ctx = createMockContext(req);
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it('should reject short password', async () => {
    const req = createMockRequest({ email: 'test@example.com', password: 'short' });
    const ctx = createMockContext(req);
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it('should reject oversized payloads', async () => {
    const largePayload = 'x'.repeat(6_000_000);
    const req = new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '6000000',
      },
      body: JSON.stringify({ email: 'test@example.com', password: largePayload }),
    });
    const ctx = createMockContext(req);
    const res = await onRequest(ctx);
    expect(res.status).toBe(413);
  });
});
