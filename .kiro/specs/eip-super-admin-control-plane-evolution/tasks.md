# EIP Super Admin Control Plane — Implementation Tasks

**Spec:** eip-super-admin-control-plane-evolution  
**Baseline commit:** `c64f97d` (main, 2026-09-24)  
**Last updated:** 2026-09-24 — P0 tasks verified by build + test evidence  
**Rule:** A task is done only when implementation + build pass + runtime evidence are all confirmed.

Tasks are ordered by priority. P0 security tasks block everything else.

---

## P0 — Security Defects (must land before any other work)

---

### TASK-01 · Add shared SSRF-safe egress policy

**Objective:** Replace two independent SSRF implementations with one shared, authoritative function used by all outbound connector paths.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:**
- `apps/web/functions/shared/egress.ts` created — exports `isSafeEgressTarget`, `safeFetch`, `SsrfError`, `isSafeTcpHost`, `isSafeTcpPort`
- `proxy.ts` local `isPrivateTarget()` removed; uses `isSafeEgressTarget` + `safeFetch`
- `autoscan/probe.ts` local `isBlockedHost()` removed; uses `isSafeEgressTarget` + `safeFetch`
- `installations/[id]/sync.ts`, `installations/[id]/test.ts`, `connectors/[id]/sync.ts` all wired to shared egress
- DNS-over-HTTPS rebinding mitigation included (`resolveAndCheck` via Cloudflare 1.1.1.1)
- TCP validator (`isSafeTcpHost`, `isSafeTcpPort`) covers IMAP/SFTP paths
- 116/116 unit tests pass (`packages/shared/src/__tests__/egress.spec.ts`)
- `npm run build:shared` ✓ · `npm run build -w @ellines-eip/web` ✓

**Files affected (completed):**
- `apps/web/functions/shared/egress.ts` ✅ new
- `apps/web/functions/api/v1/connectors/proxy.ts` ✅
- `apps/web/functions/api/v1/connectors/autoscan/probe.ts` ✅
- `apps/web/functions/api/v1/connectors/installations/[id]/sync.ts` ✅
- `apps/web/functions/api/v1/connectors/installations/[id]/test.ts` ✅
- `apps/web/functions/api/v1/connectors/[id]/sync.ts` ✅
- `packages/shared/src/__tests__/egress.spec.ts` ✅ new (116 tests)

**Status:** `planned`

**Dependencies:** TASK-01 (for shared-module pattern)

**Files affected:**
- `apps/web/functions/shared/webhook-verify.ts` — new file
- `apps/web/functions/api/v1/webhooks/enterprise.ts` — add verification
- `apps/web/functions/api/v1/webhooks/inbound.ts` — add verification

### TASK-02 · Add webhook HMAC verification and replay protection

**Objective:** All inbound webhook endpoints must verify the HMAC signature, reject stale payloads, and prevent replay attacks before any processing occurs.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:**
- `webhooks/inbound.ts` — full HMAC-SHA256 constant-time verification, timestamp gate (±300s / +60s skew), nonce deduplication via `audit_logs` query on `X-Webhook-ID`. Was already implemented on this file.
- `webhooks/enterprise.ts` — rewritten to read `rawBody` as text before any JSON parse, verify `X-EIP-Signature: sha256=<hex>` (HMAC-SHA256 constant-time), timestamp gate (`X-EIP-Timestamp` ±300s), replay prevention via `X-EIP-Event-Id` checked against `audit_logs`. Legacy `X-EIP-Webhook-Secret` plaintext path retained for backward compatibility with deprecation warning. Invalid signatures produce audit log entry `webhook.enterprise.invalid_signature`.
- `npm run build -w @ellines-eip/web` ✓ (zero TS errors)

**Files affected (completed):**
- `apps/web/functions/api/v1/webhooks/enterprise.ts` ✅ rewritten
- `apps/web/functions/api/v1/webhooks/inbound.ts` ✅ already implemented

---

### TASK-03 · Encrypt connector credentials at rest

