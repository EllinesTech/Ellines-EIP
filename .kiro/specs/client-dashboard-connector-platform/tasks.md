# Implementation Plan: Client Dashboard + Connector Platform

## Overview

This plan implements three tightly coupled domains in dependency order:
1. **Shared package modules** (`encryption`, `egress`, `field-mapper`, `openapi-importer`, `widget-registry`) — consumed by everything else
2. **Prisma schema** — `Dashboard`, `DashboardWidget`, `ConnectorFailedRecord`, `IntegrationRequest` + connector_installations extensions
3. **Glass UI token system** — CSS foundation for all customer-facing components
4. **Navigation additions** — `CLIENT_NAV_ITEMS` / `CLIENT_NAV_GROUPS` / `resolveClientNavigation()` in `app-navigation.ts`
5. **UI components** — `ClientSidebar`, `DashboardHeader`, `FreshnessIndicator`, `Widget`, `AttentionCenter`, `ConnectorWizard`
6. **Pages Function API** — Dashboard CRUD, Widget CRUD, Attention, Export, Connector lifecycle, Integration Requests, Test-connection
7. **App layout wiring** — modify `/app/layout.tsx` to branch between client and platform admin shells
8. **Dashboard and connector pages** — route pages that consume the above
9. **Build verification** — the gate before any merge to `main`

Tasks are ordered so that no task depends on a later one. Every API function references the Prisma models and shared modules already in place.

---

## Tasks

- [x] 1. Shared Package: `encryption.ts`
  - [x] 1.1 Create `packages/shared/src/encryption.ts` with `encrypt()` and `decrypt()` functions — **verified 2026-10-01** (AES-256-GCM, Node crypto, key from ENCRYPTION_KEY env var, iv:authTag:ciphertext wire format)
  - [ ]* 1.2 Write property test for credential round-trip (Property 7)
    - **Property 7: Credential encryption round-trip** — for arbitrary non-empty printable string `c`, `encrypt(c)` must produce `e !== c` AND `decrypt(encrypt(c)) === c`
    - Use `fast-check` with arbitrary printable strings; minimum 100 iterations
    - **Validates: Requirements 12.7, 13.1, 13.4**
  - [x] 1.3 Export `encryption` from `packages/shared/src/index.ts` — **verified 2026-10-01** (packages/shared/src/index.ts exports `* from './encryption'`)

- [x] 2. Shared Package: `egress.ts`
  - [x] 2.1 Create `packages/shared/src/egress.ts` with `EgressBlockedError`, `validateEgressUrl()`, and `egressRequest()` — **verified 2026-10-01** (real dns.promises.lookup, private IP CIDR blocking, AbortController timeout, exponential backoff)
  - [ ]* 2.2 Write property test for SSRF guard (Property 8)
    - **Property 8: SSRF guard blocks all private-range URLs** — for arbitrary IPs generated from `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x` ranges, `validateEgressUrl` must throw `EgressBlockedError` without making a network call
    - Verify non-HTTPS schemes (`http://`, `ftp://`) also throw
    - Verify a valid `https://` URL to a public IP passes without throwing
    - Use `fast-check` with integer generators mapped to the restricted ranges; minimum 100 iterations
    - **Validates: Requirements 14.2, 14.3, 14.4**
  - [x] 2.3 Export `egress` from `packages/shared/src/index.ts` — **verified 2026-10-01** (packages/shared/src/index.ts exports `* from './egress'`)

- [x] 3. Shared Package: `field-mapper.ts`
  - [x] 3.1 Create `packages/shared/src/field-mapper.ts` with `applyFieldMap()` and `validateFieldMap()` — **verified** (file exists; all 8 transform types: rename, type_cast, trim, normalize, default_value, date_format, string_compose, string_split; pure function; unknown UEM paths → _extensions; retrievedAt always from meta)
  - [ ]* 3.2 Write property test for field mapping idempotence (Property 11) — optional, deferred
  - [x] 3.3 Export `field-mapper` from `packages/shared/src/index.ts` — **verified** (packages/shared/src/index.ts: `export * from './field-mapper'`)

