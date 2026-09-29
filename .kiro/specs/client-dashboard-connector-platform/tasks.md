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

- [ ] 1. Shared Package: `encryption.ts`
  - [ ] 1.1 Create `packages/shared/src/encryption.ts` with `encrypt()` and `decrypt()` functions
    - Implement using AES-256-GCM (or equivalent Web Crypto API available in Cloudflare Workers)
    - `encrypt(plaintext: string, orgId: string, env: Env): Promise<string>` — derive key from `env.ENCRYPTION_KEY` + `orgId` as a salt; encode output as base64 ciphertext with prepended IV
    - `decrypt(ciphertext: string, orgId: string, env: Env): Promise<string>` — reverse; throw on invalid key or corrupted ciphertext
    - Neither function may surface plaintext or the key value in thrown error messages
    - _Requirements: 12.7, 13.1, 13.4_
  - [ ]* 1.2 Write property test for credential round-trip (Property 7)
    - **Property 7: Credential encryption round-trip** — for arbitrary non-empty printable string `c`, `encrypt(c)` must produce `e !== c` AND `decrypt(encrypt(c)) === c`
    - Use `fast-check` with arbitrary printable strings; minimum 100 iterations
    - **Validates: Requirements 12.7, 13.1, 13.4**
  - [ ] 1.3 Export `encryption` from `packages/shared/src/index.ts`
    - Add `export * from './encryption';` to the exports block
    - _Requirements: 31.1_

- [ ] 2. Shared Package: `egress.ts`
  - [ ] 2.1 Create `packages/shared/src/egress.ts` with `EgressBlockedError`, `validateEgressUrl()`, and `egressRequest()`
    - Define `EgressBlockedError extends Error` with `blockedHostname`, `blockReason`, `timestamp` fields
    - `validateEgressUrl(url: string): Promise<void>` — parse URL; block non-`https:` schemes; resolve hostname to IP; compare against CIDR blocks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `::1`, `169.254.0.0/16`; throw `EgressBlockedError` on any match without making a network call
    - `egressRequest(opts: EgressOptions): Promise<Response>` — calls `validateEgressUrl` first; on pass, executes `fetch`; retries up to 3 times on network errors or HTTP 5xx with exponential backoff (base 30 s, cap 480 s, + jitter); throws last error after retry exhaustion
    - Timeout: 30 s per attempt via `AbortController`
    - `block_reason` is never forwarded to calling code beyond the `EgressBlockedError` message field
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 22.1_
  - [ ]* 2.2 Write property test for SSRF guard (Property 8)
    - **Property 8: SSRF guard blocks all private-range URLs** — for arbitrary IPs generated from `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x` ranges, `validateEgressUrl` must throw `EgressBlockedError` without making a network call
    - Verify non-HTTPS schemes (`http://`, `ftp://`) also throw
    - Verify a valid `https://` URL to a public IP passes without throwing
    - Use `fast-check` with integer generators mapped to the restricted ranges; minimum 100 iterations
    - **Validates: Requirements 14.2, 14.3, 14.4**
  - [ ] 2.3 Export `egress` from `packages/shared/src/index.ts`
    - _Requirements: 31.1_

- [ ] 3. Shared Package: `field-mapper.ts`
  - [ ] 3.1 Create `packages/shared/src/field-mapper.ts` with `applyFieldMap()` and `validateFieldMap()`
    - Define all types: `FieldTransformType`, `FieldMapEntry`, `NormalizedRecord`, `FieldMapWarning`
    - Implement all 8 transform types: `rename`, `type_cast`, `trim`, `normalize`, `default_value`, `date_format`, `string_compose`, `string_split`
    - `applyFieldMap(source, fieldMap, meta)` — pure function; unknown UEM target fields go to `_extensions`; `retrievedAt` must be `meta.retrievedAt` (EIP clock), never source timestamp
    - `validateFieldMap(fieldMap)` — returns `FieldMapWarning[]` for unknown UEM paths, reserved field abuse, type mismatches; does not throw
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 22.6_
  - [ ]* 3.2 Write property test for field mapping idempotence (Property 11)
    - **Property 11: Field mapping is a pure deterministic transformation** — `applyFieldMap(r, m, meta)` applied twice with identical inputs must return structurally equivalent `NormalizedRecord` objects
    - Use `fast-check` to generate arbitrary source records and field maps; minimum 100 iterations; use `JSON.stringify` deep equality
    - **Validates: Requirements 19.1, 22.6**
  - [ ] 3.3 Export `field-mapper` from `packages/shared/src/index.ts`
    - _Requirements: 31.1_