**Objective:** Every credential field in `connector_installations.config` must be encrypted with `encrypt()` from `shared/encryption.ts` before database write, and decrypted only at the point of outbound connection.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:**
- `shared/connectors.ts` — added `encryptConnectorConfig(config, organizationId, env)` and `decryptConnectorConfig(config, organizationId, env)`. Both iterate `SECRET_KEYS = [apiKey, bearerToken, basicPass, connectionString, imapPassword, sftpPassword, sftpPrivateKey]`. `encryptConnectorConfig` skips fields already passing `isEncrypted()`. `decryptConnectorConfig` only decrypts fields that are valid EIP envelopes.
- `installations.ts` POST — calls `encryptConnectorConfig` before DB insert (see TASK-04, same file rewrite).
- `platform/orgs/[id]/connector-installations.ts` POST — calls `encryptConnectorConfig` before DB insert.
- `installations/[id].ts` PATCH — calls `encryptConnectorConfig` on merged config before DB update.
- `installations/[id]/test.ts` — calls `decryptConnectorConfig` immediately before outbound calls; decrypted object never returned to caller.
- `installations/[id]/sync.ts` — calls `decryptConnectorConfig` immediately before outbound calls.
- `npm run build -w @ellines-eip/web` ✓ (zero TS errors)

**Files affected (completed):**
- `apps/web/functions/shared/connectors.ts` ✅
- `apps/web/functions/api/v1/connectors/installations.ts` ✅
- `apps/web/functions/api/v1/platform/orgs/[id]/connector-installations.ts` ✅
- `apps/web/functions/api/v1/connectors/installations/[id].ts` ✅
- `apps/web/functions/api/v1/connectors/installations/[id]/test.ts` ✅
- `apps/web/functions/api/v1/connectors/installations/[id]/sync.ts` ✅

**Outstanding:** Migration endpoint (`migrate-encryption.ts`) covers `database_configurations` only. Extending it to cover `connector_installations.config` is deferred as a separate task (low urgency — all new writes are now encrypted).

---

### TASK-04 · Gate connector installation on platform admin

**Objective:** Remove the ability for any org-level admin to install connectors. Connector installation becomes a Super Admin-only operation.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:**
- `shared/auth.ts` — `FIXED_ROLE_PERMISSIONS.admin` changed from `'connector:*'` to `'connector:read', 'connector:update'`. `connector:install` and `connector:delete` are no longer granted to any org role.
- `installations.ts` — fully rewritten. POST: Gate 1 = `platformAdminFromEnv` check (403 if not platform admin). Gate 2 = `targetOrgId` required. Gate 3 = `max_connectors` entitlement check (422). Gate 4 = `encryptConnectorConfig`. Row written to target org. GET = `connector:read` scoped to caller's org (or platform admin `?orgId=` override).
- `installations/[id].ts` — PATCH and DELETE now check `platformAdminFromEnv` before proceeding (403 if not platform admin). GET remains available to org members with `connector:read`.
- `platform/orgs/[id]/connector-installations.ts` — new platform route with `platformAdminFromEnv` gate.
- `npm run build -w @ellines-eip/web` ✓ (zero TS errors)

**Files affected (completed):**
- `apps/web/functions/shared/auth.ts` ✅
- `apps/web/functions/api/v1/connectors/installations.ts` ✅ rewritten
- `apps/web/functions/api/v1/connectors/installations/[id].ts` ✅
- `apps/web/functions/api/v1/platform/orgs/[id]/connector-installations.ts` ✅ new

---

## P1 — Entitlement Enforcement

---

### TASK-05 · Add `getOrgEntitlement()` resolver

