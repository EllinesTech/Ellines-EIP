# EIP Super Admin Control Plane — Requirements

**Spec:** eip-super-admin-control-plane-evolution  
**Baseline commit:** `c64f97d` (main, 2026-09-24)  
**Status model:** Verified | Implemented | In Progress | Planned | Blocked | Broken | Needs Audit

---

## 1. Business Goals

Ellines EIP is an enterprise integration platform that sits above client systems (ERP, CRM, HIS, HR, Finance, etc.).
The Super Admin control plane is the primary surface through which Ellines operators manage:

- Their own internal organization and operations
- All client organizations (onboarding, packages, users, integrations, health, billing)
- The EIP platform itself (health, security, configuration, audit)
- Ellinea AI capabilities

The control plane must support hundreds of client organizations without degrading in clarity, performance, or security.
It must enforce commercial entitlements (package limits, connector slots, feature flags) server-side — not just in the UI.
It must never expose one client's data to another client or to a lower-privileged actor.

---

## 2. Audit Status of Existing Capabilities

The following reflects code evidence from `c64f97d`. Historical "done" labels are not trusted.

### 2.1 Navigation

| Capability | Status | Evidence |
|---|---|---|
| Single nav source of truth (`app-navigation.ts`) | **Verified** | File exists, enforced by `app-navigation.spec.ts` contract |
| Four Super Admin groups (ELLINES ORG / CLIENT ORGS / PLATFORM / ELLINEA) | **Implemented** | Defined in `app-navigation.ts`; runtime not verified |
| No second sidebar rail | **Implemented** | Architecture enforced in nav file; needs visual regression confirmation |
| Reserved items use `available: false` with honest "Planned" state | **Implemented** | Present in nav file |
| Keyboard navigation / ARIA | **Needs Audit** | Not verified in shell component |

### 2.2 Connector Governance

| Capability | Status | Evidence |
|---|---|---|
| `connector:install` requires platform admin | **Broken** | `FIXED_ROLE_PERMISSIONS` gives `admin` role `connector:*`; no `platformAdminFromEnv` check in `installations.ts` |
| `max_connectors` enforced server-side before insert | **Broken** | `POST /api/v1/connectors/installations` inserts without checking the org's package limit |
| Connector credentials encrypted at rest | **Broken** | `encrypt()` from `shared/encryption.ts` is never called in `installations.ts` or `installations/[id].ts` — config stored as plaintext JSON |
| Client IT read-only view of integrations | **Needs Audit** | No dedicated client-IT-scoped integrations endpoint or UI confirmed |
| Integration request workflow (client IT → Super Admin) | **Planned** | No implementation found |

### 2.3 Encryption & Secrets

| Capability | Status | Evidence |
|---|---|---|
| AES-256-GCM + HKDF encryption infrastructure | **Verified** | `shared/encryption.ts` — full implementation with v1 migration path |
| Database config credentials encrypted | **Verified** | `orgs/me/database-config.ts` calls `encrypt()` before write |
| Connector installation credentials encrypted | **Broken** | `installations.ts` stores `config` object directly with no encryption call |
| Encryption migration endpoint | **Implemented** | `platform/security/migrate-encryption.ts` exists; covers `database_configurations` only |
| Secret redaction in API responses | **Implemented** | `toInstallationDto()` in `shared/connectors.ts` (redaction needs audit) |

### 2.4 Scheduler / Real-time Sync

| Capability | Status | Evidence |
|---|---|---|
| Continuously running background sync | **Broken** | `wrangler.toml` explicitly comments out cron triggers; sync fires only when user opens Connectors page |
| On-demand sync (`POST /api/v1/connectors/run-due`) | **Implemented** | Route exists |
| Cloudflare Cron Trigger integration | **Planned** | Not configured |
| Event/webhook push from client systems | **Implemented** | `webhooks/enterprise.ts` exists; HMAC verification needs audit |
| Private-network connector agent / tunnel | **Planned** | No implementation |

### 2.5 Platform Health & Metrics

| Capability | Status | Evidence |
|---|---|---|
| Platform health endpoint (`/api/v1/health`) | **Verified** | Route + spec exist |
| Platform health summary (`platform/health/summary.ts`) | **Implemented** | Route exists |
| Platform metrics (`platform/metrics.ts`) | **Implemented** | Route exists |
| Real Command Center dashboard with live data | **Needs Audit** | `platform/page.tsx` imports `fetchPlatformMetrics`; whether metrics are real DB queries needs verification |