- [ ] 4. Shared Package: `openapi-importer.ts`
  - [ ] 4.1 Create `packages/shared/src/openapi-importer.ts` with `parseOpenApiDocument()`
    - Define `OpenApiParseResult`, `EndpointDef`, `OpenApiParseError`
    - Bundle a pure-JS YAML parser (no native addons; Cloudflare Workers compatible) — e.g. `js-yaml` if already in workspace, otherwise `yaml` package
    - Support OpenAPI 2.0 (Swagger), 3.0.x, 3.1.x; extract `serverBaseUrl`, `authType` (mapped from securitySchemes), `endpoints[]`, `version`, `title`
    - Unsupported version or malformed input throws `OpenApiParseError { message, location }` — never returns a partial result
    - No network calls during parse; no endpoint execution
    - _Requirements: 17.1, 17.2, 17.3, 17.5_
  - [ ] 4.2 Export `openapi-importer` from `packages/shared/src/index.ts`
    - _Requirements: 31.1_

- [ ] 5. Shared Package: `widget-registry.ts`
  - [ ] 5.1 Create `packages/shared/src/widget-registry.ts` with `WIDGET_REGISTRY`
    - Define `WidgetTypeDef`, `WidgetFamily` union type (all 24 families)
    - Populate `WIDGET_REGISTRY: Record<string, WidgetTypeDef>` with exactly 24 entries — one per `WidgetFamily` value
    - Each entry includes: `widgetTypeId` (≤ 64 chars, snake_case), `displayName`, `family`, `supportsDrillDown`, `defaultWidth`, `defaultHeight`, `configSchema`
    - Drill-down capable types: `kpi`, `table`, `financial_summary`, `inventory_summary`, `alert_list`
    - _Requirements: 4.1, 4.2, 27.1_
  - [ ] 5.2 Export `widget-registry` from `packages/shared/src/index.ts`
    - _Requirements: 31.1_

- [ ] 6. Shared Package build verification checkpoint
  - Run `npm run build:shared` — must pass with zero TypeScript errors before proceeding
  - _Requirements: 31.1_

- [ ] 7. Prisma Schema: New models and connector_installations extensions
  - [ ] 7.1 Add `Dashboard`, `DashboardWidget`, `DashboardType`, `DashboardVisibility` to `services/identity/prisma/schema.prisma`
    - Model fields must exactly match the design: `id`, `organizationId`, `ownerUserId`, `name` (VarChar 120), `description` (VarChar 500), `type DashboardType`, `visibility DashboardVisibility`, `isDefault`, `layoutConfig Json`, `refreshPolicy Int default 300`, `createdAt`, `updatedAt`, `widgets DashboardWidget[]`
    - Add relation to `Organization` with `onDelete: Cascade`
    - Add `@@index([organizationId, ownerUserId])` and `@@index([organizationId, isDefault])`
    - _Requirements: 3.2, 31.7_
  - [ ] 7.2 Add `DashboardWidget` model to schema
    - Fields: `id`, `dashboardId`, `widgetTypeId` (VarChar 64), `col`, `row`, `width`, `height`, `config Json`, `dataSourceRef String?`, `refreshOverrideSeconds Int?`, `lastFetchedAt DateTime?`, `errorState String?`, `createdAt`
    - Relation to `Dashboard` with `onDelete: Cascade`; `@@index([dashboardId])`
    - _Requirements: 4.3, 31.7_
  - [ ] 7.3 Add `ConnectorFailedRecord`, `IntegrationRequest`, `IntegrationRequestStatus` enum to schema
    - `ConnectorFailedRecord`: `id`, `connectorId`, `organizationId`, `sourceRecordId`, `failureReason`, `rawPayloadHash`, `createdAt`; `@@index([connectorId, organizationId])`
    - `IntegrationRequest`: `id`, `requesterUserId`, `organizationId`, `requestedSystemName`, `requestedConnectorType`, `businessJustification`, `status IntegrationRequestStatus default PENDING`, `reviewedByUserId?`, `reviewedAt?`, `reviewNote?`, `requestedAt`, `updatedAt`; `@@index([organizationId, status])`
    - _Requirements: 12.6, 22.3, 31.7_
  - [ ] 7.4 Extend `connector_installations` model with new columns
    - Add: `lifecycleState String?`, `discoverySnapshot Json?`, `schemaDriftDetected Boolean default false`, `mappingVersion Int default 1`, `fallbackChain Json default []`, `syncIntervalSeconds Int default 3600`, `lastSyncAt DateTime?`
    - _Requirements: 18.2, 18.3, 20.1, 22.1, 26.1, 31.7_
  - [ ] 7.5 Run `npm run db:generate` then `npm run db:push` against `ellines_eip_local`
    - Confirm schema applies cleanly; verify tables appear with `psql -d ellines_eip_local -c '\dt'`
    - _Requirements: 31.7_

