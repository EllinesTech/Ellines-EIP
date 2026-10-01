# Ellines EIP — Build Queue

**Product:** Ellines EIP v1.0 Foundation / Super Admin Control Plane
**Authoritative scope:** docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

> **Current execution authority:** [`docs/REAL_WORLD_EXECUTION_ROADMAP.md`](./REAL_WORLD_EXECUTION_ROADMAP.md). This roadmap combines the remaining platform work with the real-world connector experiment, first reference business system, online/offline/hybrid architecture, and advanced EIP capabilities. The historical phase table below remains useful for traceability, but it is no longer a reason to delay the real-world proof.

The execution model is now: **green main → real connector → connector engine → tiny business system → offline/hybrid → platform operations → intelligence → generalization**. Work in small complete slices; do not create another long planning cycle before the current acceptance gate is met.

**Phases 0–3 are done** (P0–P3 rows below). Phase 4 is the active phase.

- P0/P1 verified 2026-09-22 (evidence in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md` §39.1 and §40.9).
- P2 verified 2026-09-23 (evidence in spec §40.9.3).
- P3 verified 2026-09-23 (evidence in spec §40.9.3).
- P4 is `next` — see acceptance criteria below.

## Phase Queue

| ID | Phase | Scope | Status |
|---|---|---|---|
| P0 | Phase 0 — Foundation / Repository Integrity | G-01 package payload, G-02 password parity, G-14 user-API contract, dead-export removal (G-06), orphan CSS removal (G-07), structural contract validation (shared contract artifact + contract tests + CI gate) | done — verified 2026-09-22 (spec §40.9.1) |
| P1 | Phase 1 — Master Specification | Master spec reviewed and amended; gap map re-verified against the Phase-0 baseline; this queue seeded from the Phase 2+ roadmap | done — verified 2026-09-22 (spec §40.9.2) |
| P2 | Phase 2 — Platform Control Plane Foundation | Membership truth, AI server-side authorization/grounding, auth hardening, audit contract, permission grammar, tenant-isolation gate, health/CORS/audit UI fixes | **done** — verified 2026-09-23 (spec §40.9.3): lockout (5/15→15 min, both backends), session registry (migration 0003 + login/logout/requireAuth), unified §12.2 permission grammar (shared by Pages Functions + NestJS RBAC), isolation release gate in CI, named tests (health-probe DB failure injection + CORS matrix incl. preflight) on branch `eip/phase-2-platform-control-plane` @ `0fe82b2`; **G-15** membership truth (register + platform create now write `organization_memberships` in the same transaction — `auth.service.ts:82-95`), **G-17 core** (server-derived JWT identity, server-side grounding from DB, `ellinea:ask` permission gate, deterministic rate limit — `ask.ts` + `rate-limit.ts` free tier 10/min), **G-12** audit contract (flags PATCH + connector-packs POST + audit-logs CSV export all write `audit_rows` with before/after/reason/result/correlationId; `platform-audit.contract.spec.ts` 6/6), **G-08** audit UI depth (org/date filters, pagination Prev/Next, CSV export — `page.tsx` audit page), **G-05** health probes (`/platform/health/summary` + DB/email dependency probes), **G-19** CORS allowlist incl. preflight (`_middleware.ts`) |
| P3 | Phase 3 — Super Admin / God Mode Core | Safeguard engine, confirmation/reason capture, privileged-operation audit fields, package/connector-pack management, window-layer groundwork | **done** — verified 2026-09-23 (spec §40.9.3): operation-class registry (`packages/shared/src/safeguards.ts` — C-0 through C-5, 17 operations), server-side reason enforcement (`apps/web/functions/shared/auth.ts` — `enforceSafeguards()`), connector-pack lifecycle endpoints (PATCH publish/deprecate/update/DELETE in `connector-packs.ts`), package edit/delete safeguards (`packages/[id].ts`), confirmation dialog + reason capture UI (`confirm-dialog.tsx` + `useSafeguardedAction`), package/connector-pack management UI (`platform/page.tsx`), window-layer/z-index token system (`super-admin.module.css` — `--z-base` through `--z-system`); tests: `safeguard-enforcement.spec.ts` 12/12, `platform-audit.contract.spec.ts` 6/6 |
| P4 | Phase 4 — Internal Ellines Operations | DB-backed platform staff/roles/grants, scoped authorization, expiry, bootstrap. **Includes:** connector governance fix (install-from-template platformAdmin gate + max_connectors enforcement — landed 2026-09-29 on `main`), Ellines Org Dashboard (ELLINES ORGANIZATION section — spec at `.kiro/specs/ellines-org-dashboard/requirements.md`) | **next** |
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