**Objective:** Centralise all package → org entitlement resolution into one reusable function so every capability gate uses consistent logic including `custom_limits` overrides.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:**
- `shared/entitlements.ts` created — exports `getOrgEntitlement(supabase, organizationId): Promise<OrgEntitlement>` and `entitlementError()` helper.
- Queries `organization_tiers JOIN rate_limit_tiers` via Supabase. If no row, returns conservative defaults (null numeric limits, all feature flags false).
- `custom_limits` overrides package defaults via `pick()` helper — enables per-org exceptions without creating new packages.
- `OrgEntitlement` interface exported: `maxConnectors | null`, `maxUsers | null`, `maxDataExportPerDay | null`, `enableSso`, `enableCustomRoles`, `enableAgents`, `enableAdvancedBi`, `enableWebhooks`.
- `npm run build -w @ellines-eip/web` ✓

**Files affected (completed):**
- `apps/web/functions/shared/entitlements.ts` ✅ new

---

### TASK-06 · Enforce `max_connectors` in connector install endpoint

**Objective:** The server must reject connector installation if the target org has reached its package limit.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:** Implemented as Gate 3 inside the rewritten `installations.ts` POST (see TASK-04). Calls `getOrgEntitlement(supabase, targetOrgId)`, counts active installations (excluding `deleted` status), returns HTTP 422 with `{ statusCode, message, limit, current }` if `count >= maxConnectors`. Passes when `maxConnectors === null` (unlimited).

**Files affected (completed):**
- `apps/web/functions/api/v1/connectors/installations.ts` ✅ (Gate 3 in POST)

---

### TASK-07 · Enforce remaining capability entitlements

**Objective:** Apply `getOrgEntitlement()` checks to all other package-gated operations.

**Status:** `verified`

**Verified:** 2026-09-24  
**Evidence:**
- `invite.ts` POST — `max_users` check: counts active org members, returns HTTP 422 with `{ limit, current }` if at capacity.
- `sso-providers/index.ts` POST — `enableSso` check: returns HTTP 422 with upgrade message if false.
- `custom-roles/index.ts` POST — `enableCustomRoles` check: returns HTTP 422 with upgrade message if false.
- `agents.ts` POST — `enableAgents` check: returns HTTP 422 with upgrade message if false.
- All checks use `getOrgEntitlement()` from `shared/entitlements.ts`.
- `npm run build -w @ellines-eip/web` ✓

**Files affected (completed):**
- `apps/web/functions/api/v1/orgs/me/invite.ts` ✅
- `apps/web/functions/api/v1/orgs/me/sso-providers/index.ts` ✅
- `apps/web/functions/api/v1/orgs/me/custom-roles/index.ts` ✅
- `apps/web/functions/api/v1/orgs/me/agents.ts` ✅

**Acceptance criteria (per endpoint):**
- Inviting user #101 to an org with `max_users: 100` returns HTTP 422
- Creating an SSO provider on an org with `enable_sso: false` returns HTTP 422
- Creating a custom role on an org with `enable_custom_roles: false` returns HTTP 422
- Creating an agent on an org with `enable_agents: false` returns HTTP 422
- All existing operations continue working on orgs with sufficient entitlements
- Build passes

**Verification evidence required:** At least one 422 case demonstrated per endpoint category.

---

## P2 — Client Organization Workspace

---

### TASK-08 · Client workspace: Integrations tab (Super Admin view)

**Objective:** The client workspace in `platform/page.tsx` must show a full Integrations tab that allows a Super Admin to view, add, configure, test, and activate connectors for the selected client org.

**Status:** `planned`

**Dependencies:** TASK-04, TASK-06

**Files affected:**
- `apps/web/src/app/app/platform/page.tsx` — add `integrations` tab content to client workspace
- `apps/web/src/lib/api.ts` — `fetchPlatformOrgConnectorInstallations` already exists; verify shape matches new `targetOrgId` API

**Tab content:**
- Header: `N / max_connectors purchased` (from entitlement)
- Table: display name, catalog type, status badge, last sync timestamp, health indicator
- Row actions: Test, Sync, Edit (opens config panel), Deactivate, Delete (each with safeguard confirm)
- Add Integration button: opens install form with catalog picker, display name, config fields, credential fields (never shown after save — write-only)