- [ ] 8. Glass UI Token System
  - [ ] 8.1 Create `apps/web/src/styles/glass-ui.module.css` with the full token set
    - Define all CSS custom properties exactly as specified in the design: surfaces (`--surface-base`, `--surface-elevated`, `--surface-overlay`), borders (`--border-default`, `--border-strong`, `--border-focus`), blur (`--blur-panel`, `--blur-modal`), shadows (`--shadow-sm`, `--shadow-md`, `--shadow-lg`), radius (`--radius-sm` through `--radius-xl`), spacing (`--space-1` through `--space-12`), typography levels L1–L5 (`--font-l*-size`, `--font-l*-weight`), brand (`--brand-primary: #6F2D8D`, `--brand-dark: #0F172A`, `--brand-accent: #2563EB`, `--brand-text`, `--brand-text-muted`)
    - Add `@media (prefers-reduced-motion: reduce)` block that sets `transition-duration: 0ms !important` and `animation-duration: 0ms !important` on `*, *::before, *::after`
    - _Requirements: 9.1, 9.6, 9.7_

- [ ] 9. `app-navigation.ts` — Client navigation additions
  - [ ] 9.1 Add `ClientNavGroupId`, `ClientNavIconId`, `ClientNavItem`, `ClientNavGroupDef` type definitions to `apps/web/src/lib/app-navigation.ts`
    - `ClientNavGroupId` — union of 9 group IDs from Requirement 8.3: `client-home`, `client-business`, `client-operations`, `client-people`, `client-crm`, `client-integrations`, `client-automation`, `client-intelligence`, `client-administration`
    - `ClientNavIconId` — union of all 33 client icon keys listed in the design
    - `ClientNavItem` — interface with `id`, `label`, `href`, `icon`, `group`, `available`, `note?`, `minRole?`, `requiresPackageFeature?`
    - `ClientNavGroupDef` — interface with `id`, `label`, `collapsible`, `defaultOpen`, `itemIds`
    - _Requirements: 8.2, 31.5_
  - [ ] 9.2 Add `CLIENT_NAV_ITEMS` constant (array of `ClientNavItem`) covering all 9 groups
    - Every group from Requirement 8.3 must have at least its primary item defined
    - Items not yet available set `available: false` with a `note` explaining what package feature is required
    - No item `id` or `href` may collide with any existing `NAV_ITEMS` or `SUPER_ADMIN_NAV` entry
    - _Requirements: 8.2, 8.3, 8.7_
  - [ ] 9.3 Add `CLIENT_NAV_GROUPS` constant and `resolveClientNavigation()` function
    - `resolveClientNavigation(opts: { role, packageFeatures, grantedPermissions }): ClientNavGroupDef[]`
    - Filters by `minRole` for each item; filters by `requiresPackageFeature` against `opts.packageFeatures`; never returns any item whose `group` belongs to `NavGroupId` (Super Admin groups)
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 1.2_
  - [ ]* 9.4 Write property test for client sidebar isolation (Property 1)
    - **Property 1: Client sidebar never exposes platform items** — for arbitrary `role` + `packageFeatures` combinations, `resolveClientNavigation()` must return zero items whose `group` belongs to `{ 'ellines-organization', 'client-organizations', 'platform', 'ellinea' }`
    - Use `fast-check` with arbitrary role strings; minimum 100 iterations
    - **Validates: Requirements 1.2, 8.1, 8.2**

- [ ] 10. `ClientSidebar` component
  - [ ] 10.1 Create `apps/web/src/components/client-sidebar/ClientSidebar.tsx`
    - Accept `ClientSidebarProps`: `role`, `packageFeatures`, `grantedPermissions`, `orgName`, `collapsed`, `onToggleCollapse`
    - Call `resolveClientNavigation()` to compute visible items; never define navigation inline
    - Render `<nav aria-label="Business navigation">` → `<ul>` → `<li>` → `<a>` (available items) or `<span aria-disabled="true">` (planned items)
    - Group collapsing via `<button aria-expanded={open}>` toggle with CSS height transition (suppressed under `prefers-reduced-motion`)
    - Keyboard: `ArrowUp`/`ArrowDown` navigate within group; `Enter`/`Space` activate
    - Render a skip-navigation link as the first focusable element (Requirement 11.5)
    - Must NOT render any `PlatformSectionId` items — enforced by `resolveClientNavigation()`
    - _Requirements: 8.1, 8.2, 8.3, 8.8, 1.2, 11.1, 11.5_
  - [ ] 10.2 Create `apps/web/src/components/client-sidebar/ClientSidebar.module.css`
    - All measurements via glass-ui tokens only — no hardcoded hex or px values
    - `[data-collapsed]` state: icon-only rail at 56 px width
    - Collapsed at `max-width: 1023px` via media query; hidden at `max-width: 767px` (bottom nav replaces it)
    - Focus ring: 2 px solid `var(--border-focus)` at 3:1+ contrast
    - _Requirements: 8.9, 9.1, 9.2, 11.1_

