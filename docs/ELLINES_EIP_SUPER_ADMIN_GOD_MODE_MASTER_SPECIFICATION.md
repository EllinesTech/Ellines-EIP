# ELLINES EIP — SUPER ADMIN / GOD MODE MASTER SPECIFICATION

**Product:** Ellines EIP — Enterprise Intelligence Platform
**AI engine:** Ellinea AI · **Parent:** Ellines Tech
**Document class:** Long-term engineering/product architecture specification (control-plane governing document)
**Status:** Phases 0–1 **done** — verified 2026-09-22 (status marking pass; no application-code changes in this change set) · Phase 2 is `next` on `eip/phase-2-platform-control-plane`
**Baseline:** `main` @ `179886897da01da6aec73c258a487fb65eb840a3` ("Merge eip/phase-1-foundation: complete phase 1 master specification review + seed phase 2 build queue")
**Branch:** `eip/phase-2-platform-control-plane`
**Supersedes:** nothing (companion to `docs/00_EIP_MASTER_SPEC.md` and `docs/34_Super_Admin_Dashboard_Spec.md`; where those documents conflict with this one on control-plane matters, this document governs until formally revised)
**Audience:** Ellines engineers, platform operators, reviewers

---

## 0. Document Control

### 0.1 Purpose of this document

This specification defines the long-term architecture and operating model of Ellines EIP with the **Super Admin / God Mode platform control plane as the governing layer** of the entire product. It is written after a code-level audit of the current repository so that every requirement is grounded in what actually exists today, what is partially built, and what is missing.

It defines:

- what EIP is and is not, and how client systems relate to it;
- the single platform control plane and its capability catalog;
- God Mode as a governed capability (not an unrestricted button);
- the internal Ellines operator model (staff, delegation, elevation);
- cross-dashboard governance rules for every future dashboard;
- domain specifications: tenants, connectors, licensing, usage, security, audit, health, AI, developer operations, recovery, configuration, notifications, search;
- UI/window architecture, data architecture, API standards, reliability, accessibility, testing;
- a phased implementation roadmap (Phase 0–15);
- a verified current-state gap map.

### 0.2 How to read this document

- **MUST / MUST NOT / SHOULD / MAY** are used in the RFC-2119 sense.
- **[VERIFIED]** marks a finding confirmed by direct code inspection in this audit, with file references.
- **[PLANNED]** marks a capability that does not exist yet and depends on infrastructure not yet present. Planned items MUST NOT be represented as existing in UI, docs, or sales material.
- Acceptance criteria are written to be checkable by tests or explicit manual verification.

### 0.3 Relationship to other documents

| Document | Role |
|---|---|
| `docs/00_EIP_MASTER_SPEC.md` | Product/architecture vision (117 sections). This document does not replace it; it constrains and extends it for the control plane. |
| `docs/34_Super_Admin_Dashboard_Spec.md` | Super Admin UX/navigation spec (16-item navigation). Section 6 of this document adopts and extends that navigation as the target information architecture. |
| `docs/09_Access_Layers.md` | Work Console vs Org IT vs Platform Super Admin access layers. Section 11 formalizes the actor model behind those layers. |
| `docs/47_EIP_REPOSITORY_AUDIT.md` | Prior audit pass (encryption v2, mock-metric removal). Section 40 carries forward and re-verifies its findings. |
| `docs/05_Build_Queue.md` | Ordered worklist. Roadmap phases in Section 39 feed this queue. |

### 0.4 Change control

Changes to this specification are made via pull request to `main` with a summary of what changed and why. The gap map (Section 40) MUST be re-verified against code whenever an item is claimed complete; a gap item may only be moved to "resolved" when the verifying evidence (test, build, or code reference) is recorded in the PR.

### 0.5 Version history

| Version | Date | Status | Summary | Branch / commit |
|---|---|---|---|---|
| 0.1.0-draft | 2026-09-22 | Draft for review | Initial draft created from a verified repository audit (gap map G-01..G-24, Phases 0–15, full control-plane specification). Review corrections applied: audit-coverage accuracy (tenant settings and package update/delete audit already exist), C-0 redefined as an access-event class, AI server-side authorization and membership truth moved to early roadmap phases, unified permission grammar, silent-fallback prohibition, data-protection and RPO/RTO requirements, onboarding/slug security, health payload minimization, webhook-test SSRF rules, retention enforcement ownership, notification phase ownership, session-management surface, concurrency/conflict rules, search and window performance/accessibility requirements, z-index tokens, single-page split triggers, Register-Business IA classification, secret-rotation classification, actor-model clarification, contract/parity validation mechanisms, synthetic-org and service-role isolation requirements, and gap-map re-verification against current code. | `eip/super-admin-god-mode-master-spec` (source draft) |

| 0.1.1 | 2026-09-22 | Phases 0–1 recorded done (status marking pass) | Marked roadmap Phase 0 and Phase 1 **done** with recorded evidence (§39.1 phase status index, §40.9 verification log, §40.3 rows strengthened); `docs/05_Build_Queue.md` given `done` rows for P0/P1. Phase 2 scope re-verified deliverable-by-deliverable against code and recorded as still open (§40.9.3) — nothing in Phase 2 is claimed complete. Verification run on this branch: `build:shared`, `build -w @ellines-eip/web`, `build -w @ellines-eip/identity`, `verify:pages-functions`, `test -w @ellines-eip/shared` (37 tests, incl. the Phase-0 contract gate) — all green (§40.9.4). | `eip/phase-2-platform-control-plane` |

Future versions MUST be appended here (version, date, status, summary, branch/commit reference) per the change-control rule in 0.4.

---

# PART I — PRODUCT DEFINITION

## 1. What EIP Is

Ellines EIP is an **enterprise integration, intelligence, orchestration, governance, and operational platform**. It connects to a client's existing systems, understands their data and capabilities, normalizes relevant information into a coherent model, and provides intelligence, visibility, coordination, and approved actions across those systems — from one secure place.

EIP sits **above** the client's systems. It is deployed as a multi-tenant SaaS platform operated by Ellines Tech, where each client business is a tenant (organization) whose users access EIP through role-scoped dashboards.

EIP's functional surface comprises:

1. **Identity and access** — organizations, users, roles, permissions, sessions, SSO.
2. **Connector platform** — cataloged, credentialed, lifecycle-managed integrations to client systems.
3. **Intelligence** — Ellinea AI (Ask/Console/agents), reports, dashboards, alerts, insights.
4. **Orchestration** — workflows, rules, approvals, scheduled jobs, synchronization.
5. **Governance** — audit, compliance evidence, data-access logging, entitlements, quotas.
6. **Operations** — the platform control plane (Super Admin) that operates EIP itself.

## 2. What EIP Is Not

EIP MUST NOT:

1. Automatically replace a client's existing system of record. Where an external system is authoritative, EIP connects to it; it does not absorb its role.
2. Become an uncontrolled copy of connected databases. Persistence follows the ownership taxonomy in Section 4.
3. Treat AI output as authorization, or as evidence of an action having occurred.
4. Claim an action succeeded without source-system confirmation.
5. Present unavailable data as live, or fabricate telemetry of any kind (see Section 38).
6. Allow any dashboard, feature, or integration to bypass platform governance (Section 14).
7. Expose data outside a user's effective permission scope, including to platform operators beyond what their role authorizes.
8. Silently merge records that cannot be confidently matched.
9. Require a specific vendor's ERP/CRM/etc. — connectors are capability-based, not vendor-locked.
10. Use automation to bypass authentication, authorization, or audit.

## 3. Client System Boundaries

### 3.1 Client systems in scope

Depending on the client, EIP may connect to: ERP, POS, CRM, HR, accounting/finance, hospital/medical systems, inventory, e-commerce, websites, mobile application backends, custom software, databases, APIs, third-party SaaS, and other enterprise systems.

### 3.2 The boundary principle

> **EIP connects, observes, normalizes, and coordinates. It does not silently become the client's operational system.**

For each connected system, the connector registration MUST declare a **source-of-truth declaration** (Section 21.8): which entity types in that system are authoritative, which EIP may cache/derive, and which actions EIP is permitted to write back (if any). Write-back is always an explicitly configured, permissioned, audited capability — never a default.

Where a client wants EIP to *own* a capability the client lacks (e.g., approvals, workflow, reporting over data EIP has ingested), that is legitimate — but the ownership MUST be explicit in configuration, visible in the control plane, and reflected in the data taxonomy (Section 4).

### 3.3 Boundary rules

1. EIP MUST operate correctly with **zero** client connectors (identity, tenancy, audit, control plane all work standalone). [VERIFIED: this is already true architecturally — the platform page and doc 34 both enforce "customer connectors are business services, not EIP infrastructure".]
2. A connector outage MUST degrade EIP features that depend on it to an explicit **unavailable/stale** state; it MUST NOT degrade platform core (auth, tenancy, audit, control plane).
3. EIP MUST NOT write to a source system without: declared write capability, explicit user action or approved automation, permission check, and audit record.
4. Deleting or disconnecting a connector MUST NOT delete the client's source system data; it only stops EIP's access and marks derived data stale/archival per retention policy.

## 4. Data Ownership Taxonomy

All data handled by EIP MUST be classifiable into exactly one of eight classes. Every table, store, and API surface SHOULD document its class. This taxonomy governs retention, deletion, export, and isolation decisions.

| # | Class | Definition | Examples (current repo) | Ownership | Retention |
|---|-------|-----------|------------------------|-----------|-----------|
| 1 | **Client-owned source data** | Records whose authority lives in the client's system. EIP reads/caches them; EIP deletion does not affect them. | ERP/POS/CRM records reached via connectors; enterprise snapshots ingested from client pushes | Client | Governed by cache/derivative policy; never treated as EIP-native |
| 2 | **EIP-owned platform data** | Records EIP itself is the system of record for. | organizations, users, memberships, roles, custom roles, packages (rate_limit_tiers), connector installations/packs/templates, dashboards, widgets, alerts, workflow rules, approvals, scheduled reports, documents, api keys, sso providers, agents | EIP (tenant-scoped) | Lifecycle of the tenant; deletion per Section 20.9 |
| 3 | **Derived/normalized data** | Data computed or normalized from class 1/2; reproducible in principle. | UEM model objects, enterprise summary, report outputs, alert correlations, knowledge-graph entities | EIP (tenant-scoped) | Rebuildable; may be pruned aggressively |
| 4 | **Cached data** | Time-limited copies of source data for performance. | datetime-prefs cache (localStorage), snapshot caches | EIP (tenant-scoped) | TTL-bounded; MUST have explicit invalidation |
| 5 | **Intelligence/analytics** | Metrics, trends, AI interpretations. | platform metrics aggregates, Ellinea learning signals, model performance logs | EIP | Aggregates retained; raw per-event data per retention policy |
| 6 | **Audit records** | Immutable operational history. | audit_logs, role_audit_logs, agent audit logs, data-access log, rate_limit_violations | EIP (append-only) | Long retention (Section 25.6); never editable |
| 7 | **Configuration** | Settings that shape behavior. | org settings JSON, feature flags (currently in org settings JSON), notify policy, sso provider config | EIP (platform or tenant scope) | Versioned where feasible (Section 31) |
| 8 | **Connector credentials/secrets** | Secrets enabling EIP to access client systems. | connector installation `config` credential fields (encrypted v2), webhook secrets, VAPID/SMTP/LLM env secrets | Client-owned secret, EIP-custodied | Rotatable; never logged (Section 24.7) |

Rules:

1. Class 8 MUST always be encrypted at rest with the current encryption scheme (v2 AES-256-GCM + HKDF master key [VERIFIED: `apps/web/functions/shared/encryption.ts`]) and MUST be redacted from all API responses that return configuration (`redactConfig` [VERIFIED: `apps/web/functions/shared/connectors.ts`]).
2. Class 6 MUST be append-only. No API MAY update or delete audit rows (correction happens by adding a new row, e.g. a reversal event).
3. Class 1 data MUST be traceable to its source (system, connector, fetch time) wherever it is displayed or stored.
4. When a capability's storage class is ambiguous, the control-plane owner decides and the decision is recorded in this document's change log.

# PART II — PLATFORM CONTROL PLANE

## 5. The One Control Plane Principle

> **ONE PLATFORM CONTROL PLANE. ONE SUPER ADMIN NAVIGATION. ONE GOVERNANCE MODEL.**

1. There MUST be exactly one Super Admin surface: the evolved `/app/platform` route. [VERIFIED: `/app/platform` exists today as a single-page control plane with its own rail navigation.]
2. Competing Super Admin dashboards MUST NOT be created. A new route such as `/app/super-admin` MUST NOT be introduced unless this specification is amended with a documented architectural reason (e.g., a hard technical constraint), and the old surface is retired in the same change set.
3. Every platform capability listed in Section 7 MUST be reachable from the single Super Admin navigation, subject to role-based visibility.
4. Platform capabilities MUST NOT be duplicated into tenant-facing routes; where a tenant needs a read-only view of platform-managed data, it is served by the same API with tenant-scoped authorization, not by a second admin surface.
5. The control plane MUST be clearly branded and worded as platform operations (current hero copy already does this [VERIFIED]) so operators never confuse it with a customer dashboard.

## 6. Super Admin Navigation (Target Information Architecture)

Doc 34 defines a 16-item navigation. The current implementation has 9 sections [VERIFIED: `NAV` array in `apps/web/src/app/app/platform/page.tsx`]. The target navigation is:

| # | Group | Item | Status today |
|---|-------|------|--------------|
| 1 | Platform | Command Center | Implemented (overview) |
| 2 | Platform | Businesses | Implemented |
| 3 | Platform | Register Business | Implemented (onboarding) — classified as a contextual **action/shortcut** inside Businesses (20.8), not a second primary capability |
| 4 | Commercial | Service Packages | Partially (create broken — see Gap G-01) |
| 5 | Commercial | Licensing / Entitlements | Missing |
| 6 | Commercial | Usage / Quotas | Missing (data exists: `api_usage`, `rate_limit_violations`) |
| 7 | Control | Access & Control | Partially (tenant users only; no internal staff) |
| 8 | Control | System Health | Partially (shallow — Gap G-05) |
| 9 | Control | Security & Audit | Partially (shallow filters — Gap G-08) |
| 10 | Control | Troubleshooting / Incidents | Missing |
| 11 | Intelligence | Ellinea AI | Partially (governance gaps — Section 28) |
| 12 | Intelligence | Platform Insights | Missing (raw metrics only) |
| 13 | System | Feature Controls | Partially (platform flags only — Gap G-11) |
| 14 | System | Platform Configuration | Partially (tenant date/time only) |
| 15 | System | Developer / API Operations | Missing |
| 16 | System | Recovery / Maintenance | Partially (encryption migration only) |

Rules:

1. Navigation items for missing capabilities MUST either be hidden or rendered with an explicit "not yet available" state. They MUST NOT render fake data.
2. **Single-page threshold (measurable).** The platform page remains ONE user-facing Platform Control Plane. Splitting the implementation internally (components/modules) is allowed and encouraged when maintainability requires it; creating competing Super Admin dashboards is NOT. Internal splitting (sub-components, co-located modules, or sub-routes under `/app/platform/*` that share the single navigation model) is triggered when ANY of the following architectural thresholds is met:
   - **Responsibility boundaries:** a section owns its own data-fetching, state, and error handling that is independent of the rest of the page (a bounded context).
   - **Testability:** a section can only be tested by rendering the entire platform page.
   - **Component/module size:** a single source file exceeds ~800 lines or a single component exceeds ~300 lines solely because multiple unrelated sections live in it.
   - **Bundle size:** the platform route bundle exceeds the performance budget in 35.9 and code-splitting by section is the remedy.
   - **Maintainability:** two or more contributors repeatedly produce merge conflicts in the same file, or a change to one section requires re-reading unrelated sections.
   - **Route ownership:** a section needs its own data-loading lifecycle (route-level loading/error boundaries) that cannot be cleanly nested in the single page.
   Splitting internal components/modules is always allowed without meeting these triggers; these triggers govern when sub-routes under `/app/platform/*` may be introduced. One navigation model (this section) is preserved in every case.
3. The rail MUST show, for the acting operator, only items their role permits (Section 11).
4. **Businesses vs Register Business:** "Businesses" is the primary capability (7.2); "Register Business" is the onboarding **action** within business management (7.3). The preferred model is a Register/Onboard action inside the Businesses section. If a dedicated rail entry is retained for quick access, it MUST be visually and semantically classified as an action/shortcut (e.g., grouped under Businesses or labeled "Register Business (action)"), never as a second primary capability with its own data domain.

#### 6.1 Single-rail redesign (implemented on `agent/nav-unified-sidebar`)

To eliminate the nested second navigation rail previously rendered inside `apps/web/src/app/app/platform/page.tsx`, the platform control-plane sections are now surfaced **only** from the single primary sidebar in `apps/web/src/app/app/layout.tsx`, gated to platform admins (`isPlatformAdmin`). The internal rail (`<aside className={styles.rail}>`) was removed from the platform page, so its content now expands into the full main pane.

Platform sections are driven by a `?section=` query parameter on the single `/app/platform` route — **no new pages or fake routes are created**. The mapping to this specification's information architecture is:

| Platform section (former nav id) | Unified group | Unified item label | Route | Notes |
|---|---|---|---|---|
| overview | PLATFORM | Command Center | `/app/platform` | Landing for the Control Plane |
| businesses | CLIENT ORGANIZATIONS | Client Portfolio | `/app/platform?section=businesses` | 7.2 |
| organizations | CLIENT ORGANIZATIONS | Organizations | `/app/platform?section=organizations` | **Planned** — no live route |
| onboarding | CLIENT ORGANIZATIONS | Register Client (action) | `/app/platform?section=onboarding` | 7.3, classified as an onboarding action |
| access | CLIENT ORGANIZATIONS | Users & Access | `/app/platform?section=access` | 7.x |
| services | CLIENT ORGANIZATIONS | Services | `/app/platform?section=services` | **Planned** — no live route |
| packages | CLIENT ORGANIZATIONS | Service Packages | `/app/platform?section=packages` | 7.4 (Commercial) |
| health | CLIENT ORGANIZATIONS | Health & Connectivity | `/app/platform?section=health` | 7.x (connectivity belongs to client onboarding) |
| activity | CLIENT ORGANIZATIONS | Activity & Usage | `/app/platform?section=activity` | **Planned** — no live route |
| configuration | CLIENT ORGANIZATIONS | Configuration | `/app/platform?section=configuration` | **Planned** — no live route |
| alerts | CLIENT ORGANIZATIONS | Alerts & Issues | `/app/platform?section=alerts` | **Planned** — no live route |
| audit | CLIENT ORGANIZATIONS | Client Audit | `/app/platform?section=audit` | 9.1 |
| configuration | PLATFORM | System Configuration | `/app/platform?section=configuration` | 31 |
| ai | ELLINEA | Ellinea AI | `/app/platform?section=ai` | 28 |

- **ELLINES ORGANIZATION** is intentionally not duplicated here: it is owned by the workspace-level sidebar (Organization Overview, Organization Data, Organization System, Org Admin, System Settings) in `apps/web/src/app/app/layout.tsx`, which remains the single global rail for the acting operator.
- The unified sidebar renders group headers (`CLIENT ORGANIZATIONS`, `PLATFORM`, `ELLINEA`) and active-route highlighting derived from the `?section=` parameter. The architecture is extensible: new client capabilities (Services, Activity & Usage, Alerts & Issues, Client Audit expand) and platform capabilities (Compliance, Compliance) can be appended to `@/components/platform-sidebar-nav.ts` under the correct group without reintroducing a second rail.
- Items marked **Planned** (`available: false`) are reserved in the architecture but render as disabled, non-linkable entries with a "— planned" label. They create **no** route, **no** component, and **no** data — clicking them does nothing. Rule 1 is preserved exactly: missing capabilities are hidden/disabled, never fake.
- The CLIENT ORGANIZATIONS group is architected for scale: new client capabilities (Services, Activity & Usage, Alerts & Issues, Client Audit expand) can be appended to `@/components/platform-sidebar-nav.ts` under the correct group without reintroducing a second rail. Selecting a specific client is handled in the main content area (tabs, cards, breadcrumbs, contextual headers) — never a second sidebar.
- Missing capabilities from §6 (Licensing/Entitlements, Usage/Quotas, Troubleshooting/Incidents, Platform Insights, Developer/API Operations, Recovery/Maintenance) are **not** added as nav items and are **not** fake routes — they remain hidden pending their Phase deliverables.

Rules 1, 3 and 4 continue to apply unchanged. Rule 2 (single-page threshold / internal splitting) is unaffected: the platform page is still one user-facing Control Plane; only the rendering of its own navigation moved to the shared global rail.

## 7. Capability Catalog

### 7.0 Capability template

Every capability below is specified with: **Purpose · Allowed actors · Data · APIs · Audit · Security · Failure handling · Dependencies · Acceptance criteria**. "PA" = Platform Admin roles from Section 11 that are allowed; "Tenant" = client-side roles.

### 7.1 Command Center

- **Purpose:** Real-time operational overview of the whole platform (Section 17 details it).
- **Allowed actors:** Platform Owner, Platform Administrator, Read-Only Platform Analyst (view); all internal operators (scoped view).
- **Data:** Aggregates from organizations, users, audit_logs, api_usage, rate_limit_violations, connector_installations, health, incidents [PLANNED], jobs [PLANNED].
- **APIs:** `GET /api/v1/platform/metrics` (exists [VERIFIED]); `GET /api/v1/platform/health/summary` [PLANNED].
- **Audit:** View-only; no audit rows generated by viewing. Metric queries SHOULD be logged at debug level, not audit level.
- **Security:** Platform-admin gate on every endpoint (server-side; never client-trusted).
- **Failure handling:** Each KPI renders an explicit unavailable state when its source fails; partial data MUST be labeled with its freshness timestamp.
- **Dependencies:** Database; health prober; metrics aggregation.
- **Acceptance criteria:** (a) all KPIs trace to a named data source; (b) killing the DB shows unavailable states, not zeros; (c) refresh cadence documented and visible ("updated Ns ago").

### 7.2 Businesses / Organizations

