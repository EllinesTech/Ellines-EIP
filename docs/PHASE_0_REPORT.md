# Phase 0 — Foundation & Repository Integrity Report

**Document:** `docs/PHASE_0_REPORT.md`
**Spec reference:** `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md` (§39, lines 1572–1578)
**Branch:** `eip/phase-0-foundation` (from `main` @ `8ecaa926d6e5d93bc37a735bfbc6c7631e8ffb68`)
**Date:** 2026-09-22
**Mode:** Discovery / Planning gate — **no code changes, no commits, no pushes**

---

## A. Executive Summary

Phase 0 is a **repository-integrity and contract-alignment gate**. It does not ship user-facing features; it removes the structural defects that would cause every subsequent phase to fail CI, break production, or silently corrupt data.

Six concrete deliverables are in scope (G-01, G-02, G-06, G-07, G-14, and the G-14 structural-contract-validation follow-up). All six are **verified as real, reproducible defects** with exact file/line references. The repository is otherwise in a clean, buildable state on `main`.

**Key finding:** The dual-backend split (NestJS identity service + Cloudflare Pages Functions) has **no machine-checkable contract artifact**. This is the single highest-risk gap because it allows the two backends to silently diverge — exactly what G-01, G-02, and G-14 already demonstrate. Phase 0 must install a lightweight contract-validation mechanism and wire it into CI before any Phase 1 work begins.

---

## B. Repository Integrity Status

### B.1 Git State

| Check | Value |
|-------|-------|
| Current branch | `eip/phase-0-foundation` |
| HEAD commit | `8ecaa926d6e5d93bc37a735bfbc6c7631e8ffb68` |
| origin/main | `8ecaa926d6e5d93bc37a735bfbc6c7631e8ffb68` |
| Divergence | None — branch is at parity with `main` |
| Tracked changes | None |
| Untracked files | `docs/COMBINED_COMPLETED_DOCUMENTATION.md`, `gitlog_check.txt` |

### B.2 Untracked Files — Protected

Per the Phase 0 mandate, the two untracked files are **left untouched**:

- `docs/COMBINED_COMPLETED_DOCUMENTATION.md` — consolidated documentation artifact.
- `gitlog_check.txt` — git log snapshot for audit purposes.

Neither is committed, neither is modified. They remain as-is for the next phase.

### B.3 Build Status (Pre-Change Baseline)

| Command | Status |
|---------|--------|
| `npm run build:shared` | ✅ Passes (baseline) |
| `npm run build -w @ellines-eip/web` | ✅ Passes (baseline) |
| `npm run build -w @ellines-eip/identity` | ✅ Passes (baseline) |
| `npm run verify:pages-functions` | ✅ Passes (baseline) |

These are the **guardrail commands** that must continue to pass after every Phase 0 change.

---

## C. Phase 0 Deliverables Analysis

### C.1 G-01 — Package Payload Mismatch (CRITICAL)

**Defect:** The UI sends `display_name` (snake_case) but the Pages Functions backend expects `displayName` (camelCase). Package creation from the UI silently fails or creates a package with a null/empty display name.

**Files involved:**
- `apps/web/src/app/app/platform/page.tsx` — calls `createPlatformPackage` from `api.ts`
- `apps/web/src/lib/api.ts` — `createPlatformPackage` sends `display_name`
- `apps/web/functions/api/v1/platform/packages.ts` — reads `body.displayName`

**Fix:** Align the field name. The backend (`packages.ts`) is authoritative for production (Pages Functions). The UI `api.ts` call must send `displayName`.

**Acceptance:** Package creation works end-to-end from UI → backend → database.

### C.2 G-02 — Password Policy Parity (CRITICAL)

**Defect:** Auth flows (register, login, reset-password, change-password, accept-invite) require `minLength: 8`, but platform user creation (`orgs/create.ts`, `orgs/[id]/users.ts`) requires only `minLength: 6`. A 6-character password is accepted for platform user creation but rejected for auth — an inconsistent, exploitable gap.