- [ ] 11. `DashboardHeader` component
  - [ ] 11.1 Create `apps/web/src/components/dashboard-header/DashboardHeader.tsx`
    - Accept `DashboardHeaderProps`: `orgName`, `orgRole`, `orgMemberships[]`, `refreshingCount`, `onOrgSwitch`
    - Render: org name, current role, notification badge (unread critical+high count; `aria-live="polite"`), global search trigger, refresh-state indicator (`aria-live="assertive"`), profile menu, Ellinea button
    - Business selector: `<select>` or custom dropdown visible when `orgMemberships.length > 1` (Requirement 7.1)
    - Polls `GET /api/v1/dashboards/attention` every 60 s for badge count
    - Refresh state auto-clears 2 s after `refreshingCount` drops to 0; force-clears after 30 s regardless (Requirement 10.6)
    - All interactive elements `Tab`-reachable and `Enter`/`Space`-activatable
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 6.3, 7.1_
  - [ ] 11.2 Create `apps/web/src/components/dashboard-header/DashboardHeader.module.css`
    - Use glass-ui tokens; header height `56px` (matches grid row in layout)
    - _Requirements: 9.1, 9.2_

- [ ] 12. `FreshnessIndicator` component
  - [ ] 12.1 Create `apps/web/src/components/freshness-indicator/FreshnessIndicator.tsx`
    - Export `computeFreshnessLabel(lastFetchedAt: Date | null, errorState: string | null, now: Date, labelOverride?: string): FreshnessLabel` as a pure function with no side effects
    - Label boundaries: `≤ 5000ms` → `'LIVE'`; `5000–59999ms` → `Updated N seconds ago`; `60000–3599999ms` → `Updated N minutes ago`; `≥ 3600000ms` → `Cached — N minutes old`
    - When `errorState != null` → always `'Unavailable'` regardless of `lastFetchedAt`
    - When `labelOverride` set → use it; bypass age computation
    - Component: `useEffect` + `setInterval` at 5 s to re-evaluate label; cleared on unmount
    - Render `<span aria-label={label} className={styles[variant]}>`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 23.4_
  - [ ]* 12.2 Write property tests for `computeFreshnessLabel` purity (Properties 2, 3, 4)
    - **Property 2: Freshness label is a deterministic pure function** — arbitrary `(lastFetchedAt, now)` with `lastFetchedAt <= now`; repeated calls with same inputs always return the same label from the defined set
    - **Property 3: LIVE label forbidden for stale data** — arbitrary `lastFetchedAt` where `now - lastFetchedAt > 10000ms`; assert result `!== 'LIVE'`
    - **Property 4: Error state overrides freshness label** — arbitrary `(date, errorState)` with non-null errorState; assert result `=== 'Unavailable'`
    - Use `fast-check`; minimum 100 iterations per property
    - **Validates: Requirements 5.1, 5.2, 5.4, 4.6, 23.4**

- [ ] 13. `Widget` component
  - [ ] 13.1 Create `apps/web/src/components/widget/Widget.tsx`
    - Accept `WidgetProps` as defined in the design
    - Look up `WIDGET_REGISTRY[widgetTypeId]`; render error placeholder for unknown types
    - Schedule data re-fetch using `refreshOverrideSeconds ?? dashboardRefreshPolicy` via `setInterval`; clear on unmount
    - For drill-down capable types (KPI, Table, FinancialSummary, InventorySummary, AlertList): render a `<button>` or `<a>` drill-down affordance; cap depth at 3
    - When `errorState != null`: render `errorState` text with Freshness "Unavailable" label; do NOT render stale data as current
    - Render `FreshnessIndicator` below the widget title for every live-data widget
    - For chart families: render `<table aria-hidden="false" className={styles.srOnly}>` as an accessible data alternative
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7, 5.1, 5.5, 11.2_

- [ ] 14. `AttentionCenter` component
  - [ ] 14.1 Create `apps/web/src/components/attention-center/AttentionCenter.tsx`
    - On mount and every 60 s: call `GET /api/v1/dashboards/attention`; group results by severity; expose badge count via React context or callback
    - Dismiss action: `DELETE /api/v1/dashboards/attention/:itemId` — optimistic removal; restore on 4xx/5xx
    - Recurrence flag: render `[Recurrence]` badge on items with `recurrence: true`
    - Every item renders: severity, category, affected entity, evidence, `detectedAt`, available action button, `assignedTo` if present
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 15. `ConnectorWizard` component
  - [ ] 15.1 Create `apps/web/src/components/connector-wizard/ConnectorWizard.tsx`
    - Implement 8-step state machine matching the design's `stateDiagram-v2`
    - Persist `WizardState` (minus `authConfig`) to `sessionStorage` key `eip_wizard_${orgId}`; credentials held in component state only, never in sessionStorage or localStorage
    - Step 1: system category picker (ERP, POS, CRM, HR, Accounting, Hospital_System, Website, Database, REST_API, Other + "I don't see my system" → Custom_HTTP)
    - Step 3: all credential fields `type="password"`; values not logged or cached
    - Step 4: call `POST /api/v1/connectors/test-connection`; on SSRF block display "This URL cannot be reached from EIP"; do NOT advance to Step 5
    - Step 8: call `POST /api/v1/connectors/integration-requests`; does NOT install a connector
    - Keyboard: tab order follows step order; focus moves to first interactive element on step transition
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_

