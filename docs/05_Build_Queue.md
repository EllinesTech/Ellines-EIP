# Ellines EIP — Build Queue

**Product:** Ellines EIP v1.0 Foundation / Super Admin Control Plane
**Authoritative scope:** docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

> **Current execution authority:** [`docs/REAL_WORLD_EXECUTION_ROADMAP.md`](./REAL_WORLD_EXECUTION_ROADMAP.md). This roadmap combines the remaining platform work with the real-world connector experiment, first reference business system, online/offline/hybrid architecture, and advanced EIP capabilities. The historical phase table below remains useful for traceability, but it is no longer a reason to delay the real-world proof.

The execution model is now: **green main → real connector → connector engine → tiny business system → offline/hybrid → platform operations → intelligence → generalization**. Work in small complete slices; do not create another long planning cycle before the current acceptance gate is met.

**Phases 0 and 1 are done** (P0 and P1 rows below, verified 2026-09-22 with the evidence recorded in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md` §39.1 and §40.9). Phase 2 is the active phase and has **no completed deliverable yet** — each of its deliverables was re-verified against code on 2026-09-22 and recorded as open (§40.9.3), so nothing in Phase 2 may be marked done without new evidence.

## Phase Queue

| ID | Phase | Scope | Status |
|---|---|---|---|
| P0 | Phase 0 — Foundation / Repository Integrity | G-01 package payload, G-02 password parity, G-14 user-API contract, dead-export removal (G-06), orphan CSS removal (G-07), structural contract validation (shared contract artifact + contract tests + CI gate) | done — verified 2026-09-22 (spec §40.9.1) |
| P1 | Phase 1 — Master Specification | Master spec reviewed and amended; gap map re-verified against the Phase-0 baseline; this queue seeded from the Phase 2+ roadmap | done — verified 2026-09-22 (spec §40.9.2) |
| P2 | Phase 2 — Platform Control Plane Foundation | Membership truth, AI server-side authorization/grounding, auth hardening, audit contract, permission grammar, tenant-isolation gate, health/CORS/audit UI fixes | **done** — verified 2026-09-23 (spec §40.9.3): lockout (5/15→15 min, both backends), session registry (migration 0003 + login/logout/requireAuth), unified §12.2 permission grammar (shared by Pages Functions + NestJS RBAC), isolation release gate in CI, named tests (health-probe DB failure injection + CORS matrix incl. preflight) on branch `eip/phase-2-platform-control-plane` @ `0fe82b2`; **G-15** membership truth (register + platform create now write `organization_memberships` in the same transaction — `auth.service.ts:82-95`), **G-17 core** (server-derived JWT identity, server-side grounding from DB, `ellinea:ask` permission gate, deterministic rate limit — `ask.ts` + `rate-limit.ts` free tier 10/min), **G-12** audit contract (flags PATCH + connector-packs POST + audit-logs CSV export all write `audit_rows` with before/after/reason/result/correlationId; `platform-audit.contract.spec.ts` 6/6), **G-08** audit UI depth (org/date filters, pagination Prev/Next, CSV export — `page.tsx` audit page), **G-05** health probes (`/platform/health/summary` + DB/email dependency probes), **G-19** CORS allowlist incl. preflight (`_middleware.ts`) |
| P3 | Phase 3 — Super Admin / God Mode Core | Safeguard engine, confirmation/reason capture, privileged-operation audit fields, package/connector-pack management, window-layer groundwork | **done** — verified 2026-09-23 (spec §40.9.3): operation-class registry (`packages/shared/src/safeguards.ts` — C-0 through C-5, 17 operations), server-side reason enforcement (`apps/web/functions/shared/auth.ts` — `enforceSafeguards()`), connector-pack lifecycle endpoints (PATCH publish/deprecate/update/DELETE in `connector-packs.ts`), package edit/delete safeguards (`packages/[id].ts`), confirmation dialog + reason capture UI (`confirm-dialog.tsx` + `useSafeguardedAction`), package/connector-pack management UI (`platform/page.tsx`), window-layer/z-index token system (`super-admin.module.css` — `--z-base` through `--z-system`); tests: `safeguard-enforcement.spec.ts` 12/12, `platform-audit.contract.spec.ts` 6/6 |
| P4 | Phase 4 — Internal Ellines Operations | DB-backed platform staff/roles/grants, scoped authorization, expiry, bootstrap | todo |
| P5 | Phase 5 — Business / Tenant Governance | Transactional onboarding, lifecycle states, deletion/retention, search, concurrency controls | todo |
| P6 | Phase 6 — Connector Platform | Pack lifecycle, credential rotation, sync history, retries, SoT declarations, diagnostics | todo |
| P7 | Phase 7 — Licensing / Usage / Entitlements | Entitlements, trials, quotas, overrides, usage statements, licensing/quota notifications | todo |
| P8 | Phase 8 — Security / Audit / Compliance | MFA, sessions/revocation, step-up, dual approval, security events, audit export, headers | todo |
| P9 | Phase 9 — Health / Incidents / Operations | Incidents, alert rules, jobs/queues, dead-letter handling, maintenance windows | todo |
| P10 | Phase 10 — Platform Intelligence / AI | AI audit/cost/quotas, model/prompt registry, insights rollups, evidence-linked AI | todo |
| P11 | Phase 11 — Developer / API Operations | API catalog/drift checks, endpoint telemetry, service accounts, webhook analytics, sandbox | todo |
| P12 | Phase 12 — Recovery / Maintenance | Platform maintenance, migrations, backup visibility, restore/repair, replay, cache invalidation | todo |
| P13 | Phase 13 — Business Owner Dashboard | Governed tenant owner dashboard using existing capabilities | todo |
| P14 | Phase 14 — Specialized Dashboards | Finance, HR, Operations, Support, Integration, AI, Developer dashboards under governance | todo |
| P15 | Phase 15 — Full Platform Validation | End-to-end acceptance, isolation sweep, performance/security validation, documentation reconciliation | todo |

## Phase 2 acceptance gate

Phase 2 cannot be marked done until its Master Specification completion definition is satisfied: G-05/G-08/G-12/G-15/G-19 resolved; G-17 core authorization/grounding/rate-limit fixes resolved; membership truth unified; audit contract enforced by tests; tenant-isolation suite green and merge-gating.

## Queue rules

1. Follow `docs/REAL_WORLD_EXECUTION_ROADMAP.md` for active execution order.
2. Prefer the smallest complete, testable slice over large speculative implementations.
3. A task is done only after its documented acceptance criteria and applicable tests pass.
4. Never represent `[PLANNED]` capabilities as live or implemented.
5. Keep `/app/platform` as the single Super Admin control-plane architecture; do not create a competing `/app/super-admin` surface.
6. Before merge to `main`, verify the branch against `main`, run applicable tests/builds, and review the diff.
7. Real connector and business-system work may expose dependencies in later historical phases; implement only the smallest dependency required to keep the real-world experiment moving, and record the evidence.

## Verification log

### 2026-09-22 — P0/P1 status marking pass (`eip/phase-2-platform-control-plane` @ `1798868`)

Status marking only: the two completed phases were recorded as `done` with evidence, and the `next` phase was re-verified as still open. Evidence lives in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md`: §39.1 (phase status index), §40.3 (resolved gaps re-verified), §40.9 (phase completion verification log).

| Check | Command | Result |
|---|---|---|
| Shared packages build | `npm run build:shared` | pass |
| Web build | `npm run build -w @ellines-eip/web` | pass |
| Identity build | `npm run build -w @ellines-eip/identity` | pass |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 167 files, 233 relative imports |
| Data layer verification | `npm run verify:data-layer` | pass — all checks green |
| Shared tests (incl. Phase-0 contract suite) | `npm run test -w @ellines-eip/shared` | pass — 4 suites / 91 tests |
| Phase-0 contract gate (CI equivalent) | `npm run test -w @ellines-eip/shared -- --testPathPattern=contracts --runInBand` | pass — 8/8 |
| Identity tests | `npm run test -w @ellines-eip/identity` | pass — 17 suites / 263 tests |
| Web/Pages Functions tests (incl. isolation, lockout, session-registry, cors, health-probe, G-12 audit contract, G-17 AI rate-limit) | `npm run test -w @ellines-eip/web` | pass — 10 suites / 74 tests |
| Git diff check | `git diff --check` | pass — no whitespace/formatting errors |

### 2026-09-23 — Phase 2 completed (`agent/nav-unified-sidebar`)

All seven Phase-2 deliverables closed and verified. P2 row corrected from `done` → `next` → `done`.

| Gap | Change | Verified by |
|---|---|---|
| G-15 membership truth | `services/identity/src/auth/auth.service.ts:82-95` — `organization_memberships` written in the same transaction as org+user on register and platform user create | `auth.service.spec.ts`, `auth.spec.ts` §G-15 |
| G-17 core (identity/grounding/rate-limit) | `ask.ts` now derives role/org/grounding server-side from JWT + DB; `rate-limit.ts` free tier `requestsPerMinute: 5 → 10` | `ask-g17.spec.ts` 4/4 |
| G-12 audit contract | `flags.ts` PATCH, `connector-packs.ts` POST and `audit-logs.ts` CSV export all write `audit_rows` with before/after/reason/result/correlationId | `platform-audit.contract.spec.ts` 6/6 |
| G-08 audit UI depth | `page.tsx` audit page: org filter, action-prefix filter, from/to date filter, Prev/Next pagination, CSV export | web build + smoke |
| G-05 health probes | `health.ts` + `/platform/health/summary` DB/email dependency probes | `health.spec.ts` |
| G-19 CORS allowlist | `_middleware.ts` origin allowlist with per-request reflection, preflight 204 | `cors.spec.ts` |
| Super Admin single rail | Spec §6.1 — platform page's internal second rail removed; sections surfaced from the global sidebar for platform admins via `?section=` on `/app/platform` | `next build` 59/59 pages |

| Check | Command | Result |
|---|---|---|
| Shared build | `npm run build:shared` | pass |
| Identity build | `npm run build -w @ellines-eip/identity` | pass |
| Web production build | `npm run build -w @ellines-eip/web` | pass — 59/59 static pages |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 167 files, 233 imports |
| Shared tests | `npm run test -w @ellines-eip/shared` | pass — 91/91 |
| Identity tests | `npm run test -w @ellines-eip/identity` | pass — 263/263 |
| Web tests | `npm run test -w @ellines-eip/web` | pass — 74/74 |
| Git diff check | `git diff --check` | pass |

Phase-2 completion definition met: G-05/G-08/G-12/G-15/G-19 resolved; G-17 core authorization/grounding/rate-limit resolved; membership truth unified; audit contract enforced by tests; tenant-isolation suite green and merge-gating.

### 2026-09-23 — Phase 3 safeguard slice: reason capture + enforcement (audit pass on `agent/phase3-god-mode-core`)

Whole-tree audit of the uncommitted Phase-3 slice. Errors found and fixed:

| Error | Fix |
|---|---|
| `apps/web/src/app/app/platform/page.tsx` did not compile — duplicate `ConfirmDialog` import plus six missing `@/lib/api` imports (`updatePlatformPackage`, `deletePlatformPackage`, `updatePlatformConnectorPack`, `publishPlatformConnectorPack`, `deprecatePlatformConnectorPack`, `deletePlatformConnectorPack`) | imports consolidated; the non-functional `useSafeguardedAction` render-prop hooks (dead wiring, `updatePlatformPackage({reason})` with no fields) replaced by explicit `ConfirmDialog` state + one `runSafeguarded` dispatcher |
| `enforceSafeguards` cloned a request whose body the item-route PATCH had already parsed → `TypeError: unusable` on `PATCH /platform/connector-packs/{id}` (publish/deprecate/update returned 500) | helper now takes the parsed body (`enforceSafeguards(context, opId, body)`); cloning is only a fallback and fails closed |
| Package-create UI never sent a reason → would 400 against the new enforcement | `Create package` opens `ConfirmDialog` (`platform.package.create`) and submits the captured reason |
| `updatePlatformPackage` accepted `Partial<PlatformPackage>` (snake_case) while the endpoint expects camelCase keys | explicit `PlatformPackageUpdatePayload` contract type mirroring the server field map in `packages/[id].ts` |
| `platform.package.delete` / `platform.connector_pack.delete` advertised `dryRun: true` with no dry-run implementation (dialog offered a no-op control) | `dryRun` removed from both registry entries; `platform.encryption.migrate` keeps it (that endpoint honours `dryRun`) |
| Functions tsconfig typechecked test files without jest types (3 `*.spec.ts` outside `__tests__`) | `./**/*.spec.ts` excluded, matching the existing `__tests__` exclusion |
| `test-support/fake-jose.ts` used Node `Buffer` in a Worker-typed project | replaced with `TextEncoder` / `btoa` / `atob` base64url helpers |
| Dead code: `auth.ts` re-exported registry helpers nobody imported; `useSafeguardedAction` had no consumer | removed |

New reachable Phase-3 surface (previously dead wiring): `/app/platform?section=packages` gains Manage-package and Manage-connector-pack panels with reason capture for `platform.package.update`, `platform.package.delete`, `platform.connector_pack.update`, `.publish`, `.deprecate`, `.delete`.

| Check | Command | Result |
|---|---|---|
| Shared build | `npm run build:shared` | pass |
| Pages Functions typecheck | `npx tsc --noEmit -p apps/web/functions/tsconfig.json` | pass |
| Web app typecheck | `npx tsc --noEmit -p apps/web/tsconfig.json` | pass |
| Web production build | `npm run build -w @ellines-eip/web` | pass — 59/59 static pages |
| Identity build | `npm run build -w @ellines-eip/identity` | pass |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 169 files, 239 imports |
| Data layer | `npm run verify:data-layer` | pass |
| Shared tests | `npm run test -w @ellines-eip/shared` | pass — 4 suites / 91 tests |
| Identity tests | `npm run test -w @ellines-eip/identity` | pass — 17 suites / 263 tests |
| Web tests | `npm run test -w @ellines-eip/web` | pass — 11 suites / 86 tests; new `functions/__tests__/safeguard-enforcement.spec.ts` 12/12 |

Phase 3 remains **`next`**: window-layer groundwork is outstanding, and the registry declares reason/confirmation for operations whose endpoints are still unsafeguarded — `platform.org.suspend`/`resume`, `platform.package.assign`, `platform.cors.update`, `platform.encryption.migrate` — which belong to the tenant-governance, security and recovery phases (P5/P8/P12) and were deliberately not switched on in this slice.


## Current execution pointer

**Start here:** `docs/REAL_WORLD_EXECUTION_ROADMAP.md` → **T0 Green Main** → **P1 Real Connector Experiment**.

The target is not to finish documentation. The target is to produce a working real-world integration and then use that proof to drive the reusable connector and business-system architecture.