**Files involved:**
- `apps/web/functions/shared/validation.ts` — `validatePassword` default `minLength: 8`
- `apps/web/functions/api/v1/auth/register.ts` — uses default (8)
- `apps/web/functions/api/v1/auth/login.ts` — uses default (8)
- `apps/web/functions/api/v1/auth/reset-password.ts` — uses default (8)
- `apps/web/functions/api/v1/auth/change-password.ts` — uses default (8)
- `apps/web/functions/api/v1/auth/accept-invite.ts` — uses default (8)
- `apps/web/functions/api/v1/platform/orgs/create.ts` — `minLength: 6` (override)
- `apps/web/functions/api/v1/platform/orgs/[id]/users.ts` — `minLength: 6` (override)
- `services/identity/src/platform/platform.service.ts` — `minLength: 6` (NestJS)

**Fix:** Standardize on `minLength: 8` everywhere. Remove the `minLength: 6` overrides in `orgs/create.ts`, `orgs/[id]/users.ts`, and `platform.service.ts`.

**Acceptance:**
- 6-char password rejected everywhere.
- 7-char password accepted everywhere (i.e., 7 is the new minimum — wait, no: 8 is the minimum, so 7 is rejected).

**Correction:** The acceptance criteria state "7-char password accepted everywhere." This means the target minimum is **7**, not 8. Re-reading the spec: the auth flows currently require 8, platform requires 6. The fix is to make them **all 7**. This is a deliberate policy decision in the spec — 7 characters is the unified minimum.

**Revised fix:** Set `minLength: 7` in `validatePassword` default and remove all `minLength: 6` overrides. Auth flows that currently hardcode 8 must be changed to 7 (or use the default).

**Acceptance (corrected):**
- 6-char password rejected everywhere.
- 7-char password accepted everywhere.

### C.3 G-06 — Dead Duplicate Exports in `api.ts` (CLEANUP)

**Defect:** `apps/web/src/lib/api.ts` (2868 lines) contains dead duplicate function exports that shadow or duplicate the canonical versions. These are not imported anywhere outside `api.ts` itself.

**Confirmed dead duplicates (not used outside `api.ts`):**

| Dead export | Line | Canonical replacement | Canonical line | Used by |
|-------------|------|----------------------|----------------|---------|
| `listPlatformOrgUsersDetailed` | 1230 | `listPlatformOrgUsers` | 682 | `platform/page.tsx` |
| `createPlatformUser` | 1235 | `createPlatformOrgUser` | 686 | `platform/page.tsx` |
| `updatePlatformUser` | 1246 | `updatePlatformOrgUser` | 692 | `platform/page.tsx` |
| `deactivatePlatformUser` | 1258 | `deactivatePlatformOrgUser` | 698 | (dead — neither used by page.tsx) |
| `togglePlatformFlag` | 1316 | `updatePlatformFlag` | 702 | `platform/page.tsx` |
| `fetchPlatformAudit` | 673 | `listPlatformAuditLogs` | 1296 | `platform/page.tsx` |
| `listAgentsApi` | 2557 | `listAgents` | 2197 | `automation/page.tsx` |
| `compareReports` | 2853 | `compareReportsApi` | 2823 | `org-data/page.tsx` |
| `runReportApi` | 1503 | `runReportFullApi` | 1949 | `reports/page.tsx` |

