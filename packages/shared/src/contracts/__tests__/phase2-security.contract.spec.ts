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

  test('canonical permission grammar is present', () => {
    const auth = readRepoFile('apps/web/functions/shared/auth.ts');
    expect(auth).toMatch(/normalizePermission/);
    expect(auth).toMatch(/isValidPermission/);
    expect(auth).toMatch(/endsWith\(':\\*'\)/);
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
});