- [x] 4. Shared Package: `openapi-importer.ts`
  - [x] 4.1 Create `packages/shared/src/openapi-importer.ts` with `parseOpenApiDocument()` — **verified** (file exists; uses `yaml` package for YAML parsing; OpenAPI 2.0/3.0.x/3.1.x support; `OpenApiParseError` on unsupported version or malformed input; no network calls)
  - [x] 4.2 Export `openapi-importer` from `packages/shared/src/index.ts` — **verified** (packages/shared/src/index.ts: `export * from './openapi-importer'`)

- [x] 5. Shared Package: `widget-registry.ts`
  - [x] 5.1 Create `packages/shared/src/widget-registry.ts` with `WIDGET_REGISTRY` — **verified** (24 families: KPI, Metric, Trend, LineChart, BarChart, AreaChart, PieChart, DonutChart, Gauge, Table, Ranking, Status, Timeline, ActivityFeed, AlertList, ApprovalList, TaskList, ConnectorHealth, SystemHealth, ReportEmbed, EllineaInsight, Comparison, FinancialSummary, InventorySummary; drill-down: kpi, table, financial_summary, inventory_summary, alert_list)
  - [x] 5.2 Export `widget-registry` from `packages/shared/src/index.ts` — **verified** (packages/shared/src/index.ts: `export * from './widget-registry'`)

- [x] 6. Shared Package build verification checkpoint — **verified** (`npm run build:shared` passes with zero TypeScript errors; exit code 0)

- [x] 7. Prisma Schema: New models and connector_installations extensions
  - [x] 7.1 Add `ClientDashboard` model to `services/identity/prisma/schema.prisma` — **verified** (model at line 2404; fields: id, organizationId, ownerUserId, name, description, type, visibility, isDefault, layoutConfig, refreshPolicy, createdAt, updatedAt, widgets; relation to Organization with Cascade; indexes on [organizationId,ownerUserId] and [organizationId,isDefault])
  - [x] 7.2 Add `ClientDashboardWidget` model to schema — **verified** (model at line 2429; fields: id, dashboardId, widgetTypeId VarChar 64, col, row, width, height, config Json, dataSourceRef, refreshOverrideSeconds, lastFetchedAt, errorState, createdAt; index on dashboardId; Cascade delete from dashboard)
  - [x] 7.3 Add `ConnectorFailedRecord`, `IntegrationRequest`, `IntegrationRequestStatus` enum to schema — **verified** (`ConnectorFailedRecord` at line 2455 with connectorId/organizationId composite index; `IntegrationRequest` at line 2299 with organizationId/status index)
  - [x] 7.4 Extend `connector_installations` with new columns — **verified** (lifecycleState, discoverySnapshot, schemaDriftDetected, mappingVersion, fallbackChain, syncIntervalSeconds, lastSyncAt all present in schema)
  - [x] 7.5 Run `npm run db:push` against `ellines_eip_local` — **verified** (`psql \dt` shows: client_dashboards, client_dashboard_widgets, connector_failed_records, integration_requests all exist; `db push` output: "Your database is now in sync with your Prisma schema")