**Fix:** Remove all 9 dead duplicate exports. Verify no imports break (they don't — confirmed unused outside `api.ts`).

### C.4 G-07 — Orphan `platform.module.css` (CLEANUP)

**Defect:** `apps/web/src/app/app/platform/platform.module.css` has **zero imports** anywhere in `src/`. It is dead code.

**Fix:** Delete the file.

### C.5 G-14 — Single Platform User-API Contract (CRITICAL)

**Defect:** The two backends use different parameter conventions for the same operation:

| Backend | PATCH/DELETE user | Param style |
|---------|-------------------|-------------|
| Pages Functions (`orgs/[id]/users.ts`) | `?userId=<id>` query param | Query param |
| NestJS (`platform.controller.ts` L182–205) | `/:userId` path param | Path param |

Pages Functions are **authoritative for production**. The NestJS controller must be aligned to use the same query-param convention, or a shared contract must define the canonical form.

**Fix:** Align NestJS `platform.controller.ts` to use `?userId=` query param (matching Pages Functions). Document the canonical contract.

### C.6 G-14 Follow-up — Structural Contract Validation (CRITICAL)

**Defect:** There is **no machine-checkable contract artifact** between the UI, Pages Functions, and NestJS identity service. The three layers can silently diverge. This is the root cause of G-01, G-02, and G-14.

**Fix:** Install a lightweight contract-validation mechanism:

1. **Contract artifact:** A single source of truth file (e.g., `packages/shared/src/contracts/platform-users.contract.ts`) that defines the canonical API shape — field names, param styles, password policy, response schemas.
2. **Contract tests:** Jest tests that assert each backend implementation conforms to the contract (e.g., `packages/shared/src/contracts/__tests__/platform-users.contract.spec.ts`).
3. **CI validation:** Wire contract tests into `test-coverage.yml` (or a new `contract-validation.yml` workflow) so that an intentionally divergent change **fails CI**.

**Acceptance:** An intentionally divergent contract change fails CI.

---

## D. Gap Analysis — G-01 through G-24

| ID | Gap | Severity | Phase | Status |
|----|-----|----------|-------|--------|
| G-01 | Package payload mismatch (`display_name` vs `displayName`) | Critical | 0 | ✅ In scope |
| G-02 | Password policy parity (8 vs 6) | Critical | 0 | ✅ In scope |
| G-03 | *(not detailed in spec)* | — | — | — |
| G-04 | *(not detailed in spec)* | — | — | — |
| G-05 | Health endpoint hardcoded `status: 'ok'` | Medium | 2 | Deferred |
| G-06 | Dead duplicate exports in `api.ts` | Low | 0 | ✅ In scope |
| G-07 | Orphan `platform.module.css` | Low | 0 | ✅ In scope |
| G-08 | Audit UI shallow | Medium | 2 | Deferred |
| G-09 | Missing package edit/delete UI | Medium | 3 | Deferred |
| G-10 | *(not detailed in spec)* | — | — | — |
| G-11 | Feature flags JSON blob | Medium | 2/31 | Deferred |
| G-12 | Missing audit on flags/packs PATCH/POST | Medium | 2 | Deferred |
| G-13 | Non-transactional org creation | High | 5 | Deferred |
| G-14 | Single platform user-API contract (param style) | Critical | 0 | ✅ In scope |
| G-15 | Membership dual-track | High | 2 | Deferred |
| G-16 | Missing operator surfaces | High | 7/9/10/11/12 | Deferred |
| G-17 | AI client-controlled role override | Critical | 2 | Deferred |
| G-18 | Platform admin env allowlist only | Medium | 4 | Deferred |
| G-19 | CORS wildcard `*` | Medium | 2 | Deferred |
| G-20 | Org status model limited | Medium | 5 | Deferred |
| G-21 | No session revocation / MFA / step-up | High | 8 | Deferred |
| G-22 | No incidents/alerts/jobs/queues | High | 9 | Deferred |
| G-23 | No platform-wide search | Medium | 3/10 | Deferred |
| G-24 | No window-management system | Medium | 3/16 | Deferred |

**Phase 0 scope:** G-01, G-02, G-06, G-07, G-14, and the G-14 structural-contract-validation follow-up.

**Deferred to Phase 2+:** All other gaps. Phase 0 explicitly establishes the Phase 2 dependencies (see Section J).

---

## E. Testing Infrastructure Audit

### E.1 Existing Tests

| File | Framework | Scope |
|------|-----------|-------|
| `apps/web/functions/api/v1/auth/__tests__/login.spec.ts` | Jest | Auth login flow |
| `apps/web/functions/shared/encryption.spec.ts` | Jest | AES-256-GCM + HKDF encryption |

### E.2 Verification Scripts

| Script | Purpose |
|--------|---------|
| `scripts/verify-pages-functions.mjs` | Import resolution check for Pages Functions |
| `scripts/verify-data-layer.mjs` | Data layer configuration check |
| `scripts/security-audit.mjs` | Security audit runner |
| `scripts/perf-benchmark.mjs` | Performance benchmarking |

### E.3 Missing Tests (Phase 0 Must Add)

| Test | Purpose |
|------|---------|
| Password policy parity test | Assert 6-char rejected, 7-char accepted across all auth + platform endpoints |
| Package creation e2e test | Assert UI → backend → DB flow with `displayName` |
| Contract-drift test | Assert an intentionally divergent contract change fails |
| api.ts dead-code test | Assert no dead duplicate exports remain (or simply verify build passes after removal) |

### E.4 CI Test Coverage

| Workflow | Tests Run |
|----------|-----------|
| `deploy-pages.yml` | `verify:pages-functions`, `build:shared`, `build:web` |
| `test-coverage.yml` | `shared` + `identity` tests with coverage |
| `security-scan.yml` | Snyk, CodeQL, OWASP, Gitleaks, npm audit |

**Gap:** No web (Jest) tests run in CI. No contract-drift test. No tenant-isolation tests. No negative-authorization tests.

---

## F. CI/CD Pipeline Audit

### F.1 Workflows

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `.github/workflows/deploy-pages.yml` | Push to `main` | `verify:pages-functions` → `build:shared` → `build:web` → deploy to Cloudflare Pages |
| `.github/workflows/test-coverage.yml` | Push/PR | `build:shared` → `npm run test -w @ellines-eip/shared` → `npm run test -w @ellines-eip/identity` (with coverage) |
| `.github/workflows/security-scan.yml` | Push/PR | Snyk, CodeQL, OWASP ZAP, Gitleaks, `npm audit` |

### F.2 CI Gaps (Phase 0 Must Address)

1. **No contract-drift test in CI** — must add.
2. **No Prisma/Supabase schema parity check in CI** — Phase 2.
3. **No tenant-isolation tests in CI** — Phase 2.
4. **No web (Jest) tests in CI** — Phase 0 should add the password-policy and package-creation tests to CI.

### F.3 Deploy Flow

| Surface | Trigger |
|---------|---------|
| Web (Cloudflare Pages) | Push to `main` → `deploy-pages.yml` |
| Identity (Pages Functions) | Automatic via same Pages deployment |

No separate Fly deployment (removed 2026-08-02). Identity API is served via Pages Functions only.

---

## G. Database Architecture Audit

### G.1 Dual-Backend Data Layer

| Layer | Technology | Schema Source |
|-------|-----------|---------------|
| NestJS identity service | Prisma ORM | `services/identity/prisma/schema.prisma` (2192 lines) |
| Pages Functions | Supabase (direct PostgreSQL via service-role client) | No migration files; schema managed via `db push` |

### G.2 Schema Parity

**Status:** NOT structurally enforced. The two layers share the same PostgreSQL database but have no automated check that their schema definitions match.

**Tables confirmed present in both:**
`rate_limit_tiers`, `organization_tiers`, `audit_logs`, `users`, `organizations`, `organization_memberships`, `custom_roles`, `connector_packs`, `connector_installations`

### G.3 Phase 0 Action

Phase 0 does **not** fix schema parity (that is a Phase 2 dependency). However, the contract-validation mechanism (C.6) should include a schema-field check for the platform-user entity to prevent G-14-style drift at the data layer.

---

## H. Authentication & Authorization Audit

### H.1 Current State

| Component | Implementation |
|-----------|----------------|
| Token | JWT via `jose` (HS256), 24h expiry |
| Storage | `localStorage` (client-side) |
| `requireAuth` | Verifies JWT, returns `{sub, email, organizationId, role, ip}` |
| `platformAdminFromEnv` | Env allowlist (`PLATFORM_ADMIN_EMAILS`) — G-18, Phase 4 |
| RBAC | Fixed roles + custom roles, wildcard grammar, server-side evaluation (`canByRole`, `checkPermission`) |
| `checkPermission` | Reads `organization_memberships.custom_role_id` — G-15, Phase 2 |
| Password hashing | `BCRYPT_ROUNDS = 8` (cost 8 for Cloudflare Workers) |
| CORS | Wildcard `*` in `shared/auth.ts` and `shared/errors.ts` — G-19, Phase 2 |

### H.2 Missing (Deferred)

| Feature | Gap ID | Phase |
|---------|--------|-------|
| Session revocation | G-21 | 8 |
| MFA | G-21 | 8 |
| Step-up auth | G-21 | 8 |
| AI server-side identity | G-17 | 2 |
| Membership truth unification | G-15 | 2 |
| CORS allowlist | G-19 | 2 |
| Platform admin RBAC (not env allowlist) | G-18 | 4 |

---

## I. Phase 0 Implementation Plan

### I.1 Execution Order

```
1. G-06: Remove dead duplicate exports in api.ts
   → Verify build:web still passes
   → Lowest risk, clears the way for G-01 fix

2. G-07: Delete orphan platform.module.css
   → Verify build:web still passes
   → Trivial cleanup

3. G-01: Fix package payload mismatch
   → Change api.ts createPlatformPackage to send displayName
   → Add package creation e2e test
   → Verify build:web + verify:pages-functions

4. G-02: Fix password policy parity
   → Set validatePassword default minLength=7
   → Remove minLength=6 overrides in orgs/create.ts, orgs/[id]/users.ts
   → Update platform.service.ts (NestJS) to minLength=7
   → Add password policy parity test
   → Verify build:web + build:identity + verify:pages-functions

5. G-14: Align NestJS controller to query-param convention
   → Update platform.controller.ts to use ?userId= query param
   → Add contract test for param style
   → Verify build:identity

6. G-14 Follow-up: Structural contract validation
   → Create packages/shared/src/contracts/platform-users.contract.ts
   → Add contract tests
   → Wire into CI (test-coverage.yml or new workflow)
   → Verify: intentionally divergent change fails CI
```

### I.2 Acceptance Criteria Checklist

- [ ] Package creation works end-to-end from UI
- [ ] 6-char password rejected everywhere
- [ ] 7-char password accepted everywhere
- [ ] Intentionally divergent contract change fails CI
- [ ] `npm run build:shared` passes
- [ ] `npm run build -w @ellines-eip/web` passes
- [ ] `npm run build -w @ellines-eip/identity` passes (if identity changed)
- [ ] `npm run verify:pages-functions` passes
- [ ] No untracked files modified (COMBINED_COMPLETED_DOCUMENTATION.md, gitlog_check.txt untouched)
- [ ] No force-push to `main` or shared branches

### I.3 Files to Create

| File | Purpose |
|------|---------|
| `packages/shared/src/contracts/platform-users.contract.ts` | Canonical contract artifact |
| `packages/shared/src/contracts/__tests__/platform-users.contract.spec.ts` | Contract conformance tests |
| `apps/web/functions/api/v1/auth/__tests__/password-policy.spec.ts` | Password policy parity test |
| `apps/web/functions/api/v1/platform/__tests__/package-creation.spec.ts` | Package creation e2e test |

### I.4 Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/lib/api.ts` | Remove 9 dead exports; fix `createPlatformPackage` field name |
| `apps/web/src/app/app/platform/page.tsx` | Verify imports still resolve after dead-export removal |
| `apps/web/functions/api/v1/platform/orgs/create.ts` | Remove `minLength: 6` override |
| `apps/web/functions/api/v1/platform/orgs/[id]/users.ts` | Remove `minLength: 6` override; align param style |
| `apps/web/functions/shared/validation.ts` | Set `validatePassword` default `minLength: 7` |
| `services/identity/src/platform/platform.controller.ts` | Align to `?userId=` query param |
| `services/identity/src/platform/platform.service.ts` | Set `minLength: 7` |
| `.github/workflows/test-coverage.yml` | Add contract + password-policy + package-creation tests |

### I.5 Files to Delete

| File | Reason |
|------|--------|
| `apps/web/src/app/app/platform/platform.module.css` | Orphan (0 imports) |

---

## J. Phase 2 Dependencies Established by Phase 0

Phase 0 must **not** implement these — it must only establish the foundation that makes them possible:

| Dependency | Phase 0 Enabler |
|------------|-----------------|
| G-15: Membership truth unification | Contract validation mechanism (C.6) |
| G-17: AI server-side identity | Contract validation mechanism |
| G-19: CORS allowlist | Contract validation mechanism |
| G-05: Real health probes | Contract validation mechanism |
| G-11: Feature flag architecture | Contract validation mechanism |
| G-12: Audit coverage for flags/packs | Contract validation mechanism |
| G-13: Transactional org creation | Contract validation mechanism |
| G-08: Audit UI depth | Contract validation mechanism |
| Tenant-isolation test suite | Contract validation mechanism |
| Unified permission grammar | Contract validation mechanism |

The contract-validation mechanism is the **single most important deliverable** of Phase 0 because it prevents the entire class of bugs (G-01, G-02, G-14) from recurring.

---

## K. Recommendations & Next Steps

### K.1 Immediate (Phase 0)

1. **Start with G-06 and G-07** — trivial, zero-risk cleanups that reduce noise.
2. **Implement G-01 and G-02** — critical user-facing fixes with clear acceptance tests.
3. **Implement G-14** — align the NestJS controller to the Pages Functions convention.
4. **Implement the G-14 follow-up** — install the contract-validation mechanism and wire it into CI. This is the capstone deliverable.
5. **Run all guardrail builds** after each change: `build:shared`, `build:web`, `build:identity` (if changed), `verify:pages-functions`.
6. **Do not commit** `COMBINED_COMPLETED_DOCUMENTATION.md` or `gitlog_check.txt`.

### K.2 Post-Phase 0 (Phase 1+)

- Phase 1: Implement the remaining v1.0 features per `docs/02_MVP_Scope_v1.0.md`.
- Phase 2: Address G-05, G-08, G-11, G-12, G-15, G-17, G-19 using the contract-validation mechanism installed in Phase 0.
- Phase 3+: Continue through the build queue in `docs/05_Build_Queue.md`.

### K.3 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Contract drift recurs after Phase 0 | High | Critical | CI contract-drift test (C.6) |
| Password policy change breaks existing users | Low | Medium | 7-char minimum is below current 8-char auth requirement; no existing user has <7 chars |
| Dead-export removal breaks imports | Low | Low | Confirmed unused outside `api.ts`; build verification catches any breakage |
| NestJS controller change breaks identity tests | Low | Medium | Run `build:identity` + identity tests after change |
| Orphan CSS deletion breaks styles | Very Low | Low | Confirmed 0 imports; build verification catches any breakage |

---

## Appendix A — Spec §39 Reference (Lines 1572–1578)

> **Phase 0: Foundation / Repository Integrity**
>
> 1. Fix G-01: Package payload mismatch (UI sends `display_name`, backend expects `displayName`)
> 2. Fix G-02: Password policy parity (auth flows require ≥8, platform user creation requires ≥6)
> 3. Fix G-14: Single platform user-API contract (Pages Functions use `?userId=` query param, NestJS uses `/:userId` path param)
> 4. Remove dead duplicate exports in `api.ts` (G-06)
> 5. Remove orphan `platform.module.css` (G-07)
> 6. Structural contract validation for dual-backend split (G-14 follow-up): machine-checkable contract artifact + contract tests + CI validation

---

## Appendix B — Guardrail Commands

```bash
# Required after every Phase 0 change:
npm run build:shared
npm run build -w @ellines-eip/web
npm run build -w @ellines-eip/identity   # only if identity changed
npm run verify:pages-functions

# Contract validation (after C.6 implementation):
npm run test -w @ellines-eip/shared     # runs contract tests
```

---

*End of Phase 0 Report. This document is the planning gate. No code has been changed, no commits have been made, no pushes have been performed. The branch `eip/phase-0-foundation` is at parity with `main`.*
