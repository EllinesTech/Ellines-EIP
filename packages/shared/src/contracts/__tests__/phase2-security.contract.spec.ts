import * as fs from 'fs';
import * as path from 'path';

function repoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}
function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(repoRoot(), rel), 'utf8');
}

describe('Phase 2 platform security contracts', () => {
  test('membership is the server-side authorization source of truth', () => {
    const auth = readRepoFile('apps/web/functions/shared/auth.ts');
    expect(auth).toMatch(/from\('organization_memberships'\)/);
    expect(auth).toMatch(/role: membership\.role/);
    expect(auth).toMatch(/membership\.is_active/);

    const migration = readRepoFile('services/identity/prisma/migrations/0002_phase2_membership_truth/migration.sql');
    expect(migration).toMatch(/INSERT INTO organization_memberships/);
    expect(migration).toMatch(/CREATE TRIGGER eip_users_primary_membership/);
    expect(migration).toMatch(/AFTER INSERT OR UPDATE OF organization_id, role, is_active/);
  });

  test('AI ignores client-controlled authorization and grounding', () => {
    const ask = readRepoFile('apps/web/functions/api/v1/ellinea/ask.ts');
    expect(ask).toMatch(/requirePermissionAsync\([^\n]+ellinea:ask/);
    expect(ask).toMatch(/const role = auth\.role/);
    expect(ask).toMatch(/const organizationName = org\.name/);
    expect(ask).toMatch(/const serverSummary = snapshot/);
    expect(ask).not.toMatch(/const role = typeof body\.role/);
    expect(ask).not.toMatch(/const clientMemory = normalizeNotes\(body\.memory\)/);
  });

  test('CORS has an explicit allowlist and no wildcard helper', () => {
    const middleware = readRepoFile('apps/web/functions/_middleware.ts');
    expect(middleware).toMatch(/CORS_ALLOWED_ORIGINS/);
    expect(middleware).toMatch(/Origin not allowed/);
    for (const file of ['apps/web/functions/shared/auth.ts','apps/web/functions/shared/errors.ts']) {
      expect(readRepoFile(file)).not.toContain("access-control-allow-origin': '*'");
    }
  });

  test('G-12 mutations write complete audit context', () => {
    for (const file of ['apps/web/functions/api/v1/platform/flags.ts','apps/web/functions/api/v1/platform/connector-packs.ts']) {
      const source = readRepoFile(file);
      expect(source).toMatch(/auditRow\(/);
      expect(source).toMatch(/correlationId/);
      expect(source).toMatch(/before:/);
      expect(source).toMatch(/after:/);
      expect(source).toMatch(/result: 'success'/);
    }
  });

  test('health probes dependencies and public payload is minimal', () => {
    const health = readRepoFile('apps/web/functions/api/v1/health.ts');
    const summary = readRepoFile('apps/web/functions/api/v1/platform/health/summary.ts');
    expect(health).toMatch(/probeDatabase/);
    expect(health).toMatch(/status: database\.status/);
    expect(health).not.toMatch(/mailProviderLabel/);
    expect(summary).toMatch(/platformAdminFromEnv/);
    expect(summary).toMatch(/dependencies/);
  });

  test('tenant-scoped routes use server organization identity', () => {
    for (const file of [
      'apps/web/functions/api/v1/orgs/me/audit-logs.ts',
      'apps/web/functions/api/v1/orgs/me/status.ts',
      'apps/web/functions/api/v1/orgs/me/create-child.ts',
    ]) {
      const source = readRepoFile(file);
      expect(source).toMatch(/auth\.organizationId/);
      expect(source).not.toMatch(/body\.organizationId/);
    }
  });

  test('canonical permission grammar is one shared implementation (§12.2)', () => {
    const auth = readRepoFile('apps/web/functions/shared/auth.ts');
    expect(auth).toMatch(/normalizePermission/);
    expect(auth).toMatch(/isValidPermission/);
    expect(auth).toMatch(/matchPermission\(/);
    expect(auth).toMatch(/from '@ellines-eip\/shared'/);
    // The legacy prefix shortcut is gone — matching is segment-wise and fail-closed.
    expect(auth).not.toMatch(/endsWith\(':\*'\)/);

    const shared = readRepoFile('packages/shared/src/permissions.ts');
    expect(shared).toMatch(/matchPermission/);
    expect(shared).toMatch(/platform/);

    // BOTH backends consume the shared evaluator — one grammar, one evaluator.
    const rbac = readRepoFile('services/identity/src/rbac/permission.service.ts');
    expect(rbac).toMatch(/matchPermission/);
    expect(rbac).toMatch(/from '@ellines-eip\/shared'/);
  });

  test('audit UI exposes org/date filters, pagination and export', () => {
    const page = readRepoFile('apps/web/src/app/app/platform/page.tsx');
    expect(page).toMatch(/auditOrg/);
    expect(page).toMatch(/auditFrom/);
    expect(page).toMatch(/auditTo/);
    expect(page).toMatch(/exportPlatformAuditLogs/);
    expect(page).toMatch(/Previous/);
    expect(page).toMatch(/Next/);
  });

  test('baseline account lockout is wired into both authentication endpoints (24.4.1)', () => {
    const login = readRepoFile('apps/web/functions/api/v1/auth/login.ts');
    expect(login).toMatch(/checkLoginLockout/);
    expect(login).toMatch(/recordLoginFailure/);
    expect(login).toMatch(/clearLoginFailures/);

    const sharedPolicy = readRepoFile('packages/shared/src/lockout.ts');
    expect(sharedPolicy).toMatch(/LOCKOUT_MAX_FAILURES = 5/);
    expect(sharedPolicy).toMatch(/LOCKOUT_WINDOW_MS = 15 \* 60_000/);
    expect(sharedPolicy).toMatch(/LOCKOUT_LOCK_MS = 15 \* 60_000/);

    const pagesLockout = readRepoFile('apps/web/functions/shared/lockout.ts');
    expect(pagesLockout).toMatch(/from '@ellines-eip\/shared'/); // consumes the shared policy

    const identityLogin = readRepoFile('services/identity/src/auth/auth.service.ts');
    expect(identityLogin).toMatch(/this\.lockout\.isLocked/); // checked before user lookup
    expect(identityLogin).toMatch(/this\.lockout\.recordFailure/);
    expect(identityLogin).toMatch(/this\.lockout\.clear/);
    expect(identityLogin).toMatch(/429/);
  });

  test('session registry groundwork: model, migration, login association, revocation (24.2.3)', () => {
    const schema = readRepoFile('services/identity/prisma/schema.prisma');
    expect(schema).toMatch(/model Session \{/);
    expect(schema).toMatch(/tokenHash\s+String\s+@unique/);
    expect(schema).toMatch(/revokedAt\s+DateTime\?/);

    const migration = readRepoFile(
      'services/identity/prisma/migrations/0003_phase2_session_registry/migration.sql',
    );
    expect(migration).toMatch(/CREATE TABLE "sessions"/);
    expect(migration).toMatch(/"token_hash" TEXT NOT NULL/);
    expect(migration).toMatch(/"revoked_at" TIMESTAMP\(3\)/);

    const pagesLogin = readRepoFile('apps/web/functions/api/v1/auth/login.ts');
    expect(pagesLogin).toMatch(/from\('sessions'\)\.insert/);
    expect(pagesLogin).toMatch(/hashToken\(tokens\.accessToken\)/);

    const auth = readRepoFile('apps/web/functions/shared/auth.ts');
    expect(auth).toMatch(/from\('sessions'\)/); // requireAuth checks revocation
    expect(auth).toMatch(/Session has been revoked/);

    const logout = readRepoFile('apps/web/functions/api/v1/auth/logout.ts');
    expect(logout).toMatch(/revoked_at/);

    const identityLogin = readRepoFile('services/identity/src/auth/auth.service.ts');
    expect(identityLogin).toMatch(/this\.prisma\.session\.create/);
    expect(identityLogin).toMatch(/revokeSessionByToken/);
    expect(identityLogin).toMatch(/revokeUserSessions/);
  });

  test('tenant isolation runs as a CI release gate (isolation.spec.ts executes and gates)', () => {
    const workflow = readRepoFile('.github/workflows/test-coverage.yml');
    expect(workflow).toMatch(/npm run test -w @ellines-eip\/web\b/);
    expect(workflow).toMatch(/isolation\.spec\.ts/);
    expect(workflow).toMatch(/Test @ellines-eip\/shared/); // existing gates intact
    expect(workflow).toMatch(/Test @ellines-eip\/identity/);
    expect(workflow).toMatch(/Phase 0 contract validation gate/);
    // Gates must fail the job — never soft-fail.
    const isolationStep = workflow.split('Tenant isolation gate')[1] ?? '';
    expect(isolationStep).toMatch(/continue-on-error: false/);
  });
});