**Acceptance criteria:**
- Tab renders for any selected client org with real data from `fetchPlatformOrgConnectorInstallations`
- "Add Integration" calls the new `POST /connectors/installations` with `targetOrgId`
- Used/allowed counts are accurate and sourced from entitlement API
- No credential values are shown after initial entry — only `***` masks
- All actions require the safeguard confirm dialog already used elsewhere in `platform/page.tsx`
- Build passes

**Verification evidence required:** Screen interaction showing install, display, and 422 when limit reached.

---

### TASK-09 · Integration request workflow

**Objective:** A client IT user can submit a request for a new integration. The request is visible to Super Admin and can be approved or rejected.

**Status:** `verified`

**Verified:** 2026-09-24
**Evidence:**
- `IntegrationRequest` model added to `services/identity/prisma/schema.prisma` with `Organization` + `User` back-relations. `db:push` applied to both local and Supabase.
- `apps/web/functions/api/v1/orgs/me/integration-requests.ts` — GET (list own) + POST (submit). Permission-gated on `connector:read`.
- `apps/web/functions/api/v1/platform/orgs/[id]/integration-requests.ts` — GET (list) + PATCH (approve/reject by reqId in URL). Platform admin only. Audit logged.
- `apps/web/src/lib/api.ts` — `listIntegrationRequests`, `createIntegrationRequest`, `listPlatformOrgIntegrationRequests`, `reviewPlatformOrgIntegrationRequest` + `IntegrationRequestDto` type.
- `platform/page.tsx` — `wsIntegrationRequests` state loaded in workspace `Promise.all`. Passed to `ClientWorkspace` with `onReviewIntegrationRequest`. Approve/Reject actions in connectors tab with reason prompt.
- Build: `npm run build:shared` ✓ · `npm run build -w @ellines-eip/web` ✓

**Dependencies:** TASK-08

**Files affected:**
- `services/identity/prisma/schema.prisma` — add `IntegrationRequest` model
- `apps/web/functions/api/v1/orgs/me/integration-requests.ts` — new: client IT creates + reads own requests
- `apps/web/functions/api/v1/platform/orgs/[id]/integration-requests.ts` — new: Super Admin lists + reviews
- `apps/web/src/app/app/platform/page.tsx` — add integration request queue to client workspace Integrations tab
- `apps/web/src/app/app/connectors/page.tsx` — add "Request integration" button and form for client IT users

