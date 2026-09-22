/**
 * Phase 0 canonical contract — platform users + related Phase 0 surfaces.
 *
 * Source of truth per docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md
 *   Section 24.1 item 1: "global password policy (min length 8 [VERIFIED for auth flows];
 *   parity fix required G-02)"
 *   Section 7.5 + 40 (G-14): single platform user-API contract
 *   Section 7.9 + 40 (G-01): package create payload uses `displayName` (camelCase)
 *
 * Architecture: Shared contract -> Pages Functions implementation
 *               Shared contract -> NestJS implementation
 * Neither backend is authoritative over the other.
 */

/** Authoritative minimum password length (spec 24.1). Do not change without spec revision. */
export const PASSWORD_MIN_LENGTH = 8;

/** Spec reference for auditability. */
export const PASSWORD_POLICY_SPEC_REF =
  'docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md §24.1(1): global password policy (min length 8)';

export function isPasswordCompliant(password: unknown): boolean {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

export function assertPasswordCompliant(password: unknown, field = 'password'): void {
  if (!isPasswordCompliant(password)) {
    throw new RangeError(`${field} must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}

/** Canonical package-creation request field (G-01). Backend maps it to DB column display_name. */
export const PACKAGE_CREATE_DISPLAY_FIELD = 'displayName' as const;
export const PACKAGE_CREATE_DEPRECATED_FIELD = 'display_name' as const;

export interface PlatformPackageCreateContract {
  endpoint: string;
  method: 'POST';
  path: '/api/v1/platform/packages';
  /** Canonical request field — camelCase. */
  requestFields: {
    name: string;
    displayName: string;
    maxUsers?: number | null;
    maxConnectors?: number | null;
    requestsPerDay?: number;
    monthlyPrice?: number;
    enableSso?: boolean;
    enableCustomRoles?: boolean;
    enableAgents?: boolean;
    enableAdvancedBi?: boolean;
    enableWebhooks?: boolean;
  };
  responseFields: string[];
  errors: Record<string, number>;
}

export const PLATFORM_PACKAGE_CREATE_CONTRACT: PlatformPackageCreateContract = {
  endpoint: 'platform.packages.create',
  method: 'POST',
  path: '/api/v1/platform/packages',
  requestFields: {
    name: 'string (required, slug-normalized server-side)',
    displayName: 'string (required, canonical — NOT display_name)',
  } as unknown as PlatformPackageCreateContract['requestFields'],
  responseFields: [
    'id',
    'name',
    'display_name',
    'requests_per_day',
    'requests_per_hour',
    'requests_per_minute',
    'burst_limit',
    'max_connectors',
    'max_users',
  ],
  errors: { invalidBody: 400, missingFields: 400, conflict: 409 },
};

/** Validate a raw package-create body against the canonical contract. */
export function validatePackageCreateBody(body: Record<string, unknown>): { ok: boolean; reason?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'body must be an object' };
  }
  const displayName = body[PACKAGE_CREATE_DISPLAY_FIELD];
  if (typeof displayName !== 'string' || !displayName.trim()) {
    return { ok: false, reason: `${PACKAGE_CREATE_DISPLAY_FIELD} is required` };
  }
  const name = body['name'];
  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, reason: 'name is required' };
  }
  // Deprecated snake_case field must not be the carrier of the display name.
  if (
    PACKAGE_CREATE_DEPRECATED_FIELD in body &&
    !(PACKAGE_CREATE_DISPLAY_FIELD in body)
  ) {
    return {
      ok: false,
      reason: `deprecated field ${PACKAGE_CREATE_DEPRECATED_FIELD} used without canonical ${PACKAGE_CREATE_DISPLAY_FIELD}`,
    };
  }
  return { ok: true };
}

// ── Platform users (G-14 canonical contract) ────────────────────────────────

export type PlatformUserParamStyle = 'query';

export interface PlatformUserRouteContract {
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  queryParams: string[];
  pathParams: string[];
  requestFields: string[];
  passwordPolicy: number;
  responseFields: string[];
  errors: Record<string, number>;
}

export const PLATFORM_USER_PARAM_STYLE: PlatformUserParamStyle = 'query';

export const PLATFORM_USERS_CONTRACT: PlatformUserRouteContract[] = [
  {
    endpoint: 'platform.org.users.list',
    method: 'GET',
    path: '/api/v1/platform/orgs/:id/users',
    queryParams: [],
    pathParams: ['id'],
    requestFields: [],
    passwordPolicy: PASSWORD_MIN_LENGTH,
    responseFields: ['id', 'email', 'fullName', 'role', 'isActive', 'createdAt', 'updatedAt'],
    errors: { forbidden: 403, notFound: 404 },
  },
  {
    endpoint: 'platform.org.users.create',
    method: 'POST',
    path: '/api/v1/platform/orgs/:id/users',
    queryParams: [],
    pathParams: ['id'],
    requestFields: ['email', 'fullName', 'password', 'role'],
    passwordPolicy: PASSWORD_MIN_LENGTH,
    responseFields: ['id', 'email', 'fullName', 'role', 'isActive', 'createdAt', 'updatedAt'],
    errors: { invalidBody: 400, weakPassword: 400, conflict: 409, notFound: 404 },
  },
  {
    endpoint: 'platform.org.users.update',
    method: 'PATCH',
    path: '/api/v1/platform/orgs/:id/users',
    queryParams: ['userId'],
    pathParams: ['id'],
    requestFields: ['fullName', 'role', 'isActive', 'password'],
    passwordPolicy: PASSWORD_MIN_LENGTH,
    responseFields: ['id', 'email', 'fullName', 'role', 'isActive', 'createdAt', 'updatedAt'],
    errors: { missingUserId: 400, weakPassword: 400, notFound: 404 },
  },
  {
    endpoint: 'platform.org.users.deactivate',
    method: 'DELETE',
    path: '/api/v1/platform/orgs/:id/users',
    queryParams: ['userId'],
    pathParams: ['id'],
    requestFields: [],
    passwordPolicy: PASSWORD_MIN_LENGTH,
    responseFields: ['ok', 'message'],
    errors: { missingUserId: 400, notFound: 404 },
  },
];

export const PLATFORM_ORG_CREATE_CONTRACT = {
  endpoint: 'platform.org.create',
  method: 'POST' as const,
  path: '/api/v1/platform/orgs/create',
  queryParams: [] as string[],
  requestFields: ['name', 'slug', 'ownerEmail', 'ownerFullName', 'ownerPassword'],
  passwordPolicy: PASSWORD_MIN_LENGTH,
  responseFields: ['id', 'name', 'slug', 'createdAt', 'userCount', 'status', 'owner'],
  errors: { invalidBody: 400, weakPassword: 400, conflict: 409 },
};

/**
 * Structural validator: does a NestJS-style route path conform to the canonical
 * query-param contract? Path-param style (`/:userId`) is divergent.
 */
export function isPlatformUserPathConformant(routePath: string): boolean {
  const normalized = routePath.trim();
  if (/:userId/i.test(normalized)) return false;
  return true;
}

/** Assert a PATCH/DELETE implementation uses ?userId= and not /:userId. */
export function assertPlatformUserParamStyle(routePath: string): void {
  if (!isPlatformUserPathConformant(routePath)) {
    throw new Error(
      `divergent platform-user param style: ${routePath} uses path param :userId; canonical is query param ?userId=`,
    );
  }
}