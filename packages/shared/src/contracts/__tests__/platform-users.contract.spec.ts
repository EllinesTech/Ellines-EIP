/**
 * Phase 0 structural contract validation.
 * Canonical source: ../platform-users.contract.ts
 * Neither backend is authoritative; both must conform to the shared contract.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  PASSWORD_MIN_LENGTH,
  isPasswordCompliant,
  assertPasswordCompliant,
  PACKAGE_CREATE_DISPLAY_FIELD,
  PACKAGE_CREATE_DEPRECATED_FIELD,
  validatePackageCreateBody,
  PLATFORM_USERS_CONTRACT,
  PLATFORM_USER_PARAM_STYLE,
  isPlatformUserPathConformant,
  assertPlatformUserParamStyle,
} from '../platform-users.contract';

function repoRoot(): string {
  // __dirname = packages/shared/src/contracts/__tests__
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}

function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(repoRoot(), rel), 'utf8');
}

describe('Phase 0 canonical contract', () => {
  test('password minimum is authoritative 8 (spec 24.1)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  test('password boundary: below-min rejected, min and above accepted', () => {
    const below = 'a'.repeat(PASSWORD_MIN_LENGTH - 1); // 7
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH); // 8
    const above = 'a'.repeat(PASSWORD_MIN_LENGTH + 1); // 9
    expect(isPasswordCompliant(below)).toBe(false);
    expect(isPasswordCompliant(exact)).toBe(true);
    expect(isPasswordCompliant(above)).toBe(true);
    expect(() => assertPasswordCompliant(below)).toThrow(/at least 8/);
    expect(() => assertPasswordCompliant(exact)).not.toThrow();
    expect(() => assertPasswordCompliant(above)).not.toThrow();
  });

  test('divergent password implementation fails validation', () => {
    // Simulate an implementation that accepts 6-char passwords (old bug).
    const divergentAccepts = (pwd: string) => pwd.length >= 6;
    const seven = 'a'.repeat(7);
    // Divergent impl would accept 7, canonical must reject 7 only if min were 8? No:
    // canonical rejects 7, divergent-with-6 accepts 7 -> divergence detectable.
    expect(divergentAccepts(seven)).toBe(true);
    expect(isPasswordCompliant(seven)).toBe(false);
    // A stricter divergent impl (min 9) would reject the canonical 8.
    const strictAccepts = (pwd: string) => pwd.length >= 9;
    expect(strictAccepts('a'.repeat(8))).toBe(false);
    expect(isPasswordCompliant('a'.repeat(8))).toBe(true);
  });

  test('Pages + NestJS password implementations conform to min 8', () => {
    const validation = readRepoFile('apps/web/functions/shared/validation.ts');
    expect(validation).toMatch(/validatePassword\(value: unknown, minLength = 8\)/);

    const login = readRepoFile('apps/web/functions/api/v1/auth/login.ts');
    expect(login).toMatch(/validatePassword\(body\.password, 8\)/);
    const register = readRepoFile('apps/web/functions/api/v1/auth/register.ts');
    expect(register).toMatch(/validatePassword\(body\.password, 8\)/);

    const reset = readRepoFile('apps/web/functions/api/v1/auth/reset-password.ts');
    expect(reset).toMatch(/newPassword\.length < 8/);
    expect(reset).not.toMatch(/newPassword\.length < 6/);

    const change = readRepoFile('apps/web/functions/api/v1/auth/change-password.ts');
    expect(change).toMatch(/newPassword\.length < 8/);
    expect(change).not.toMatch(/newPassword\.length < 6/);

    const accept = readRepoFile('apps/web/functions/api/v1/auth/accept-invite.ts');
    expect(accept).toMatch(/password.*length < 8/);
    expect(accept).not.toMatch(/length < 6/);

    const orgCreate = readRepoFile('apps/web/functions/api/v1/platform/orgs/create.ts');
    expect(orgCreate).toMatch(/ownerPassword\.length < 8/);
    expect(orgCreate).not.toMatch(/ownerPassword\.length < 6/);
    expect(orgCreate).toMatch(/at least 8 characters/);

    const orgUsers = readRepoFile('apps/web/functions/api/v1/platform/orgs/[id]/users.ts');
    expect(orgUsers).toMatch(/password\.length < 8/);
    expect(orgUsers).not.toMatch(/password\.length < 6/);

    const nestService = readRepoFile('services/identity/src/platform/platform.service.ts');
    const sixMatches = nestService.match(/length < 6/g) || [];
    expect(sixMatches.length).toBe(0);
    expect(nestService).toMatch(/ownerPassword.*length < 8/);
    expect(nestService).toMatch(/dto\.password.*length < 8/);
  });

  test('package creation uses canonical displayName (G-01)', () => {
    expect(PACKAGE_CREATE_DISPLAY_FIELD).toBe('displayName');
    expect(validatePackageCreateBody({ name: 'x', displayName: 'X' }).ok).toBe(true);
    // Intentionally divergent body using only snake_case must fail.
    const divergent = validatePackageCreateBody({ name: 'x', display_name: 'X' } as unknown as Record<string, unknown>);
    expect(divergent.ok).toBe(false);

    const backend = readRepoFile('apps/web/functions/api/v1/platform/packages.ts');
    expect(backend).toMatch(/body\.displayName/);
    expect(backend).toMatch(/name and displayName are required/);

    const client = readRepoFile('apps/web/src/lib/api.ts');
    expect(client).toMatch(/displayName: string/);
    // Canonical create helper must not send snake_case display_name.
    const createFn = client.slice(client.indexOf('export function createPlatformPackage'));
    const createFnEnd = client.indexOf('export function updatePlatformPackage');
    const createBlock = client.slice(createFn.length > 0 ? client.indexOf('export function createPlatformPackage') : 0, createFnEnd);
    expect(createBlock).toMatch(/displayName/);
    expect(createBlock).not.toMatch(/display_name/);

    const page = readRepoFile('apps/web/src/app/app/platform/page.tsx');
    expect(page).toMatch(/pkg\.displayName/);
    expect(page).not.toMatch(/pkg\.display_name/);
  });

  test('platform-user param style is query ?userId= (G-14)', () => {
    expect(PLATFORM_USER_PARAM_STYLE).toBe('query');
    const update = PLATFORM_USERS_CONTRACT.find((r) => r.endpoint === 'platform.org.users.update')!;
    const del = PLATFORM_USERS_CONTRACT.find((r) => r.endpoint === 'platform.org.users.deactivate')!;
    expect(update.queryParams).toEqual(['userId']);
    expect(del.queryParams).toEqual(['userId']);
    expect(update.path).not.toMatch(/:userId/);
    expect(del.path).not.toMatch(/:userId/);

    // Divergent path-param style must fail validation.
    expect(isPlatformUserPathConformant('/api/v1/platform/orgs/:id/users')).toBe(true);
    expect(isPlatformUserPathConformant('/api/v1/platform/orgs/:id/users/:userId')).toBe(false);
    expect(() => assertPlatformUserParamStyle('orgs/:id/users/:userId')).toThrow(/query param/);
    expect(() => assertPlatformUserParamStyle('orgs/:id/users')).not.toThrow();

    // Pages implementation uses query param.
    const pagesUsers = readRepoFile('apps/web/functions/api/v1/platform/orgs/[id]/users.ts');
    expect(pagesUsers).toMatch(/searchParams\.get\('userId'\)/);
    expect(pagesUsers).toMatch(/userId query param required/);

    // NestJS implementation must use @Query userId, not path param.
    const controller = readRepoFile('services/identity/src/platform/platform.controller.ts');
    expect(controller).toMatch(/@Patch\('orgs\/:id\/users'\)/);
    expect(controller).toMatch(/@Delete\('orgs\/:id\/users'\)/);
    expect(controller).not.toMatch(/orgs\/:id\/users\/:userId/);
    expect(controller).toMatch(/@Query\('userId'\)/);

    // Web client uses query param.
    const client = readRepoFile('apps/web/src/lib/api.ts');
    expect(client).toMatch(/\/users\?userId=\$\{encodeURIComponent\(userId\)\}/);
  });

  test('contract response shapes are documented', () => {
    for (const route of PLATFORM_USERS_CONTRACT) {
      expect(route.responseFields.length).toBeGreaterThan(0);
      expect(route.errors).toBeDefined();
      expect(route.passwordPolicy).toBe(PASSWORD_MIN_LENGTH);
    }
    expect(PLATFORM_USERS_CONTRACT.length).toBe(4);
  });

  test('dead duplicate exports are gone (G-06)', () => {
    const client = readRepoFile('apps/web/src/lib/api.ts');
    for (const dead of [
      'listPlatformOrgUsersDetailed',
      'createPlatformUser(',
      'updatePlatformUser(',
      'deactivatePlatformUser(',
      'togglePlatformFlag(',
      'fetchPlatformAudit(',
      'listAgentsApi(',
      'compareReports(',
      'runReportApi(',
    ]) {
      // Canonical similarly-named exports (createPlatformOrgUser etc.) must remain,
      // so check exact dead identifiers.
      if (dead === 'compareReports(') {
        expect(client).not.toMatch(/export function compareReports\(/);
        expect(client).toMatch(/export function compareReportsApi\(/);
      } else if (dead === 'runReportApi(') {
        expect(client).not.toMatch(/export function runReportApi\(/);
        expect(client).toMatch(/export function runReportFullApi\(/);
      } else if (dead === 'listAgentsApi(') {
        expect(client).not.toMatch(/export function listAgentsApi\(/);
        expect(client).toMatch(/export function listAgents\(/);
      } else {
        expect(client).not.toContain(dead.replace('(', ''));
      }
    }
    // Canonical implementations remain.
    expect(client).toMatch(/export function listPlatformOrgUsers\(/);
    expect(client).toMatch(/export function createPlatformOrgUser\(/);
    expect(client).toMatch(/export function updatePlatformOrgUser\(/);
    expect(client).toMatch(/export function deactivatePlatformOrgUser\(/);
    expect(client).toMatch(/export function updatePlatformFlag\(/);
    expect(client).toMatch(/export function listPlatformAuditLogs\(/);
  });
});