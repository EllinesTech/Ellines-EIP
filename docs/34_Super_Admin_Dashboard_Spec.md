# Ellines EIP — Super Admin Control Plane Specification

**Version:** 2.0  
**Status:** Canonical SuperAdmin UX/control specification  
**Route:** `/app/platform`  
**Access:** Platform Super Admin only  
**Acceptance status:** §16 — verified against code 2026-09-22 (11 met · 3 partial · 1 not met)

## 1. Purpose

The Super Admin Control Plane is the operator console for **Ellines EIP itself**.

It is intentionally different from every business dashboard.

A business dashboard answers: **“How is this business operating?”**

The Super Admin console answers:

- Is EIP operating correctly?
- Which businesses are onboarded?
- Which businesses are active, suspended, or disconnected?
- What service package does each business have?
- Who has access?
- What needs troubleshooting?
- What configuration/features are enabled?
- What privileged actions happened?
- Which customer integrations require intervention?
- What platform-level capacity, security, usage, and reliability issues exist?

## 2. Connector boundary

Customer connectors must **not** be presented as EIP infrastructure.

EIP must operate without any customer connector.

Connectors exist because an onboarded business needs EIP to interact with that business's systems.

Therefore:

- **Do not place Connectors as a primary Command Center KPI.**
- **Do not define platform health from connector availability.**
- **Do not require a connector for EIP startup, authentication, tenant administration, audit, or core platform operation.**
- Connector templates/packs belong under **Business Services / Integration Catalog**.
- SuperAdmin may inspect, troubleshoot, disconnect, revoke, or publish business integrations when authorized.

## 3. Primary navigation

### Platform
1. **Command Center**
2. **Businesses**
3. **Register Business**

### Commercial
4. **Service Packages**
5. **Licensing / Entitlements**
6. **Usage / Quotas**

### Control
7. **Access & Control**
8. **System Health**
9. **Security & Audit**
10. **Troubleshooting / Incidents**

### Intelligence
11. **Ellinea AI**
12. **Platform Insights**

### System
13. **Feature Controls**
14. **Platform Configuration**
15. **Developer / API Operations**
16. **Recovery / Maintenance**

Customer connector administration is accessed from the relevant business or Service Catalog, not from the EIP core-health navigation.

## 4. Command Center

The first screen must focus on EIP platform operation.

### Core KPIs

- businesses onboarded;
- active businesses;
- suspended/disconnected businesses;
- total tenant users;
- platform availability;
- service health;
- API latency;
- background-job health;
- failed jobs;
- security alerts;
- pending operator actions;
- current usage/capacity.

### Business lifecycle summary

Show:

- newly registered;
- active;
- suspended;
- disconnected;
- onboarding/incomplete;
- package assigned/unassigned.

### Platform health

Platform health must come from real platform telemetry.

Never use:

- random values;
- fake percentages;
- fake latency;
- synthetic incidents;
- fabricated predictive forecasts.

Unavailable telemetry must be explicitly displayed as **Unavailable** or **Not connected**.

## 5. Business control

SuperAdmin must be able to:

- register a business;
- create its initial owner;
- inspect tenant identity;
- inspect tenant users;
- assign/change service package;
- change tenant settings;
- activate;
- suspend;
- disconnect;
- reconnect;
- inspect usage;
- inspect integration status;
- inspect recent activity;
- inspect audit history;
- troubleshoot the tenant.

### Disconnect behavior

Disconnect/suspend should be reversible where possible.

The normal control plane must not expose irreversible hard deletion without a separate destructive workflow with:

- explicit reason;
- confirmation;
- audit event;
- dependency checks;
- recovery/backup consideration;
- elevated re-authentication;
- optional dual approval.

## 6. Service packages

SuperAdmin must manage commercial capability packages.

A package may define:

- maximum users;
- maximum integrations;
- API request limits;
- burst limits;
- export limits;
- SSO;
- custom roles;
- autonomous agents;
- advanced BI;
- webhooks;
- support priority;
- pricing;
- custom overrides.

A package can be assigned to an onboarded business.

Package changes must be audited.

## 7. Business Service / Integration Catalog

This is where customer-facing integration offerings belong.

SuperAdmin may:

- publish connector/service templates;
- maintain reusable integration packs;
- version templates;
- inspect installation compatibility;
- troubleshoot customer integrations;
- disconnect/revoke a business integration;
- publish or unpublish a service offering.

This area must never be confused with EIP platform health.

## 8. Access & Control

SuperAdmin must be able to inspect and control tenant users:

- list users;
- create users;
- activate/deactivate users;
- change roles;
- reset credentials through the approved secure flow;
- inspect recent access activity.

Every privileged change is audited.

## 9. Security & Audit

Provide a cross-business audit center with:

- actor;
- business;
- action;
- resource;
- timestamp;
- IP/security metadata where permitted;
- reason/reference where required;
- before/after metadata where appropriate.

Support filtering by:

- business;
- actor;
- action;
- resource;
- date range;
- security severity.

## 10. Troubleshooting

Provide a dedicated operator troubleshooting workspace.

It should correlate:

- platform health;
- tenant status;
- service package;
- user/access failures;
- integration health;
- recent events;
- audit activity;
- failed jobs;
- error signatures;
- incident history.

AI may summarize evidence, but it must not invent evidence or silently perform privileged actions.

## 11. Feature controls

SuperAdmin may enable/disable global feature flags.

Every change must:

- require platform authorization;
- be auditable;
- show current state;
- show impact/description;
- avoid silently changing tenant permissions.

## 12. System configuration