- [ ] 16. Checkpoint — Shared modules + Prisma + UI components
  - Run `npm run build:shared` and `npm run build -w @ellines-eip/web`; fix any TypeScript errors before proceeding
  - _Requirements: 31.1, 31.2_

- [ ] 17. Dashboard API — Core CRUD (`/api/v1/dashboards`)
  - [ ] 17.1 Implement `GET /api/v1/dashboards` and `POST /api/v1/dashboards` in `apps/web/functions/api/v1/dashboards/index.ts`
    - GET: filter `organization_id = auth.organizationId`; support `?type=` and `?default=true`; return `DashboardSummaryDto[]` (no `layoutConfig` or `widgets`)
    - POST: validate name (1–120), description (0–500), `refreshPolicy` (30–86400), valid `DashboardType` enum; check org count < 500 (422 if at limit); require `dashboard:create` permission (403 otherwise)
    - All queries include mandatory `organization_id` equality filter
    - _Requirements: 3.1, 3.2, 3.5, 3.7, 3.8, 6.6, 15.1_
  - [ ] 17.2 Implement `GET /api/v1/dashboards/[id]`, `PATCH /api/v1/dashboards/[id]`, `DELETE /api/v1/dashboards/[id]` in `apps/web/functions/api/v1/dashboards/[id].ts`
    - GET: verify `dashboard.organizationId === auth.organizationId` (403 on mismatch); return full `DashboardDto` with `widgets[]`
    - PATCH: require `dashboard:write`; accept partial updates; write audit row in same transaction when `visibility` changes
    - DELETE: require `dashboard:delete`; if `isDefault=true`, clear flag and include `{ defaultCleared: true }` in response; cascade to widgets via DB constraint
    - _Requirements: 3.1, 3.4, 3.6, 3.7, 30.1_
  - [ ] 17.3 Implement `POST /api/v1/dashboards/[id]/duplicate` and `POST /api/v1/dashboards/[id]/default`
    - Duplicate: require `dashboard:create`; new dashboard name = `"{original} (Copy)"`; `isDefault=false`; `visibility=PRIVATE`
    - Set-default: SERIALIZABLE transaction — set all matching `isDefault=false` first, then set target `isDefault=true`
    - _Requirements: 3.1, 3.3_
  - [ ]* 17.4 Write property test for SET_DEFAULT exactly-one invariant (Property 5)
    - **Property 5: SET_DEFAULT preserves exactly-one invariant** — arbitrary N dashboards for same `(ownerUserId, organizationId)`; after `SET_DEFAULT(target)`, assert `count(isDefault=true) === 1`
    - Use fast-check to generate N ∈ [1..20] dashboards; minimum 100 iterations; test against a real local DB transaction (use `beforeEach` to seed and `afterEach` to clean)
    - **Validates: Requirements 3.3**
  - [ ]* 17.5 Write property test for dashboard org isolation (Property 6)
    - **Property 6: Dashboard operations are org-scoped** — for arbitrary org pairs A≠B, no Dashboard API response authenticated as org A contains a record with `organizationId = B`
    - **Validates: Requirements 2.4, 3.1, 7.3, 7.4**

- [ ] 18. Dashboard API — Widgets, Export, Attention
  - [ ] 18.1 Implement widget sub-endpoints in `apps/web/functions/api/v1/dashboards/[id]/widgets/`
    - `POST /api/v1/dashboards/[id]/widgets` (`index.ts`): require `dashboard:write`; validate `widgetTypeId` exists in `WIDGET_REGISTRY`; validate config JSON ≤ 64 KB; return `DashboardWidgetDto` (201)
    - `PATCH /api/v1/dashboards/[id]/widgets/[wid]` and `DELETE /api/v1/dashboards/[id]/widgets/[wid]` (`[wid].ts`): wrap layout changes in a transaction; 204 on delete
    - _Requirements: 4.3, 4.4, 4.8, 4.9_
  - [ ] 18.2 Implement `POST /api/v1/dashboards/[id]/export` in `apps/web/functions/api/v1/dashboards/[id]/export.ts`
    - Require `dashboard:export` permission (403 without it)
    - Accept `{ format: 'pdf' | 'csv' | 'xlsx' | 'json' }`
    - Write audit row: `{ actor_id, organization_id, dashboard_id, export_format, widget_count, exported_at }`
    - Return export payload or signed URL
    - _Requirements: 29.1, 29.2, 29.3, 30.1_
  - [ ] 18.3 Implement `GET /api/v1/dashboards/attention` and `DELETE /api/v1/dashboards/attention/[itemId]`
    - GET: aggregate from `connector_installations` (status in `error`, `degraded`) and `approvals` (status `pending`) filtered to `organization_id`; return `AttentionItemDto[]` sorted severity DESC, detectedAt DESC; never return items from other orgs
    - DELETE: write audit row `{ user_id, item_id, category, severity, timestamp }`; return 204
    - _Requirements: 6.1, 6.2, 6.4, 6.6, 30.1_

