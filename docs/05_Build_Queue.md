# Ellines EIP — Build Queue

**Product:** Ellines EIP v1.0 Foundation / Super Admin Control Plane
**Authoritative scope:** docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

This queue is seeded from the Master Specification Phase 2–15 roadmap. Work proceeds in order; no phase is skipped. The active phase is completed, verified, built, and reviewed before the next phase begins.

## Phase Queue

| ID | Phase | Scope | Status |
|---|---|---|---|
| P2 | Phase 2 — Platform Control Plane Foundation | Membership truth, AI server-side authorization/grounding, auth hardening, audit contract, permission grammar, tenant-isolation gate, health/CORS/audit UI fixes | next |
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