SuperAdmin controls platform-wide settings and selected tenant-level administrative settings.

Examples:

- feature flags;
- date/time defaults;
- service configuration;
- quotas;
- rate limits;
- notification configuration;
- maintenance controls;
- release configuration.

## 13. Modern UX requirements

The console should feel like a high-end platform operations center:

- dense but readable information hierarchy;
- responsive layout;
- keyboard accessible;
- dark/light/high-contrast support where appropriate;
- clear severity states;
- live refresh where authoritative telemetry exists;
- drill-down instead of information overload;
- command/search capability;
- persistent context for selected business;
- safe destructive-action flows;
- no fake data.

## 14. Control philosophy

SuperAdmin is **not** another business dashboard with more permissions.

It is the **EIP platform operating console**.

Business dashboards operate business data.

SuperAdmin operates:

**Platform → Businesses → Services → Access → Security → Configuration → Recovery.**

## 15. Acceptance criteria

The SuperAdmin implementation is accepted only when:

- EIP works without customer connectors;
- Command Center focuses on platform performance and lifecycle;
- business registration works;
- business activation/suspension/disconnection works;
- package creation and assignment work;
- tenant user administration works;
- feature flags can be controlled;
- global audit is searchable;
- system health uses real telemetry;
- customer integrations are clearly separated from EIP infrastructure;
- privileged actions are audited;
- no dashboard telemetry is fabricated;
- destructive operations have safeguards;
- UI works on desktop and mobile;
- build/type-check/tests pass.

## 16. Acceptance-criteria status (verified 2026-09-22)

Verified against `main` @ `1798868` (branch `eip/phase-2-platform-control-plane`). This section does not change the criteria in §15 — it records **what is done today**, so the criteria stay the acceptance bar. Roadmap ownership and the full verification log live in `docs/ELLINES_EIP_SUPER_ADMIN_GOD_MODE_MASTER_SPECIFICATION.md` (§39, §40.9): Phases 0–1 of that roadmap are **done**; Phase 2 is `next`.

Status legend: **met** = verified working in code today · **partial** = works but incomplete (owning phase + gap id given) · **not met** = verified missing.

| # | Acceptance criterion (§15) | Status | Evidence / gap |
|---|---|---|---|
| 1 | EIP works without customer connectors | met | Auth, tenant administration, audit and platform APIs run with no connector installed (master spec §40.1) |
| 2 | Command Center focuses on platform performance and lifecycle | met | Command Center section of `apps/web/src/app/app/platform/page.tsx`; real 24h metrics from `platform/metrics.ts` (platform org excluded); lifecycle/business table. Deeper health telemetry is G-05 (Phase 2) |
| 3 | Business registration works | met | `createPlatformOrg` (`lib/api.ts`) → `platform/orgs/create.ts` (org + optional owner) |
| 4 | Business activation/suspension/disconnection works | met | `platform/orgs/[id].ts` PATCH `status: active\|suspended` via `updatePlatformOrgStatus`; audited as `platform.org.status` |
| 5 | Package creation and assignment work | met | Creation fixed in Phase 0 (G-01): `platform/packages.ts` reads `displayName`, the client sends `displayName` (contract test green); assignment via `platform/orgs/[id]/package.ts`. Edit/delete UI is still missing (G-09, Phase 3) |
| 6 | Tenant user administration works | met | `platform/orgs/[id]/users.ts` list/create/update/deactivate with ≥8-character password parity (G-02 resolved) |
| 7 | Feature flags can be controlled | met | `platform/flags.ts` PATCH + `updatePlatformFlag` client helper. Audit of flag changes is still missing (G-12, Phase 2) |
| 8 | Global audit is searchable | **partial** | Only action-prefix + fixed `limit: 100` today; the backend supports `orgId`/`from`/`to`/`offset` but the UI does not expose them, and there is no export (G-08, Phase 2) |
| 9 | System health uses real telemetry | **not met** | `functions/api/v1/health.ts` still returns a hardcoded `status: 'ok'` with no DB/dependency probe and the three-tier payload boundary (G-05, Phase 2) |
| 10 | Customer integrations are clearly separated from EIP infrastructure | met | §2 of this document is implemented in the UI copy ("Tenant diagnostics — not EIP core infrastructure") and in the navigation model |
| 11 | Privileged actions are audited | **partial** | Audited: org create/status, tenant settings, package create/update/delete, user create/update/deactivate, credential-encryption migration. Not audited yet: feature-flag changes, connector-pack creation (G-12, Phase 2). Reason/before-after fields are Phase 2/3 |
| 12 | No dashboard telemetry is fabricated | met | No mock/random generators remain; unavailable telemetry renders as unavailable, with the silent-fallback prohibition (master spec §38) |
| 13 | Destructive operations have safeguards | **partial** | Confirmation prompts exist (suspend/reconnect, encryption migration); the safeguard matrix, reason capture and dual approval are Phase 3/8 |
| 14 | UI works on desktop and mobile | met | Responsive breakpoints in `super-admin.module.css`; keyboard-accessible controls (master spec §40.1) |
| 15 | Build/type-check/tests pass | met | Verified 2026-09-22: `build:shared`, `build -w @ellines-eip/web`, `build -w @ellines-eip/identity`, `verify:pages-functions` (151 files, 188 imports), shared tests 37/37 incl. the Phase-0 contract gate (master spec §40.9.4) |

Rows 8, 9 and 11 are the reason the Super Admin console is **not yet accepted** under §15; each is owned by Phase 2 of the master-specification roadmap (`docs/05_Build_Queue.md` P2).