- [ ] 19. Connector API — Integration Requests and Test-Connection
  - [ ] 19.1 Implement `POST /api/v1/connectors/integration-requests` and `GET /api/v1/connectors/integration-requests` in `apps/web/functions/api/v1/connectors/integration-requests.ts`
    - POST: any org user; validate required fields (`requestedSystemName`, `requestedConnectorType`); insert `IntegrationRequest` with `status=PENDING`; does NOT install anything; return 201
    - GET: org user sees their org's requests; platform admin with `?orgId=X` sees any org's requests
    - _Requirements: 12.5, 12.6, 24.3_
  - [ ] 19.2 Implement `POST /api/v1/connectors/test-connection` in `apps/web/functions/api/v1/connectors/test-connection.ts`
    - Route URL + authConfig through `egressRequest()` from `egress.ts`
    - On `EgressBlockedError`: return 422 `"This URL cannot be reached from EIP"` — never expose `block_reason`
    - Return `{ latencyMs, statusCode, success, message }` on success
    - _Requirements: 14.1, 14.5, 24.4_

- [ ] 20. Connector API — Lifecycle Transitions
  - [ ] 20.1 Add `PATCH /api/v1/connectors/[id]/lifecycle` endpoint
    - Extend `apps/web/functions/api/v1/connectors/[id]/` with a `lifecycle.ts` handler
    - Enforce `platformAdmin` check (403 for non-platform-admins) for state transitions that cross into ENABLED, AUTHORIZED, PAUSED, DISCONNECTED, REVOKED, REMOVED
    - Validate `(currentState, requestedState)` against `VALID_TRANSITIONS` table from the design — reject invalid pairs with 422 `"Transition from X to Y is not permitted"` without modifying the record or writing a state-change audit row
    - On valid transition: update `lifecycleState`, write audit row `{ connector_id, organization_id, previous_status, new_status, reason, timestamp }` in same DB transaction
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 12.1, 21.3, 30.2_
  - [ ]* 20.2 Write property test for connector lifecycle state machine (Property 9)
    - **Property 9: Invalid connector lifecycle transitions are rejected** — for arbitrary `(currentState, requestedState)` pairs NOT in `VALID_TRANSITIONS`, the endpoint must return HTTP 422 without modifying the connector record or writing a state-change audit row
    - Use fast-check to generate state pairs; cross-reference against `VALID_TRANSITIONS` to produce invalid pairs; minimum 100 iterations
    - **Validates: Requirements 20.1**

- [ ] 21. Connector API — Credential Encryption and Health
  - [ ] 21.1 Update connector install flow to encrypt all credential fields before DB write
    - In `apps/web/functions/api/v1/connectors/installations.ts`: wrap every credential field (`apiKey`, `bearerToken`, `basicPass`, `imapPassword`, `sftpPassword`, `sftpPrivateKey`, `connectionString`, `clientSecret`, `privateKey`) with `encrypt()` before insert
    - If `encrypt()` throws: abort insert, return 500 without persisting plaintext
    - On all GET/LIST responses: omit or replace credential fields with `••••••••`
    - Add `platformAdmin` check to install/activate/deactivate/delete/replace operations (403 + audit row for non-admins)
    - Enforce `max_connectors` inside the same DB transaction as insert (422 if at limit)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.4_
  - [ ] 21.2 Update `apps/web/functions/api/v1/connectors/health.ts` to source data from live DB only
    - Remove any hardcoded or placeholder values
    - Surface all fields from Requirement 21.1: status, `lastSuccessfulConnectionAt`, `lastSyncAttemptAt`, `latencyMs`, `errorCount24h`, `authStatus`, `recordCountLastSync`, capability status per declared capability, `lastErrorMessage` (redacted), `nextScheduledSyncAt`
    - Include `organizationId` in cache key to prevent cross-tenant health data leaks
    - _Requirements: 21.1, 21.2, 15.5_
  - [ ] 21.3 Update `apps/web/functions/api/v1/connectors/run-due.ts` for DEGRADED auto-detection
    - If `now() > lastSyncAt + 2 * syncIntervalSeconds`: set `status = 'DEGRADED'`; add attention item to Attention_Center for the owning org
    - Write audit row for SYNCING → DEGRADED transition
    - _Requirements: 21.6, 10.2_

- [ ] 22. Connector failure capture and recovery
  - [ ] 22.1 Update sync run error handling to write `ConnectorFailedRecord` rows
    - In the sync run path (called from `run-due.ts`): capture per-record failures into `connector_failed_records` with `connector_id`, `organization_id`, `source_record_id`, `failure_reason`, `raw_payload_hash`; continue processing remaining batch records
    - Never write a partial UEM record — wrap record insert in a transaction; roll back on mapping/validation failure
    - _Requirements: 22.3, 22.6_
  - [ ] 22.2 Implement replay for failed sync runs using idempotency keys
    - Replay operation uses `sourceSystem` + `sourceRecordId` as idempotency key; skip records already successfully written
    - On connector recovering from ERROR to CONNECTED: set status to CONNECTED, clear the active attention item
    - _Requirements: 22.4, 22.5_