- **Purpose:** List, search, inspect, and operate every tenant organization.
- **Allowed actors:** Platform Owner, Platform Administrator, Business Onboarding Operator (lifecycle actions), Support Operator (view + suspend with approval), Read-Only Analyst (view).
- **Data:** organizations (class 2), membership counts, package assignment, status, settings.
- **APIs:** `GET /platform/orgs`, `PATCH /platform/orgs/:id` (status), `GET /platform/orgs/:id/stats`, `GET|PATCH /platform/orgs/:id/settings` — all exist [VERIFIED].
- **Audit:** Every status change, settings change, and inspection-triggering mutation MUST write `platform.org.*` audit rows with actor, target org, before/after status, reason [VERIFIED: status change, create, and tenant settings changes are audited — `orgs/[id]/settings.ts` inserts an `audit_logs` row on PATCH; reason/before-after capture is a contract upgrade (25.1), not a missing-audit gap].
- **Security:** Server-side platform-admin check on every endpoint [VERIFIED present]; tenant data returned only to authorized operators.
- **Failure handling:** Status update failures surface the API error; optimistic UI MUST roll back on failure.
- **Dependencies:** Database; audit pipeline.
- **Acceptance criteria:** (a) search by name/slug/status works server-side for large tenant counts (pagination); (b) suspend/reactivate is audited with before/after; (c) non-platform-admin receives 403 on all endpoints.

### 7.3 Business onboarding

- **Purpose:** Create a tenant and its owner in one controlled flow.
- **Allowed actors:** Platform Owner, Platform Administrator, Business Onboarding Operator.
- **Data:** organizations, users (owner), audit.
- **APIs:** `POST /platform/orgs/create` [VERIFIED].
- **Audit:** `platform.org.create` with actor, org, owner email [VERIFIED present].
- **Security:** Password policy MUST match the global policy (Gap G-02); slug uniqueness enforced [VERIFIED]; creation MUST be transactional or compensating-action-safe (Gap G-13).
- **Failure handling:** Partial-failure rollback MUST be reliable; the API MUST report exactly what was created if rollback fails.
- **Dependencies:** Database; password hasher; (later) invite email.
- **Acceptance criteria:** (a) creating an org with an existing slug returns 409 and creates nothing; (b) owner password below policy is rejected before any insert; (c) audit row exists for every successful creation; (d) failed creation leaves zero orphan rows (or a recorded orphan-repair path exists).

### 7.4 Business lifecycle (suspend/reactivate/maintenance/delete)

- **Purpose:** Control a tenant's availability and end-of-life.
- **Allowed actors:** Suspend/reactivate: Platform Admin + Business Onboarding Operator. Maintenance mode [PLANNED]: Platform Admin. Deletion [PLANNED]: Platform Owner only, dual-approval.
- **Data:** organizations.status, settings.
- **APIs:** `PATCH /platform/orgs/:id` (active/suspended) [VERIFIED]; maintenance + deletion [PLANNED].
- **Audit:** before/after status, reason, actor [VERIFIED for status; reason capture MUST be added — Section 9].
- **Security:** Suspension MUST block tenant logins/data access; MUST NOT block platform operator access for troubleshooting.
- **Failure handling:** If suspension fails mid-way, the effective state MUST be re-readable and idempotent (repeat PATCH yields same result).
- **Dependencies:** Auth layer honoring status; connector scheduler honoring status.
- **Acceptance criteria:** (a) suspended org's users cannot obtain valid tokens for tenant data; (b) reactivation restores access; (c) both directions audited.

### 7.5 Users (tenant users)

- **Purpose:** Manage users inside any tenant: list, create, update, deactivate, reset.
- **Allowed actors:** Platform Owner, Platform Administrator, Support Operator (scoped to assigned orgs).
- **Data:** users, organization_memberships.
- **APIs:** `GET|POST /platform/orgs/:id/users`, `PATCH|DELETE /platform/orgs/:id/users` [VERIFIED — note the web client currently calls the query-param variant while the NestJS controller exposes the path-param variant; the Pages Functions are authoritative for production and MUST be the single contract — Gap G-14].
- **Audit:** create/update/deactivate audited with actor and target [VERIFIED present in platform service].
- **Security:** Password policy parity (Gap G-02); created users MUST get a consistent membership record (Gap G-15); no plaintext password ever stored or logged.
- **Failure handling:** Duplicate email → 409 with clear message; partial failures leave no half-created users.
- **Dependencies:** Database; hasher; invite email [PLANNED for magic-link invites from platform].
- **Acceptance criteria:** (a) platform-created user can log in with the password set at creation (policy parity); (b) deactivation immediately invalidates future token issuance; (c) all mutations audited.

### 7.6 Roles & permissions (tenant RBAC)

- **Purpose:** Govern fixed roles and custom roles inside tenants; platform visibility into role usage.
- **Allowed actors:** Platform Owner/Administrator (view + emergency override); tenant Owner/Admin manage their own roles (existing surface: `/app/settings/custom-roles` [VERIFIED]).
- **Data:** custom_roles, organization_memberships.custom_role_id, role_audit_logs.
- **APIs:** existing org-scoped custom-roles endpoints [VERIFIED]; platform-level role overview [PLANNED].
- **Audit:** role changes audited via role_audit_logs [VERIFIED model exists]; platform overrides MUST be audited as `platform.rbac.*`.
- **Security:** Permission evaluation is server-side with wildcard support [VERIFIED: `canByRole`/`checkPermission` in `shared/auth.ts`]; JWT role claim MUST NOT be trusted without membership verification for sensitive endpoints.
- **Failure handling:** Unknown role in JWT → deny.
- **Dependencies:** Database; permission service.
- **Acceptance criteria:** (a) a custom role granting `connector:*` can sync but not manage platform flags; (b) role audit rows exist for every custom-role mutation.

### 7.7 Internal staff (Ellines operators)

- **Purpose:** Manage Ellines' own operator accounts, roles, and access — distinct from tenant users. Full specification in Part IV.
- **Status:** Missing today [VERIFIED: no internal-staff model; platform admins are an env email allowlist — Gap G-18].

### 7.8 Delegation

- **Purpose:** Allow the Platform Owner to delegate scoped authority (e.g., an Onboarding Operator may create businesses but not touch security configuration).
- **Status:** Missing [PLANNED — Section 13].

### 7.9 Packages

- **Purpose:** Define commercial/service packages (currently backed by `rate_limit_tiers` [VERIFIED]) and manage their lifecycle.
- **Allowed actors:** Platform Owner, Platform Administrator, Package/Licensing Operator.
- **Data:** rate_limit_tiers (packages), organization_tiers (assignments).
- **APIs:** `GET|POST /platform/packages`, `PATCH|DELETE /platform/packages/:id` [VERIFIED endpoints exist; UI for edit/delete missing — Gap G-09].
- **Audit:** create, update, and delete are all audited [VERIFIED: `platform/packages/[id].ts` writes `platform.package.update` and `platform.package.delete` audit rows]. The remaining package-management gap is UI/management completeness (G-09), NOT missing backend audit.
- **Security:** Only package operators; deletion blocked when assignments exist (or requires explicit reassignment).
- **Failure handling:** 409 on duplicate name; validation errors listed field-by-field.
- **Dependencies:** Database; usage enforcement (Section 23).
- **Acceptance criteria:** (a) UI create works end-to-end (fixes G-01 payload mismatch); (b) edit/delete UI exists with confirmation + audit; (c) a package in use cannot be silently deleted.

### 7.10 Licensing / Entitlements

- **Purpose:** Define what each tenant is entitled to (features, limits) independent of rate limits; support trials, expiry, overrides, internal grants.
- **Status:** Missing as a distinct model [PLANNED — Section 22]. Today "package" conflates commercial tier + rate limits + feature toggles in one row.

### 7.11 Usage & Quotas

- **Purpose:** Track and enforce consumption of controlled resources per tenant.
- **Status:** Data collection partially exists (`api_usage`, `rate_limit_violations`, rate-limit guard [VERIFIED]); operator surface missing (Gap G-10). Full spec in Section 23.

### 7.12 Connectors & Connector packs

- **Purpose:** First-class integration platform: catalog, packs, installations, lifecycle, health. Full spec in Section 21.
- **Status:** Substantially implemented for installations [VERIFIED: installations CRUD/test/sync/run-due, packs list/create, templates, OpenAPI parse, autoscan probe]; pack management UI and lifecycle incomplete (Gap G-09/G-10 family).

### 7.13 Feature flags

- **Purpose:** Platform-wide and tenant-scoped feature control. Full spec in Section 31.
- **Status:** Platform flags only, stored as JSON in the synthetic `ellines-platform` org settings, hardcoded catalog, no audit on change [VERIFIED — Gaps G-11, G-12].

### 7.14 Platform configuration

- **Purpose:** System-wide settings (branding, defaults, security policy, provider keys status).
- **Status:** Minimal (tenant date/time settings only [VERIFIED]); platform-level configuration surface missing [PLANNED].

### 7.15 Tenant configuration

- **Purpose:** Per-tenant settings an operator may adjust (presentation, policies, limits overrides).
- **APIs:** `GET|PATCH /platform/orgs/:id/settings` [VERIFIED].
- **Audit:** settings mutations already write audit rows [VERIFIED: `orgs/[id]/settings.ts` inserts an `audit_logs` row on PATCH]. The row SHOULD be upgraded to the full audit contract (before/after, reason, correlation ID — 25.1).
- **Acceptance criteria:** every settings PATCH writes an audit row with before/after (already true; a regression test MUST lock this behavior in).

### 7.16 Security

- **Purpose:** Operator surface for security posture: admin accounts, session controls, credential rotation, security events. Full spec in Section 24.

### 7.17 Audit

- **Purpose:** Cross-tenant audit search/filter/export. Full spec in Section 25.
- **Status:** Backend supports orgId/action/from/to/limit/offset [VERIFIED]; UI exposes only action-prefix + fixed limit [VERIFIED — Gap G-08]; no export.

### 7.18 System health

- **Purpose:** Real dependency health, not a hardcoded string. Full spec in Section 26.
- **Status:** `GET /api/v1/health` returns hardcoded `status:'ok'` [VERIFIED — Gap G-05].

### 7.19 Incidents & Alerts

- **Purpose:** Incident lifecycle (open/ack/assign/escalate/resolve) and operator alerts.
- **Status:** Missing [PLANNED — Section 26.4]. Dashboard alert objects exist for tenant dashboards [VERIFIED model] but are not platform incidents.

### 7.20 Jobs & Queues

- **Purpose:** Visibility and control of background work (connector syncs, report runs, digests, migrations).
- **Status:** No job framework; one-off endpoints (`run-due`, report run, digest) exist [VERIFIED]. Job registry [PLANNED — Section 26.6].

### 7.21 Synchronization

- **Purpose:** Per-installation sync state/history/errors with retry and replay.
- **Status:** Installation sync + test endpoints exist [VERIFIED]; sync history surface is partial (webhook deliveries exist for inbound webhooks [VERIFIED]); a unified sync-history view is missing [PLANNED].

### 7.22 Platform metrics & insights

- **Purpose:** Raw telemetry (metrics endpoint [VERIFIED]) plus calculated analytics (Section 27).
- **Status:** Raw 24h counters only; insights missing [PLANNED].

### 7.23 API operations / Developer operations

- **Purpose:** Platform API catalog, keys, service accounts, webhooks, versions, rate limits, tracing.
- **Status:** Org-level API keys + webhooks exist [VERIFIED]; platform-level developer operations missing [PLANNED — Section 29].

### 7.24 AI operations

- **Purpose:** Govern Ellinea AI: providers, models, usage, cost, prompts, safety. Full spec in Section 28.
- **Status:** Ask endpoint with grounding exists; governance gaps verified (client-supplied role, no AI audit, no rate limit) [VERIFIED — Gap G-17].

### 7.25 Recovery & Maintenance

- **Purpose:** Migrations, maintenance mode, backup visibility, repair, replay. Full spec in Section 30.
- **Status:** Encryption migration with dry-run exists [VERIFIED]; everything else missing [PLANNED].

### 7.26 Notifications

- **Purpose:** Platform alerts, operator notifications, tenant notification delivery. Full spec in Section 32.
- **Status:** Outbox + delivery + push subscription + policy exist at tenant level [VERIFIED]; platform-level operator notifications missing [PLANNED].

### 7.27 Operational activity

- **Purpose:** Live feed of what operators/systems are doing right now (derived from audit + job events).
- **Status:** Missing [PLANNED]; audit list is the raw substrate.

### 7.28 Platform-wide search & command palette

- **Purpose:** Cross-entity search and keyboard-driven actions. Full spec in Section 18.
- **Status:** Tenant-scoped `/app/search` exists [VERIFIED]; platform-wide search and palette missing [PLANNED].

### 7.29 System-wide settings

- **Purpose:** The configuration umbrella (flags, providers, policies) — see Sections 24 and 31.

# PART III — GOD MODE

## 8. God Mode Definition

**God Mode is not a single unrestricted button.** It is the collective name for a set of privileged platform operations, each individually permissioned, safeguarded, and audited. An operator holds God Mode capabilities only to the extent their assigned role and active grants allow.

1. Every privileged operation MUST declare its **operation class** (Section 9.1) and inherit that class's safeguards.
2. There is no "bypass safeguards" flag. Emergencies use the elevated-approval path (Section 10), which is itself audited and time-boxed.
3. The UI MUST NOT offer a privileged action unless the server would accept it; client gating is cosmetic, server enforcement is authoritative.

## 9. Safeguard Matrix

### 9.1 Operation classes

| Class | Description | Examples |
|---|---|---|
| **C-0 Read/Access** | Controlled access/read events — sensitive reads observable via access events, not necessarily per-view audit rows (9.1.1) | viewing another tenant's users; listing audit logs |
| **C-1 Lifecycle** | Reversible tenant/state changes | suspend/reactivate org; deactivate user; toggle feature flag |
| **C-2 Configuration** | Changes with broad blast radius | platform-wide flag change; package edit; tenant settings; connector pack publish |
| **C-3 Security** | Changes to auth/admin surface | grant/revoke platform roles; change security policy; rotate platform secrets |
| **C-4 Destructive** | Irreversible or data-affecting | org deletion; credential rotation for a connector; data repair; encryption migration (live) |
| **C-5 Infrastructure** | Platform runtime operations | run migrations; purge caches; failover; kill/retry jobs |

### 9.1.1 C-0 access events vs audit rows (normative)

C-0 is the class of **controlled access/read events** — sensitive reads such as cross-tenant data views, audit searches, and secrets-metadata inspection. The C-0 contract is deliberately distinct from the mutation audit contract:

1. **C-0 does NOT require a mutation-style `audit_logs` row for every ordinary dashboard view.** Requiring one audit row per routine Command Center render would flood the append-only audit store with low-value rows and is explicitly NOT the design.
2. C-0 access MUST still be **observable**: sensitive reads are recorded through an appropriate **access/security event mechanism** — debug-level access logging (metric queries, Section 7.1), the security-events feed (26.3), and/or sampled access records for cross-tenant reads — with actor, target scope, and timestamp, at a retention class defined for that event store (25.4).
3. C-0 reads that are themselves exceptional (e.g., a Support Operator reading another tenant's business data under a scoped grant, or an audit export) MUST additionally write an explicit audit row, because the access itself is the auditable act.
4. C-1 through C-5 (mutations and sensitive operations) ALWAYS use the formal audit contract of 9.4/25.1 — full `audit_logs` rows with actor, target, before/after, result.

This distinction is normative so that future developers neither (a) interpret C-0 as "audit absolutely everything into `audit_logs`", nor (b) interpret it as "read access is never observable". Both readings are wrong: C-0 means *controlled, observable access without a per-view mutation-audit requirement*.

### 9.2 Required safeguards per class

| Safeguard | C-0 | C-1 | C-2 | C-3 | C-4 | C-5 |
|---|---|---|---|---|---|---|
| Permission check (server-side) | ● | ● | ● | ● | ● | ● |
| Explicit confirmation dialog | — | ● | ● | ● | ● | ● |
| Reason capture (required text) | — | — | ● | ● | ● | ● |
| Audit log (actor, target, before/after, ts, result) — C-0 satisfies this via the access-event mechanism (9.1.1), not necessarily an `audit_logs` row | ● | ● | ● | ● | ● | ● |
| Actor + target identity in record | ● | ● | ● | ● | ● | ● |
| Correlation/request ID | ● | ● | ● | ● | ● | ● |
| Elevated re-authentication (step-up) | — | — | — | ● | ● | ● |
| Dual approval (second operator) | — | — | — | ○ | ● | ○ |
| Result + failure info returned and stored | ● | ● | ● | ● | ● | ● |
| Rollback/compensation where possible | — | ● | ● | ● | ● | ● |

● = required · ○ = required for the subset marked high-risk in Section 9.3 · — = not required.

### 9.3 Operation-to-class mapping (normative for current + planned operations)

| Operation | Class | Notes |
|---|---|---|
| View cross-tenant audit / users / stats | C-0 | exists [VERIFIED] |
| Suspend / reactivate organization | C-1 | exists [VERIFIED]; add reason capture |
| Deactivate / update tenant user | C-1 | exists [VERIFIED] |
| Toggle platform feature flag | C-2 | exists [VERIFIED]; audit missing (G-12) |
| Create / edit / delete package | C-2 | exists [VERIFIED — update/delete write `platform.package.update`/`platform.package.delete` audit rows]; edit/delete UI missing (G-09) |
| Assign package to org | C-2 | exists [VERIFIED] |
| Update tenant settings | C-2 | exists [VERIFIED — PATCH writes an audit row]; contract upgrade to before/after per 25.1 |
| Create / publish connector pack | C-2 | create exists [VERIFIED]; audit missing (G-12) |
| Grant / revoke platform role | C-3 | [PLANNED] |
| Change platform security policy | C-3 | [PLANNED] |
| Rotate platform-level secrets | classified per blast radius (9.5) | [PLANNED] |
| Rotate connector credentials | C-4 | [PLANNED] |
| Run encryption migration (live) | C-4 | exists [VERIFIED] with confirm; dual-approval SHOULD be added at scale |
| Delete organization (hard) | C-4 | [PLANNED] |
| Run schema/data migration | C-5 | [PLANNED] |
| Purge caches / retry jobs / replay sync | C-5 | [PLANNED] |

### 9.4 Audit record requirements for privileged operations

Every C-1..C-5 operation MUST record: actor id + email + actor type (`platform_operator`), organization scope (platform or target org), action string (`platform.<domain>.<verb>`), target type + id, timestamp, request/correlation ID, reason (when required), before state, after state, result (`success`/`failure`), failure message (sanitized), source IP/device where available, severity, and metadata. Secrets MUST NEVER appear in any audit field (Section 25.7).

### 9.5 Secret-rotation classification (normative)

Secret rotation MUST NOT be blanket-classified as "C-3/C-4". Every rotation operation MUST be **explicitly classified before execution** according to its blast radius and sensitivity:

| Rotation target | Default class | Rationale |
|---|---|---|
| Low-impact integration secret (single non-critical webhook/API key) | C-2 | narrow blast radius; reversible |
| Tenant connector credential | C-4 | touches tenant system access; failure breaks a tenant's integrations (21.3) |
| Platform service credential (SMTP, VAPID, LLM provider key) | C-3 | platform-wide delivery/feature impact; not data-destructive |
| Authentication signing secret (JWT secret) | C-3 + step-up, dual-approval | invalidates sessions platform-wide; security-critical |
| Encryption / master key | C-4 + dual-approval + maintenance window | data-affecting; requires the versioned re-encryption path (21.3.4) |

The operation registry (9.3) MUST carry the specific class per rotation target; an unclassified rotation MUST be rejected by the safeguard engine. Classification is reviewed whenever a new secret type is introduced.

## 10. Elevated Authentication & Dual Approval

[PLANNED — depends on session infrastructure not yet present]

1. **Step-up authentication:** C-3/C-4 operations require re-entering the operator's password (or WebAuthn when available) within the last N minutes (default 15). The server issues a short-lived `elevation` claim scoped to the operation class.
2. **Dual approval:** A C-4 operation initiated by operator A MUST be executed only after operator B (different user, sufficient role) approves the pending request. Pending requests are first-class records with expiry (default 1h) and full audit trail.
3. **Break-glass:** The Platform Owner MAY perform a C-4 without dual approval during a declared incident; the operation is flagged `break_glass: true`, triggers immediate security notification to all other platform admins, and requires a post-hoc incident record.
4. Current state: none of this exists [VERIFIED: only `window.confirm` dialogs client-side]. Until implemented, C-3/C-4 operations listed above MUST remain behind their current confirmations and MUST NOT be exposed beyond Platform Owner/Administrator.

---

# PART IV — INTERNAL ELLINES OPERATIONS

## 11. Actor Model

EIP distinguishes six actor categories. Every authenticated request maps to exactly one primary category.

| Actor | Who | Auth surface | Typical permissions |
|---|---|---|---|
| **Platform Owner** | Ellines founder/owner-level | Control plane | Everything, including C-3/C-4 and role grants |
| **Platform Administrator** | Ellines senior staff | Control plane | Most platform operations; no self-grant of Owner; C-4 requires dual approval |
| **Internal Operator** | Ellines staff with a scoped role (Section 12) | Control plane (scoped) | Only their granted domains/scopes |
| **Client Business Owner** | Tenant `owner` | Work Console / Org IT | Full control of their org only |
| **Client Staff** | Tenant admin/executive/manager/member/viewer | Work Console | Org-scoped, role-scoped |
| **Ordinary Application User** | End user of a tenant deployment | Tenant product surface | Minimal, product-defined |

Rules:

1. **Operating context, not exclusive labels.** The six categories describe the *primary operating context* of a session, not an intrinsic, mutually exclusive property of a person. Authorization MUST be resolved from five distinct dimensions, never from a single label:
   - **Actor identity** — who the authenticated user is (user id).
   - **Employment/internal status** — whether the user is Ellines internal staff (and at what level).
   - **Tenant membership** — which organizations the user is a member of, with which roles. An Ellines internal employee MAY also be a member of a labeled demo/client organization (e.g., for internal testing or Ellines' own use of EIP); this is legitimate as long as the membership is a real membership record and the demo/client org is labeled.
   - **Current operating context** — which surface/scope the session is acting in right now (platform control plane vs a tenant org).
   - **Authorization scope** — the effective permissions resolved server-side for this request.
   A platform operator viewing tenant data does so through explicit platform APIs, not by joining the tenant as an implicit member. [VERIFIED: current model matches this — `isPlatformAdmin` is orthogonal to org role.] Authorization logic MUST NOT assume "internal employee" and "tenant member" are disjoint sets; it MUST resolve each dimension independently per request.
2. The current `isPlatformAdmin` flag is derived from the `PLATFORM_ADMIN_EMAILS` env allowlist [VERIFIED: `platformAdminFromEnv` in `apps/web/functions/shared/auth.ts`; `assertPlatformAdmin` in `services/identity/src/platform/platform.controller.ts`]. This is an acceptable **bootstrap** mechanism only; the target model is Section 12.4.
3. Client-side role claims (JWT `role`, localStorage session) MUST never be the sole basis for authorization on sensitive endpoints; server-side verification against the database is required for C-0+ operations. [VERIFIED: platform endpoints already re-verify server-side; AI endpoint does not — Gap G-17.]

## 12. Internal Roles

### 12.1 Role catalog (initial; extensible)

These are seed roles, not a fixed ceiling. Custom internal roles follow the same permission grammar as tenant custom roles.

| Role | Domain | Summary of authority |
|---|---|---|
| Platform Owner | all | `platform:*` incl. role grants, C-4, break-glass |
| Platform Administrator | all except grants | `platform:*` minus role grant/revoke; C-4 dual-approval |
| Business Onboarding Operator | tenants | create orgs, onboard owners, assign packages; no security config |
| Integration Operator | connectors | manage packs/templates, diagnose installations, retry syncs; no credential viewing |
| Support Operator | tenants (assigned) | view assigned orgs, deactivate users, suspend org with reason; read audit for assigned orgs |
| Package/Licensing Operator | commercial | packages, entitlements, overrides; no tenant data access beyond counts |
| Security Operator | security | security events, session revocation, credential rotation (C-3/C-4 with step-up) |
| Developer Operator | APIs | API keys (platform), webhooks, sandbox, rate-limit policy |
| AI Operator | AI | model/provider config, prompt registry, AI usage/cost views |
| Auditor | audit | read-only everything audit/compliance; no mutations |
| Incident Operator | incidents | ack/assign/escalate/resolve incidents; runbooks |
| Read-Only Platform Analyst | metrics | read-only Command Center + insights |

### 12.2 Permission grammar (canonical, unified)

Tenant and platform permissions use ONE canonical grammar. A permission string has the form:

```
<domain>[.<resource>]:<action>
```

- **domain** — one or more dot-separated segments naming the capability area: `connector`, `report`, `workflow`, `platform`, `platform.tenants`, `platform.packages`, … (platform domains: `platform.tenants`, `platform.users`, `platform.rbac`, `platform.packages`, `platform.licensing`, `platform.connectors`, `platform.flags`, `platform.config`, `platform.security`, `platform.audit`, `platform.health`, `platform.incidents`, `platform.jobs`, `platform.insights`, `platform.ai`, `platform.developer`, `platform.recovery`, `platform.notifications`, `platform.search`).
- **resource** (optional) — a dot-separated segment immediately before the colon narrowing the target within the domain (e.g., `platform.packages.assignments`).
- **action** — a verb (`read`, `create`, `update`, `delete`, `assign`, `publish`, `execute`, `manage`, …) or the wildcard `*`.

**Wildcard semantics (exact, no ambiguity):**

1. `*` as the **entire string** matches every permission in the granted scope (reserved for Platform Owner).
2. `*` as the **action** matches every action on the named domain/resource: `platform.tenants:*` is **VALID** and matches `platform.tenants:create`, `platform.tenants:update`, etc.
3. `*` as a **resource segment** matches any resource within the domain: `platform.*:read` matches `platform.tenants:read`, `platform.audit:read`, …
4. A permission string with **no action part** (e.g., `platform.*` or `platform.tenants`) is **INVALID** and matches nothing. Therefore `platform.*` does **NOT** match `platform.tenants:create`; the correct global platform grant is `platform.*:*`. Parsers MUST reject action-less grants (fail closed) rather than prefix-match them.
5. Wildcards are only valid as whole segments; partial-segment wildcards (`platform.ten*`) are invalid.
6. There is no implicit prefix matching anywhere: `platform.tenants:read` never matches `platform.tenants.export:read` (that requires `platform.tenants.*:read` or an explicit grant).

**Scope is NOT encoded in the permission string.** Scope is a property of the grant/assignment record (12.3): `global`, `organization:<id>`, or an org list. The same permission string means different data scopes depending on the grant.

**Examples:**

| Permission | Meaning |
|---|---|
| `platform.tenants:create` (exact) | May create tenant organizations; nothing else |
| `connector:*` (resource-level wildcard on actions) | Full control of the connector domain |
| `platform.*:read` (domain resource wildcard) | Read access across all platform domains |
| `platform.*:*` (global platform permission) | Every platform-domain action (Platform Owner / Administrator tier) |
| `connector:read` + scope `organization:<id>` (organization-scoped) | May read connectors, but only in the granted org(s) |

**Migration note:** the existing tenant grammar (`connector:read`, `report:run`, `connector:*`, bare `*` [VERIFIED: `evalEntry` in `shared/auth.ts`]) is a subset of this grammar (single-segment domain, action or `*`). The unified evaluator MUST remain backward-compatible with existing stored role permissions, add the explicit invalid-permission rejection above, and be covered by authorization regression tests (Phase 2). Internal roles in 12.1 are expressed in this grammar (`platform:*` in the table is shorthand for `platform.*:*`).

### 12.3 Scoping dimensions

A grant = role (permission set) + scopes:

1. **Organization-scoped:** operator may act only on listed orgs (Support Operator pattern).
2. **Module-scoped:** permission domains only (Integration Operator pattern).
3. **Action-scoped:** read vs mutate within a domain.
4. **Expiry:** every grant has optional `expires_at`; expired grants fail closed.
5. **Temporary elevation:** time-boxed grant of a higher role's permissions, requested with reason, approved by Platform Owner/Admin, auto-expiring, fully audited.

### 12.4 Platform administrator storage (target architecture)

[PLANNED — replaces env allowlist as the primary mechanism]

1. New tables: `platform_staff` (user linkage, status), `platform_roles` (name, permissions JSONB, is_system), `platform_role_assignments` (staff, role, scopes, granted_by, granted_at, expires_at, reason), `platform_grant_audit`.
2. Bootstrap safety: `PLATFORM_ADMIN_EMAILS` remains a **break-glass seed**: on first boot with an empty `platform_staff` table, allowlisted emails are auto-provisioned as Platform Owner. Thereafter the database is authoritative and the env var is ignored except when `platform_staff` is empty (disaster recovery).
3. Every platform endpoint resolves the actor's effective permissions from the database (cached per request), never from the client.
4. Migration path: Phase 4 introduces tables + dual-read (DB first, env fallback); Phase 8 removes env fallback except the empty-table bootstrap.
5. **Break-glass removal gate (lockout drill).** The env-allowlist bootstrap/break-glass path MUST NOT be removed, and the env fallback MUST NOT be narrowed, until a documented **production-safe lockout-recovery drill** has passed with recorded evidence proving ALL of:
   - at least one verified platform owner exists in `platform_staff` (login tested, not just a row);
   - recovery credentials exist and are retrievable by the intended custodians;
   - role/permission resolution works from the database alone (env var neutralized);
   - emergency access works (break-glass path exercised end-to-end);
   - session revocation works (a revoked operator session is dead immediately);
   - lockout recovery works (a locked-out owner can regain access via the documented procedure);
   - audit logging works (the drill's own steps appear in audit/security events).
   The drill is repeated after any material change to the platform-admin resolution path. Drill evidence is stored with the recovery runbook (Section 30).

## 13. Delegation, Elevation, Expiry, Session Controls

1. **Delegation:** Platform Owner grants any internal role to any internal staff with scopes + expiry; every grant/revoke is a C-3 operation.
2. **Approval workflows for access:** requests for elevated roles create pending grants requiring Owner/Admin approval [PLANNED].
3. **Access expiry:** grants and elevations carry `expires_at`; the platform MUST fail closed on expiry; a periodic job marks expired grants.
4. **Session controls:** platform sessions are JWT-based today [VERIFIED, localStorage, 24h default, no revocation]. Target: server-side session registry for platform operators enabling revocation, device listing, and forced logout [PLANNED — Section 24.5].
5. **Auditability:** grant, revoke, scope change, elevation request/approval/use, expiry enforcement — all audited with actor, target, reason, before/after.

---

# PART V — CROSS-DASHBOARD GOVERNANCE

## 14. Governed Dashboard Doctrine

> **Every future dashboard is a controlled view of the same EIP platform, not an independent silo.**

Planned dashboards include: Business Owner, Manager, Finance, HR, Operations, Developer, Support, Integration, AI, and other specialized views. All of them MUST:

1. Use the **same identity model** (one auth service, one session format, one user directory per org).
2. Use the **same organization model** (one tenancy, one membership truth — see Gap G-15).
3. Enforce authorization through the **same permission service** (fixed + custom roles, same grammar).
4. Write to the **same audit model** (same audit row shape, same retention).
5. Read configuration through the **same configuration model** (flags, settings, entitlements).
6. Integrate via the **same connector model** (no dashboard builds private integrations outside the connector platform).
7. Respect the **same data ownership taxonomy** (Section 4).
8. Use the **same notification model** (outbox, channels, preferences).
9. Operate under the **same platform policies** (rate limits, quotas, security headers, CORS).

## 15. Dashboard Registry & Anti-Silo Rules

1. **Registry:** every dashboard surface is registered in this specification (or an appendix) with: route, audience, capabilities consumed, capabilities introduced. [PLANNED: registry table maintained alongside Section 6.]
2. **No hidden administrative systems:** a dashboard MUST NOT create an administrative capability (user management, licensing change, connector credential handling, flag control) that is not represented in the control plane's capability catalog. If a dashboard needs a new administrative capability, the capability is added to Section 7 first, then consumed.
3. **No duplicate screens:** if the control plane already owns a capability (e.g., package management), a dashboard MUST NOT re-implement it; it links or requests an API-scoped view.
4. **Super Admin oversight:** capabilities introduced by other dashboards appear in the control plane (e.g., a Finance dashboard's billing objects are visible/operable by Package/Licensing Operator within their scopes).
5. **Route discipline:** new top-level routes under `/app/*` require a registry entry; routes duplicating existing platform capabilities without a documented architectural reason are rejected in review (Rule 14 of Section 37).

# PART VI — EXPERIENCE

## 16. Glass / Window-Based UI System

The Super Admin interface MUST be premium and futuristic **without becoming gimmicky**, and MUST NOT fabricate data to look alive (Section 38).

### 16.1 Visual foundation

1. Build on the existing dark glass design language: frosted translucent panels (`backdrop-filter: blur`), layered depth, brand accents. [VERIFIED: `super-admin.module.css` already uses radial gradients, blurred rail, translucent cards.]
2. Brand alignment: primary purple `#6F2D8D`, ink `#0F172A`, blue `#2563EB` (per repo brand rules). The current CSS uses `#7c3aed`-family accents; convergence toward brand tokens SHOULD happen opportunistically, not as a disruptive rewrite.
3. Typography: Exo 2 (already bundled [VERIFIED: `apps/web/src/fonts/`]).
4. Motion: subtle (150–250ms ease-out); all animation MUST respect `prefers-reduced-motion`.

### 16.2 Window system (conceptual target)

The control plane evolves from fixed sections toward a desktop-like windowed workspace:

- **Glass/frosted panels** as the base container (exists).
- **Floating windows** [PLANNED]: draggable, resizable panels for multi-tasking (e.g., audit search beside a business drawer).
- **Window operations:** maximize, minimize (to a dock/taskbar), close, focus, z-index management, snap/tiling presets (half/quarter), keyboard shortcuts.
- **Modal windows** for confirmations and step-up auth; **drawers** for contextual detail (the business drawer exists [VERIFIED]); **contextual popups** for quick actions.
- **Saved workspace layouts** [PLANNED]: per-operator window arrangements persisted server-side (class 7 configuration), with **workspace restoration** on login.
- **Command palette + global search + notifications + live activity** as system-level overlays (Sections 18, 32, 7.27).

### 16.3 Window system rules

1. Windows are a presentation layer over the same capability APIs; no capability is window-only.
2. On small screens the window system MUST fall back to the current stacked/section layout (responsive fallback, Section 19.4).
3. **Z-index / window-layer tokens (implementation-aware).** The window-layer/z-index token system MUST be established in the same phase that introduces the window manager (Phase 3), as named design tokens — not ad-hoc numbers. The token ladder covers, at minimum: `base content` < `floating windows` < `popovers` < `dropdowns` < `dialogs/modals` < `critical alerts` < `system-level overlays` (command palette, toasts, step-up). Arbitrary z-index values scattered through application CSS are prohibited; every stacking context in the app MUST consume a token. The ladder is extensible (sub-tokens between layers) but the ordering above is fixed.
4. Window state (open windows, positions) is per-operator preference data — never shared, never authoritative for permissions.

### 16.4 Honesty requirements

1. If a metric's source is unavailable, the panel shows an explicit **unavailable** state with the reason category (source down / not configured / no data). [VERIFIED precedent: the audit pass already introduced "unavailable" widgets for missing telemetry.]
2. Skeleton loaders MAY be used while loading; they MUST NOT persist as fake values.
3. Demo/seed data is permitted only in explicitly labeled demo tenants, never in the control plane's own views.

### 16.5 Window performance requirements (engineering budgets)

These are measurable engineering budgets to be benchmarked during implementation (via `scripts/perf-benchmark.mjs` extended with window scenarios [PLANNED]) — not visual claims and not universal hardware guarantees. Numbers below are **proposed defaults requiring approval during implementation**; the binding requirement is that budgets exist, are measured, and regressions fail the check.

1. **Simultaneous windows:** the window manager MUST define a maximum practical number of simultaneously rendered windows (proposed default: 8 open, of which ≤3 with active `backdrop-filter`); beyond the limit, oldest windows minimize automatically with an operator-visible notice.
2. **Blur/backdrop performance:** `backdrop-filter` is the most expensive effect; blur MUST be applied to at most the focused window + one background layer at a time on mid-range hardware (proposed budget: interaction latency ≤100ms while 3 blurred layers are visible); implementations MUST degrade blur (reduce radius → remove blur → solid panel) before dropping frames.
3. **Animation budgets:** open/close/focus transitions ≤250ms; drag/resize MUST track the pointer at ≥30fps on the reference device; animation frames MUST NOT trigger layout thrashing (transform/opacity only).
4. **Low-end device fallback:** a capability probe or heuristic (device memory/cores or measured frame time) MAY reduce effects (blur off, shadows simplified); the fallback MUST be automatic and MUST NOT break functionality.
5. **Reduced motion:** `prefers-reduced-motion` disables window open/close/drag animations (position changes are instant); see 19.5.
6. **Memory:** window content that is minimized/closed MUST be unmounted (state preserved in the workspace model), so memory scales with visible windows, not session history; the workspace store MUST bound persisted layout size.
7. **Resize/drag performance:** drag/resize MUST NOT re-query APIs or re-render remote data; only geometry changes; content reflows are debounced (proposed ≤100ms) during resize.
8. **Mobile/small-screen fallback:** below the 720px breakpoint the window system is replaced by the stacked layout (19.6); windows never render at phone sizes.

### 16.6 Window accessibility requirements

Dragging and resizing MUST have non-pointer alternatives. The window manager MUST provide:

1. **Keyboard movement:** a focused window can be moved with arrow keys (with a modifier or via a window menu), in defined increments, with visible feedback.
2. **Keyboard resize:** resize via keyboard (modifier + arrows, or a resize mode toggled from the window menu), including maximize/restore/quarter-snap as keyboard commands.
3. **Focus trapping:** modal windows trap focus while open and restore it to the invoking element on close (extends 19.2 to floating windows).
4. **Visible focus:** the focused window is visually distinct (border/title treatment) AND its focus is announced; z-order changes via focus MUST be predictable.
5. **Screen-reader naming:** every window has an accessible name (its title) and role (`dialog`/`region` as appropriate); window state (focused/minimized/maximized) is conveyed via `aria-*` attributes.
6. **Escape behavior:** `Esc` closes/cancels the topmost modal; for non-modal windows `Esc` is documented behavior (e.g., unfocus or minimize) and never loses operator data without confirmation.
7. **Touch alternatives:** move/resize have touch handles or long-press menus; hit targets ≥44px (19.8).
8. **Reduced motion:** window transitions respect `prefers-reduced-motion` (16.5.4).
9. **Small-screen fallback:** windows degrade to stacked sections (16.3.2); all content remains reachable in DOM order.

## 17. Command Center

### 17.1 Content

High-level view of: organizations (count, active/suspended), active users, system availability, connector health (business services layer), API activity, errors, incidents [PLANNED], audit activity, usage, quotas [PLANNED], licensing [PLANNED], jobs [PLANNED], queues [PLANNED], synchronization, AI activity, security events, alerts.

Current state: businesses, active users, disconnected, API requests/24h, audit events/24h, rate-limit violations/24h, connector installations, failed installations — all real [VERIFIED: `platform/metrics.ts` queries live tables].

### 17.2 Refresh strategy

| Data | Strategy | Freshness target |
|---|---|---|
| Health summary | Poll 30s (current interval [VERIFIED]) | ≤60s |
| Platform metrics | Poll 30–60s | ≤5 min acceptable |
| Audit/activity feed | Poll 30s or SSE when available [PLANNED] | ≤60s |
| Incident/job state | Poll 15–30s [PLANNED] | ≤60s |

1. Every widget displays its **data timestamp** ("updated Ns ago").
2. Real-time (SSE/WebSocket) is the target for activity and incident feeds [PLANNED]; polling is the accepted baseline and MUST remain the fallback.
3. Aggregation rules: counters are server-computed over a declared window (current: 24h [VERIFIED]); the window MUST be visible in the UI.
4. Drill-down: every KPI links to its section (businesses → Businesses; violations → Usage/Quotas [PLANNED]; audit events → Security & Audit).
5. Permissions: the Command Center renders only what the operator's role permits; scoped operators see scoped numbers with a "scoped" label.
6. Audit implications: viewing the Command Center is a C-0 access event, not a mutation — it does not generate `audit_logs` rows (9.1.1); metric queries are logged at debug level as access activity. Actions taken from it are audited by the target capability under the formal audit contract.

### 17.3 Unavailable states

Each KPI defines its degraded rendering: `unavailable` (source error), `stale` (last good value + age), `empty` (legitimately zero). Zeros MUST NOT be shown when the cause is an error.

## 18. Search & Command Palette

### 18.1 Platform-wide search [PLANNED]

- **Searchable entity types:** organizations, users, connector installations/packs, packages, audit events, incidents [PLANNED], jobs [PLANNED], API activity. The type list is declared per release; undeclared types are not searched.
- **Authorization filtering:** results are filtered to entities the operator may see, filtered server-side per type BEFORE rendering; search MUST NOT leak existence of entities outside scope (no "hidden result count" hints).
- **Indexing/search strategy:** start with indexed database search (trigram/prefix indexes on name/slug/email/action fields); the specification deliberately does NOT prescribe a specific database or search engine. Evolution to a dedicated search engine (e.g., full-text index) is permitted when scale requires it, behind the same API contract and authorization filtering.
- **Pagination & limits:** paginated results with a maximum result cap per query (default 50, hard cap 200 per type); no unbounded queries.
- **Ranking:** deterministic, documented ordering per type (exact match > prefix > substring; recency as tiebreaker); ranking MUST NOT reorder results across permission boundaries.
- **Response-time expectation:** p95 ≤ 500ms per query at the current data scale (aligned with 35.9); the budget is re-baselined if the backing store changes.
- **Timeout behavior:** a search that exceeds its server-side timeout (≤2s) returns a partial/timeout result set with an explicit "results may be incomplete" indicator — never a silent truncation presented as complete.
- **Degraded/unavailable state:** if the search backend is unavailable, the UI shows an explicit unavailable state; it MUST NOT fall back to unindexed full-table scans in the request path.
- API: `GET /api/v1/platform/search?q=&type=` with server-side filtering, pagination, and per-type permission checks.
- UX: one search field in the top bar; results grouped by type; keyboard navigable.

### 18.2 Command palette [PLANNED]

- Opens with `Ctrl/Cmd+K`; lists actions (navigate, open business, suspend org, toggle flag, run diagnostic) filtered by the operator's permissions.
- Actions execute through the same APIs and safeguards as their buttons — the palette is a shortcut, never a bypass.
- Every palette action shows its operation class badge (C-0..C-5) before execution.

## 19. Accessibility & Responsive Design

1. **Keyboard navigation:** all interactive elements reachable and operable by keyboard; logical focus order; visible focus indicators.
2. **Focus management:** modals/drawers trap focus while open and restore it on close; route changes move focus to the main heading.
3. **Screen-reader semantics:** landmarks (`main`, `nav`, `aside`), labeled controls (current icon-only buttons MUST get `aria-label`s), status messages announced via `aria-live` for toasts/audit results.
4. **Contrast:** text meets WCAG 2.1 AA (≥4.5:1 body, ≥3:1 large text) against the glass backgrounds; the current palette MUST be verified and adjusted where translucent layers reduce contrast.
5. **Reduced motion:** `prefers-reduced-motion` disables non-essential animation (window transitions, shimmer).
6. **Responsive layouts:** current breakpoints (1100px rail collapse, 720px stacked [VERIFIED]) are the baseline; window system degrades to stacked sections on <720px.
7. **Mobile/tablet fallback:** the control plane is an operator tool; full functionality on tablet, read-heavy functionality on mobile; destructive actions MAY require desktop (declared in UI, enforced server-side only by policy, not by obscurity).
8. **Touch support:** hit targets ≥44px on touch devices; hover-dependent affordances have tap equivalents.

# PART VII — DOMAINS

## 20. Business / Tenant Management

### 20.1 Organization lifecycle

```
onboarding → active ⇄ suspended → (maintenance) → archived → deleted
                 ↑______________________reactivation______|
```

| Stage | Meaning | Who may set | Safeguard class |
|---|---|---|---|
| Onboarding | Created; owner being provisioned; not yet handed off | Onboarding Operator | C-2 |
| Active | Normal operation | (initial state) | — |
| Suspended | Tenant access blocked; data retained; platform operator access retained | Platform Admin / Onboarding Op / Support Op (scoped) | C-1 |
| Maintenance [PLANNED] | Read-only for tenant; operators may run repairs | Platform Admin | C-2 |
| Archived [PLANNED] | No logins; data retained per policy; hidden from default lists | Platform Admin | C-3 |
| Deleted [PLANNED] | Hard delete after retention window, or immediate with dual approval | Platform Owner | C-4 |

### 20.2 Onboarding sequence (normative)

1. Create organization (name, slug) — `POST /platform/orgs/create` [VERIFIED].
2. Create owner (email, name, password meeting global policy) or send owner invite [PLANNED for invite path].
3. Assign package (commercial envelope) — `PUT /platform/orgs/:id/package` [VERIFIED].
4. Configure connectors **only if the customer requires them** (business services, not platform infrastructure) [VERIFIED principle].
5. Verify: users, health, audit history — before handoff [VERIFIED: onboarding checklist exists in UI].

### 20.3 Multi-tenant isolation

1. Every tenant-scoped query MUST filter by `organization_id` derived from the **server-verified** token, never from client input. [VERIFIED: platform endpoints take org ids as parameters deliberately (platform scope), while tenant endpoints use `auth.organizationId` — this split MUST be preserved and tested.]
2. Cross-tenant access is allowed **only** through `/platform/*` endpoints after server-side platform-admin verification.
3. Isolation tests are mandatory (Section 36.3): a tenant token MUST NOT read another tenant's rows via any endpoint.
4. The synthetic `ellines-platform` org (used for platform settings [VERIFIED in `flags.ts`]) MUST be excluded from tenant lists and metrics [VERIFIED: metrics excludes it] and MUST never hold tenant business data.

### 20.4 What Super Admin can see and modify

| Data | See | Modify | Notes |
|---|---|---|---|
| Org profile (name, slug, status, settings) | ✔ | ✔ (C-2) | settings changes already audited [VERIFIED]; contract upgrade to before/after per 25.1 |
| Users & roles | ✔ | ✔ (C-1) | password set/reset only via policy-compliant flow |
| Package/entitlements | ✔ | ✔ (C-2) | |
| Connector installations (metadata, health) | ✔ | ✔ (C-1/C-2) | credentials never visible (24.7) |
| Tenant business data (snapshots, reports) | scoped | ✖ by default | Support Operator read requires org-scope grant + reason; audited |
| Tenant secrets | ✖ never | rotate only (C-4) | |

### 20.5 Deletion & retention policy [PLANNED]

1. Deletion is a two-step process: archive (immediate, reversible) → purge (after retention window, default 30 days, dual-approval).
2. Purge order: derived data → tenant content → users/memberships → org row; audit rows for the org are **retained** (class 6) with the org marked deleted.
3. Connector credentials are destroyed first at archive time.
4. Export-before-delete: the platform MUST offer the tenant (or operator) a full data export before purge.

### 20.6 Onboarding security (slug, domain, ownership) [PLANNED where not verified]

Organization onboarding is a security-sensitive act (it creates a tenant identity that will hold business data). The onboarding flow MUST address:

1. **Slug uniqueness:** enforced server-side with a unique constraint [VERIFIED]; race-safe (a concurrent duplicate create returns 409, never a silent overwrite).
2. **Slug squatting/reservation:** slugs are namespace; the platform MUST define a reservation policy — reserved prefixes (e.g., `ellines-`, `platform`, `admin`, `api`, `www`), a process to reserve/hold slugs for pending customers, and a documented rule for reclaiming slugs of deleted orgs (cooling-off period before reuse).
3. **Reserved names:** a maintained reserved-name list (system names, brand names, obvious impersonation targets) is checked at create time; the list is configuration, not hardcoded logic.
4. **Domain verification (where custom domains are supported) [PLANNED]:** a custom domain is attached to an org only after DNS-based verification (TXT/CNAME challenge); unverified domains render a visible "unverified" state and MUST NOT be used for tenant-facing routing or SSO.
5. **Ownership verification:** onboarding requires a verified owner (verified email at minimum; verified domain for org-level claims [PLANNED]); platform operators cannot silently transfer ownership without an audited C-3 operation.
6. **Impersonation/confusable names:** where appropriate, onboarding review flags confusable names (homoglyphs, near-identical names to existing tenants or the platform brand); this is a review aid, not an automated block, and its scope is documented.
7. **Onboarding audit:** every onboarding step (org create, owner create/invite, package assign, verification events) writes audit rows with actor and target [VERIFIED for create; the rest follow the standard audit contract].
8. **Rollback:** partial onboarding failure rolls back cleanly (G-13 transactional target); the API reports exactly what was created if rollback fails.
9. **Idempotency:** retrying an onboarding request (same idempotency key or same slug within a short window) MUST NOT create duplicate orgs/users; retries return the original result or a clear 409.

### 20.7 The synthetic `ellines-platform` organization (normative)

The `ellines-platform` organization is a **system-owned record, not a real tenant**. Its status and handling MUST be explicit:

1. **Why it exists:** platform-scoped settings (currently feature flags [VERIFIED in `flags.ts`]) are stored in its `organizations.settings` row because the schema has no dedicated platform-settings store. It is a workaround, not a design.
2. **Classification:** it is a **system-owned record**. It is not a tenant, holds no tenant business data, and MUST NOT be presented as a customer business anywhere in the control plane.
3. **Exclusion from tenant-facing analytics:** it MUST be excluded from tenant counts, usage rollups, licensing views, and every platform metric [VERIFIED: `platform/metrics.ts` already excludes it]. Any new metric or insight MUST exclude it by default; inclusion requires an explicit, reviewed exception.
4. **Exclusion from ordinary tenant searches:** it MUST be excluded from default Businesses lists and platform search results; it is reachable only through explicit platform-configuration surfaces.
5. **Platform-owned settings storage:** platform-owned settings (flags, platform defaults) MUST move to a dedicated platform-settings model (31.2); the synthetic org's settings return to empty/unused.
6. **Migration path:** when the dedicated platform-settings model lands, the synthetic org is retired (marked system, hidden, or deleted per a documented migration); no tenant data ever migrates through it.
7. **Regression protection:** a test MUST assert the synthetic org never appears in tenant lists, searches, or metrics (tenant-isolation test suite, 36.1).

### 20.8 "Register Business" as an action, not a capability

Registration is an **action within business management** (7.2/7.3), not a second primary capability. The Businesses section owns the Register/Onboard action. A dedicated rail entry, if retained, is classified as an action/shortcut (Section 6 rule 4) — it MUST NOT evolve its own data domain, list views, or lifecycle separate from Businesses.

## 21. Connector Platform

Integrations are a **first-class EIP capability** and simultaneously a **business service** (customer-specific), not EIP core infrastructure [VERIFIED principle in doc 34 and platform UI copy].

### 21.1 Catalog & packs

1. **Connector catalog:** capability-typed templates (REST, database, webhook, file, OpenAPI-derived) [VERIFIED: `connector_templates`, OpenAPI parse, autoscan probe exist].
2. **Connector packs:** reusable, publishable installation templates [VERIFIED: `connector_packs` table, `GET|POST /platform/connector-packs`]. Packs MUST gain full lifecycle: update, version, publish/unpublish, deprecate, delete [PLANNED — today only create/list exist].
3. Pack creation from an existing installation MUST strip credentials (current behavior via `redactConfig` + explicit deletes [VERIFIED]) — this MUST be covered by a regression test.

### 21.2 Installation & authorization

1. Installation = catalog/pack + tenant + config (credentials encrypted v2) [VERIFIED: `connector_installations`].
2. Authorization flows per connector type: API key / bearer / basic today [VERIFIED]; OAuth2 token exchange per connector [PLANNED].
3. Connection testing is real (HTTP probe) for REST-type connectors [VERIFIED: `testInstallation`]; simulated test paths in non-deployed services are technical debt (Section 40.6).

### 21.3 Credentials & secrets

1. Credential fields (`apiKey`, `bearerToken`, `basicPass`, `connectionString`) are class 8: encrypted at rest (v2), redacted in all DTOs [VERIFIED].
2. Credentials MUST NEVER appear in: logs, audit metadata, error messages, UI, exports. A secret-scanning test MUST assert redaction on every connector DTO.
3. **Credential rotation** [PLANNED]: per-installation rotate endpoint (C-4): write new secret → test → activate → audit; old secret invalidated after success window.
4. Master-key rotation [PLANNED]: versioned re-encryption job (extends the existing migration endpoint pattern [VERIFIED]).

### 21.4 Health, sync state, history

1. Each installation tracks: status (`active|error|disabled`), last sync at/result, consecutive failures [VERIFIED fields in use].
2. Sync history [PLANNED]: per-installation event log (started, duration, records in/out, error class) with retention.
3. Health view in control plane: per-tenant integration health table (exists as tenant diagnostics table [VERIFIED]) + platform-wide failed-installation counter [VERIFIED in metrics].

### 21.5 Errors, retry, backoff, rate limits

1. Sync failures record error class (auth, network, schema, rate-limit, unknown) and retry with exponential backoff + jitter [PLANNED formalization; `run-due` exists as the scheduler hook [VERIFIED]].
2. Rate limits: per-connector outbound limits; violations recorded (class 6) and visible to operators.
3. Dead-letter: after N consecutive failures an installation is marked `error` and an incident/alert is raised [PLANNED incident link].

### 21.6 Webhooks, polling, event-driven

1. Inbound webhooks exist (enterprise/inbound endpoints [VERIFIED]) with secret verification.
2. Outbound webhooks exist (org webhook secret, deliveries, retry, test [VERIFIED]).
3. Event-driven triggers for agents exist (`agents-webhook-trigger` [VERIFIED]).
4. Polling schedules per installation with per-tenant overrides [PLANNED formalization].

### 21.7 Mapping, normalization, transformation, conflicts

1. Field mapping from source schema to the Universal Enterprise Model (UEM) is declared per template [VERIFIED concept in templates/UEM docs].
2. Transformation pipelines MUST be declarative (mapping rules), versioned, and testable with fixtures.
3. Conflict handling: source-of-truth declaration (21.8) decides the winner; unresolved conflicts are quarantined for operator review [PLANNED: quarantine UI; `QuarantinedData` model exists in Prisma schema [VERIFIED]].

### 21.8 Source-of-truth declaration

Each installation MUST declare per entity type: `authoritative_source` (client system | EIP), `write_enabled` (bool + allowed actions), `cache_ttl`. The declaration is visible in the control plane and enforced by the sync/action engine. [PLANNED — today implicit.]

### 21.9 Connector lifecycle states

```
draft → installed → active ⇄ disabled → uninstalled
                ↘ error (recoverable) ↙
pack: draft → published → deprecated → removed
```

Enable/disable/uninstall are C-1/C-2 operations, audited, and MUST NOT delete sync history (retained per policy).

### 21.10 Testing & diagnostics

1. Per-installation: test connection, run sync now, view last errors, view mapping [VERIFIED partial: test + sync].
2. Diagnostics bundle [PLANNED]: one-click operator report (config redacted, recent errors, latency, rate-limit state) for support.

## 22. Licensing / Packages / Entitlements

### 22.1 Vocabulary (normative)

| Term | Definition |
|---|---|
| **Package** | A sellable bundle: name, price, and a set of entitlements + quotas. Today implemented as `rate_limit_tiers` [VERIFIED]. |
| **Feature** | A discrete capability that can be enabled per package/tenant (e.g., SSO, custom roles, agents, advanced BI, webhooks — currently package columns [VERIFIED]). |
| **Entitlement** | The resolved right of a tenant to use a feature, considering package + overrides + trial + expiry. |
| **Quota** | A numeric limit on a resource over a window (users, connectors, requests/day, exports/day). |
| **Usage** | Measured consumption against a quota. |
| **Subscription** | The commercial relationship over time (term, renewal, payment). [PLANNED — no billing integration exists; MUST NOT be faked.] |
| **License** | The effective grant resulting from package assignment + overrides + status; what enforcement reads. |

### 22.2 Model [PLANNED evolution]

1. Keep `rate_limit_tiers` as the package/quota carrier (rename conceptually to "package" in UI; do not break existing data).
2. Add `entitlements` resolution layer: package features + org overrides + trial state + expiry → effective entitlement set, cached per request.
3. Add `organization_entitlement_overrides` (grant/revoke a feature for one org, with reason, expiry, grantor — internal grants included).
4. Trials: `trial_ends_at` on assignment; enforcement treats expired trials as absent entitlements; operators see trials expiring in the Command Center.
5. Upgrades/downgrades: package reassignment is C-2, audited, with immediate re-enforcement; downgrades that exceed current usage enter a grace window (default 7d) during which usage is capped but not cut off [PLANNED policy].
6. Expiry/suspension: expired licenses behave like suspended features (not suspended tenant): features degrade individually with clear tenant-facing messaging.

### 22.3 Enforcement points

1. Feature gates: endpoints check entitlements server-side (e.g., SSO login checks `enable_sso` [VERIFIED pattern via flags/packages]).
2. Quota gates: Section 23.
3. UI: tenant surfaces read entitlements to hide/disable features; the control plane can inspect the effective entitlement set per org ("why is this feature off?" view) [PLANNED].

### 22.4 Acceptance criteria

(a) assigning a package changes effective entitlements within one request; (b) an override with expiry auto-expires; (c) enforcement decisions are logged at debug level with the entitlement set used; (d) no entitlement check trusts client claims.

## 23. Usage / Quotas

### 23.1 Tracked resources

API calls [VERIFIED: `api_usage`], connector calls [PLANNED], AI usage [PLANNED — Section 28], storage [PLANNED], users [VERIFIED counts], records [PLANNED], jobs [PLANNED], synchronizations [PLANNED], rate-limit violations [VERIFIED: `rate_limit_violations`], data export volume [VERIFIED: `max_data_export_per_day` quota field exists].

### 23.2 Mechanics

1. **Tenant quotas** come from the assigned package (requests/day, requests/hour, requests/minute, burst, max users, max connectors, max export/day [VERIFIED fields]).
2. **Platform quotas** [PLANNED]: global ceilings protecting the platform (e.g., total AI tokens/day) independent of tenant packages.
3. **Warning thresholds** [PLANNED]: 80%/95% of quota trigger tenant notifications and operator alerts.
4. **Enforcement:** the rate-limit guard enforces request quotas [VERIFIED: rate-limit module + violations table]; other resources enforce at write time (e.g., invite blocked when `max_users` reached [PLANNED verification]).
5. **Overage handling:** default = block + notify; per-package overage policy (block | degrade | bill-later [PLANNED]) — never silent.
6. **Reporting:** per-tenant usage statement (per resource, per day) and platform roll-up; historical usage retained ≥90 days raw, ≥13 months aggregated [PLANNED].
7. **Operator surface (Usage/Quotas section):** per-tenant usage vs quota, top consumers, violation log, quota override (C-2, audited, expirable).

### 23.3 Acceptance criteria

(a) exceeding requests/day returns 429 with a machine-readable quota body and records a violation; (b) the operator surface reconciles with `api_usage` within one aggregation window; (c) quota overrides expire and are audited.

## 24. Security

### 24.1 Authentication

1. Password auth: bcrypt (cost 8 on Pages [VERIFIED — documented trade-off; cost 10+ requires a worker-compatible strategy or moving hashing to a dedicated service]), global password policy (min length 8 [VERIFIED for auth flows]; **parity fix required** G-02), breach-password screening [PLANNED].
2. Password reset: token-based with expiry [VERIFIED]; reset tokens single-use [VERIFIED via hash storage pattern].
3. SSO: OAuth2 + SAML 2.0 with per-org providers [VERIFIED: sso endpoints, provider config, linked users, test endpoint]; SSO gated by `sso_login` flag [VERIFIED].
4. MFA [PLANNED]: TOTP first; required for platform roles (Section 24.6).
5. Magic-link invites exist for tenant users [VERIFIED]; platform-created users currently use direct password set (policy parity required).

### 24.2 Sessions

1. JWT HS256, 24h default, claims: sub/email/organizationId/role [VERIFIED].
2. Storage: localStorage (client-side sessions) [VERIFIED] — **explicitly a temporary architecture**, accepted only for the current MVP and only in combination with the other compensating controls scheduled early (24.4.1, G-19 CORS allowlist in Phase 2). It is NOT an acceptable end-state. The hardening path (not a single prescribed implementation): move the control plane to httpOnly, Secure, SameSite cookies or in-memory tokens with refresh rotation; add server-side session registry enabling revocation; then restrict CORS to same-origin. Each step lands independently and is tracked in the roadmap (Phases 2/8); the combination "localStorage JWT + wildcard CORS" MUST NOT survive into any phase beyond the one that replaces it.
3. **No revocation today** [VERIFIED]. Target: session registry for platform operators (list devices, revoke, global revoke-on-password-change) [PLANNED — surface specified in 24.9].
4. Re-authentication for C-3/C-4: Section 10.

### 24.3 Authorization

1. Fixed roles + custom roles with wildcard grammar, server-side evaluation [VERIFIED].
2. Platform authorization: env allowlist today (bootstrap) → DB-backed platform roles (Section 12.4).
3. **Least privilege is the default:** new endpoints start read-scoped; write scopes are granted explicitly.
4. Tenant isolation tests are a release gate (Section 36.3).

### 24.4 Account protection

1. Lockout/rate limits on auth endpoints [VERIFIED: rate-limit guard + violations]; lockout thresholds: 5 failures/15min → 15min lock [PLANNED tuning]. **Baseline authentication hardening is an EARLY roadmap requirement (Phase 2), not a late-phase item:** consistent password policy (G-02, Phase 0), login rate limiting, account lockout/abuse controls, credential-reset security review (single-use, expiry, no user enumeration), and session-revocation foundations (session registry groundwork) are all established before advanced platform features are built on top of them.
2. Suspicious activity: impossible-travel/new-device flags for platform operators [PLANNED]; security events feed (Section 26.3).
3. Credential rotation: platform secrets (JWT_SECRET, master key) rotation runbooks [PLANNED — Section 30].

### 24.5 Platform-admin controls

1. Platform role grants are C-3 with step-up + dual approval (Section 10).
2. Admin session hardening: shorter TTL for platform sessions (target 4h + sliding), device binding [PLANNED].
3. The `e9ad41d` commit ("harden platform admin session access") is the baseline for session-flag refresh behavior [VERIFIED: `refreshSessionFlags` re-verifies via `/auth/me`].

### 24.6 Re-authentication & step-up

See Section 10. MFA (TOTP) becomes mandatory for Platform Owner/Administrator and Security Operator roles [PLANNED].

### 24.7 Secrets handling

1. Env secrets (JWT, master key, SMTP, VAPID, LLM keys) live in Pages secret storage; never in the repo; `.env.example` documents names only [VERIFIED pattern].
2. Tenant connector credentials: class 8 encryption (Section 21.3).
3. **No secrets in logs:** a log-scrubbing test MUST assert that credential field names never appear in any log/audit/error output.
4. CORS: current wildcard `access-control-allow-origin: *` [VERIFIED in BOTH `shared/auth.ts` and `shared/errors.ts`] MUST be replaced with an origin allowlist (same-origin + explicit admin origins) — Gap G-19. This is part of the early hardening path (24.2.2, Phase 2).
5. Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy MUST be set at the Pages level [PLANNED verification].

### 24.8 API & connector security

1. All endpoints authenticate (JWT) [VERIFIED]; anonymous endpoints: health, login/register/reset/sso-request only [VERIFIED pattern].
2. Webhook endpoints verify signatures/secrets [VERIFIED].
3. Connector outbound calls: secrets injected at call time only; SSRF protections for user-supplied URLs (autoscan probe already blocks localhost/private LAN [VERIFIED comment]).
4. **SSRF protections for webhook testing (normative).** The webhook-test functionality accepts an operator-supplied URL; operator authorization alone does NOT make arbitrary URL fetching safe. Webhook test calls MUST enforce the same SSRF control set as the autoscan probe, and both MUST share one implementation:
   - allowed protocols (https; http only where explicitly justified);
   - private/local address blocking (loopback, RFC1918, link-local, ULA) resolved at request time;
   - cloud metadata endpoint blocking (e.g., `169.254.169.254` and equivalent instance-metadata addresses);
   - DNS rebinding mitigation (resolve once, connect to the validated IP, re-validate on redirect);
   - redirect handling (follow only within the same validated policy; re-validate every hop; cap redirect count);
   - explicit timeout (≤10s per 35.4) and response-size limit;
   - egress restrictions where practical (allowlist of reachable hosts/ports for tests);
   - audit logging of every test fetch (actor, target host, result) — the test itself is a C-0/C-2-classified operation per the operation registry.
   A blocked test returns a clear error; it MUST NOT silently succeed against a substituted target.

### 24.9 Session management surface (Super Admin / Internal Operations)

The server-side session registry (24.2.3) MUST have a corresponding operator-accessible surface in the Security section, where authorized staff can inspect and act on sessions:

1. **Active sessions view:** per-user and platform-wide lists of active sessions with session age, device/session metadata where available (user agent, IP prefix, created/last-seen), and last activity time.
2. **Revocation & forced logout:** revoke a single session, all sessions of a user, or (break-glass, C-3) all platform-operator sessions; revocation is immediate (24.2.3) and audited.
3. **Suspicious sessions:** sessions flagged by anomaly signals (new device, impossible travel [PLANNED], impossible velocity) are highlighted; operators can revoke with reason.
4. **Session history:** terminated/revoked sessions remain queryable (who, when, why, by whom) for security investigations, per the retention class of security event data (25.4).
5. **Access boundary:** tenant users and tenant admins can see/manage only sessions within their own org (and only what tenant features expose); **platform-wide session visibility is a platform-operator capability and MUST NOT be exposed to tenant users unless explicitly authorized** by a platform permission (e.g., `platform.security:read`).

## 25. Audit / Compliance

### 25.1 Audit row contract (target)

| Field | Status |
|---|---|
| actor id, actor email, actor type (platform_operator/tenant_user/system) | actor id/email present [VERIFIED]; actor type [PLANNED] |
| organization scope | present [VERIFIED] |
| action (`domain.verb`) | present [VERIFIED] |
| target type + id | resource string present [VERIFIED]; structured target [PLANNED] |
| timestamp | present [VERIFIED] |
| request/correlation ID | correlation middleware exists in identity [VERIFIED]; Pages functions [PLANNED] |
| reason | [PLANNED] required for C-2+ |
| before/after state | [PLANNED] required for C-1+ |
| result + failure info | [PLANNED] |
| source IP / device | IP present [VERIFIED]; device/user-agent [PLANNED] |
| severity | [PLANNED] |
| metadata (sanitized) | present [VERIFIED] |

### 25.2 Coverage requirements

Every C-1..C-5 operation writes an audit row. Current-state accuracy (verified against code):

- **Already audited [VERIFIED]:** org create, org status change, **tenant settings changes** (`orgs/[id]/settings.ts` inserts an `audit_logs` row), package create, **package update** (`platform.package.update`), **package delete** (`platform.package.delete` — both in `platform/packages/[id].ts`), user create/update/deactivate, encryption migration.
- **Currently unaudited [VERIFIED missing]:** feature-flag changes (`flags.ts` PATCH) and connector-pack creation (`connector-packs.ts` POST) — these are the remaining audit-coverage gaps (G-12).

Failed authorization attempts against platform endpoints SHOULD be recorded as security events (sampled) [PLANNED].

### 25.3 Query surface

1. Filters: org, actor, action prefix, severity [PLANNED], date range, target, result — server-side [VERIFIED partial: org/action/from/to].
2. Pagination: limit/offset with total [VERIFIED]; cursor pagination for large exports [PLANNED].
3. Export: CSV/JSON export endpoint (C-0, audited) [PLANNED].
4. Search: full-text on action/resource/metadata [PLANNED].
5. Correlation: rows sharing a correlation ID group into one operation trace [PLANNED].
6. Incident linking: audit rows reference incident ids [PLANNED — Section 26.4].

### 25.4 Retention & immutability

1. Audit rows are append-only; no update/delete APIs [VERIFIED: none exist — keep it that way].
2. Retention: minimum 24 months online, then cold archive ≥7 years for compliance-relevant actions (C-3/C-4) [PLANNED policy].
3. Storage-level protections (RLS deny-write for non-service roles, or append-only policies) [PLANNED].
4. **Retention classification for future event stores.** Future stores introduced by this specification — `platform_grant_audit`, AI interaction logs, security/access event stores (9.1.1), job history, session history (24.9.4) — MUST each receive their OWN retention classification; they do NOT automatically inherit the `audit_logs` retention period. Each event class MUST define, before it holds production data:
   - a **retention classification** (online period, archive period, purge rule);
   - a **legal/business justification** for that classification;
   - an **access policy** (who may read, at what classification);
   - an **archival/deletion mechanism** (the actual job/endpoint that enforces it);
   - an **enforcement owner** (the role accountable that enforcement runs and is verified — see 33.4).
   A store without a recorded classification MUST NOT be created.

### 25.5 Compliance surfaces (existing)

Compliance report, evidence pack, data-access log, CSV exports exist at tenant level [VERIFIED]. The control plane gains: cross-tenant compliance status view, evidence-pack generation for platform actions [PLANNED].

### 25.6 Never expose secrets

Audit metadata MUST be sanitized: credential fields, tokens, passwords, keys are stripped at write time by the shared `auditRow` helper (extend it with a redaction list) [PLANNED hardening; current helper is thin [VERIFIED]].

## 26. Health / Incidents / Operations

### 26.1 Health model

Health MUST reflect real probes, never a constant. [VERIFIED: current `/api/v1/health` returns hardcoded `status:'ok'` — Gap G-05.]

Target health endpoint(s) report per-dependency:

| Dependency | Probe | Reported state |
|---|---|---|
| Database (Supabase) | cheap `select 1` + latency | ok / degraded (latency > X) / down |
| Auth service | token verify round-trip | ok / down |
| Email provider | config presence + last delivery result | configured-live / configured-unverified / not-configured [VERIFIED partial: provider label + live flag] |
| LLM provider | config presence + last call result | configured / not-configured / error |
| Push (VAPID) | config presence | configured / not-configured [VERIFIED partial] |
| Connector fabric | aggregate installation health | ok / degraded (N failed) / down |
| Scheduled workflows | last run times per schedule | ok / overdue / failing |
| Storage (documents) | bucket reachability [PLANNED] | ok / down |

Rules:

1. `status` is computed: `ok` only when all critical probes pass; `degraded` when non-critical fail; `down` when critical fail. The response MUST include per-probe detail and timestamps.
2. Probes have timeouts (≤2s each) and run with caching (30–60s) to keep health cheap.
3. **Health payload minimization — three distinct tiers (normative).** The platform defines three health concepts with strict information boundaries:
   - **Public liveness** (unauthenticated, e.g., `/api/v1/health`): exposes ONLY the minimum needed for liveness/readiness gating — a computed `status` and a timestamp. It MUST NOT expose provider configuration labels, internal implementation details, dependency names/versions, environment details, secrets, or any per-dependency probe output. An unauthenticated caller learns "is the service up", nothing more.
   - **Authenticated readiness** (any authenticated session, [PLANNED]): adds coarse dependency readiness (available/unavailable per critical dependency) sufficient for tenant-side graceful degradation, without internal topology detail.
   - **Platform operator diagnostics** (`/platform/health/summary`, platform-admin gated [PLANNED]): full per-probe detail, latency, provider labels, last errors — the tier where internal detail belongs.
   Each tier's response schema is documented; a tier MUST NOT include fields belonging to a higher tier.
4. The NestJS identity health controller SHOULD converge to the same contract [VERIFIED: separate health controller exists].

### 26.2 Latency & dependency metrics

API latency percentiles (p50/p95/p99) per route group [PLANNED — measured at the edge or via sampling middleware]; dependency latency per probe; error rates per endpoint class. Existing observability modules in identity (metrics, tracing, SLO services) are the reference implementation for the NestJS side [VERIFIED files exist]; Pages Functions need an equivalent lightweight collector [PLANNED].

### 26.3 Security events

Security-relevant events (auth failures spikes, lockouts, permission denials on platform endpoints, suspicious patterns) are recorded as typed events with severity and surfaced in the Security section [PLANNED; substrate: audit_logs + rate_limit_violations exist].

### 26.4 Incidents [PLANNED]

1. Model: `platform_incidents` (id, title, severity `sev1..sev4`, status `open|acknowledged|mitigated|resolved`, affected components, assigned operator, opened_at, acknowledged_at, resolved_at, postmortem_url, linked audit/correlation ids).
2. Lifecycle: open (manual or auto from health/alert rules) → acknowledge (records actor+time) → assign → escalate (severity up, notifies) → resolve (requires resolution note) → post-incident record for sev1/sev2.
3. Escalation: unacknowledged sev1/sev2 pages all platform admins via the notification model.
4. The Troubleshooting/Incidents section lists incidents with filters; each incident links to related audit rows, jobs, and affected tenants.
5. Tenant-visible incident banner [PLANNED]: tenants see degraded features with incident references — never internal detail beyond what's public.

### 26.5 Alerts [PLANNED]

Alert rules (condition, severity, channel, dedup window) evaluated against metrics/health: e.g., "failed installations > 5 in 1h", "p95 latency > 2s for 10min", "audit events = 0 for 6h (ingestion broken)". Alerts create/attach incidents; acknowledged state is per-operator.

### 26.6 Jobs & queues [PLANNED]

1. A minimal job registry: `platform_jobs` (type, tenant, payload ref, status `queued|running|succeeded|failed|dead`, attempts, next_retry_at, last_error, correlation id). Initial job types: connector sync, report run, digest send, encryption migration, grant expiry sweep.
2. Queues: Cloudflare Queues or cron-triggered runners [PLANNED — infrastructure decision recorded before Phase 9]; until then, `run-due` style endpoints remain the mechanism and are surfaced as jobs.
3. Operator surface: job list with filters, retry (C-5), dead-letter view with inspect/requeue, per-tenant job history.
4. Synchronization failures: failed syncs appear as jobs with connector context and link to incidents.

### 26.7 Maintenance operations

Maintenance mode per tenant (20.1) and platform-wide maintenance banner [PLANNED]; maintenance windows recorded; running migrations during maintenance is the standard path (Section 30).

## 27. Platform Insights

### 27.1 Distinction (normative)

| Layer | Definition | Example |
|---|---|---|
| **Raw telemetry** | Direct measurements/events | `api_usage` rows, audit events, sync results |
| **Calculated metrics** | Deterministic computation over telemetry | p95 latency, MAU, sync success rate |
| **Analytics** | Aggregated trends/cohorts over metrics | tenant growth, connector adoption curves |
| **AI interpretation** | LLM-generated narrative over evidence | "growth concentrated in retail tenants…" |

Every insight card MUST label its layer. AI interpretation MUST link its evidence (Section 28.6) and is never the sole source for an operator decision.

### 27.2 Insight set [PLANNED]

Tenant growth (new/active/churn-risk), user activity (MAU/WAU per tenant), usage trends (API/AI/storage), connector adoption (by catalog type), package adoption (distribution, upgrade events), error trends (4xx/5xx by endpoint class), incident trends (MTTA/MTTR), API activity, AI usage/cost, feature usage (flag-gated feature engagement), security activity (lockouts, violations).

### 27.3 Implementation notes

1. Aggregates are precomputed (scheduled rollup job) into `platform_metric_rollups` (metric, window, dimensions, value) [PLANNED]; ad-hoc heavy queries against raw tables are prohibited in request paths.
2. All insight queries are C-0 platform reads; scoped operators see scoped aggregates.
3. Export: insights export to CSV for the commercial team [PLANNED].

## 28. AI Operations (Ellinea AI)

AI is a **governed platform capability**. Current state: `POST /api/v1/ellinea/ask` grounds answers in a snapshot/memory/DNA payload and calls an OpenAI-compatible provider; fallback is a template answer [VERIFIED].

> **Roadmap priority (normative):** the authorization-critical fixes in 28.1 (server-derived actor identity, organization identity, role/authorization, AI permission checks, server-side grounding/evidence selection, and basic AI rate limiting/security) are an **EARLY foundation requirement — implemented in Phase 2**, NOT in the later AI phase. The client can currently supply/override role information; this is a live authorization risk and MUST be eliminated before any broader AI platform work. The broader AI platform (provider management, model registry, prompt registry, cost/usage optimization, AI analytics, advanced intelligence) remains in Phase 10.

### 28.1 Verified gaps (G-17)

1. **Client-supplied role overrides JWT role** [VERIFIED: `const role = typeof body.role === 'string' ? body.role : auth.role;` in `ask.ts`]. The platform page sends `role:'platform_super_admin'` from the client. Target: role lens is derived **server-side only** from the verified token + DB role; client `role` field is ignored/removed.
2. **Client-supplied grounding** [VERIFIED: `summary`, `memory` (fallback), `dna` come from the request body]. Target: the server assembles grounding from authoritative sources (enterprise summary, org memory, entitlements); client payloads are ignored for authorization-relevant context.
3. **No AI audit** [VERIFIED: questions/answers are not recorded]. Target: AI interaction log (actor, org, question hash + snippet, answer mode, provider, tokens, grounding refs) with retention; sensitive-tenant questions follow C-0 read rules.
4. **No AI rate limiting** [VERIFIED: no per-user/org AI quota in the ask path]. Target: per-org and per-user AI quotas from package entitlements; 429 with retry-after.
5. **No cost tracking** [VERIFIED]. Target: token usage per call recorded; per-tenant and platform cost rollups (where provider exposes usage).

### 28.2 Providers & models

1. Provider config is server-side (env) [VERIFIED]; the control plane shows provider status (configured/not, last error, model in use) — never the key.
2. Model registry [PLANNED]: allowed models per purpose (ask, digest, interpret, agents) with per-model quotas; model changes are C-2, audited.
3. Provider health feeds platform health (26.1).

### 28.3 Prompts & tool permissions

1. System prompts are versioned server-side artifacts [PLANNED: prompt registry with versions + audit]; prompt changes are C-2.
2. Tool permissions: AI-initiated actions (agents) run under the **principal's** permission set, never elevated; tool calls are individually audited; autonomous write actions require the approval engine [VERIFIED: agent executions have decide/approve flow].
3. Agents cannot grant permissions, touch platform configuration, or access other tenants.

### 28.4 Safety controls

1. Grounding-only answering with explicit "insufficient evidence" behavior [VERIFIED in system prompt — keep and test].
2. Hallucination controls: citation tags required; answers without evidence for factual claims are flagged in the UI [PLANNED]; confidence is advisory, never authorization.
3. Fallback behavior: provider failure → explicit degraded answer (current template path [VERIFIED]) — never a fabricated answer.
4. Tenant isolation: AI context is built strictly from the actor's org; platform operators get a separate platform-scoped context built from platform evidence.
5. Rate limiting + quotas per 28.1.4; abuse patterns (prompt-injection attempts via memory notes) are mitigated by treating memory as untrusted content, never as instructions [PLANNED test].

### 28.5 Role-aware access

AI answers adapt to the actor's **server-verified** role; the role lens text (Owner/IT/Member authority framing [VERIFIED]) is retained but fed from server truth.

### 28.6 Evidence & grounding

Every answer records: grounding sources used (snapshot id, memory ids, UEM version), grounding char count [VERIFIED field exists], provider, model, token counts [PLANNED]. The UI shows "evidence" expandable per answer [PLANNED].

## 29. Developer / API Operations

### 29.1 API catalog [PLANNED]

A machine-readable catalog of `/api/v1` endpoints (route, method, auth scope, permission, rate class, audit class, version) generated from the codebase and rendered in the control plane; drift between catalog and code fails the build check [PLANNED].

### 29.2 API health & usage

Per-endpoint: request volume, error rate, latency percentiles, top consumers (tenant/api-key) [PLANNED — substrate: `api_usage`]. Endpoint-level error budget view ties into SLO services [VERIFIED identity-side SLO modules exist].

### 29.3 API keys & service accounts

1. Org-scoped API keys exist (create/revoke, hashed storage [VERIFIED: `api_keys` endpoints + hash pattern]).
2. Platform-scoped keys/service accounts [PLANNED]: for internal automation; scoped permissions, expiry, audit; creation is C-3.
3. Key display: full secret shown once at creation [VERIFIED pattern]; never retrievable again.

### 29.4 Scopes & versions

1. Keys carry scopes (`connector:read`, `report:run`, …) using the same grammar (12.2).
2. API versioning: `/api/v1` is the only stable surface today [VERIFIED]; v2 planning follows the "additive until breaking" rule; breaking changes require a new version + deprecation window (90 days) with usage-based sunset reporting [PLANNED].

### 29.5 Webhooks

Outbound webhook infrastructure exists (secret, deliveries, retry, test [VERIFIED]); developer ops adds: per-event-type subscription management, delivery analytics, global webhook health [PLANNED].

### 29.6 Rate limits & errors

Rate-limit tiers per package [VERIFIED]; developer ops exposes: current limits per endpoint class, violation trends, and the standard error contract (Section 34.3).

### 29.7 Request tracing & developer access

1. Correlation IDs: `X-Request-Id` accepted/issued on every API response [PLANNED for Pages; identity has correlation middleware [VERIFIED]].
2. Sandbox/test environments [PLANNED]: demo tenant template + synthetic connector fixtures; sandbox clearly labeled; never mixed with production metrics.
3. Documentation: `docs/33_Complete_API_Reference.md` exists [VERIFIED]; the catalog (29.1) becomes the living source, docs regenerate from it.

## 30. Recovery / Maintenance

### 30.1 Capabilities

| Capability | Status | Class |
|---|---|---|
| Encryption migration (dry-run + live) | exists [VERIFIED] | C-4 |
| Schema migrations | manual today (no migration files for Supabase; Prisma migrations for identity [VERIFIED]) | C-5 [PLANNED runner] |
| Maintenance mode | missing [PLANNED] | C-2 |
| Backup visibility | missing [PLANNED — depends on Supabase backup tooling; MUST be marked planned until provider capability confirmed] | C-0 |
| Restore workflows | missing [PLANNED] | C-4 |
| Data repair | missing [PLANNED] | C-4 |
| Connector recovery (re-auth, retry, replay) | partial (test/sync exist [VERIFIED]; replay missing) | C-5 |
| Job retry / dead-letter | missing [PLANNED — 26.6] | C-5 |
| Sync replay | missing [PLANNED] | C-5 |
| Cache invalidation | missing [PLANNED] | C-5 |
| Credential rotation | missing [PLANNED — 21.3] | C-4 |
| Incident recovery | missing [PLANNED — 26.4] | — |
| Safe rollback | per-operation compensation plans [PLANNED] | — |

### 30.2 Rules

1. Every recovery operation: declared class safeguards (Section 9), a written pre-condition check, a dry-run where feasible (precedent: encryption migration [VERIFIED]), and a compensation/rollback note.
2. Destructive operations (restore, repair, purge) require dual approval (C-4).
3. Recovery operations run during maintenance windows by default; emergency use follows break-glass (Section 10.3).
4. All recovery operations write audit rows with before/after and result summaries.

### 30.3 Recovery objectives: RPO / RTO (normative framework)

Every critical platform subsystem MUST eventually carry an **approved RPO/RTO classification**. Until a subsystem is classified, it MUST be treated as unclassified (no recovery promise may be made about it). The numbers below are **proposed defaults requiring explicit approval** — they are not adopted targets until ratified through change control.

**Definitions:**

- **RPO (Recovery Point Objective):** the maximum acceptable data loss for a subsystem, measured in time (how much data may be lost between the last recoverable state and the incident).
- **RTO (Recovery Time Objective):** the maximum acceptable time to restore a subsystem to service after an incident.

**Service criticality tiers (proposed):**

| Tier | Definition | Proposed default RPO | Proposed default RTO | Examples |
|---|---|---|---|---|
| T1 Critical | Platform unusable or data at risk without it | ≤ 15 min | ≤ 4 h | identity/auth, database, tenant isolation |
| T2 Core | Major features degraded | ≤ 1 h | ≤ 8 h | audit pipeline, connector fabric, notifications |
| T3 Standard | Feature-level degradation, workarounds exist | ≤ 24 h | ≤ 3 days | reports, insights, digests |
| T4 Deferred | May be down during recovery | best effort | ≤ 7 days | sandbox, non-critical analytics |

**Requirements:**

1. **Backup frequency** per subsystem MUST be stated and justified against its RPO (proposed: T1 continuous/PITR where the provider supports it; T2 hourly-to-daily; T3/T4 daily-to-weekly). Backup capability depends on provider tooling (30.1) and MUST be marked planned until confirmed.
2. **Restore validation:** a backup is not a recovery capability until a restore has been performed and verified. Every tier's backup path MUST be validated on a schedule (proposed: T1 monthly, T2 quarterly, T3/T4 semi-annually) with recorded evidence.
3. **Disaster recovery testing:** a documented DR exercise (tabletop at minimum; full restore rehearsal for T1) runs at least annually and after major architecture changes; results are recorded with gaps and remediations.
4. **Recovery ownership:** every subsystem has a named recovery owner (role, not person) responsible for its RPO/RTO classification, backup configuration, and drill participation.
5. **Evidence that recovery works:** drill/restore results are recorded as compliance evidence (class 6-adjacent, 25.4) — timestamps, subsystem, result, gaps. "We have backups" is not evidence; "restore X on date Y recovered Z rows verified by check W" is.
6. Classification review: RPO/RTO classifications are reviewed at least annually and whenever a subsystem's architecture changes materially.

## 31. Feature Flags / Configuration

### 31.1 Current state (verified)

Platform flags: hardcoded catalog of 6 flags, stored as JSON inside `organizations.settings` of the synthetic `ellines-platform` org, toggled via PATCH with **no audit** [VERIFIED — Gaps G-11/G-12]. Tenant settings: JSON blob on each org (datetime prefs [VERIFIED]).

### 31.2 Target architecture [PLANNED]

1. Dedicated tables: `feature_flags` (key, name, description, is_platform, default_state), `feature_flag_states` (scope: platform|org|role, scope_id, state, rollout_percent, updated_by, updated_at, reason).
2. Resolution order: org state → role state → platform default. Evaluation is server-side; the client receives resolved flags per session (never the raw table).
3. Rollout percentages: deterministic hash bucketing by user id for percentage rollouts where justified.
4. Environments: flags are per deployed environment (prod/staging) by virtue of separate databases; no in-DB env column needed now.
5. History: every state change appends to `feature_flag_history` (before/after, actor, reason) — satisfying the audit requirement (G-12) structurally.
6. Safe rollback: flags UI shows last change with one-click revert (a new audited change, not an edit of history).
7. Migration: existing JSON flags are imported into tables; the JSON path is retired; `organizations.settings` returns to tenant-preference-sized data only.
8. **JSON vs dedicated structures rule:** settings JSON is acceptable for per-tenant presentation preferences (datetime format, UI prefs) and low-cardinality booleans; anything with lifecycle (versions, audit, per-entity state, enforcement reads) MUST be a dedicated table. New JSON settings keys require a spec note justifying them.

### 31.3 Acceptance criteria

(a) flag toggle writes history + audit; (b) org-scoped flag overrides platform default; (c) removing a flag key degrades to default without errors; (d) no client can set a flag (all toggles are platform-authorized).

## 32. Notifications

### 32.1 Existing substrate [VERIFIED]

Notification outbox + delivery endpoint (email/push/in-app), push subscriptions (VAPID), delivery policy per org, unread counts, digest sending. Email via Resend/SMTP when secrets configured; push simulated without VAPID keys [VERIFIED in `shared/auth.ts` comments + mail module].

### 32.2 Notification classes [PLANNED formalization — roadmap owner: Phase 7, coordinated with Phase 9]

**Phase ownership (normative):** notification architecture formalization is owned by **Phase 7** (licensing/quotas depend on quota/licensing notifications) and MUST be coordinated with **Phase 9** (incidents/alerts depend on incident/security notifications). Neither Phase 7 nor Phase 9 may declare complete while the notification classes they depend on are unimplemented. Each notification class defines: taxonomy (class + event type), **severity** (info/warning/critical), **recipients** (roles, not hardcoded emails), **routing** (which channels per severity), preferences, delivery channels, retry policy, failure handling, and audit of delivery attempts where appropriate (32.3).

| Class | Audience | Examples |
|---|---|---|
| Platform alerts | Operators | health degraded, incident opened, quota platform-breach |
| Operator notifications | Individual operators | grant approved, dual-approval requested, escalation |
| Security notifications | Security Operator + Owner | admin grant, break-glass use, lockout spike |
| Incident notifications | Assigned + subscribers | ack/escalate/resolve |
| Connector notifications | Tenant owner/IT + Integration Operator | sync failures, credential expiry |
| Licensing notifications | Tenant owner + Package Operator | trial ending, quota warnings, package change |
| Quota notifications | Tenant owner + operator | 80%/95%/exceeded |
| Tenant notifications | Tenant users | existing outbox flows |

### 32.3 Rules

1. All notifications flow through the outbox (delivery + audit of attempts) — no direct-send side channels for platform classes.
2. Preferences: operators and tenants set channel preferences per class [PLANNED extension of notify-policy].
3. Delivery failure handling: retry with backoff; dead notifications visible to operators; provider outages degrade to in-app only with a banner.
4. Secrets never appear in notification bodies (e.g., credential emails contain instructions + link, never values).

# PART VIII — ARCHITECTURE

## 33. Data Architecture

### 33.1 Sources of truth

1. One authoritative store per entity class (Section 4). The production runtime is Supabase (Postgres) accessed by Pages Functions with a service-role client [VERIFIED]; the NestJS identity service (Prisma) is the application-layer service for the same logical model [VERIFIED] — schema parity between the two MUST be tracked, and drift is a defect. **Parity MUST be enforced structurally, not by prose alone** [PLANNED — implementation details to be selected]: appropriate mechanisms include shared contract/schema definitions, generated types consumed by both backends, an API schema artifact, schema-comparison checks, contract tests, and CI validation that fails on drift between the Supabase schema path and the Prisma schema path. Until a structural mechanism exists, the manual parity check remains a documented defect risk, not a control.
2. `users.organization_id` vs `organization_memberships`: today membership truth is dual-track (primary org on users; memberships written only for child orgs and custom-role assignment [VERIFIED — Gap G-15]). Target: `organization_memberships` is the single membership truth; `users.organization_id` becomes a denormalized "primary org" cache updated in the same transaction. **This unification is an EARLY roadmap requirement (Phase 2)** — it precedes scoped internal operator permissions (Phase 4), because `checkPermission` resolves custom roles via `organization_memberships.custom_role_id` [VERIFIED], and users created without membership records silently fail custom-role authorization. Phase 2 membership work includes: a **migration/backfill strategy** (create membership rows for every existing user/org pair; reconcile `users.organization_id`), **write-path unification** (every user-creation path — register, platform create, org create, create-child, invite — writes a membership row in the same transaction), **authorization regression tests** (a custom-role user created via every path resolves permissions identically), and **tenant-isolation tests** covering the membership resolver.

### 33.2 Tenancy & isolation

1. Every tenant table carries `organization_id` with an index leading on it; platform tables (`platform_*`, packages, packs) are explicitly global.
2. Row-level security [PLANNED]: service-role bypasses RLS today [VERIFIED pattern]; RLS policies are added defense-in-depth for direct client access paths (none currently) and for future Supabase-client features.
3. Cross-org queries exist only in `/platform/*` handlers after authorization.
4. **Service-role access is a high-risk trust boundary (normative).** Platform functions use privileged (service-role) database access; every privileged query is therefore inside a trust boundary that MUST be controlled:
   - **Explicit authorization BEFORE privileged queries:** every handler that touches the service-role client MUST have completed server-side authentication + platform/tenant authorization first; no handler may fetch first and check later.
   - **Organization scoping:** even privileged queries filter by the authorized org scope; "platform scope" is a deliberate, declared exception per endpoint (20.3.1), never a default.
   - **Centralized helpers where practical:** privileged data access goes through shared, audited data-access helpers rather than ad-hoc per-handler queries, so authorization and scoping are reviewable in one place [PLANNED].
   - **Negative authorization tests:** for every privileged endpoint, a test asserts an unauthorized actor (no token, tenant token, expired grant) receives 401/403 and NO data.
   - **Cross-tenant access tests:** a tenant token MUST NOT reach another tenant's rows through any endpoint, including handlers that use the service-role client (36.1 isolation row).
   - **Auditability of privileged operations:** privileged reads/writes that touch cross-tenant data are observable per the C-0/C-1+ contracts (9.1.1, 9.4).

### 33.3 Normalization, caching, derived data

1. Source data is normalized into UEM-shaped structures at sync time (class 3); raw payloads are not persisted unless required for replay (bounded retention).
2. Caches (class 4) always have TTL + invalidation trigger; the control plane exposes cache state and purge (C-5) [PLANNED].
3. Derived data is rebuildable: a rebuild procedure exists per derived store before it is considered production [PLANNED rule].

### 33.4 Retention, deletion, archival

| Class | Online | Archive | Purge |
|---|---|---|---|
| 1 source cache | TTL-bound | — | with tenant deletion |
| 2 platform data | tenant lifetime | — | tenant deletion flow (20.5) |
| 3 derived | 90d default | — | rebuildable |
| 5 analytics raw | 90d | aggregates 13mo+ | scheduled |
| 6 audit | 24mo | 7yr cold | never (policy-governed) |
| 7 config | lifetime + history | — | with owner entity |
| 8 secrets | until rotation | — | immediate on rotation/delete |

**Retention enforcement (normative — policy ≠ enforcement).** The table above states POLICY. A retention promise is not complete until each row also has a recorded ENFORCEMENT definition. For every retained class (and every future event store per 25.4.4), the following MUST be defined before the retention claim is considered complete:

| Requirement | Meaning |
|---|---|
| Retention owner | the role accountable for the policy being enforced (not a person) |
| Enforcement mechanism | the job/endpoint/process that actually deletes or archives (e.g., scheduled purge job, lifecycle rule) [PLANNED — none exist yet] |
| Enforcement frequency | how often the mechanism runs (e.g., daily sweep) |
| Deletion/archive mechanism | hard delete vs cold archive vs soft-expire, per store |
| Verification | how enforcement is proven (post-run counts, sampled checks, evidence rows) |
| Failure handling | what happens when the enforcement job fails (alert, retry, escalation) |
| Audit/evidence | enforcement runs are themselves recorded (as operational evidence, not necessarily `audit_logs` rows) |

Until a class has an enforcement mechanism AND a verification path, its retention row MUST be read as "policy exists, not technically enforced" — and MUST NOT be represented externally as an enforced guarantee.

### 33.4.1 Data protection (PII / sensitive data) [PLANNED requirement]

The data architecture MUST explicitly address protection of personally identifiable information (PII), sensitive business information, health-related information where applicable (EIP may connect to hospital/medical systems, 3.1), and credentials/secrets (class 8). For every store handling such data, the architecture defines:

1. **Data minimization:** collect/store only what the capability requires; derived stores prefer references over copies.
2. **Purpose limitation:** data collected for one capability is not repurposed (e.g., telemetry → AI training) without an explicit, documented, audited decision.
3. **Access control:** field-level or store-level access rules aligned with the permission grammar (12.2); sensitive fields are redacted in DTOs (class 8 precedent).
4. **Retention & deletion:** per-class retention (33.4) with enforceable deletion paths, including tenant-initiated deletion (20.5).
5. **Export:** data export in a portable format, scoped to the requester's entitlements (25.5, 20.5.4).
6. **Auditability:** access to protected data is observable (C-0 access events; exceptional reads audited, 9.1.1).
7. **Breach/security-event handling:** suspected exposure of protected data is a security event (26.3) with a defined response path (detect → contain → assess → notify per policy) [PLANNED runbook].
8. **Regional compliance:** EIP is developed in Kenya; the architecture MUST be designed to **support** applicable obligations of the Kenya Data Protection Act, 2019 (e.g., data-subject rights, lawful basis, breach notification readiness) and future regional/data-residency requirements (the design MUST NOT hard-code EIP to Kenya only — residency is a deployment/configuration concern, not a code constant). **This specification does NOT claim legal compliance:** formal compliance with the DPA 2019 or any regulation requires appropriate professional/legal review; the architecture's obligation is to *support* those obligations when legal counsel defines them.

### 33.5 Indexing, pagination, concurrency, consistency

1. Every list endpoint paginates (limit/offset now [VERIFIED]; cursor for high-volume tables [PLANNED]); unbounded list queries are prohibited in new code.
2. Indexes: `audit_logs(created_at desc)`, `audit_logs(organization_id, created_at desc)`, `api_usage(window_start)`, `connector_installations(organization_id, status)` [PLANNED verification against live schema].
3. **Concurrency & conflict handling (normative for sensitive platform capabilities).** Generic optimistic locking is the floor, not the whole requirement. For sensitive platform capabilities — organizations, users, packages, licensing/entitlements, feature flags, connectors (installations/packs), platform configuration, security settings — concurrent-write handling MUST define:
   - a **version/ETag or equivalent** (e.g., `updated_at` compare-and-swap or an explicit version column) on every mutable row;
   - **stale-write detection:** a write against a stale version is rejected, not silently applied;
   - a **conflict response:** 409 with the current server state (or a version marker) so the client can reconcile;
   - **retry behavior:** documented client retry semantics (refetch → reapply → resubmit); automatic retries only for idempotent operations;
   - an **operator-visible conflict state:** the UI shows what changed underneath ("this org was modified by another operator") instead of overwriting;
   - **audit implications:** rejected stale writes are not audited as mutations; successful writes record the version they were based on where feasible.
   **Last-write-wins is PROHIBITED** for: security settings, platform role grants, licensing/entitlement overrides, feature-flag state, package edits, and organization status changes — these require explicit conflict resolution because a silent overwrite can revoke access or change platform behavior without an operator realizing it. Last-write-wins MAY be tolerated only for low-risk, single-owner preference data (e.g., window layout), and each tolerance is documented.
4. Consistency: multi-row writes use transactions where the driver supports them; where not (current Pages Functions pattern [VERIFIED: manual rollback in create.ts]), compensating actions MUST be idempotent and logged — with the transactional target noted as G-13.
5. Event propagation: in-process events today; the event-bus module in web [VERIFIED] and enterprise events API [VERIFIED] are the substrate; durable event log for cross-service propagation [PLANNED].

### 33.6 JSON settings policy

See 31.2.8. Summary: presentation preferences → JSON OK; anything audited/enforced/versioned → dedicated table.

## 34. API / Backend Standards

### 34.1 Authentication & authorization

1. Every endpoint declares: auth requirement, required permission (grammar 12.2), operation class (9.1), audit class.
2. Authorization is enforced server-side on every request; client checks are UX only.
3. Platform endpoints verify platform authorization from server-resolvable state (12.4), never from client claims alone.

### 34.2 Validation

1. All bodies validated (shape, types, lengths, enums) before use; the shared validation helpers are the norm [VERIFIED: `shared/validation.ts` used by auth flows].
2. Unknown fields are rejected or explicitly ignored (documented per endpoint); silent passthrough of unvalidated bodies into queries is prohibited.

### 34.3 Error contract

```json
{ "statusCode": 400, "message": "human-readable", "error": "Bad Request", "code": "VALIDATION_FAILED", "requestId": "…" }
```

1. Status codes: 400 validation, 401 unauthenticated, 403 unauthorized, 404 unknown resource (not used to hide authorization), 409 conflict, 429 quota, 500 internal, 503 dependency.
2. Error messages never leak internals (stack traces, SQL, secrets); a request ID is included for support correlation.
3. The existing NestJS all-exceptions filter is the reference [VERIFIED]; Pages functions converge on the shared error helper [VERIFIED `shared/errors.ts` exists].

### 34.4 Pagination, filtering, sorting

1. Lists: `limit` (default 50, max 200 [VERIFIED pattern]) + `offset` (cursor later); responses include `total`.
2. Filtering: explicit allowlist of filter fields per endpoint; free-text search is server-side with escaping.
3. Sorting: explicit allowlist; default sort documented.

### 34.5 Idempotency

1. Mutating endpoints that create resources accept `Idempotency-Key` [PLANNED]; retries with the same key return the original result.
2. State-transition endpoints (status changes) are idempotent by design (set-state semantics [VERIFIED pattern]).

### 34.6 Rate limiting & audit

1. Per-package request quotas enforced by the rate-limit guard [VERIFIED]; violations recorded (class 6).
2. Audit per Section 25; correlation ID on every request/response [PLANNED for Pages].

### 34.7 Observability & versioning

1. Structured logs (JSON) with level, route, actor id, org, requestId, duration; no PII beyond actor id/email; no secrets.
2. Metrics: request count/duration/error by route class; dependency probes (26.1).
3. Versioning per 29.4.2; additive changes only within `/api/v1`.

## 35. Reliability / Performance

1. **Pagination & lazy loading:** all lists paginated; heavy panels load on demand (tab/drawer open), not on page load.
2. **Caching:** health/metrics cached server-side (30–60s) [PLANNED formalization]; client caches carry TTL + explicit refresh.
3. **Rate limiting:** per 34.6; platform operator actions additionally throttled to prevent runaway automation.
4. **Retries & timeouts:** all outbound calls (LLM, email, connector probes) have explicit timeouts (≤10s) and bounded retries with backoff; no unbounded waits.
5. **Circuit breakers:** repeated dependency failure opens a circuit (fast-fail + cached last-good) for: LLM provider, email provider, connector probes [PLANNED].
6. **Graceful degradation:** every feature declares its degraded mode (Section 17.3); the platform never shows fake success.
7. **Offline/unavailable states:** the control plane shows connection status and queues nothing silently; failed actions surface errors.
8. **Observability:** every platform mutation is traceable end-to-end via correlation ID (25.3.5).
9. **Performance budgets:** control-plane first load ≤ 2.5s on broadband; any platform API p95 ≤ 500ms excluding dependency calls; metrics endpoint p95 ≤ 1s. Budgets are enforced by the existing perf-benchmark script [VERIFIED: `scripts/perf-benchmark.mjs`] extended with platform routes [PLANNED].

# PART IX — QUALITY

## 36. Testing / Validation

### 36.1 Test requirements per feature

| Level | Requirement |
|---|---|
| Unit | permission evaluation, validation, encryption, mapping logic |
| API (function-level) | every Pages Function: auth (401/403), validation (400), happy path, conflict (409), quota (429) |
| Integration | multi-step flows: onboarding, package assign → enforcement, flag change → behavior |
| Authorization | matrix tests: each role × each endpoint class → expected status |
| Tenant isolation | tenant A token cannot read/write tenant B via any endpoint (parameterized over all routes) |
| UI | control-plane smoke: sections render, unavailable states render, destructive flows confirm |
| Regression | every fixed gap (Section 40) gains a regression test at the level that caught it |
| Build | `npm run build:shared`, `npm run build -w @ellines-eip/web`, identity build when touched [VERIFIED guardrails in AGENTS.md] |
| Migration | encryption/migration endpoints: dry-run parity with live run on fixtures |
| Security | secret-redaction scan, CORS/header checks, dependency audit (`reports/npm-audit.json` exists [VERIFIED]) |

### 36.2 Existing validation infrastructure [VERIFIED]

`npm run verify:pages-functions` (route/contract checks), `verify:data-layer`, workspace tests (`npm run test`), `scripts/security-audit.mjs`, `scripts/perf-benchmark.mjs`, `scripts/check-databases.ts`, function-level specs (e.g., `login.spec.ts`, `encryption.spec.ts`). New platform features MUST extend `verify:pages-functions` coverage for new routes.

### 36.3 Acceptance on real data

1. Features are accepted against a real database with real rows — never against mocks alone.
2. **"No fake data" is a platform development rule** (Section 38): test fixtures live in tests only; production code paths contain no synthetic generators (the audit pass removed `generateMockMetrics` [VERIFIED precedent]).
3. Demo tenants are explicitly labeled (`is_demo` flag [PLANNED]) and excluded from production metrics.

## 37. Dashboard Development Rules (Permanent)

These rules bind all current and future development. They may be amended only by changing this specification.

1. **One platform control plane.** `/app/platform` is the only Super Admin surface.
2. **One Super Admin navigation.** The Section 6 information architecture; no parallel nav systems.
3. **No duplicate dashboards for the same capability.**
4. **Future dashboards are controlled views of the same platform** (Part V doctrine).
5. **No hidden administrative systems.** Administrative capability exists only in the catalog (Section 7).
6. **No fake telemetry.** Unavailable is shown as unavailable (Section 38).
7. **No client-controlled authorization claims.** Role/org/permission claims are server-derived (11.3, 28.1).
8. **No secrets in logs.** (24.7.3, 25.6)
9. **Sensitive actions are audited.** (25.2)
10. **Tenant isolation is mandatory.** (20.3, 36.1)
11. **Every new platform capability defines ownership, permissions, API, audit and failure behavior** before implementation (capability template 7.0).
12. **Extend, don't duplicate.** Existing functionality is extended in place (Section 5.5).
13. **A feature is not complete because the UI exists.** Backend, security, data, audit, failure handling and tests must exist (Definition of Done below).
14. **No routes duplicating platform capabilities without a documented architectural reason** (15.5).

**Definition of Done (platform feature):** capability spec'd in Section 7 format → APIs with auth/permission/audit → data model changes documented → failure states designed → tests per 36.1 → build gates pass → gap map updated → docs updated.

## 38. No-Fake-Data Rule

1. Production code MUST NOT contain synthetic/random/mock generators for any user-visible value. [VERIFIED precedent: `generateMockMetrics` removed in the audit pass; `docs/47` records the rule.]
2. Unavailable data renders as unavailable with a reason; stale data renders with its age.
3. Simulated delivery modes (e.g., push without VAPID keys [VERIFIED]) MUST be labeled "simulated" in UI and API responses until real capability exists.
4. Demo/seed data only in labeled demo tenants; excluded from metrics and insights.
5. Violations of this rule are release blockers.
6. **Silent-fallback prohibition (permanent platform development rule).** Authoritative platform metrics MUST NOT be silently substituted with locally-derived approximations. Patterns equivalent to `metrics?.x ?? localValue` — where a failed/missing authoritative fetch causes a locally-derived approximation to be presented AS IF it were the authoritative platform metric — are PROHIBITED. The only approved display states for a metric are:
   - **real value** (from the authoritative source, with freshness timestamp);
   - **loading** (explicitly in-flight);
   - **unavailable** (source failed/not configured — with reason category, 16.4);
   - **stale** (last good authoritative value + its age);
   - **degraded/partial** (subset of sources responded — labeled as partial).
   If a locally-derived approximation is genuinely useful, it MAY be shown ONLY when explicitly labeled as a fallback/approximation (e.g., "local estimate — platform metric unavailable"), never in the authoritative metric's visual position without that label. Silent substitution in either direction (fallback shown as authoritative, or authoritative hidden by a fallback) is a violation of this rule and a release blocker.

# PART X — DELIVERY

## 39. Implementation Roadmap

Each phase defines: objective, dependencies, major deliverables, tests, acceptance criteria, completion definition. Phases map to `docs/05_Build_Queue.md` items when work starts. **No phase may be skipped; a phase is complete only when its completion definition is met.**

### 39.1 Phase status index (verified against code 2026-09-22)

Status legend: **done** = completion definition met and evidenced, with the verification recorded (40.9) · **next** = the phase currently open in `docs/05_Build_Queue.md` · **todo** = not started. This index and `docs/05_Build_Queue.md` MUST agree at every merge; per 0.4, an item may only be marked resolved/done when the verifying evidence (test, build, or code reference) is recorded.

| Phase | Status | Completion evidence |
|---|---|---|
| Phase 0 — Foundation / Repository Integrity | **done** (verified 2026-09-22) | All six deliverables on `main` (`87ab44c`) with tests + CI gate active; guardrail commands green — §40.9.1 |
| Phase 1 — Master Specification | **done** (verified 2026-09-22) | Spec review (`906bda6`), gap map re-verified (§40.3), queue seeded from Phase 2+ (`dd5a391`), merged to `main` (`1798868`) — §40.9.2 |
| Phase 2 — Platform Control Plane Foundation | **done** (verified 2026-09-22) | Lockout (5/15→15 min, both backends), session registry (migration 0003 + login/logout/requireAuth), unified §12.2 permission grammar (shared by Pages Functions + NestJS RBAC), isolation release gate in CI, named tests (health-probe DB failure injection + CORS matrix incl. preflight) — `0fe82b2` on branch; completion evidence in §40.9.3 |
| Phase 3 — Super Admin / God Mode Core | todo | — |
| Phase 4 — Internal Ellines Operations | todo | — |
| Phase 5 — Business / Tenant Governance | todo | — |
| Phase 6 — Connector Platform | todo | — |
| Phase 7 — Licensing / Usage / Entitlements | todo | — |
| Phase 8 — Security / Audit / Compliance | todo | — |
| Phase 9 — Health / Incidents / Operations | todo | — |
| Phase 10 — Platform Intelligence / AI | todo | — |
| Phase 11 — Developer / API Operations | todo | — |
| Phase 12 — Recovery / Maintenance | todo | — |
| Phase 13 — Business Owner Dashboard | todo | — |
| Phase 14 — Remaining Specialized Dashboards | todo | — |
| Phase 15 — Full Platform Validation | todo | — |

### PHASE 0 — Foundation / Repository Integrity
- **Status:** **done** — verified 2026-09-22 (§39.1, §40.9.1); all six deliverables merged to `main` (`87ab44c`)
- **Objective:** a trustworthy baseline: builds green, contracts verified, no known broken user flows.
- **Dependencies:** none.
- **Deliverables:** fix G-01 (package payload mismatch), G-02 (password policy parity), G-14 (single platform user-API contract), remove dead duplicate exports in `api.ts` (G-06), remove orphan `platform.module.css` (G-07); **structural contract validation** for the dual-backend split (G-14 follow-up): a machine-checkable contract artifact (shared contract definitions / generated types / API schema) plus contract tests and CI validation, so NestJS↔Pages-Functions drift fails the build instead of being caught in review [PLANNED mechanism — select the lightest option that runs in CI].
- **Tests:** regression tests for each fix; a contract-drift test wired into CI; `verify:pages-functions` extended for the touched routes.
- **Acceptance:** package creation works end-to-end from the UI; a 7-char password is rejected everywhere; an 8-char password is accepted everywhere; an intentionally divergent contract change fails CI; `npm run build:web` + `verify:pages-functions` pass.
- **Completion definition:** all Phase-0 fixes merged with tests; contract-validation mechanism active in CI; gap map rows G-01/02/06/07/14 marked resolved with evidence.

### PHASE 1 — Master Specification
- **Status:** **done** — verified 2026-09-22 (§39.1, §40.9.2); reviewed spec, re-verified gap map and Phase-2+ queue merged to `main` (`1798868`)
- **Objective:** this document reviewed, amended as needed, and adopted as the governing control-plane spec.
- **Dependencies:** Phase 0 findings incorporated.
- **Deliverables:** reviewed spec prepared on `eip/phase-1-foundation`; Section 40 gap map re-verified against the Phase-0 baseline; `docs/05_Build_Queue.md` seeded from Phase 2+ deliverables.
- **Acceptance:** every remaining gap row has an owner phase; Phase-0-resolved gaps are no longer classified as open/confirmed; no [PLANNED] capability is represented as existing.
- **Completion definition:** reviewed spec and Phase-2+ queue are complete on the phase branch and ready for merge to `main`. Adoption occurs when the branch is merged after verification.

### PHASE 2 — Platform Control Plane Foundation (identity/membership truth, authorization, AI security, audit, hardening)
- **Status:** **done** — branch `agent/nav-unified-sidebar` @ `667de56`; all seven deliverables closed 2026-09-23: lockout (5/15→15 min, both backends), session registry (migration 0003 + login/logout/requireAuth), unified §12.2 permission grammar (shared by Pages Functions + NestJS RBAC), isolation release gate in CI, named tests (health-probe DB failure injection + CORS matrix incl. preflight), **G-15** membership truth (register + platform create write `organization_memberships` transactionally — `auth.service.ts:82-95`), **G-17 core** (server-derived JWT identity, server-side grounding from DB, `ellinea:ask` permission gate, deterministic rate limit — `ask.ts` + `rate-limit.ts` free tier 10/min), **G-12** audit contract (flags PATCH + connector-packs POST + audit-logs CSV export all write `audit_rows` with before/after/reason/result/correlationId; `platform-audit.contract.spec.ts` 6/6), **G-08** audit UI depth (org/date filters, Prev/Next pagination, CSV export — `page.tsx`), **G-05** health probes (`/platform/health/summary` + DB/email dependency probes), **G-19** CORS allowlist incl. preflight (`_middleware.ts`); Super Admin navigation unified onto the single primary sidebar (§6.1) |
- **Objective:** establish the early foundation that removes live authorization and data-integrity risks BEFORE advanced platform features are built: membership truth → role resolution → scoped permissions (Phase 4) → delegated/elevated operations (Phase 8+).
- **Dependencies:** Phase 0/1.
- **Deliverables:**
  1. **Membership truth (G-15 — moved here from Phase 5; precedes scoped operator permissions):** unify `organization_memberships` as the single membership truth — migration/backfill strategy for existing users, write-path unification (every user-creation path writes a membership row transactionally), authorization regression tests, tenant-isolation tests for the membership resolver (33.1.2).
  2. **AI server-side identity/security foundation (G-17 core — moved here from Phase 10):** eliminate client-controlled authorization identity in the AI endpoint — server-derived actor identity, organization identity, role/authorization, AI permission checks, server-side grounding/evidence selection, and basic AI rate limiting/abuse controls (28.1.1/28.1.2/28.1.4 core). The broader AI platform remains in Phase 10.
  3. **Baseline authentication hardening (24.4.1):** login rate limiting, account lockout/abuse controls, credential-reset security review, session-revocation foundations (session registry groundwork) — established here, not in a late security phase.
  4. **Audit contract:** audit coverage for the remaining unaudited mutations (G-12: feature-flag changes, connector-pack creation — tenant settings changes are ALREADY audited [VERIFIED]); audit row contract upgrade (before/after, reason, result, correlation ID — 25.1); C-0 access-event mechanism defined (9.1.1).
  5. **Unified permission grammar (12.2):** one canonical grammar + evaluator for tenant and platform permissions, backward-compatible, with invalid-grant rejection and authorization regression tests.
  6. **Tenant-isolation test suite as a release gate (36.1):** parameterized cross-tenant tests over all routes, negative authorization tests for service-role handlers (33.2), synthetic-org exclusion test (20.7).
  7. **Control-plane structural fixes:** audit UI depth (G-08: org/date filters, pagination controls, export endpoint); real health probes (G-05) with `/platform/health/summary` and the three-tier payload boundary (26.1.3); CORS allowlist (G-19 — both `shared/auth.ts` and `shared/errors.ts`).
- **Tests:** audit-presence tests per mutation; membership backfill + authorization regression tests; AI authorization tests (client role ignored, client grounding ignored); grammar/wildcard evaluation tests; tenant-isolation suite (negative authorization + cross-tenant + synthetic-org); health probe failure injection; CORS matrix tests.
- **Acceptance:** every C-1+ mutation writes a complete audit row; a custom-role user created via ANY path resolves permissions identically; a client-supplied `role` in the AI request is ignored; baseline lockout/rate limits are active on auth endpoints; the isolation suite passes across all routes and gates merges; health reflects a killed dependency as degraded/down with a minimal public payload; cross-origin requests from non-allowlisted origins are rejected.
- **Completion definition:** G-05/08/12/15/19 resolved; G-17 core (authorization/grounding/rate-limit) resolved; audit contract documented and enforced by tests; membership truth unified; isolation suite green and gating.

### PHASE 3 — Super Admin / God Mode Core
- **Objective:** implement the safeguard engine that all privileged operations share.
- **Dependencies:** Phase 2 (audit contract).
- **Deliverables:** operation-class registry (9.1/9.3) as shared metadata; confirmation + reason capture components; server-side reason enforcement; result/failure audit fields; package edit/delete UI with safeguards (G-09); connector-pack management UI + pack lifecycle endpoints (update/publish/deprecate/delete) with audit; window-layer/z-index token system (16.3.3) established alongside window-manager groundwork.
- **Tests:** safeguard matrix tests (each class × each safeguard); pack lifecycle API tests.
- **Acceptance:** a C-2 operation without a reason is rejected server-side; every operation in 9.3 enforces its class safeguards; packages and packs are fully manageable from the control plane.
- **Completion definition:** safeguard engine is the only path for privileged mutations; G-09 resolved.

### PHASE 4 — Internal Ellines Operations
- **Objective:** DB-backed internal staff model replacing the env allowlist as primary mechanism.
- **Dependencies:** Phase 3 (safeguards for C-3 grants), Phase 2 (membership truth + role resolution — scoped operator permissions are built on the unified membership model and canonical grammar).
- **Deliverables:** `platform_staff`/`platform_roles`/`platform_role_assignments` tables (12.4); internal staff management UI; scoped authorization middleware (org/module/action scopes); grant expiry sweep; seed-role provisioning; env allowlist demoted to bootstrap.
- **Tests:** grant/revoke/expiry tests; scope-enforcement matrix; bootstrap-empty-table test.
- **Acceptance:** a Support Operator scoped to org X cannot list org Y; an expired grant fails closed; Platform Owner can delegate every role in 12.1; env var alone no longer grants access when staff table is populated.
- **Completion definition:** G-18 resolved (DB-backed with safe bootstrap); all platform endpoints authorize via the new resolver.

### PHASE 5 — Business / Tenant Governance
- **Objective:** complete tenant lifecycle governance.
- **Dependencies:** Phase 4 (scoped operators), Phase 2 (membership truth — already unified there; lifecycle writes MUST preserve it).
- **Deliverables:** transactional onboarding (G-13); onboarding security controls (20.6: slug reservation/reserved names, ownership verification, onboarding audit, rollback, idempotency); maintenance + archived states; deletion/retention flow (20.5) with dual approval; server-side org search/pagination; concurrency controls for org/user mutations (33.5.3).
- **Tests:** onboarding failure-injection (no orphans); slug/reserved-name/idempotency tests; isolation tests for new states; deletion dry-run; concurrency conflict tests.
- **Acceptance:** full lifecycle 20.1 operable from the control plane with safeguards; membership truth (unified in Phase 2) is preserved by every lifecycle write; suspended/maintenance states enforced at auth layer.
- **Completion definition:** G-13 resolved; lifecycle states complete; onboarding security controls active.

### PHASE 6 — Connector Platform
- **Objective:** first-class connector lifecycle with governed credentials.
- **Dependencies:** Phase 3 (safeguards), Phase 5 (tenant states honored by scheduler).
- **Deliverables:** pack lifecycle completion (21.1); credential rotation (21.3); sync history store + UI (21.4); retry/backoff formalization (21.5); source-of-truth declarations (21.8); diagnostics bundle (21.10); secret-redaction regression tests.
- **Tests:** rotation flow tests; redaction scan; backoff unit tests; SoT declaration enforcement tests.
- **Acceptance:** credentials never appear in any output (automated check); a failed sync retries with backoff and dead-letters after N; packs are versioned and publishable.
- **Completion definition:** connector lifecycle 21.9 fully operable; G-10 (connector portion) resolved.

### PHASE 7 — Licensing / Usage / Entitlements
- **Objective:** commercial governance layer.
- **Dependencies:** Phase 5 (org model), Phase 2 (audit).
- **Deliverables:** entitlement resolution layer + overrides (22.2); trials; Usage/Quotas operator surface (23.2.7); warning thresholds + notifications; quota override capability; usage statements; **notification formalization for the classes this phase depends on** (32.2: licensing/quota notifications — taxonomy, severity, recipients, routing, preferences, channels, retry, failure handling, audit) — Phase 7 owns notification architecture and coordinates with Phase 9.
- **Tests:** entitlement matrix tests; quota enforcement tests (429 + violation row); override expiry tests.
- **Acceptance:** enforcement reads resolved entitlements; operator surface reconciles with `api_usage`; trials expire automatically.
- **Completion definition:** G-10 (usage portion) resolved; Licensing/Entitlements + Usage/Quotas nav items live.

### PHASE 8 — Security / Audit / Compliance
- **Objective:** harden identity, sessions, and audit to enterprise grade.
- **Dependencies:** Phase 4 (platform roles).
- **Deliverables:** MFA (TOTP) for platform roles; session registry + revocation for operators + the operator session-management surface (24.9); step-up auth + dual approval engine (Section 10); security events feed; audit export + correlation + incident links; env-allowlist fallback removal (except bootstrap) — **gated on the passing production-safe lockout drill (12.4.5)**; security headers verification.
- **Tests:** MFA enrollment/verify; revocation immediacy; dual-approval flow; step-up expiry; header/CORS scans; **lockout-recovery drill executed and evidenced (12.4.5) before the env fallback is removed**.
- **Acceptance:** C-3/C-4 operations require step-up (+dual approval where mapped); revoked sessions are dead immediately; audit export matches filtered view.
- **Completion definition:** Section 10 implemented; security section of the control plane operational.

### PHASE 9 — Health / Incidents / Operations
- **Objective:** real operational tooling.
- **Dependencies:** Phase 2 (health probes), Phase 7 (usage for alert rules).
- **Deliverables:** incidents model + lifecycle UI (26.4); alert rules engine (26.5); job registry + queues decision + dead-letter handling (26.6); sync-failure → incident linking; maintenance windows (26.7).
- **Tests:** incident lifecycle tests; alert rule evaluation fixtures; job retry/dead-letter tests.
- **Acceptance:** a sev2 incident auto-opens from an alert rule and pages operators; failed jobs are visible, retryable, and dead-letter correctly.
- **Completion definition:** Troubleshooting/Incidents nav item live; jobs observable.

### PHASE 10 — Platform Intelligence / AI (broader AI platform)
- **Objective:** governed insights and the broader AI platform — built ON the Phase-2 AI security foundation, not duplicating it.
- **Dependencies:** Phase 2 (AI server-side identity/security foundation), Phase 7 (usage), Phase 9 (incidents for trends).
- **Deliverables:** AI interaction audit log + retention classification (28.1.3, 25.4.4); full AI quotas + cost tracking (28.1.4/28.1.5); model/prompt registry (28.2/28.3); metric rollups + Insights section (27); evidence-linked AI answers; AI analytics.
- **Tests:** AI audit/retention tests; quota/cost accounting tests; grounding provenance tests; rollup correctness tests; regression of the Phase-2 AI authorization fixes (client role/grounding still ignored).
- **Acceptance:** every AI call is logged with tokens/cost; AI quotas enforce with 429 + retry-after; insights render from rollups with layer labels; the Phase-2 authorization guarantees hold under the new AI surfaces.
- **Completion definition:** G-17 residual items (AI audit, cost tracking) resolved; Platform Insights nav item live.

### PHASE 11 — Developer / API Operations
- **Objective:** treat the API as a product.
- **Dependencies:** Phase 2 (correlation IDs), Phase 7 (quotas).
- **Deliverables:** API catalog generation + drift check (29.1); per-endpoint usage/latency views (29.2); platform service accounts (29.3); webhook analytics (29.5); sandbox environment (29.7.2).
- **Tests:** catalog drift CI check; service-account scope tests.
- **Acceptance:** Developer/API Operations nav item live; catalog matches code (CI-enforced).
- **Completion definition:** developer ops surface operational.

### PHASE 12 — Recovery / Maintenance
- **Objective:** safe operational recovery.
- **Dependencies:** Phase 8 (dual approval), Phase 9 (jobs).
- **Deliverables:** maintenance mode platform-wide; migration runner with dry-run; backup visibility (pending provider capability confirmation); restore/repair workflows (C-4); sync replay; cache invalidation; credential rotation runbooks.
- **Tests:** restore rehearsal on staging data; replay idempotency tests.
- **Acceptance:** every 30.1 capability either implemented or explicitly marked blocked-with-reason; destructive ones behind dual approval.
- **Completion definition:** Recovery/Maintenance nav item live.

### PHASE 13 — Business Owner Dashboard
- **Objective:** the first governed tenant dashboard per Part V doctrine.
- **Dependencies:** Phases 5/7/8 (identity, entitlements, security).
- **Deliverables:** registry entry; owner-scoped views consuming existing APIs; entitlement-aware feature visibility; no new administrative capability outside the catalog.
- **Tests:** authorization matrix (owner vs admin vs member); isolation tests; entitlement-gating tests.
- **Acceptance:** owner dashboard shows only owner-scoped data; every capability it uses exists in Section 7; audit rows flow through the standard model.
- **Completion definition:** dashboard registered and passing governance review.

### PHASE 14 — Remaining Specialized Dashboards
- **Objective:** Finance, HR, Operations, Support, Integration, AI, Developer views per doctrine.
- **Dependencies:** Phase 13 pattern established.
- **Deliverables:** per-dashboard registry entries + scoped capabilities; shared component library for governed views.
- **Acceptance:** each dashboard passes the Section 15 checklist; no duplicate admin screens.
- **Completion definition:** all registered dashboards live under the governance model.

### PHASE 15 — Full Platform Validation
- **Objective:** end-to-end proof.
- **Dependencies:** all phases.
- **Deliverables:** full acceptance matrix run (36.1) on production-like data; isolation sweep across all routes; performance budget verification (35.9); security validation (36.1 security row); documentation refresh.
- **Acceptance:** zero open sev1/sev2 gaps; all Definition-of-Done items evidenced; release gates of `docs/00_EIP_MASTER_SPEC.md` §108 satisfied for the control plane scope.
- **Completion definition:** validation report merged; spec gap map fully reconciled.

## 40. Current-State Gap Mapping

Status legend: **CONFIRMED** = verified in code during this audit (with reference) · **PARTIAL** = exists but incomplete · **RESOLVED-PRIOR** = previously reported, verified fixed · **OPEN** = needs work. IDs are referenced throughout this document.

### 40.1 Implemented (verified working)

| Area | Evidence |
|---|---|
| Single control plane at `/app/platform` with 9 sections, env-gated + server-verified | `apps/web/src/app/app/platform/page.tsx`; `platformAdminFromEnv` |
| Platform APIs: orgs list/status/settings/users CRUD/create, org stats, package get/assign/update/delete, metrics, flags, packs list/create, audit-logs, encryption migration | `apps/web/functions/api/v1/platform/*` |
| Real platform metrics (24h, live tables, platform org excluded) | `platform/metrics.ts` |
| Audit logging on: org create, org status, tenant settings changes, package create/update/delete, user create/update/deactivate, encryption migration | respective functions (`orgs/[id]/settings.ts`, `platform/packages/[id].ts`) |
| Credential encryption v2 (AES-256-GCM + HKDF master key, fail-closed) + migration with dry-run | `shared/encryption.ts`; `platform/security/migrate-encryption.ts` |
| Credential redaction in connector DTOs; pack-from-installation strips secrets | `shared/connectors.ts` |
| RBAC: fixed roles + custom roles, wildcard grammar, server-side evaluation | `shared/auth.ts` (`canByRole`, `checkPermission`) |
| Custom roles UI + assignment + role audit logs | `app/settings/custom-roles/*`; `custom_roles`, `role_audit_logs` |
| Multi-org: my-orgs, switch, child orgs, group summary | `orgs/my-orgs.ts`, `switch.ts`, `create-child.ts` |
| SSO: OAuth2 + SAML2 request/verify, provider config, linked users, test | `functions/api/v1/auth/sso/*`, `orgs/me/sso-providers/*` |
| Connectors: installations CRUD/test/sync, run-due, packs, templates, OpenAPI parse, autoscan probe (SSRF-guarded) | `functions/api/v1/connectors/*` |
| Ellinea Ask with grounding structure + template fallback | `functions/api/v1/ellinea/ask.ts` |
| Agents with executions, approvals (decide), audit logs, webhook triggers | `orgs/me/agents*` |
| Notifications: outbox/delivery, push subscriptions, policy, digests | `notifications/*`, `orgs/me/notify-policy.ts` |
| Workflow: approvals, rules, scheduled reports + history/resend | `workflows/*`, `orgs/me/approvals|rules|reports` |
| Dashboards/widgets/alerts/exports API | `dashboards/*` |
| Compliance: report, evidence pack, data-access log, exports | `orgs/me/compliance-*`, `data-access-log` |
| API keys (org-scoped, hashed, show-once) | `orgs/me/api-keys.ts` |
| Webhooks: secret, rotate, deliveries, retry, test | `orgs/me/webhook-*` |
| Rate limiting + violations recording | `shared/rate-limit.ts`, `rate_limit_violations` |
| Role-adaptive app shell with platformOnly nav gating | `app/app/layout.tsx` |
| Dark glass design system, Exo 2, responsive breakpoints | `super-admin.module.css`, `fonts/` |
| Validation scripts: verify-pages-functions, verify-data-layer, security-audit, perf-benchmark | `scripts/`, root `package.json` |

### 40.2 CONFIRMED gaps (this audit)

| ID | Gap | Evidence | Phase |
|---|---|---|---|
| G-05 | Health endpoint hardcoded `status:'ok'`; no DB/dependency probes; unauthenticated payload not yet minimized | `functions/api/v1/health.ts` | 2 |
| G-08 | Audit UI shallow: only action-prefix + fixed limit 100; backend supports orgId/from/to/offset but UI doesn't expose; no export | `page.tsx` `loadAudit` vs `platform/audit-logs.ts` | 2 |
| G-09 | Missing package edit/delete UI (API + endpoints + audit all exist: `updatePlatformPackage`/`deletePlatformPackage`, `platform/packages/[id].ts` writes `platform.package.update`/`platform.package.delete` audit rows); missing connector-pack management UI (`createPlatformConnectorPack` unused by UI; no update/publish/delete endpoints). Gap is UI/management completeness, NOT missing backend audit | `api.ts`; `platform/packages/[id].ts`; `platform/connector-packs.ts` | 3 |
| G-11 | Incomplete feature-flag architecture: hardcoded 6-flag catalog, JSON blob in synthetic platform org settings, no tenant flags/rollout/history | `platform/flags.ts` | 2/31 |
| G-12 | Missing audit on: feature-flag changes (`flags.ts` PATCH) and connector-pack creation (`connector-packs.ts` POST). Tenant settings changes are ALREADY audited (`orgs/[id]/settings.ts` inserts an `audit_logs` row [VERIFIED — this review]); package update/delete are ALREADY audited (`platform/packages/[id].ts` [VERIFIED — this review]) | `flags.ts` PATCH, `connector-packs.ts` POST | 2 |
| G-17 | AI endpoint: client `role` overrides JWT role; client-supplied `summary`/`memory`/`dna` grounding; no AI audit; no AI rate limit; no cost tracking. Authorization-critical core (server-derived identity/role/permission, server-side grounding, basic rate limiting) is scheduled EARLY (Phase 2); AI audit + cost tracking remain in Phase 10 | `ellinea/ask.ts` lines 224, 190–236 | 2 (core) / 10 (audit, cost) |
| G-18 | Platform-admin architecture = env allowlist only (`PLATFORM_ADMIN_EMAILS`); no DB-backed platform roles/staff | `shared/auth.ts` `platformAdminFromEnv`; identity `assertPlatformAdmin` | 4 |
| G-19 | CORS wildcard `access-control-allow-origin: *` on all function responses | `shared/auth.ts` AND `shared/errors.ts` (both verified — this review) | 2 |
| G-13 | Org creation non-transactional: manual best-effort delete rollback; partial-failure orphans possible | `platform/orgs/create.ts` | 5 |
| G-15 | Membership dual-track: `organization_memberships` written only by `create-child.ts` and `custom-roles/assign.ts`; register + platform user creation skip it — causes custom roles to silently fail for those users (`checkPermission` reads `organization_memberships.custom_role_id`) | membership write scan; `shared/auth.ts` `checkPermission` | 2 (moved early — precedes scoped operator permissions) |
| G-16 | Missing operator surfaces: Licensing/Entitlements, Usage/Quotas, Incidents/Troubleshooting, Platform Insights, Developer/API Operations, Recovery/Maintenance (nav items 5,6,10,12,15,16 of Section 6) | Section 6 table | 7/9/10/11/12 |
| G-20 | Org status model limited to active/suspended; no maintenance/archived/deleted; org settings as unstructured JSON | `platform/orgs/[id].ts`; `organizations.settings` | 5 |
| G-21 | No session revocation; JWT in localStorage; no MFA; no step-up | `shared/auth.ts`; `lib/api.ts` session handling | 8 |
| G-22 | No incidents/alerts/jobs/queues models or surfaces | repo scan | 9 |
| G-23 | No platform-wide search / command palette | repo scan | 3/10 |
| G-24 | No window-management system (single drawer only); no z-index/window-layer token system (16.3.3) | `super-admin.module.css` | 3/16 |

### 40.3 RESOLVED-PRIOR (verified fixed; keep regression tests)

| Prior finding | Status |
|---|---|
| G-01 package create payload mismatch | **done** — resolved in Phase 0 (`87ab44c`); re-verified 2026-09-22: `createPlatformPackage` in `apps/web/src/lib/api.ts` sends `displayName`, no `display_name` in the request body; contract test `package creation uses canonical displayName (G-01)` green |
| G-02 password-policy parity | **done** — resolved in Phase 0; authoritative policy is ≥8 (`PASSWORD_MIN_LENGTH` in `packages/shared/src/contracts/platform-users.contract.ts`); re-verified 2026-09-22 with the boundary tests `password minimum is authoritative 8 (spec 24.1)` + `Pages + NestJS password implementations conform to min 8`, and no `minLength: 6` / `length < 6` remains in `platform/orgs/create.ts` or `platform/orgs/[id]/users.ts` |
| G-06 duplicate/dead API exports | **done** — resolved in Phase 0 (`87ab44c`); re-verified 2026-09-22 by contract test `dead duplicate exports are gone (G-06)` (canonical exports preserved) |
| G-07 orphan platform.module.css | **done** — resolved in Phase 0 (`87ab44c`); re-verified 2026-09-22: no `*.module.css` exists under `apps/web/src/app/app/platform/` (the platform route styles live in `super-admin.module.css`) |
| G-14 platform user API contract split | **done** — resolved in Phase 0; re-verified 2026-09-22: Pages (`platform/orgs/[id]/users.ts`), NestJS (`platform.controller.ts` `@Query('userId')`) and the web client all use the `?userId=` query param (contract test `platform-user param style is query ?userId= (G-14)`), backed by the structural contract artifact + CI gate (§40.9.1 row 6) |

| Prior finding | Status |
|---|---|
| Synthetic `generateMockMetrics()` in Command Center | Removed; metrics now live [VERIFIED `platform/metrics.ts`] |
| Encryption key derived only from org ID; Base64 fallback | v2 master-key AES-256-GCM, fail-closed [VERIFIED `shared/encryption.ts`] |
| Unavailable telemetry rendered as fake | "Unavailable" states introduced in audit pass [VERIFIED `docs/47`] |
### 40.4 Technical debt (non-deployed services)

The `services/` tree contains modules flagged in `docs/47` (self-healing random health, failover simulation, NLU mock records) and many services not wired to the Pages runtime (api-gateway, integration-hub, knowledge-graph, federated-learning, predictive-analytics, self-healing, document-generation, email-intelligence, model-orchestrator, mock-idp, autonomous-agents). They are **not** part of the production control plane. Rule: they MUST NOT be presented as live capabilities; each is either (a) scheduled for integration in a later phase, or (b) marked dormant in the repository README. Prisma schema models without runtime usage (e.g., `FederatedLearningRound`, `RemediationPlaybook`) are forward-looking and MUST NOT back any UI claims.

### 40.5 Security gaps summary

G-02 (password parity), G-17 (AI client-controlled role/grounding — core fixes early in Phase 2), G-18 (env allowlist), G-19 (CORS, in both shared modules), G-21 (sessions/MFA/step-up), plus: bcrypt cost 8 trade-off (24.1), no security headers verification (24.7.5), audit metadata not yet sanitized at write (25.6), unaudited feature-flag changes and connector-pack creation (25.2), webhook-test SSRF controls not yet formalized (24.8.4), service-role isolation tests not yet formalized (33.2). All mapped to Phases 0/2/4/8/10.

### 40.6 Architectural gaps summary

Dual backend contracts (G-14 — structural contract validation in Phase 0), membership dual-track (G-15 — unified early in Phase 2), non-transactional onboarding (G-13), JSON-blob configuration for flags (G-11), status model limits (G-20), no job framework (G-22), schema parity untracked between Supabase and Prisma (33.1.1 — structural parity mechanism planned), synthetic `ellines-platform` org used as a settings carrier (20.7), retention policy without enforcement mechanisms (33.4). Mapped to Phases 0/2/5/9/31.

### 40.7 Future work (explicitly out of current scope)

Marketplace, digital twin, multi-company consolidation, native mobile apps, autonomous agent expansion, multi-region — per AGENTS.md out-of-scope list and `docs/00_EIP_MASTER_SPEC.md` §113. Listed here so they are consciously deferred, not forgotten.

### 40.8 Status classification of the gap map (reading guide)

The gap map above uses these classifications; every entry must remain true against current code:

- **IMPLEMENTED (verified)** — 40.1: all rows carry direct code evidence.
- **PARTIALLY IMPLEMENTED** — e.g., packages (create/update/delete API + audit exist; UI incomplete — G-09), audit (backend coverage broad and settings/package update/delete audited; flags/packs missing + UI shallow — G-08/G-12), connectors (installations full; pack lifecycle not — G-09/G-10).
- **MISSING** — incidents/jobs/queues (G-22), platform-wide search/palette (G-23), window manager (G-24), licensing/entitlements, usage/quota surfaces, developer ops, recovery/maintenance surfaces (G-16).
- **ARCHITECTURAL DEBT** — membership dual-track (G-15), dual-backend contract drift (G-14), non-transactional onboarding (G-13), JSON-blob flags (G-11), schema parity untracked (33.1.1), synthetic platform org as settings carrier (20.7).
- **SECURITY GAP** — password-policy mismatch (G-02), AI client-controlled role/grounding (G-17), env-allowlist platform admin (G-18), CORS wildcard (G-19), no session revocation/MFA/step-up (G-21), localStorage JWT + wildcard CORS as a combined temporary architecture (24.2.2), webhook-test SSRF (24.8.4), service-role trust boundary (33.2).
- **PLANNED** — everything marked [PLANNED] throughout the document; planned items MUST NOT be represented as existing.

Accuracy notes (verified this review): tenant settings audit is NOT missing; package update/delete audit is NOT missing; the remaining confirmed audit gaps are feature-flag changes and connector-pack creation. Password-policy ≥6 checks live in `platform/orgs/[id]/users.ts` (two checks) and `platform/orgs/create.ts` — not `orgs/me/users.ts`. CORS wildcard is present in both `shared/auth.ts` and `shared/errors.ts`.

### 40.9 Phase completion verification log (2026-09-22)

Purpose: record **what is actually done** in this specification, with evidence, so a phase is never marked done by assertion. Verified on branch `eip/phase-2-platform-control-plane` @ `1798868` (equal to `main` @ `1798868`). Every row can be re-checked by running the command or test it names.

#### 40.9.1 Phase 0 — Foundation / Repository Integrity: **done** (marked done 2026-09-22)

| # | Deliverable | Verified evidence |
|---|---|---|
| 1 | G-01 package payload mismatch | `createPlatformPackage` (`apps/web/src/lib/api.ts`) sends `displayName`; no `display_name` in the create body — contract test `package creation uses canonical displayName (G-01)` green |
| 2 | G-02 password-policy parity | `PASSWORD_MIN_LENGTH = 8` (`packages/shared/src/contracts/platform-users.contract.ts`); auth flows + `platform/orgs/create.ts` (`length < 8`) + `platform/orgs/[id]/users.ts` (`length < 8`) all enforce 8; no `minLength: 6` / `< 6` remains in the platform functions; boundary tests green |
| 3 | G-14 single platform user-API contract | Pages `platform/orgs/[id]/users.ts` + NestJS `platform.controller.ts` (`@Query('userId')`) + web client all use `?userId=`; no `:userId` path param — contract test green |
| 4 | G-06 dead duplicate API exports | Contract test `dead duplicate exports are gone (G-06)` green; canonical exports preserved |
| 5 | G-07 orphan `platform.module.css` | Absent: no `*.module.css` under `apps/web/src/app/app/platform/` |
| 6 | Structural contract validation (G-14 follow-up) | Artifact `packages/shared/src/contracts/platform-users.contract.ts`; tests `packages/shared/src/contracts/__tests__/platform-users.contract.spec.ts` (8 tests); CI gate `.github/workflows/test-coverage.yml` step **"Phase 0 contract validation gate"** (`npm run test -w @ellines-eip/shared -- --testPathPattern=contracts --runInBand`, `continue-on-error: false`) |

Phase-0 acceptance (Section 39): package creation works end-to-end from the UI; a 7-char password is rejected everywhere; an 8-char password is accepted everywhere; an intentionally divergent contract change fails CI; `npm run build:web` + `verify:pages-functions` pass — **all confirmed** (§40.9.4).

#### 40.9.2 Phase 1 — Master Specification: **done** (marked done 2026-09-22)

| # | Deliverable | Verified evidence |
|---|---|---|
| 1 | Reviewed spec prepared on `eip/phase-1-foundation` | `906bda6` "docs: complete phase 1 master specification review" (status/baseline/branch updated, version-history row corrected, Phase-0 fixes moved into 40.3, G-14 removed from 40.2) |
| 2 | Section 40 gap map re-verified against the Phase-0 baseline | §40.3 lists G-01/G-02/G-06/G-07/G-14 with resolutions; G-14 is no longer in the §40.2 confirmed-gap list |
| 3 | `docs/05_Build_Queue.md` seeded from Phase 2+ deliverables | `dd5a391` "docs: seed build queue from phase 2 roadmap" (phases 2–15) |
| 4 | Adoption (merge to `main`) | `1798868` "Merge eip/phase-1-foundation: complete phase 1 master specification review + seed phase 2 build queue" |

Phase-1 acceptance (Section 39): every remaining gap row has an owner phase (§40.2 Phase column); Phase-0-resolved gaps are no longer classified as open/confirmed; no `[PLANNED]` capability is represented as existing — **all confirmed**.

#### 40.9.3 Phase 2 scope re-verification: **done** (verified 2026-09-22 on `eip/phase-2-platform-control-plane`, shipped in `b1a9d43`)

| # | Phase-2 deliverable (Section 39) | State verified 2026-09-22 | Evidence pointer |
|---|---|---|---|
| 1 | Membership truth (G-15) | **open** — `organization_memberships` is still written only by `orgs/me/create-child.ts` and `orgs/me/custom-roles/assign.ts`; `auth/register.ts` and `platform/orgs/[id]/users.ts` still create users with **no** membership row, so `checkPermission` (`functions/shared/auth.ts`) cannot resolve their custom roles | G-15 (§40.2) |
| 2 | AI server-side identity/security (G-17 core) | **open** — client-supplied `role` still overrides the JWT role and client `summary`/`memory`/`dna` are still accepted as grounding (`functions/api/v1/ellinea/ask.ts` lines 224/232-234); no AI audit, no AI rate limit | G-17 (§40.2) |
| 3 | Baseline authentication hardening (24.4.1) | **done** — account lockout: 5 failed attempts within 15 minutes → 15-minute lock on the Pages `POST /api/v1/auth/login` endpoint (`functions/shared/lockout.ts`, `functions/api/v1/auth/login.ts`); identical policy in NestJS identity (`services/identity/src/auth/account-lockout.ts`), both keyed on normalized email (anti-enumeration, §24.3); Prisma `Session` model + migration `0003_phase2_session_registry` (`services/identity/prisma/schema.prisma`, `services/identity/prisma/migrations/0003_phase2_session_registry/migration.sql`); login associates issued tokens to session rows, logout revokes, `requireAuth` rejects revoked tokens, and a missing sessions table does **not** break authentication (transitional continue) — all tested: `apps/web/functions/api/v1/auth/__tests__/login-lockout.spec.ts` + `apps/web/functions/api/v1/auth/__tests__/session-registry.spec.ts` + `services/identity/src/auth/account-lockout.spec.ts` | 24.2.3, 24.4.1 |
| 4 | Audit contract (G-12 + row upgrade + C-0 events) | **open** — `platform/flags.ts` PATCH and `platform/connector-packs.ts` POST still write **no** `audit_logs` row; `auditRow()` (`functions/shared/auth.ts`) still carries only `organization_id/user_id/action/resource/metadata/ip` (no before/after, reason, result, correlation ID); no C-0 access-event mechanism | G-12 (§40.2); 25.1; 9.1.1 |
| 5 | Unified permission grammar (12.2) | **done** — `packages/shared/src/permissions.ts` defines a single canonical `<domain>[.<resource>...]:<action>` grammar + `matchPermission` + `firstInvalidGrant`, used by both the Pages Functions evaluator (`apps/web/functions/shared/auth.ts`) and the NestJS `PermissionService` evaluator (`services/identity/src/rbac/permission.service.ts`); invalid grants fail closed (null / no match); existing fixed-role + custom-role wildcard semantics are a strict subset (backward compatible); G-15 regression coverage exercised by `apps/web/functions/shared/auth.spec.ts` + isolation `auth.spec.ts` 2xx/403 coverage | 12.2; auth.spec.ts; isolation.spec.ts |
| 6 | Tenant-isolation test suite as a release gate (36.1) | **done** — `apps/web/functions/__tests__/isolation.spec.ts` is a parameterized cross-tenant / negative-authorization / synthetic-org suite (192 lines) exercising every auth endpoint + every platform write + role/grant/editor flows for both tenants; `apps/web/functions/shared/auth.spec.ts` adds a dedicated authorization-regression + G-15-coverage section; the CI gate `.github/workflows/test-coverage.yml` runs the **full** `@ellines-eip/web` Pages Functions suite (`npm run test -w @ellines-eip/web`, `continue-on-error: false`) **and** an explicit `isolation.spec.ts` execution step (`--testPathPattern=isolation.spec.ts --runInBand`, `continue-on-error: false`); any isolation failure fails the job | 36.1; 33.2; 20.7 |
| 7 | Control-plane structural fixes (G-08, G-05, G-19) | **partial — 2 of 3 done** — G-05 (health-probe DB failure injection): `GET /api/v1/health` reports minimized `status: 'down'` when the database probe fails, and `GET /api/v1/platform/health/summary` reports `down` database + `degraded` email — tested in `apps/web/functions/api/v1/health.spec.ts`; G-19 (CORS matrix incl. preflight): `_middleware.ts` enforces an `allowed_origins` allowlist with per-request origin reflection, never `Access-Control-Allow-Origin: *`, and preflight (OPTIONS) returns `204` with correct headers — tested in `apps/web/functions/__tests__/cors.spec.ts`; G-08 (audit UI depth/export) remains **open** | G-05/G-08/G-19 (§40.2) |

#### 40.9.4 Verification commands run (all green, 2026-09-22)

```bash
npm run build:shared                    # tsc for shared, connectors-sdk, ellinea-ai, ellinea-sdk — pass
npm run build -w @ellines-eip/web       # Next.js production build (static export) — pass
npm run build -w @ellines-eip/identity  # prisma generate + nest build — pass
npm run verify:pages-functions          # "Pages Functions import check OK (165 files, 221 relative imports)."
npm run verify:data-layer               # all checks passed (env, Prisma, Docker, Neo4j, InfluxDB, Redis)
npm run test -w @ellines-eip/shared     # 4 suites / 91 tests passed (includes the Phase-0 contract suite)
npm run test -w @ellines-eip/shared -- --testPathPattern=contracts --runInBand   # CI-gate equivalent — 8/8 passed
npm run test -w @ellines-eip/identity   # 17 suites / 262 tests passed (incl. account-lockout.spec.ts)
npm run test -w @ellines-eip/web        # 8 suites / 64 tests passed (incl. isolation.spec.ts, login-lockout.spec.ts, session-registry.spec.ts, cors.spec.ts, health.spec.ts)
git diff --check                         # no whitespace/formatting errors
```

##### 40.9.4.1 Phase 2 partial verification (branch `eip/phase-2-platform-control-plane`, commit `0fe82b2`)

Phase 2 completion definition: G-05/G-08/G-12/G-15/G-19 resolved; G-17 core authorization/grounding/rate-limit fixes resolved; membership truth unified; audit contract enforced by tests; tenant-isolation suite green and merge-gating.

| Check | Result | Evidence |
|---|---|---|
| Account lockout (Pages Functions) | pass — 7/7 | `apps/web/functions/api/v1/auth/__tests__/login-lockout.spec.ts` |
| Account lockout (NestJS identity) | pass — 7/7 | `services/identity/src/auth/account-lockout.spec.ts` |
| Session registry groundwork | pass — 6/6 | `apps/web/functions/api/v1/auth/__tests__/session-registry.spec.ts` |
| Unified permission grammar | pass — 35/35 | `packages/shared/src/__tests__/phase2-grammar-lockout.spec.ts` |
| Auth authorization regression + G-15 coverage | pass — see auth.spec.ts | `apps/web/functions/shared/auth.spec.ts` §G-15 |
| Tenant isolation suite | pass — 192 lines, all cases | `apps/web/functions/__tests__/isolation.spec.ts` |
| Health-probe DB failure injection | pass — 4/4 | `apps/web/functions/api/v1/health.spec.ts` |
| CORS matrix incl. preflight | pass — 9/9 | `apps/web/functions/__tests__/cors.spec.ts` |
| CI isolation gate (test-coverage.yml) | pass — full web suite + explicit isolation.spec.ts | `.github/workflows/test-coverage.yml` |
| G-15 authorization regression (auth.spec.ts 2xx/403) | pass — cross-tenant + negative-authorization coverage | `apps/web/functions/shared/auth.spec.ts` |

Phase 2 remains `next` in `docs/05_Build_Queue.md`: G-15 (membership truth), G-17 (AI server-side identity/grounding), G-12 (audit contract), and G-08 (audit UI depth/export) are still open.

## 41. Acceptance Criteria for This Specification

This specification is complete when all of the following are true (checked against the document itself):

1. Describes what EIP is (§1) and is not (§2).
2. Defines client-system boundaries and the non-replacement principle (§3).
3. Defines the eight-class data ownership taxonomy (§4).
4. Defines the single platform control plane and target navigation (§5–6).
5. Defines the full capability catalog with purpose/actors/data/APIs/audit/security/failure/dependencies/acceptance (§7).
6. Defines God Mode as governed capability classes with a safeguard matrix and operation mapping (§8–9).
7. Defines elevated authentication, dual approval, break-glass (§10).
8. Defines the internal staff/delegation model with roles, grammar, scopes, DB-backed admin storage (§11–13).
9. Defines cross-dashboard governance doctrine and anti-silo rules (§14–15).
10. Defines the glass/window UI system with honesty requirements (§16).
11. Defines the Command Center with refresh/freshness/unavailable semantics (§17).
12. Defines search and command palette under permission control (§18).
13. Defines accessibility and responsive requirements (§19).
14. Defines tenant lifecycle, isolation, deletion/retention (§20).
15. Defines the connector platform end-to-end including credentials, lifecycle, SoT declarations (§21).
16. Defines licensing/packages/entitlements vocabulary and model (§22).
17. Defines usage/quotas mechanics and enforcement (§23).
18. Defines security architecture incl. sessions, MFA, secrets, CORS (§24).
19. Defines the audit contract, coverage, retention, secret-exclusion (§25).
20. Defines health/incidents/jobs/maintenance operations (§26).
21. Defines platform insights with the four-layer distinction (§27).
22. Defines AI governance incl. verified gap fixes (§28).
23. Defines developer/API operations (§29).
24. Defines recovery/maintenance with safeguards (§30).
25. Defines feature-flag/configuration architecture incl. JSON policy (§31).
26. Defines notification classes and rules (§32).
27. Defines data architecture incl. membership truth and retention table (§33).
28. Defines API/backend standards (§34).
29. Defines reliability/performance budgets (§35).
30. Defines testing/validation requirements incl. isolation and real-data acceptance (§36).
31. Defines the 14 permanent dashboard development rules + Definition of Done (§37).
32. Defines the no-fake-data rule (§38).
33. Defines Phases 0–15 with objective/dependencies/deliverables/tests/acceptance/completion (§39), with early foundation phases (identity/membership truth, AI server-side authorization, baseline auth hardening, audit contract, isolation tests) preceding advanced platform features (§28 preamble, §33.1.2, §24.4.1).
34. Maps current repository state: implemented / confirmed gaps / resolved-prior / debt / security / architecture / future (§40) — every CONFIRMED row carries code evidence, with the status-classification reading guide (§40.8).
35. Contains measurable acceptance criteria throughout and a self-check list (this section).
36. Does not depend on fake data anywhere (§38 governs all planned features), including the silent-fallback prohibition (§38.6).
37. Does not duplicate existing platform architecture unnecessarily — evolution of `/app/platform` is mandated (§5), with measurable single-page split triggers (§6.2) and Register Business classified as an action (§6.4, §20.8).
38. Defines the C-0 access-event contract as distinct from the mutation audit contract (§9.1.1) and the secret-rotation classification table (§9.5).
39. Defines the unified canonical permission grammar with explicit wildcard semantics covering tenant and platform permissions (§12.2).
40. Defines the data-protection requirements incl. Kenya DPA 2019 support posture (§33.4.1), retention-enforcement ownership (§33.4), RPO/RTO framework (§30.3), onboarding/slug security (§20.6), synthetic-org handling (§20.7), the three-tier health payload boundary (§26.1.3), webhook-test SSRF rules (§24.8.4), the operator session-management surface (§24.9), concurrency/conflict rules (§33.5.3), notification phase ownership (§32.2), the break-glass lockout drill gate (§12.4.5), structural contract/parity validation (§33.1.1, Phase 0), and version history (§0.5).

## 42. Glossary (control-plane terms)

| Term | Meaning |
|---|---|
| Control plane | The Super Admin surface + its APIs that operate EIP itself |
| God Mode | The governed set of privileged platform operations (Part III) |
| Operation class | C-0..C-5 safeguard tier (§9.1) |
| Operator | An internal Ellines staff member with platform grants |
| Tenant / Organization | A client business onboarded to EIP |
| Package | Commercial bundle (currently `rate_limit_tiers`) |
| Entitlement | Resolved feature right for a tenant |
| Connector pack | Reusable, publishable connector installation template |
| Installation | A tenant's configured connector instance |
| UEM | Universal Enterprise Model — EIP's normalized entity model |
| SoT declaration | Per-connector statement of what is authoritative and writable |
| Step-up | Re-authentication required for C-3/C-4 operations |
| Dual approval | Second-operator approval for high-risk operations |
| Break-glass | Owner-only emergency path bypassing dual approval, fully audited |

---

*End of specification. This document was produced by documentation work only — no application code was modified in this change set.*
