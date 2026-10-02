# Ellines EIP — Build Queue

**Product:** Ellines EIP v1.0 Foundation / Super Admin Control Plane
**Authoritative scope:** docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

> **Current execution authority:** [`docs/REAL_WORLD_EXECUTION_ROADMAP.md`](./REAL_WORLD_EXECUTION_ROADMAP.md). This roadmap combines the remaining platform work with the real-world connector experiment, first reference business system, online/offline/hybrid architecture, and advanced EIP capabilities. The historical phase table below remains useful for traceability, but it is no longer a reason to delay the real-world proof.

The execution model is now: **green main → real connector → connector engine → tiny business system → offline/hybrid → platform operations → intelligence → generalization**. Work in small complete slices; do not create another long planning cycle before the current acceptance gate is met.

**Phases 0–4 are done** (P0–P4 rows below). Phase 5 is the active phase.

- P0/P1 verified 2026-09-22 (evidence in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md` §39.1 and §40.9).
- P2 verified 2026-09-23 (evidence in spec §40.9.3).
- P3 verified 2026-09-23 (evidence in spec §40.9.3).
- P4 verified 2026-10-02 (staff API + UI + bootstrap — see verification log below).
- P5 is `next` — Business / Tenant Governance.

## Phase Queue

| ID | Phase | Scope | Status |
|---|---|---|---|
| P0 | Phase 0 — Foundation / Repository Integrity | G-01 package payload, G-02 password parity, G-14 user-API contract, dead-export removal (G-06), orphan CSS removal (G-07), structural contract validation (shared contract artifact + contract tests + CI gate) | done — verified 2026-09-22 (spec §40.9.1) |
| P1 | Phase 1 — Master Specification | Master spec reviewed and amended; gap map re-verified against the Phase-0 baseline; this queue seeded from the Phase 2+ roadmap | done — verified 2026-09-22 (spec §40.9.2) |
| P2 | Phase 2 — Platform Control Plane Foundation | Membership truth, AI server-side authorization/grounding, auth hardening, audit contract, permission grammar, tenant-isolation gate, health/CORS/audit UI fixes | **done** — verified 2026-09-23 (spec §40.9.3): lockout (5/15→15 min, both backends), session registry (migration 0003 + login/logout/requireAuth), unified §12.2 permission grammar (shared by Pages Functions + NestJS RBAC), isolation release gate in CI, named tests (health-probe DB failure injection + CORS matrix incl. preflight) on branch `eip/phase-2-platform-control-plane` @ `0fe82b2`; **G-15** membership truth (register + platform create now write `organization_memberships` in the same transaction — `auth.service.ts:82-95`), **G-17 core** (server-derived JWT identity, server-side grounding from DB, `ellinea:ask` permission gate, deterministic rate limit — `ask.ts` + `rate-limit.ts` free tier 10/min), **G-12** audit contract (flags PATCH + connector-packs POST + audit-logs CSV export all write `audit_rows` with before/after/reason/result/correlationId; `platform-audit.contract.spec.ts` 6/6), **G-08** audit UI depth (org/date filters, pagination Prev/Next, CSV export — `page.tsx` audit page), **G-05** health probes (`/platform/health/summary` + DB/email dependency probes), **G-19** CORS allowlist incl. preflight (`_middleware.ts`) |
| P3 | Phase 3 — Super Admin / God Mode Core | Safeguard engine, confirmation/reason capture, privileged-operation audit fields, package/connector-pack management, window-layer groundwork | **done** — verified 2026-09-23 (spec §40.9.3): operation-class registry (`packages/shared/src/safeguards.ts` — C-0 through C-5, 17 operations), server-side reason enforcement (`apps/web/functions/shared/auth.ts` — `enforceSafeguards()`), connector-pack lifecycle endpoints (PATCH publish/deprecate/update/DELETE in `connector-packs.ts`), package edit/delete safeguards (`packages/[id].ts`), confirmation dialog + reason capture UI (`confirm-dialog.tsx` + `useSafeguardedAction`), package/connector-pack management UI (`platform/page.tsx`), window-layer/z-index token system (`super-admin.module.css` — `--z-base` through `--z-system`); tests: `safeguard-enforcement.spec.ts` 12/12, `platform-audit.contract.spec.ts` 6/6 |
| P4 | Phase 4 — Internal Ellines Operations | DB-backed platform staff/roles/grants, scoped authorization, expiry, bootstrap. **Includes:** connector governance fix (install-from-template platformAdmin gate + max_connectors enforcement — landed 2026-09-29 on `main`), Ellines Org Dashboard (ELLINES ORGANIZATION section — spec at `.kiro/specs/ellines-org-dashboard/requirements.md`) | **done** — verified 2026-10-02: staff registry (`platform_staff_members` + `platform_staff_grants` tables), scoped grants, fail-closed DB-backed resolver (`functions/shared/platform-staff.ts`), all 5 staff API endpoints (`GET/POST /platform/staff`, `POST /platform/staff/bootstrap`, `DELETE /platform/staff/:memberId`, `PATCH /platform/staff/:memberId/grants`), DB-backed admin check on all platform endpoints (metrics/flags/orgs), `access-control` section UI (staff table, invite form, edit grants, bootstrap card), nav item `available: true`, `PlatformStaffMemberDto`/`PlatformStaffGrantDto` + 5 API helpers in `api.ts`; builds: `npm run build:shared` ✓, `npm run build -w @ellines-eip/web` ✓, `npx tsc --noEmit` ✓ |
| P5 | Phase 5 — Business / Tenant Governance | Transactional onboarding, lifecycle states, deletion/retention, search, concurrency controls | **next** |
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

### 2026-09-29 — Audit fixes + P4 activation (main @ `e1fa94a` → new commit)

Full codebase audit run by Kiro. Findings and fixes applied:

| Finding | File | Fix |
|---|---|---|
| **BROKEN** — `TemplateController.installFromTemplate()` had no guards; any authenticated user could install connectors via this path | `services/identity/src/connectors/template.controller.ts` | Added `@UseGuards(JwtAuthGuard)` to every route; added 3-gate platformAdmin enforcement to `installFromTemplate` (admin check, targetOrgId required, max_connectors server-side) and `testTemplate`/CRUD; injects `PrismaService` for entitlement query |
| **BROKEN** — Pages Function proxy `install-from-template.ts` forwarded with no auth check | `apps/web/functions/api/v1/connectors/install-from-template.ts` | Rewritten to use `requireAuth` + `platformAdminFromEnv` before forwarding; returns 403 for non-admins |
| **NEEDS AUDIT** — Build queue claimed "Phase 2 is next" but P2 and P3 were already done | `docs/05_Build_Queue.md` | Updated preamble to reflect P0–P3 done; P4 set to `next` with scope |
| **IN PROGRESS** — 15 EIP 2.0 property test stubs committed but not verified against services | All `*.spec.ts` files in `services/identity/src/` | Tests reference real service implementations — verified imports are correct against existing service files; no missing service implementations found for the spec stubs |

Build queue: P4 is now `next`. Its scope includes the Ellines Org Dashboard (spec at `.kiro/specs/ellines-org-dashboard/`) and DB-backed platform staff management.

### 2026-09-30 — Real connector proof: source separation + timezone-safe freshness (`eip/real-haven-sync-and-source-separation`)

Roadmap P1.6–P1.9 work: the real Ellines Haven connector's sync/freshness numbers were being measured with the reader's timezone, and the same connector read `STALE`/180 min on the connector surface while the registry beside it read `FRESH`/0 min. Root cause and the whole-tree defects found by this pass:

| Defect | Evidence | Fix |
|---|---|---|
| **Freshness depended on the reader's timezone.** Prisma maps `DateTime` to Postgres `timestamp without time zone`; PostgREST returns it zone-less (`2026-10-01T04:24:10.027`), and `new Date(...)` reads a zone-less string as **local** time. On a UTC+3 host a sync that had completed seconds earlier measured 180 minutes old → false `STALE`; the registry JSON (written with `toISOString()`) carried `Z` → `FRESH`. | `new Date('2026-10-01 04:24:10.027')` → `01:24:10.027Z` on a UTC+3 host (reproduced against the live DB) | new `packages/shared/src/db-time.ts` (`toInstantMs` pins zone-less values to UTC, trusts explicit `Z`/offset, returns `null` — never `Date.now()` — for unparsable; `toUtcIso` emits explicit `Z`), exported from `packages/shared/src/index.ts`, wired into `packages/shared/src/source-graph.ts` (`freshnessFrom`, measurement sort, `summarise` last-retrieval now max-instant instead of lexicographic string sort) and `apps/web/functions/api/v1/connectors/health.ts` (`lastSyncAtUtc`/`lastSyncedAtUtc`, age/stale, evidence string, `freshness.lastSuccessfulSyncAt`) |
| **Timeliness was fabricated as `0`** when no health metric existed, dragging the dimension average toward "maximally stale". | `deriveDimensions`/`computeScore` in `services/identity/src/data-quality/data-quality.service.ts` | `enterprise_snapshots.healthScore Int?` (migration `0007_snapshot_unknown_health`) and `DataQualityScore/DataQualityHistory.timelinessScore Float?` (migration `0008_quality_timeliness_unknown`); the `timeliness` dimension is **omitted** when `healthScore` is null and `computeScore` skips absent dimensions; `apps/web/functions/api/v1/orgs/[slug]/data-quality/summary.ts` widened to `number \| null` |
| **Prisma schema was invalid** — `OrganizationSource.organization` and `SourceWebsiteMeasurement.organization` had no opposite field on `Organization` (P1012), so `db:generate`, `db:push` and the identity build were all broken. | `npx prisma validate` | added `Organization.sources` / `Organization.sourceMeasurements` back-relations |
| `scripts/apply-0006-source-model.mjs` ran under bare `node` with no env loader → `Environment variable not found: DATABASE_URL`. | script output | `import 'dotenv/config'` (and `node --env-file=.env scripts/apply-pending-migrations.mjs --dry-run` verified the deploy path baselines 0001–0003 and leaves 0004–0008 to `prisma migrate deploy`) |
| `toRegistryRow` narrowed payloads with an unexplained cast | `apps/web/functions/shared/capability-store.ts` | why-comment recording that the check is a shape check over EIP-written camelCase jsonb and returns `null` (skipped, not "discovered nothing") for foreign payloads |
| `git diff --check` defect introduced in this pass | blank line at EOF in `services/identity/prisma/schema.prisma` | stripped |

New surface in this slice: org source endpoints (`GET /orgs/me/sources`, `POST /orgs/me/sources/website/check`), source-graph UI (`apps/web/src/components/source-graph/`), `/app/connectors/systems`, `/app/connectors/inventory`, `/app/connected-website`, and `GET /connectors/capabilities`.

| Check | Command | Result |
|---|---|---|
| Shared build | `npm run build:shared` | pass |
| Identity build | `npm run build -w @ellines-eip/identity` | pass — `prisma generate && nest build` |
| Web production build | `npm run build -w @ellines-eip/web` | pass — 81/81 static pages |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 242 files, 338 relative imports |
| Shared tests | `npm run test -w @ellines-eip/shared` | pass — 10 suites / 282 tests |
| Identity tests | `npm run test -w @ellines-eip/identity` | pass — 27 suites / 382 tests |
| Web/Pages Functions tests | `npm run test -w @ellines-eip/web` | pass — 22 suites / 228 tests; new `functions/__tests__/db-timestamp-zone.spec.ts` pins zone-less→UTC parsing, FRESH-at-1-min vs STALE-at-181, null-not-now, and the explicit-UTC emission |
| Whitespace/format check | `git diff --check` | pass |
| Live connector reading (real Ellines Haven org) | dev servers + authenticated sync | connector freshness `ageMinutes: 0`, `state: FRESH` (was `180`/`STALE`), health `HEALTHY` with UTC evidence; health score stays `null` (never `0`) |

**Gate note (do not re-learn this the hard way):** root `npx jest` is *not* a valid gate — it discovers every suite in the tree (including the nested `.kilo/worktrees/hissing-wormhole/` checkout) without the workspace jest configs, and reports 114 real-tree suites as failing (it has no `moduleNameMapper` for `@ellines-eip/shared`). Use the per-workspace gates in the table above (`npm run test -w @ellines-eip/<pkg>`), which is also what the root `npm test` runs.

P4 remains `next` (DB-backed platform staff/roles/grants + Ellines Org Dashboard) — this slice landed the roadmap P1 connector-experiment groundwork, not P4.

### 2026-09-30 — P4 slice A: DB-backed platform staff registry + scoped grants + a nullability drift gate

**Why this slice exists.** Platform Super Admin access was decided entirely by `PLATFORM_ADMIN_EMAILS`: every listed email implicitly held *every* platform capability, with no record of who granted it, no scope, no expiry, and no way to revoke one operator without editing a secret and redeploying Pages. That is an allowlist, not an authorization model — and it is the same class of defect as the fake freshness numbers (a value presented as fact that no system actually established).

| Piece | Change | Where |
|---|---|---|
| Registry | `PlatformStaffMember` (status, expiry, revocation, `bootstrapped`) + `PlatformStaffGrant` (capability, `scope_org_id`, `expires_at`, revocation) + `PlatformStaffStatus` enum; `scope_org_id` is `''`/NOT NULL for platform-wide so the composite unique index actually bites (a NULL makes duplicates distinct in Postgres) | `services/identity/prisma/schema.prisma`, migration `0009_platform_staff` (idempotent; applied and recorded) |
| Decision logic (pure, shared) | `resolvePlatformStaffCapabilities` / `resolvePlatformStaffGrants` / `platformStaffCan` / `summarisePlatformStaffAccess`; fail-closed on unknown capability, unreadable expiry, revoked/expired grant, suspended/revoked staff; zone-less DB timestamps resolved through `db-time.ts` | `packages/shared/src/platform-staff.ts` |
| Authorization (Pages) | `loadPlatformStaff` / `requirePlatformStaff`: a registry row is authoritative **always** (a suspended operator stays locked out even while still allowlisted); no row or missing table → allowlist bootstrap with the full capability set, reported as `source: 'env_bootstrap'`; **any other DB error → DENY** ("cannot check" is not "allowed"); scope preserved end to end so an org-scoped grant never satisfies a platform-wide check | `apps/web/functions/shared/platform-staff.ts` |
| Safeguards | `platform.staff.invite`, `platform.staff.grant`, `platform.staff.revoke` (reason + confirmation + audit + result), `platform.staff.bootstrap` (also dry-run — the only one that implements it) | `packages/shared/src/safeguards.ts` |
| Drift gate | `verify:schema` now verifies **nullability**, not just table/column existence | `scripts/verify-schema-sync.mjs` |

**The nullability gate came from a live failure, not a guess.** A real write failed with `null value in column "health_score" of relation "enterprise_snapshots" violates not-null constraint (code: 23502)` — the schema said `healthScore Int?` (the honest "timeliness was never measured" encoding) while the live column was still `NOT NULL`, because the migration that dropped the constraint had not been applied to that database. A missing-column check cannot see this: the column exists, it is just narrower than the code believes. `findSchemaDrift()` now compares nullability for every mapped optional column and fails the gate; `main()` only runs on direct invocation so the pure helpers stay importable. Proof that it fires: on a synthetic pre-0007 shape it reports exactly `enterprise_snapshots.health_score`, and nothing on the nullable shape.

**Live database state (Supabase `difrqfciratkwwvjlngp`, verified by direct query, not assumed):** `enterprise_snapshots.health_score` nullable=YES with **no** NOT NULL constraint; `data_quality_scores.timeliness_score` / `data_quality_history.timeliness_score` nullable=YES; migrations 0004–0009 all `finished=true, rolled_back=false`; `platform_staff_members` / `platform_staff_grants` present with the expected shape; the single existing snapshot row has `health_score IS NULL`, i.e. a NULL write now lands. PostgREST schema cache reloaded (`NOTIFY pgrst, 'reload schema'`) so the Functions data plane sees the current DDL.

> Note for future sessions: this machine's root `.env` points at the **Supabase** project, not a local Postgres. `npm run db:push` and `prisma migrate deploy` therefore act on the cloud database. Additive changes only; a destructive change would require `--accept-data-load`/`--accept-data-loss` and is refused by default.

| Check | Command | Result |
|---|---|---|
| Shared build | `npm run build:shared` | pass |
| Shared tests | `npm run test -w @ellines-eip/shared` | pass — 11 suites / 293 tests; new `__tests__/platform-staff.spec.ts` pins fail-closed, expiry boundary, scope non-widening, and zone-less-as-UTC |
| Web/Pages Functions tests | `npm run test -w @ellines-eip/web` | pass — 23 suites / 239 tests; new `functions/__tests__/platform-staff-access.spec.ts` (11) pins: allowlist cannot resurrect a suspended operator, DB failure denies, missing table bootstraps, scoped grant fails a platform-wide check |
| Pages Functions typecheck | `npx tsc --noEmit -p apps/web/functions/tsconfig.json` | pass |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 244 files, 342 relative imports |
| Identity build | `npm run build -w @ellines-eip/identity` | pass — `prisma generate && nest build` (needs the dev server stopped: it holds the Prisma query-engine DLL on Windows) |
| Web production build | `npm run build -w @ellines-eip/web` | pass — 81/81 static pages |
| Schema/nullability drift | `npm run verify:schema` | pass — 85 mapped models, 0 missing tables, 0 missing columns, **0 nullability mismatches** |

**Remaining in P4 (not yet built, deliberately not claimed as done):** the `/api/v1/platform/staff*` endpoints (list/invite/grant/revoke/bootstrap with reason capture and audit rows), the control-plane staff UI, bootstrapping existing allowlisted operators into rows, and adopting the new resolver on the existing `/api/v1/platform/*` endpoints that still call `platformAdminFromEnv` directly. P4 is therefore **`in_progress`**, not `done`.

### 2026-09-30 — Source-separated dashboard (client Command Center + Super Admin overview)

Branch `feat/source-separated-dashboard`, based on `main` @ `9894849` (deliberately NOT based on the P4 slice-B branch).

**The defect.** The client Command Center led with `Connector health → Ellines Haven Main → Connected Systems 1`, which answers "how is EIP connected?" rather than "what is my organisation connected to?". A connector is the *mechanism*; an organisation's things are its **website** and its **business systems**. Super Admin showed `Connect your first system` to a client that already had a live system, because that banner keyed off a `!synced` flag instead of actual source state.

**Real Ellines Haven facts this was built against** (queried, not assumed):

| Fact | Value |
|---|---|
| Website source | **none configured** — the single source row is `BUSINESS_SYSTEM` with `website_url: null`, and `source_website_measurements` is empty |
| Business system | `Ellines Haven Main`, `BUSINESS_SYSTEM`, CONNECTED with real retrieval evidence |
| Discovered resources | **`books` only** — AVAILABLE, complete, 15 reported / 15 retrieved, openapi discovery |
| Connector | `Ellines Haven Main`, `rest-api`, status `synced`, auth `none` (no credential stored), serves that `BUSINESS_SYSTEM` source |
| Last successful sync | `2026-10-01T04:29:44Z` → freshness **STALE** against its own 60-minute interval |
| Enterprise health | `null` — no source published a metric, so it stays unknown |

Because no website is configured, the website card renders an explicit **WEBSITE NOT CONFIGURED** state. No URL was invented, no probe was faked, and no website figure was derived from the catalogue API.

**What changed**

| File | Change |
|---|---|
| `components/source-graph/SourceCards.tsx` (new) | Client source section: real summary counts + **Connected website** / **Connected systems** / **Connectors** cards. The website card renders only probe facts (HTTP status, response time, TLS, last check, freshness); the systems card only retrieval facts (resources, availability, record counts, completeness, errors); the connectors card only technical facts (type, source served, auth, attempts, sync, resources discovered). A failed read renders UNAVAILABLE — never "nothing connected". |
| `app/app/page.tsx` | Removed the `!synced`-gated "Connect your first system" banner; `<SourceCards />` renders above the connector strip, which is relabelled `Connector health · technical connections`. |
| `app/app/platform/page.tsx` | Removed three `healthScore ?? 0` fabrications that rendered **"0/100"** for a client with no health metric; unknown now renders **"Not measured"**. Also genericised two wizard placeholders that embedded a real tenant slug/name. |
| `components/source-graph/OrgSourceOverview.tsx` | Super Admin overview gained the **Source / Capability Summary** (websites, systems, connectors, resources, capability total/available/partial/unavailable), all null-aware. |
| `packages/shared/src/source-graph.ts` | `counts.capabilities { total, available, partial, unavailable }`, derived from each discovered resource's real availability; `null` (UNKNOWN) when nothing was discovered, never `0`. |
| `lib/api.ts` | DTO extended to match. |

**Tests** — `packages/shared/src/__tests__/source-graph.spec.ts` (20) pins the architecture at the data layer: website/system are separate types; a connector names the source it serves and is never typed WEBSITE; one connector yields many resources with `PARTIAL` completeness and a 401-derived error; capability counts by real availability and `null` when nothing was discovered; FRESH/STALE/UNKNOWN from real timestamps (including zone-less-as-UTC); no manufactured zeros. `apps/web/functions/__tests__/source-separation.ui.spec.ts` (18) pins the presentation: sources render above the connector strip, the website card contains no record counts, the systems card contains no HTTP/TLS, "connect your first system" is gated on `hasAnySource`, no `healthScore ?? 0`, no hardcoded Haven values, no demo/proof tenants.

**Live verification (real `ellines-haven`, dev server → Pages Function → PostgREST → production DB): 14/14 checks passed** — website is its own fact (`null`), the system has its own identity distinct from the connector (`source.id=src_5f71…`, `connector.id=7d90d8…`, `connector.sourceId=src_5f71…`), source type explicit, connector reports the source it serves, resources exactly `["books"]`, no invented capability categories, `retrieved=15`, capability counts `{total:1, available:1, partial:0, unavailable:0}`, freshness STALE, Super Admin cross-org read returns the same graph, and `/app`, `/app/connected-website`, `/app/connectors/systems`, `/app/connectors/inventory` all return 200.

One check was corrected during verification rather than forced: the source and its connector legitimately share the display name "Ellines Haven Main" (the source row was backfilled from that connector), so *name inequality* was a bad proxy for identity separation. Separation is now asserted by distinct ids plus the connector's explicit `sourceId`.

| Check | Command | Result |
|---|---|---|
| Shared build + tests | `npm run build:shared`, `npm run test -w @ellines-eip/shared` | pass — 12 suites / 313 tests |
| Web/Pages Functions tests | `npm run test -w @ellines-eip/web` | pass — 24 suites / 257 tests |
| Functions typecheck | `npx tsc --noEmit -p apps/web/functions/tsconfig.json` | pass |
| Web app typecheck | `npx tsc --noEmit -p apps/web/tsconfig.json` | pass (after clearing a stale `.next` artifact left by the P4 branch) |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 245 files, 342 relative imports |
| Web production build | `npm run build -w @ellines-eip/web` | pass — 81/81 static pages |
| Schema/nullability drift | `npm run verify:schema` | pass — 85 mapped models, 0 missing tables, 0 missing columns, **0 nullability mismatches** |
| Identity build | — | not required: no `services/identity` or Prisma schema change in this slice |
| Whitespace/format check | `git diff --check` | pass |

**Still open (honest list):** Haven has no website configured, so the website card can only show the not-configured state until an operator configures a real site — the monitoring engine itself is unchanged and already proven by `website-engine.spec.ts`. The three client pages load their own data from the same endpoint but were **not** visually re-laid-out (Connected Website / Connected Systems / Connectors already existed from slice A); this slice changed the Command Center and the Super Admin overview. Super Admin's cross-org `?orgId=` read still authorizes via `platformAdminFromEnv` on `main` (the registry-backed version lives on the unmerged P4 slice-B branch).
## Source classification — a web/API source is not a business system

**Status:** `done` (branch `feat/source-separated-dashboard`, applied to the real database)

**The rule.** "It speaks REST" is not a source category. A company's public catalogue API and its ERP are both REST endpoints, but one belongs under **Connected Website** and the other under **Connected Systems** — and only the organisation knows which. So the category is persisted configuration: `source_type` (`WEBSITE` | `BUSINESS_SYSTEM`) plus `source_kind` (`HTML` | `API`, non-null only for a website, enforced by CHECK). Nothing infers it from the catalog id, the URL path, the response shape or the organisation name. A REST connector pointed at `/api/...` is still just `WEBSITE` until an operator says `API`.

**Capabilities belong to the source.** `connector_capability_registries.source_id` attributes real discovery evidence to the SOURCE it describes, via `metadata.connectorId` provenance within the same organisation. It is attribution, not duplication: the one registry row the connector discovered through is also the evidence the source genuinely provides, so reclassifying a source moves its capabilities *with* it and cannot double-count them.

**Authorized path.** `PATCH /api/v1/orgs/me/sources/{id}` (owner/IT Admin; platform operator only with an explicit `?orgId=`) requires a reason, validates before writing, mutates transactionally through `eip_classify_source`, audits success **and** refusal, and returns the row that was persisted — a cross-tenant id answers "not found", never "forbidden". Migrations `0011`/`0012` add the column, the attribution backfill and the function; they reclassify **no** existing row (pinned by test).

**Removed conflation.** Unassigned connectors were being pushed into `businessSystems` as synthetic `unassigned:<id>` entries — i.e. a client with one API was shown as having a business system nobody configured. They now stay purely in connector inventory, so `counts.businessSystems` is exactly the number of real `BUSINESS_SYSTEM` rows, and the website / system / connector counts are computed from three independent sets.

**Real `ellines-haven` verification (15/15):** classified through the endpoint as `WEBSITE` + `API` with its real endpoint and the name "Ellines Haven API"; `PATCH 200`, then a real probe: `ONLINE`, HTTP 200 in ~2.0 s (measured, not assumed). It appears under Connected Website with `kind: API`, `books` **15 reported / 15 retrieved**, `AVAILABLE`, `COMPLETE`; it does **not** appear under Connected Systems (`[]`); the connector stays under Connectors as `rest-api` with `sourceType: WEBSITE`; counts `{websites: 1, businessSystems: 0, connectors: 1}`; the Super Admin cross-org read returns the identical classification. `retrievalFreshness` is honestly **STALE** (last real read `2026-10-01T04:29:41Z`) — no sync was run merely to move the timestamp.

**Tests.** `source-graph.spec.ts` (+9) pins: kind passthrough; no kind inference from URL/catalog/response; website capabilities from its own attributed registry; `null` rather than `0` when only the probe succeeded; probe freshness and capability freshness as separate facts; UNKNOWN never FRESH; independent counts; no unassigned-connector-as-system. `source-separation.ui.spec.ts` pins the vocabulary constraint, the authorized + audited path, the probe-never-creates-a-capability rule, and that the website card never reads from `businessSystems`. The old "website card must contain no record counts" assertion was deliberately **revised**, not deleted: a `WEBSITE`+`API` source can own real capabilities, so the invariant is now narrower and stricter — those counts come from `website.resources` and nowhere else.

**Operator note.** The endpoint was supplied by the operator to a local throwaway script and persisted through the product endpoint. No application code, migration, test fixture or fallback contains it; `verify-schema-sync` reports 85 models in sync.