- [ ] 23. OpenAPI Import API endpoint
  - [ ] 23.1 Update `apps/web/functions/api/v1/connectors/openapi/` to use `parseOpenApiDocument()`
    - Accept OpenAPI document as URL or file upload body; parse via `parseOpenApiDocument()` from shared
    - On success: return `OpenApiParseResult` + generate initial connector config (base URL, auth type, available endpoints)
    - On `OpenApiParseError`: return 422 with `message` and `location`; do not produce partial config
    - Test-connection calls for imported OpenAPI connectors route through `egressRequest()`; parse step makes no network calls
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [ ] 24. Field Mapping API integration
  - [ ] 24.1 Wire `applyFieldMap()` into the sync run path and expose field map save/validate endpoint
    - During sync: call `applyFieldMap(sourceRecord, fieldMap, meta)` for each record before UEM write; records failing mapping are written to `connector_failed_records`
    - `PATCH /api/v1/connectors/[id]/field-mapping`: validate map via `validateFieldMap()`; reject unknown UEM paths with 422 (warnings allowed for `_extensions`); increment `mappingVersion` on save
    - NormalizedRecord must carry `sourceSystem`, `sourceEntity`, `sourceRecordId`, `businessId`, `retrievedAt` (EIP clock), `mappingVersion`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 25. Connector Discovery endpoint
  - [ ] 25.1 Implement discovery phase in `apps/web/functions/api/v1/connectors/[id]/` — add `discovery.ts`
    - Probe connected system for available endpoints/entity types, supported methods, response schemas, pagination strategy, filter params, identifier fields, timestamp fields — via `egressRequest()`
    - Store result in `discoverySnapshot` JSON field with `discoveredAt` timestamp
    - On subsequent runs: compare new snapshot to stored; if schema changed (new/removed/changed fields), set `schemaDriftDetected = true` and surface drift warning in connector health without deactivating
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [ ] 26. Connector ↔ Dashboard integration
  - [ ] 26.1 Update Dashboard widget data source resolution to check connector capability
    - In `POST /api/v1/dashboards/[id]/widgets`: verify `dataSourceRef` connector is ENABLED and the user holds at least READ capability via `Effective_Permission`; reject with 403 if not
    - When connector enters DISABLED/ERROR/PAUSED: update `errorState` on all widgets with that `dataSourceRef`; widgets should reflect "Unavailable" within ≤ 30 s polling cycle
    - _Requirements: 27.1, 27.2, 27.3_
  - [ ] 26.2 Implement connector fallback chain resolution
    - When primary connector sync fails: attempt next step in `fallbackChain` JSON config (if configured)
    - Widget `FreshnessIndicator` must reflect the actual data source used (fallback source name + its freshness), not the preferred path
    - When all fallback options exhausted: set widget `errorState = 'Unavailable'`; never display zero or fabricated values
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

- [ ] 27. Ellinea grounding in customer dashboard context
  - [ ] 27.1 Constrain Ellinea customer-dashboard queries to authorized org data
    - In `apps/web/functions/api/v1/ellinea/`: add middleware that enforces `organization_id = auth.organizationId` on all evidence retrieval; block cross-org data access
    - If data source is unavailable (connector offline / no sync records): return explicit response `"I cannot answer this question because [data source] is currently unavailable."` — never generate synthetic or estimated values
    - Each Ellinea response in customer context must include: evidence records consulted (as linked references), data source (`connector_id` or built-in query), data freshness timestamp, uncertainty statement if confidence is insufficient
    - _Requirements: 28.1, 28.2, 28.3, 28.4_

- [ ] 28. Browser Connector type
  - [ ] 28.1 Add `Browser_Automation` connector type support
    - Add `BROWSER_AUTOMATION` to the `connectorType` enum (or equivalent) in the connector install validation
    - Validate required config: `authorizedUrlScope` (base URL + allowed path patterns), `maxRequestsPerMinute`, signed authorization record confirming permission to automate
    - All outbound requests from browser connector must pass through `egressRequest()` + SSRF guard — no separate HTTP path
    - On auth failure, CAPTCHA challenge, or MFA prompt during automated run: immediately halt, set status `AUTH_REQUIRED`, record failure event, surface attention item; never attempt to solve/simulate the challenge
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

- [ ] 29. App layout wiring — client shell
  - [ ] 29.1 Modify `apps/web/src/app/app/layout.tsx` to branch between client and platform admin shells
    - Detect active path: when route starts with `/app/platform`, skip rendering `ClientSidebar` + `DashboardHeader` (platform page has its own shell)
    - For all other `/app` routes with a client org user session: render `ClientSidebar` (left, 240 px or 56 px collapsed) + `DashboardHeader` (top, 56 px) using CSS grid layout from `client-layout.module.css`
    - For platform admin sessions on non-platform routes: preserve existing Super Admin navigation rail
    - Create `apps/web/src/app/app/client-layout.module.css` with grid template matching the design: `grid-template-columns: 240px 1fr` / `grid-template-rows: 56px 1fr`; collapsed state `56px 1fr`; mobile `< 768px` hides sidebar
    - _Requirements: 1.1, 1.2, 1.3, 8.1, 8.9, 9.1_