### 2.6 Package / Entitlement Model

| Capability | Status | Evidence |
|---|---|---|
| Package definition with `max_connectors`, `max_users`, feature flags | **Verified** | `rate_limit_tiers` table and `platform/packages.ts` confirmed |
| Assign package to org (`platform/orgs/[id]/package.ts`) | **Implemented** | Route exists |
| Package limits enforced at runtime | **Broken** | No enforcement in connector install path; `max_users` enforcement also unconfirmed |
| Package-aware client workspace display | **Implemented** | Client workspace in `platform/page.tsx` shows tier data |

### 2.7 Audit Logging

| Capability | Status | Evidence |
|---|---|---|
| Audit log writes on key actions | **Implemented** | `auditRow()` called in multiple endpoints |
| Platform audit log query (`platform/audit-logs.ts`) | **Implemented** | Route exists |
| Before/after state captured in audit records | **Needs Audit** | `auditRow()` signature does not mandate before/after; needs review |
| Client-specific audit view in workspace | **Implemented** | `client-audit` section in `platform/page.tsx` |

### 2.8 User Management

| Capability | Status | Evidence |
|---|---|---|
| Client org user list (`platform/orgs/[id]/users.ts`) | **Implemented** | Route exists |
| Ellines internal user management | **Needs Audit** | No dedicated internal-staff management surface confirmed separate from org admin |
| Role-based access per org | **Implemented** | `FIXED_ROLE_PERMISSIONS` in `shared/auth.ts` |
| Custom roles | **Implemented** | `orgs/me/custom-roles/` routes exist |
| User separation (internal vs client) | **Needs Audit** | `admin/page.tsx` exists; whether it correctly excludes client-org users is unconfirmed |

---

## 3. User Stories

### 3.1 Super Admin — Connector Governance

**US-CG-01:** As a Super Admin, I can install a connector for a specific client organization so that the client's systems are integrated with EIP.

**Acceptance criteria:**
- `POST /api/v1/connectors/installations` requires `platformAdminFromEnv` check before proceeding
- The request includes a target `organizationId` parameter (not just the authenticated org)
- Connector credentials submitted in the request body are encrypted with `encrypt()` before database write
- The installed connector is associated with the target client org, not the Ellines operator org

**US-CG-02:** As a Super Admin, I cannot install more connectors than the client's package allows.

**Acceptance criteria:**
- Before insert, the API counts active installations for the org and compares against `rate_limit_tiers.max_connectors`
- If `current_count >= max_connectors` (and `max_connectors` is not null), the API returns HTTP 422 with message "Connector limit reached for this organization's package"
- This check is performed inside the same database transaction as the insert
- The UI reflects the used/allowed count accurately, sourced from the API

**US-CG-03:** As a Super Admin, I can view all integrations for a client organization, including their health, last sync time, and credentials status.

**Acceptance criteria:**
- Integration list shows: name, catalog type, status, last sync, next sync, credential expiry indicator
- No credential values are exposed in the response — only masked indicators
- Data comes from real database queries, not hardcoded values

**US-CG-04:** As a client IT administrator, I can view the integrations connected to my organization but I cannot modify them.

**Acceptance criteria:**
- A client org `admin` role can read connector installations for their org
- A client org `admin` role cannot call `POST`, `PATCH`, `DELETE` on connector installation endpoints
- The UI for client IT shows integrations as read-only with a "Request integration" action

**US-CG-05:** As a client IT administrator, I can submit an integration request to Ellines.

**Acceptance criteria:**
- A request form captures: target system, purpose, requested by
- The request creates a record visible in the Super Admin's queue
- The client IT user sees status: Pending / Approved / Rejected

### 3.2 Super Admin — Entitlement Enforcement

**US-EN-01:** As a Super Admin, I can assign a service package to a client organization.

**Acceptance criteria:**
- `PUT /api/v1/platform/orgs/:id/package` requires platform admin
- Package assignment is recorded in `organization_tiers` (or equivalent)
- Audit log entry is written with before/after package state

**US-EN-02:** As the platform, I enforce package entitlements at the API layer for all capability-gated operations.

**Acceptance criteria:**
- `max_connectors` — enforced in connector install endpoint
- `max_users` — enforced in org user invite/create endpoint
- `enable_sso` — enforced in SSO provider create endpoint
- `enable_custom_roles` — enforced in custom role create endpoint
- `enable_agents` — enforced in agent create/trigger endpoint
- All checks return HTTP 422 with a clear entitlement-exceeded message

