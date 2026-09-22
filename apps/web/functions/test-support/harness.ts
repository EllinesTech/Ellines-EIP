/**
 * Shared test harness for Pages Functions suites: env, EventContext and token builders.
 */

import type { PagesFunction } from '@cloudflare/workers-types';
import { signAccessToken, type Env } from '../shared/auth';

export const ORG_A = 'org-alpha';
export const ORG_B = 'org-beta';
export const ORG_PLATFORM = 'org-platform';
export const PLATFORM_OPERATOR_EMAIL = 'operator@ellines.co.ke';

export type TestEnv = Env & Record<string, unknown>;

export const TEST_ENV: TestEnv = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
  JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
  PLATFORM_ADMIN_EMAILS: PLATFORM_OPERATOR_EMAIL,
};

export function envWith(overrides: Record<string, unknown> = {}): TestEnv {
  return { ...TEST_ENV, ...overrides };
}

export interface TestContextOptions {
  next?: () => Promise<Response>;
}

/** Build a PagesFunction EventContext with a passthrough `next`. */
export function context(
  request: Request,
  env: TestEnv,
  options: TestContextOptions = {},
) {
  const next = options.next ?? (async () => new Response('passed-through', { status: 200 }));
  return {
    request,
    env,
    params: {},
    data: {},
    functionPath: new URL(request.url).pathname,
    next,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as Parameters<PagesFunction<TestEnv>>[0];
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export interface TokenClaims {
  sub: string;
  email: string;
  organizationId: string;
  role: string;
}

/** Mint a real (mocked-jose) access token for a set of claims. */
export async function makeToken(claims: TokenClaims, env: TestEnv = TEST_ENV): Promise<string> {
  const { accessToken } = await signAccessToken(env, claims);
  return accessToken;
}

export interface SeedTenantOptions {
  userId: string;
  email: string;
  organizationId: string;
  role?: string;
  membership?: 'active' | 'inactive' | 'absent';
  customRoleId?: string | null;
  orgSettings?: Record<string, unknown>;
}

/** Seed a user + optional membership row for one tenant. */
export function seedTenant(
  db: { seed: (table: string, rows: Array<Record<string, any>>) => unknown },
  options: SeedTenantOptions,
): void {
  const {
    userId,
    email,
    organizationId,
    role = 'owner',
    membership = 'active',
    customRoleId = null,
    orgSettings = {},
  } = options;

  db.seed('users', [
    { id: userId, email, is_active: true, organization_id: organizationId, role },
  ]);
  db.seed('organizations', [
    { id: organizationId, name: organizationId, slug: organizationId, settings: orgSettings },
  ]);
  db.seed('organization_memberships', membership === 'absent' ? [] : [
    {
      id: `membership-${userId}`,
      user_id: userId,
      organization_id: organizationId,
      role,
      custom_role_id: customRoleId,
      is_active: membership === 'active',
    },
  ]);
}