- [ ] 30. Dashboard pages
  - [ ] 30.1 Create `apps/web/src/app/app/dashboards/page.tsx` — dashboard list page
    - Fetch `GET /api/v1/dashboards` on mount; render list of `DashboardSummaryDto` cards
    - "Create Dashboard" action: trigger modal/form that POSTs to create endpoint
    - Cards link to `/app/dashboards/[id]`
    - Empty state for new organizations with no dashboards
    - _Requirements: 3.1_
  - [ ] 30.2 Create `apps/web/src/app/app/dashboards/[id]/page.tsx` — dashboard canvas page
    - Fetch `GET /api/v1/dashboards/:id` on mount; render `Widget` components in grid layout per `col`/`row`/`width`/`height` positions
    - Render `AttentionCenter` panel (visible when there are critical/high items)
    - Widget picker: list `WIDGET_REGISTRY` entries available for the org's connectors
    - Dashboard name and description editable inline (PATCH on blur)
    - Export button (when user has `dashboard:export` permission): dropdown for PDF/CSV/XLSX/JSON
    - _Requirements: 3.1, 4.1, 4.7, 29.1, 29.2_
  - [ ] 30.3 Implement client-side access guard for `/app/platform` routes
    - In the client-side router/layout: detect when authenticated user is a client org user (not platform admin) and path starts with `/app/platform`; render access-denied state immediately before any API call; push to `/app` within 2 seconds
    - _Requirements: 1.4_

- [ ] 31. Connector management pages (client-facing read surface)
  - [ ] 31.1 Create or update connector pages under `/app/connectors/` to show health view for client org users
    - Display connector list with live health data from `GET /api/v1/connectors/health`
    - Show per-connector: status badge, last sync time, error count, latency — sourced from DB, not hardcoded
    - Integration Request submit form: calls `POST /api/v1/connectors/integration-requests`
    - Platform admin controls (reauthorize, pause, resume, rotate) rendered only for platform admin sessions
    - `ConnectorWizard` accessible from this page for submitting integration requests
    - _Requirements: 12.5, 21.1, 21.5_

- [ ] 32. Audit and tenant isolation verification
  - [ ]* 32.1 Write integration test for connector install org isolation (Property 10)
    - **Property 10: Connector tenant isolation** — for arbitrary org pairs A≠B, a Connector_API query authenticated as org A must not return any connector record where `organizationId = B`
    - Test: seed org A and org B with connectors; query as org A; assert zero org B records in response
    - **Validates: Requirements 15.1, 15.2, 15.3**
  - [ ] 32.2 Verify all audit rows are present for required operations
    - Write an integration test that exercises: dashboard created, dashboard exported, connector install denied (403), connector state transition — and confirms each operation produced an `audit_rows` record with the correct `operation`, `actor_id`, `organization_id`, `entity_id`, and `result` fields
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

- [ ] 33. Build verification gate
  - [ ] 33.1 Run `npm run build:shared` — must pass with zero TypeScript errors
    - _Requirements: 31.1_
  - [ ] 33.2 Run `npm run build -w @ellines-eip/web` — must produce successful static export with all expected pages
    - Zero new TypeScript errors
    - No `// @ts-ignore` or untyped `any` without explanatory comment
    - _Requirements: 31.2, 31.3_
  - [ ] 33.3 Run `npm run build -w @ellines-eip/identity` — required because Prisma schema changed
    - _Requirements: 31.1_
  - [ ] 33.4 Run `npm run verify:pages-functions` (if script exists) — report no new broken imports
    - _Requirements: 31.4_

- [ ] 34. Real-World Connector Proof (Requirement 32 acceptance gate)
  - [ ] 34.1 Connect a real external business system and demonstrate end-to-end flow
    - Select a real external system (e.g. a REST API, accounting system, or database accessible from the dev machine)
    - Walk through: Authentication → Connection test → Discovery → Data retrieval → UEM normalization via `applyFieldMap()` → Dashboard widget display → Freshness Indicator rendering → Error handling (force failure) → Attention Center item → Audit record
    - Retrieve at least 4 real records; verify they appear in a dashboard widget with a correct Freshness Indicator
    - Inject a forced failure (take the system offline); confirm connector transitions to ERROR within 90 s; confirm Attention Center surfaces the item; confirm widget shows "Unavailable"
    - Restore the system; confirm connector auto-recovers to CONNECTED within the next sync cycle; confirm attention item resolves; confirm widget resumes live data
    - Query evidence from the local database: `SELECT * FROM connector_sync_runs WHERE connector_id='...'`; confirm sync run records, audit rows, freshness timestamps exist
    - Screenshots are not sufficient — the evidence must be queryable rows in the database
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5_

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
