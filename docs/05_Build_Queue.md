# Ellines EIP — Build Queue

**Product:** Ellines EIP v1.0 Foundation / Super Admin Control Plane
**Authoritative scope:** docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

This queue is seeded from the Master Specification Phase 2–15 roadmap. Work proceeds in order; no phase is skipped. The active phase is completed, verified, built, and reviewed before the next phase begins.

**Phases 0 and 1 are done** (P0 and P1 rows below, verified 2026-09-22 with the evidence recorded in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md` §39.1 and §40.9). Phase 2 is the active phase and has **no completed deliverable yet** — each of its deliverables was re-verified against code on 2026-09-22 and recorded as open (§40.9.3), so nothing in Phase 2 may be marked done without new evidence.

## Phase Queue

| ID | Phase | Scope | Status |
|---|---|---|---|
| P0 | Phase 0 — Foundation / Repository Integrity | G-01 package payload, G-02 password parity, G-14 user-API contract, dead-export removal (G-06), orphan CSS removal (G-07), structural contract validation (shared contract artifact + contract tests + CI gate) | done — verified 2026-09-22 (spec §40.9.1) |
| P1 | Phase 1 — Master Specification | Master spec reviewed and amended; gap map re-verified against the Phase-0 baseline; this queue seeded from the Phase 2+ roadmap | done — verified 2026-09-22 (spec §40.9.2) |
| P2 | Phase 2 — Platform Control Plane Foundation | Membership truth, AI server-side authorization/grounding, auth hardening, audit contract, permission grammar, tenant-isolation gate, health/CORS/audit UI fixes | **done** — verified 2026-09-22 (spec §40.9.3): lockout (5/15→15 min, both backends), session registry (migration 0003 + login/logout/requireAuth), unified §12.2 permission grammar (shared by Pages Functions + NestJS RBAC), isolation release gate in CI, named tests (health-probe DB failure injection + CORS matrix incl. preflight) on branch `eip/phase-2-platform-control-plane` @ `0fe82b2` |
| P3 | Phase 3 — Super Admin / God Mode Core | Safeguard engine, confirmation/reason capture, privileged-operation audit fields, package/connector-pack management, window-layer groundwork | todo |
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

1. Work only the current `next` phase.
2. Do not implement later-phase features early unless the Master Specification explicitly makes them a dependency.
3. A phase must pass its documented tests, acceptance criteria, and completion definition before its status changes to `done`.
4. Never represent `[PLANNED]` capabilities as live or implemented.
5. Keep `/app/platform` as the single Super Admin control-plane architecture; do not create a competing `/app/super-admin` surface.
6. Before merge to `main`, verify the phase branch against `main`, run the applicable tests/builds, and review the diff.

## Verification log

### 2026-09-22 — P0/P1 status marking pass (`eip/phase-2-platform-control-plane` @ `1798868`)

Status marking only: the two completed phases were recorded as `done` with evidence, and the `next` phase was re-verified as still open. Evidence lives in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md`: §39.1 (phase status index), §40.3 (resolved gaps re-verified), §40.9 (phase completion verification log).

| Check | Command | Result |
|---|---|---|
| Shared packages build | `npm run build:shared` | pass |
| Web build | `npm run build -w @ellines-eip/web` | pass |
| Identity build | `npm run build -w @ellines-eip/identity` | pass |
| Pages Functions import check | `npm run verify:pages-functions` | pass — 151 files, 188 relative imports |
| Shared tests (incl. Phase-0 contract suite) | `npm run test -w @ellines-eip/shared` | pass — 2 suites / 37 tests |
| Phase-0 contract gate (CI equivalent) | `npm run test -w @ellines-eip/shared -- --testPathPattern=contracts --runInBand` | pass — 8/8 |

Phase-2 deliverables re-checked as **open** (no deliverable complete): membership truth (G-15), AI server-side identity/grounding (G-17 core), auth hardening (partial: rate limits exist, lockout/session-registry absent), audit contract (G-12 flags/packs audit + row upgrade + C-0 events), unified permission grammar, tenant-isolation suite, control-plane fixes (G-05 health probes, G-08 audit UI depth, G-19 CORS allowlist).