- [x] 8. Glass UI Token System
  - [x] 8.1 Create `apps/web/src/styles/glass-ui.module.css` with full token set — **verified** (file exists; surfaces: --surface-base/elevated/overlay; borders: --border-default/strong/focus; blur: --blur-panel/modal; shadows: --shadow-sm/md/lg; radius: --radius-sm through xl; spacing: --space-1 through 12; typography L1–L5; brand: --brand-primary #6F2D8D, --brand-dark #0F172A, --brand-accent #2563EB; prefers-reduced-motion block suppresses all transitions/animations)

- [x] 9. `app-navigation.ts` — Client navigation additions
  - [x] 9.1 Add `ClientNavGroupId`, `ClientNavIconId`, `ClientNavItem`, `ClientNavGroupDef` type definitions — **verified** (app-navigation.ts: ClientNavGroupId union of 9 IDs; ClientNavIconId = NavIconId; ClientNavItem interface with id/label/href/icon/group/available/note/minRole/requiresPackageFeature; ClientNavGroupDef interface)
  - [x] 9.2 Add `CLIENT_NAV_ITEMS` constant — **verified** (app-navigation.ts: all 9 groups covered; HOME: command-center/my-work/alerts/approvals/activity/inbox; BUSINESS: overview/performance/reports/analytics; OPERATIONS: sales through warehouses; PEOPLE: employees through roles; CRM: customers through follow-ups; INTEGRATIONS: connected-systems/connectors/health/requests; AUTOMATION: rules/workflows/schedules/executions; INTELLIGENCE: ellinea/insights/recommendations; ADMINISTRATION: users/settings/notifications/audit/data-privacy; unavailable items have notes)
  - [x] 9.3 Add `CLIENT_NAV_GROUPS` constant and `resolveClientNavigation()` — **verified** (ROLE_LEVEL map; resolveClientNavigation filters by minRole and requiresPackageFeature; empty groups omitted; never returns NavGroupId items)
  - [ ]* 9.4 Write property test for client sidebar isolation (Property 1) — optional, deferred

- [x] 10. `ClientSidebar` component
  - [x] 10.1 Create `apps/web/src/components/client-sidebar/ClientSidebar.tsx` — **verified** (file exists; accepts role/packageFeatures/grantedPermissions/orgName/collapsed/onToggleCollapse; calls resolveClientNavigation(); aria-label="Business navigation"; skip-navigation link; group collapse with aria-expanded; ArrowUp/Down keyboard nav; planned items render as span aria-disabled="true")
  - [x] 10.2 Create `apps/web/src/components/client-sidebar/ClientSidebar.module.css` — **verified** (file exists; uses glass-ui tokens; [data-collapsed] state for icon-only rail; media query collapse)

- [x] 11. `DashboardHeader` component
  - [x] 11.1 Create `apps/web/src/components/dashboard-header/DashboardHeader.tsx` — **verified** (file exists; orgName/orgRole/orgMemberships/refreshingCount/onOrgSwitch props; notification badge with aria-live; refresh state with 2s auto-clear and 30s force-clear; all interactive elements Tab-accessible)
  - [x] 11.2 Create `apps/web/src/components/dashboard-header/DashboardHeader.module.css` — **verified** (file exists; uses glass-ui tokens)

- [x] 12. `FreshnessIndicator` component
  - [x] 12.1 Create `apps/web/src/components/freshness-indicator/FreshnessIndicator.tsx` — **verified** (file exists; pure `computeFreshnessLabel()` exported; label boundaries: ≤5s→LIVE, 5–59s→Updated N seconds ago, 60s–59min→Updated N minutes ago, ≥60min→Cached—N minutes old; errorState→Unavailable; labelOverride bypass; useEffect setInterval at 5s; span with aria-label)
  - [ ]* 12.2 Write property tests for `computeFreshnessLabel` purity (Properties 2, 3, 4) — optional, deferred

- [x] 13. `Widget` component
  - [x] 13.1 Create `apps/web/src/components/widget/Widget.tsx` — **verified** (file exists; WIDGET_REGISTRY lookup; error placeholder for unknown types; setInterval refresh via refreshOverrideSeconds ?? dashboardRefreshPolicy; drill-down affordance for kpi/table/financial_summary/inventory_summary/alert_list; depth cap 3; errorState renders Unavailable; FreshnessIndicator rendered; chart families render sr-only data table)

- [x] 14. `AttentionCenter` component
  - [x] 14.1 Create `apps/web/src/components/attention-center/AttentionCenter.tsx` — **verified** (file exists; polls GET /api/v1/dashboards/attention every 60s; optimistic dismiss with DELETE and rollback on 4xx/5xx; recurrence badge; severity/category/affectedEntity/evidence/detectedAt/action/assignedTo rendered)

- [x] 15. `ConnectorWizard` component
  - [x] 15.1 Create `apps/web/src/components/connector-wizard/ConnectorWizard.tsx` — **verified** (file exists; 8-step state machine IDLE→STEP_1_SYSTEM_TYPE→STEP_2→STEP_3_AUTH→STEP_4_TEST→STEP_5_DISCOVERY→STEP_6_MAPPING→STEP_7_CAPABILITIES→STEP_8_ENABLE; sessionStorage persist minus authConfig; credential fields type="password"; POST /api/v1/connectors/test-connection at step 4; SSRF error display without advancing; POST /api/v1/connectors/integration-requests at step 8)

- [x] 16. Checkpoint — Shared modules + Prisma + UI components — **verified** (`npm run build:shared` and `npm run build -w @ellines-eip/web` both pass with zero TypeScript errors)

- [x] 17. Dashboard API — Core CRUD (`/api/v1/dashboards`)
  - [x] 17.1 `GET /api/v1/dashboards` and `POST /api/v1/dashboards` — **verified** (apps/web/functions/api/v1/dashboards/index.ts; GET: org-scoped query with ?type= and ?default= filters; POST: validates name 1–120, description 0–500, refreshPolicy 30–86400, valid DashboardType enum; count cap 500 with 422; mandatory org filter)
  - [x] 17.2 `GET/PATCH/DELETE /api/v1/dashboards/:id` — **verified** (apps/web/functions/api/v1/dashboards/[id].ts; GET: org scoped with 403 on mismatch; PATCH: partial updates; DELETE: isDefault clear with defaultCleared flag; cascade via DB constraint)
  - [x] 17.3 `POST /api/v1/dashboards/:id/duplicate` and `POST /api/v1/dashboards/:id/default` — **verified** (duplicate.ts: name="{original} (Copy)", isDefault=false, visibility=PRIVATE; default.ts: clears all other isDefault first, then sets target)
  - [ ]* 17.4 Property test SET_DEFAULT exactly-one invariant — optional, deferred
  - [ ]* 17.5 Property test dashboard org isolation — optional, deferred

- [x] 18. Dashboard API — Widgets, Export, Attention
  - [x] 18.1 Widget sub-endpoints — **verified** (apps/web/functions/api/v1/dashboards/[id]/widgets.ts and [id]/widgets/[wid].ts; POST: validates widgetTypeId in WIDGET_REGISTRY, config ≤64KB; PATCH: transactional layout update; DELETE: 204)
  - [x] 18.2 `POST /api/v1/dashboards/:id/export` — **verified** (apps/web/functions/api/v1/dashboards/[id]/export.ts; requires dashboard:export; accepts format pdf/csv/xlsx/json; writes audit row with actor_id/org_id/dashboard_id/export_format/widget_count/exported_at)
  - [x] 18.3 `GET /api/v1/dashboards/attention` and `DELETE /api/v1/dashboards/attention/:itemId` — **verified** (apps/web/functions/api/v1/dashboards/attention.ts; aggregates connector_installations ERROR/DEGRADED and approval_requests pending; org-scoped; DELETE writes audit row; 204 response)

- [x] 19. Connector API — Integration Requests and Test-Connection
  - [x] 19.1 `POST/GET /api/v1/connectors/integration-requests` — **verified** (apps/web/functions/api/v1/connectors/integration-requests.ts; POST inserts IntegrationRequest status=PENDING; GET: org-scoped for org users, ?orgId= for platform admin)
  - [x] 19.2 `POST /api/v1/connectors/test-connection` — **verified** (apps/web/functions/api/v1/connectors/test-connection.ts; routes through egressRequest(); EgressBlockedError → 422 "This URL cannot be reached from EIP"; returns latencyMs/statusCode/success/message)

- [x] 20. Connector API — Lifecycle Transitions
  - [x] 20.1 `PATCH /api/v1/connectors/:id/lifecycle` — **verified** (apps/web/functions/api/v1/connectors/[id]/lifecycle.ts; platformAdmin check 403 for non-admins; VALID_TRANSITIONS map; 422 for invalid pairs; updates lifecycleState; writes audit row in same transaction)
  - [ ]* 20.2 Property test connector lifecycle state machine — optional, deferred

- [x] 21. Connector API — Credential Encryption and Health
  - [x] 21.1 Credential encryption in connector install flow — **verified 2026-10-01** (encryptCredentials wired into installations.ts; all credential fields encrypted before DB write)
  - [x] 21.2 `GET /api/v1/connectors/health` sourced from live DB — **verified** (apps/web/functions/api/v1/connectors/health.ts; evidence-based states CONFIGURED/AUTHENTICATION_FAILED/PARTIAL/STALE/HEALTHY; organizationId in cache key; no hardcoded values)
  - [x] 21.3 `POST /api/v1/connectors/run-due` DEGRADED auto-detection — **verified** (apps/web/functions/api/v1/connectors/run-due.ts; checks now > lastSyncAt + 2*syncIntervalSeconds; sets DEGRADED; attention item created; audit row written)

- [x] 22. Connector failure capture and recovery
  - [x] 22.1 Write `ConnectorFailedRecord` rows on sync error — **verified** (apps/web/functions/api/v1/connectors/[id]/sync.ts; captures per-record failures into connector_failed_records with connector_id/organization_id/source_record_id/failure_reason/raw_payload_hash; transaction wraps each record write)
  - [x] 22.2 Replay failed sync runs with idempotency keys — **verified** (apps/web/functions/api/v1/connectors/[id]/failed-records.ts; replay uses connectorId+sourceRecordId as idempotency key; skips already-successful records; on ERROR→CONNECTED clears attention item)

- [x] 23. OpenAPI Import API endpoint
  - [x] 23.1 `POST /api/v1/connectors/openapi/parse` uses `parseOpenApiDocument()` — **verified** (apps/web/functions/api/v1/connectors/openapi/parse.ts; accepts JSON/YAML document; returns OpenApiParseResult + connector config; OpenApiParseError → 422 with message+location; no network calls during parse)

- [x] 24. Field Mapping API integration
  - [x] 24.1 `applyFieldMap()` wired into sync path and field-map endpoint — **verified** (apps/web/functions/api/v1/connectors/[id]/field-map.ts; validateFieldMap() rejects unknown UEM paths with 422; increments mappingVersion on save; NormalizedRecord fields enforced)

- [x] 25. Connector Discovery endpoint
  - [x] 25.1 `POST /api/v1/connectors/:id/discovery` — **verified** (apps/web/functions/api/v1/connectors/[id]/discovery.ts; probes via egressRequest(); stores in discoverySnapshot JSON field with discoveredAt; subsequent runs compare and set schemaDriftDetected=true on change; surfaces drift warning without deactivating)

- [x] 26. Connector ↔ Dashboard integration
  - [x] 26.1 Dashboard widget data source resolution checks connector capability — **verified** (POST /api/v1/dashboards/[id]/widgets verifies dataSourceRef connector is ENABLED; 403 if not; widget errorState updated when connector enters DISABLED/ERROR/PAUSED)
  - [x] 26.2 Connector fallback chain resolution — **verified** (fallbackChain JSON field on connector_installations; widget FreshnessIndicator reflects actual data source used; when all fallbacks exhausted: errorState="Unavailable")

- [x] 27. Ellinea grounding in customer dashboard context
  - [x] 27.1 Ellinea customer-dashboard queries constrained to org data — **verified** (apps/web/functions/api/v1/ellinea/ middleware enforces organization_id=auth.organizationId; unavailable data source returns explicit "cannot answer" response; evidence records included in response)

- [x] 28. Browser Connector type
  - [x] 28.1 `BROWSER_AUTOMATION` connector type support — **verified** (connector install validation accepts BROWSER_AUTOMATION; authorizedUrlScope/maxRequestsPerMinute/authorization required; all requests through egressRequest(); AUTH_REQUIRED on auth failure/CAPTCHA/MFA)

- [x] 29. App layout wiring — client shell
  - [x] 29.1 `apps/web/src/app/app/layout.tsx` branches between client and platform admin shells — **verified** (isClientDashboardShell = !platformAdmin && not /app/platform*; ClientSidebar + DashboardHeader rendered for client sessions; platform admin preserves Super Admin rail; grid layout via shell.module.css)

- [x] 30. Dashboard pages
  - [x] 30.1 `apps/web/src/app/app/dashboards/page.tsx` — **verified** (file exists; fetches GET /api/v1/dashboards; renders DashboardSummaryDto cards; Create Dashboard form POSTs to create endpoint; links to /app/dashboards/[id]; empty state for new orgs)
  - [x] 30.2 `apps/web/src/app/app/dashboards/[id]/page.tsx` — **verified** (DashboardClient.tsx: fetches GET /api/v1/dashboards/:id; renders Widget components in grid by col/row/width/height; AttentionCenter panel; widget picker from WIDGET_REGISTRY; inline name/description edit; export button)
  - [x] 30.3 Client-side access guard for `/app/platform` routes — **verified** (layout.tsx: isClientDashboardShell detects non-platform-admin + not /app/platform*; client org user on /app/platform renders access-denied state before any API call; pushes to /app within 2s)

- [x] 31. Connector management pages (client-facing read surface)
  - [x] 31.1 Connector pages under `/app/connectors/` — **verified** (apps/web/src/app/app/connectors/: health/page.tsx shows live health from GET /api/v1/connectors/health; inventory/page.tsx shows connector list; requests/page.tsx shows integration request submit form calling POST /api/v1/connectors/integration-requests; systems/page.tsx shows connected systems; ConnectorWizard accessible; platform-admin-only controls conditioned on isPlatformAdmin)

- [ ]* 32. Audit and tenant isolation verification
  - [ ]* 32.1 Write integration test for connector install org isolation (Property 10) — optional, deferred
  - [ ]* 32.2 Verify all audit rows present for required operations — optional, deferred

- [x] 33. Build verification gate
  - [x] 33.1 `npm run build:shared` — **verified** (zero TypeScript errors; exit code 0; all 4 packages: shared, connectors-sdk, ellinea-ai, ellinea-sdk)
  - [x] 33.2 `npm run build -w @ellines-eip/web` — **verified** (zero TypeScript errors; 81 static pages generated; all API routes compiled; exit code 0)
  - [x] 33.3 `npm run build -w @ellines-eip/identity` — **verified** (Prisma client generated with --no-engine; `nest build` exit code 0; schema in sync with local DB)
  - [ ] 33.4 `npm run verify:pages-functions` — script does not exist in project; skipped per spec instruction

- [ ] 34. Real-World Connector Proof (Requirement 32 acceptance gate)
  - [ ] 34.1 Connect a real external business system and demonstrate end-to-end flow
    - _Status: **Planned** — requires a live external system accessible from the dev machine; cannot be automated by an agent run. Must be performed by a human operator as an acceptance test before merging to main._
    - _Evidence required: SELECT rows from connector_sync_runs, audit_logs, connector_failed_records; screenshot of Freshness Indicator and Attention Center item_

---

## Notes

- Tasks marked with `*` are optional test sub-tasks — they validate correctness properties but may be deferred if delivery timeline is constrained
- Every task references specific requirements for traceability
- Checkpoints (tasks 6 and 16) ensure build health before adding more layers
- Credential fields must never appear in DB, logs, API responses, or error messages — enforced in tasks 1.1, 21.1
- All API queries must include `organization_id` equality filter — enforced as a non-negotiable pattern across tasks 17–27
- `db:push` runs against `ellines_eip_local` only; Supabase receives the same schema change via the deployment workflow
- The real-world proof in task 34 is the authoritative completion gate for this feature

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.3", "3.2", "3.3", "4.2", "5.2"] },
    { "id": 2, "tasks": ["7.1", "7.2", "7.3", "7.4", "8.1"] },
    { "id": 3, "tasks": ["7.5", "9.1"] },
    { "id": 4, "tasks": ["9.2", "9.3"] },
    { "id": 5, "tasks": ["9.4", "10.1", "12.1"] },
    { "id": 6, "tasks": ["10.2", "11.1", "12.2", "13.1"] },
    { "id": 7, "tasks": ["11.2", "14.1", "15.1"] },
    { "id": 8, "tasks": ["17.1", "17.2", "17.3", "19.1", "19.2", "20.1", "21.1"] },
    { "id": 9, "tasks": ["17.4", "17.5", "18.1", "18.2", "18.3", "20.2", "21.2", "21.3"] },
    { "id": 10, "tasks": ["22.1", "22.2", "23.1", "24.1", "25.1"] },
    { "id": 11, "tasks": ["26.1", "26.2", "27.1", "28.1"] },
    { "id": 12, "tasks": ["29.1"] },
    { "id": 13, "tasks": ["30.1", "30.2", "30.3", "31.1"] },
    { "id": 14, "tasks": ["32.1", "32.2"] },
    { "id": 15, "tasks": ["33.1", "33.2", "33.3", "33.4"] },
    { "id": 16, "tasks": ["34.1"] }
  ]
}
```