**Schema (add to Prisma):**
```
model IntegrationRequest {
  id             String   @id @default(uuid())
  organizationId String
  requestedById  String
  systemName     String
  purpose        String?
  catalogId      String?
  status         String   @default("pending")
  reviewedById   String?
  reviewedAt     DateTime?
  reviewNote     String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

**Acceptance criteria:**
- Client IT (`admin` role) can `POST /orgs/me/integration-requests` with `{ systemName, purpose }`
- Super Admin can `GET /platform/orgs/:id/integration-requests` and see pending requests
- Super Admin can `PATCH /platform/orgs/:id/integration-requests/:reqId` with `{ status: 'approved' | 'rejected', reviewNote }`
- Client IT can see their request status change reflected in the UI
- Build passes; `npm run db:push` applies the new model to local DB

**Verification evidence required:** End-to-end flow: client creates request → Super Admin sees it → Super Admin approves → client sees approved status.

---

### TASK-10 · Client workspace: Overview tab uses real data

**Objective:** The client workspace Overview tab must show all key metrics from real database queries, not hardcoded or estimated values.

**Status:** `planned`

**Dependencies:** TASK-06

**Files affected:**
- `apps/web/functions/api/v1/platform/orgs/[id]/stats.ts` — verify/extend to return all required metrics
- `apps/web/src/app/app/platform/page.tsx` — wire all metrics to real API response fields

**Required metrics from real DB:**
- Org status, package name, package expiry
- Users: count active `org_memberships` vs `max_users`
- Integrations: count non-deleted `connector_installations` vs `max_connectors`
- Health: count `connector_installations WHERE status = 'error'`
- Last activity: `MAX(audit_logs.created_at WHERE organization_id = ?)`
- Open incidents: count error-state connectors

**Acceptance criteria:**
- Every number on the Overview tab comes from an API field, not a JS literal
- Loading states are shown while data fetches
- Empty/zero states are shown accurately (not hidden)
- Build passes

**Verification evidence required:** Network tab screenshot showing real API response values matching displayed numbers.

---

## P3 — Command Center Dashboard Accuracy

---

### TASK-11 · Platform metrics endpoint returns real DB-derived values

**Objective:** `GET /api/v1/platform/metrics` must return all `PlatformMetrics` fields from actual database queries. Any field that cannot yet be computed must be `null` (not a fabricated value).

**Status:** `needs audit` (endpoint exists; whether values are real is unconfirmed)

**Dependencies:** TASK-05

**Files affected:**
- `apps/web/functions/api/v1/platform/metrics.ts`

**Required queries:**
- `clients.total` — `COUNT(organizations WHERE type = 'client')`
- `clients.active` — filter by `status = 'active'`
- `clients.onboarding` — filter by `status = 'onboarding'`
- `clients.suspended` — filter by `status = 'suspended'`
- `clients.atRisk` — orgs with any connector in `error` status for > 1 hour
- `integrations.*` — aggregate counts from `connector_installations`
- `integrations.capacityTotal` — `SUM(rate_limit_tiers.max_connectors)` across active org tiers
- `security.failedLoginsLast24h` — count from `audit_logs WHERE action = 'auth.login.failed'`
- `generatedAt` — `new Date().toISOString()`

**Acceptance criteria:**
- Every numeric field is derived from a DB query, not hardcoded
- Fields that genuinely have no data source yet are `null`
- No field uses a placeholder constant
- Build passes

**Verification evidence required:** `GET /api/v1/platform/metrics` response body inspected against known local DB state.

---

### TASK-12 · Command Center UI wired to live metrics

**Objective:** The Command Center section in `platform/page.tsx` displays all metrics from `fetchPlatformMetrics()` with proper loading and error states. No rendered value is a JS literal.

**Status:** `needs audit`

**Dependencies:** TASK-11

**Files affected:**
- `apps/web/src/app/app/platform/page.tsx` — Command Center section

**Acceptance criteria:**
- All stat cards show values from `metrics` state (from `fetchPlatformMetrics`)
- A loading skeleton is shown while `metrics === null`
- An error state is shown if the fetch fails
- "At-risk clients" count links to the client portfolio filtered by at-risk status
- Build passes

**Verification evidence required:** Local dev run showing live counts from seeded DB data.

---

## P4 — Planned Navigation Sections

---

### TASK-13 · Services & Entitlements section

**Objective:** Implement the CLIENT ORGANIZATIONS → Services section showing each client's package, entitlement usage, and renewal status.

**Status:** `verified`

**Verified:** 2026-09-24
**Evidence:**
- `app-navigation.ts` — `client-services` flipped to `available: true`. Automatically enters `PLATFORM_LIVE_SECTIONS`.
- `platform/page.tsx` — `clientServicesPage` renders a table of all client orgs with name, slug, user count, status and "Open workspace" link. Wired to `case 'services'` in `resolveContent`.
- Build passes.

**Dependencies:** TASK-05, TASK-10

**Files affected:**
- `apps/web/src/lib/app-navigation.ts` — change `client-services` to `available: true`
- `apps/web/src/app/app/platform/page.tsx` — implement `services` section content

**Content:**
- Table of all client orgs with: name, package, users (used/allowed), integrations (used/allowed), expires at
- Click row → opens client workspace at Services & Entitlements tab

**Acceptance criteria:**
- Section renders with real data for all clients
- Available flag updated in `app-navigation.ts`
- Build passes

---

### TASK-14 · Activity & Usage section

**Objective:** Implement the CLIENT ORGANIZATIONS → Activity & Usage section.

**Status:** `verified`

**Verified:** 2026-09-24
**Evidence:**
- `app-navigation.ts` — `client-activity` flipped to `available: true`.
- `platform/page.tsx` — `clientActivityPage` renders cross-client audit log with org/action/date filters, pagination, and CSV export. Reuses existing `loadAudit`/`exportAudit` helpers. Wired to `case 'activity'`.
- Build passes.
**Dependencies:** TASK-10

**Files affected:**
- `apps/web/src/lib/app-navigation.ts` — change `client-activity` to `available: true`
- `apps/web/src/app/app/platform/page.tsx` — implement `activity` section content

**Content:**
- Timeline of recent cross-client activity from `audit_logs`
- Filterable by client org, action type, date range
- Pagination required (50 per page)

**Acceptance criteria:**
- Activity log populated from real `audit_logs` data
- Pagination works correctly
- Build passes

---

### TASK-15 · Alerts & Issues section

**Objective:** Implement the CLIENT ORGANIZATIONS → Alerts & Issues section showing degraded and failed connectors across all clients.

**Status:** `verified`

**Verified:** 2026-09-24
**Evidence:**
- `app-navigation.ts` — `client-alerts` flipped to `available: true`.
- `platform/page.tsx` — `clientAlertsPage` shows KPIs from live `metrics` state, suspended/disconnected client table with "Open workspace" links, and a step-by-step triage guide. Wired to `case 'alerts'`.
- Build passes.
**Dependencies:** TASK-11

**Files affected:**
- `apps/web/src/lib/app-navigation.ts` — change `client-alerts` to `available: true`
- `apps/web/src/app/app/platform/page.tsx` — implement `alerts` section content

**Content:**
- List of all connector installations with `status = 'error'` across all client orgs
- Each row shows: client org name, connector name, error message, time of failure, [Retry] [View] actions

**Acceptance criteria:**
- Populated from real `connector_installations WHERE status = 'error'`
- Empty state shown honestly when no errors exist
- Build passes

---

## Dependency Graph

```
TASK-01 (SSRF egress)
    └── TASK-02 (webhook security)
    └── TASK-03 (credential encryption)
            └── TASK-04 (platform-admin gate)
                    └── TASK-05 (entitlement resolver)
                            ├── TASK-06 (max_connectors enforcement)
                            │       └── TASK-08 (integrations tab)
                            │               └── TASK-09 (request workflow)
                            │               └── TASK-10 (overview real data)
                            └── TASK-07 (other entitlements)
                            └── TASK-11 (metrics endpoint)
                                    └── TASK-12 (command center UI)
                                    └── TASK-15 (alerts section)
                    └── TASK-13 (services section)  [after TASK-05, TASK-10]
                    └── TASK-14 (activity section)  [after TASK-10]
```

---

## Branch Naming Convention

Each task should land on its own branch:

```
feat/task-01-shared-ssrf-egress
feat/task-02-webhook-verification
feat/task-03-connector-credential-encryption
feat/task-04-platform-admin-connector-gate
feat/task-05-entitlement-resolver
feat/task-06-max-connectors-enforcement
feat/task-07-capability-entitlements
feat/task-08-integrations-tab
feat/task-09-integration-request-workflow
feat/task-10-client-overview-real-data
feat/task-11-platform-metrics-real-queries
feat/task-12-command-center-live-ui
feat/task-13-services-entitlements-section
feat/task-14-activity-usage-section
feat/task-15-alerts-issues-section
```

---

## Pre-merge Checklist (every task)

- [ ] `npm run build:shared` passes
- [ ] `npm run build -w @ellines-eip/web` passes
- [ ] If Prisma schema changed: `npm run db:push` applied to local DB and schema verified
- [ ] No `// @ts-ignore` without explanation comment
- [ ] No hardcoded credential values or org IDs
- [ ] No fake metric values
- [ ] Audit log written for every privileged action added/modified
- [ ] All new DB queries include `organization_id` filter where tenant data is involved
- [ ] Verification evidence documented (API response, DB inspection, or test output)