### 3.3 Super Admin — Client Organization Workspace

**US-CW-01:** As a Super Admin, I can open a client organization's workspace from the Client Portfolio and see a complete overview of that client.

**Acceptance criteria:**
- Client Overview shows: org status, package name, users (used/allowed), integrations (used/allowed), health, last activity — all from real data
- Workspace uses breadcrumbs and a client header; no second sidebar is introduced
- Navigation within the workspace uses tabs: Overview | People & Access | Services & Entitlements | Integrations | Health | Usage | Activity | Audit | Configuration

**US-CW-02:** As a Super Admin, I can manage a client's users from within that client's workspace.

**Acceptance criteria:**
- User list is scoped to the selected client org only
- No Ellines internal users appear in this list
- Actions: view, change role, deactivate, reset password (all platform-admin gated)

### 3.4 Super Admin — Command Center

**US-CC-01:** As a Super Admin, the Command Center shows a real-time overview of all clients, integrations, and platform health.

**Acceptance criteria:**
- Client counts (active, onboarding, suspended, at-risk) come from database queries
- Integration counts (total, healthy, degraded, failed) come from real connector installation + health data
- Platform health status reflects actual service health probes
- No hardcoded or fabricated values appear on this surface
- "At-risk" clients are identified by a real rule (e.g., degraded connectors > N, or no activity for > N days)

### 3.5 Security

**US-SEC-01:** As the platform, all outbound connector HTTP requests use a single shared SSRF-safe egress policy.

**Acceptance criteria:**
- One function (`safeConnectorFetch` or equivalent) handles all outbound connector HTTP
- Private IP ranges, localhost, cloud metadata endpoints, and non-HTTPS URLs are rejected before the request is made
- All connector sync, test, and proxy paths call this function — no direct `fetch()` of user-supplied URLs elsewhere

**US-SEC-02:** As the platform, inbound webhook payloads are verified before processing.

**Acceptance criteria:**
- `webhooks/enterprise.ts` and `webhooks/inbound.ts` verify HMAC signature on every request
- Requests without a valid signature return HTTP 401 — no partial processing occurs
- Timestamp/nonce replay prevention is applied (reject payloads older than 5 minutes or with a seen nonce)

**US-SEC-03:** As the platform, all connector credentials are encrypted at rest.

**Acceptance criteria:**
- `installations.ts` POST path calls `encrypt()` for every credential field before database write
- `installations/[id].ts` PATCH path re-encrypts updated credential fields
- `migrations/migrate-encryption.ts` covers `connector_installations.config` credential fields
- No credential plaintext appears in database rows, logs, or API responses

### 3.6 Scheduler / Real-time

**US-SCHED-01:** As a Super Admin, I can see an accurate representation of connector sync frequency and understand that it is currently on-demand, not continuous.

**Acceptance criteria:**
- The connector workspace shows "Sync mode: On-demand" until a cron trigger is configured
- No UI copy claims "real-time" or "automatic" sync while the cron trigger is absent
- When a Cloudflare Cron Trigger is configured, the UI updates to show the schedule

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Tenant isolation** | Every API endpoint that reads/writes tenant data must filter by `organization_id`. Cross-tenant access is a P0 defect. |
| **Entitlement enforcement** | All package-gated capabilities must be blocked server-side, not just hidden in the UI. |
| **Credential security** | All connector credentials must be encrypted at rest using AES-256-GCM. No plaintext credential storage. |
| **Audit completeness** | Every privileged platform action must produce an audit log entry with actor, timestamp, action, resource, and metadata. |
| **Performance** | Platform dashboard and client portfolio must load initial data within 2 seconds on a standard connection. Pagination is required for lists > 50 items. |
| **Accessibility** | Navigation must be keyboard-navigable. All interactive controls must have accessible labels. Colour is not used as the sole status indicator. |
| **No fake data** | Zero hardcoded metric values on any production surface. Placeholder states are acceptable for genuinely absent data. |
| **Build integrity** | TypeScript strict mode; zero `// @ts-ignore` without explanation; build must pass before any merge. |

---

## 5. Out of Scope for This Spec

The following are explicitly deferred and must not be implemented during this evolution:

- Native iOS / Android mobile apps
- Marketplace / connector marketplace
- Digital twin
- Multi-company consolidation (v1.1+)
- Autonomous AI agents operating without human approval
- Billing / payment processing integration (structure only, no payment gateway)
- Private-network connector agent / Cloudflare Tunnel bridge (architecture only in this spec; implementation is a separate queue item)
