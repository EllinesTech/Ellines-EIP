# Requirements Document

## Introduction

This feature delivers three interconnected domains for Ellines EIP's customer-facing layer:

1. **Customer / Business Dashboard Engine** — persistent, customizable, role-adaptive dashboards that give business owners, managers, and staff a unified view of their operations sourced from connected systems.
2. **Professional EIP Glass Visual System** — a premium enterprise glass UI standard that governs all customer-facing surfaces: typography hierarchy, layered surfaces, subtle transparency, restrained effects, strict accessibility.
3. **Universal Connector Client Experience** — an 8-step setup wizard and the complete client-facing connector management surface that lets a business connect any system (REST, OpenAPI, GraphQL, SOAP, database, file, webhook, email, browser automation, or custom HTTP) without the client organization administrator installing, activating, or deleting connectors (those remain Super Admin operations).

These three domains are inseparable: connector capabilities feed dashboard availability; dashboard design is governed by the visual system; the navigation is a single role-aware, package-aware sidebar registered exclusively in `apps/web/src/lib/app-navigation.ts`.

**What is explicitly out of scope for this feature:**
- The EIP Platform / Super Admin Dashboard (`/app/platform`) — already implemented and governed by separate specs.
- Native iOS/Android mobile apps.
- Connector marketplace, digital twin, autonomous agents, multi-company group consolidation (v1.1+).

---

## Glossary

- **EIP**: Ellines Enterprise Intelligence Platform — the product owned and operated by Ellines Tech.
- **Customer_Dashboard**: The client-facing operating surface that answers "How is my business performing and what do I need to operate it?" — distinct from the Super Admin dashboard.
- **Dashboard_Engine**: The server + client subsystem responsible for creating, persisting, versioning, and rendering named dashboards with configurable widget layouts.
- **Widget**: A self-contained, typed, configurable display unit inside a dashboard. Each widget knows its data source, freshness policy, permission scope, and error state.
- **Widget_Registry**: The server-side catalogue of available widget type definitions, keyed by `widgetTypeId`.
- **Attention_Center**: The dashboard sub-system that surfaces actionable items requiring user attention (failed connectors, overdue invoices, pending approvals, low inventory, security events).
- **Connector**: A configured integration between EIP and one external business system. Connectors are installed and activated exclusively by Platform Admins (Super Admin operations). Clients may view, request, and monitor connectors.
- **Connector_Wizard**: The 8-step customer-facing flow that allows a business user to configure and submit a connector setup request (not install it — installation requires Super Admin approval).
- **Universal_Connector**: A generic HTTP connector template that allows a business to connect any REST/HTTP system without a pre-built vendor connector.
- **Egress_Function**: The single, hardened outbound HTTP function in `packages/shared` through which all connector HTTP requests must pass. No connector may make outbound HTTP calls outside this function.
- **SSRF_Guard**: The IP/hostname validation layer inside the Egress_Function that blocks private IPs, localhost, link-local addresses, and cloud metadata endpoints.
- **UEM**: Universal Entity Model — EIP's canonical normalized entity set (Customer, Supplier, Employee, Product, Sale, Purchase, Invoice, Payment, Expense, Asset, Approval, Task, Document).
- **Field_Mapping**: A configured transformation that maps source system fields to UEM fields (rename, type conversion, trim, normalize, default, date normalization, string composition/splitting).
- **Connector_Capability**: A declared operation a connector can perform: READ, CREATE, UPDATE, DELETE, APPROVE, EXPORT, SEARCH, WEBHOOK, REPORT, SYNC, EXECUTE.
- **Effective_Permission**: The intersection of Connector_Capability ∩ User_Permission ∩ Business_Policy ∩ Package_Entitlement. No user may exceed this intersection.
- **Connector_Health**: The live state of a connector installation: CONNECTED, SYNCING, DEGRADED, AUTH_REQUIRED, ERROR, DISABLED, REVOKED, UNAVAILABLE.
- **Integration_Request**: A formal request from a client org user asking a Platform Admin to install a specific connector on their behalf.
- **Glass_UI**: The EIP premium enterprise visual standard — layered surfaces, subtle transparency, backdrop blur where supported, fine borders, controlled shadows, restrained glow, strong typography hierarchy, consistent corner radius and spacing.
- **Client_Sidebar**: The single, collapsible, role-aware, package-aware sidebar for the customer dashboard, registered in `app-navigation.ts` and rendered with no second nested rail.
- **Command_Center**: The root dashboard for the customer — the entry point at `/app` showing role-adapted KPIs, attention items, and quick actions.
- **My_Work**: The staff-level dashboard tab showing assigned tasks, pending approvals, notifications, and relevant records.
- **Ellinea**: The EIP AI engine. In the customer dashboard it operates on authorized live evidence only and must never invent missing business data.
- **Freshness_Indicator**: The visible label on every live-data widget indicating the data age: LIVE, "Updated N seconds ago", "Cached — N minutes old", Historical, Snapshot, Unavailable.
- **Drill_Down**: The navigation path from a summary widget through intermediate evidence views to the originating source-system record.
- **Dashboard_API**: The `/api/v1/dashboards` Pages Function endpoint family that handles dashboard CRUD, widget CRUD, and layout persistence.
- **Connector_API**: The `/api/v1/connectors` Pages Function endpoint family that handles connector lifecycle, health, sync status, and integration requests.
- **Platform_Admin**: An Ellines operator whose email is in `PLATFORM_ADMIN_EMAILS`. The only user who may install, activate, delete, or replace a connector.
- **max_connectors**: The per-organization entitlement enforced server-side (inside the same DB transaction as any connector insert) that limits how many connectors a client org may have installed simultaneously.
- **encrypt()**: The function exported from `packages/shared/src/encryption.ts` that must be used to encrypt all connector credential fields before any database write.
- **OpenAPI_Importer**: The subsystem that accepts an OpenAPI/Swagger document, parses endpoints/auth/schemas, and generates an initial connector configuration.
- **Browser_Connector**: A connector type that performs authorized browser-based interaction (login, page navigation, data extraction, controlled form interaction, file download/upload) only with explicit customer authorization.

---

## Requirements

---

### Requirement 1: Dashboard Separation and Identity

**User Story:** As a business user, I want a dedicated customer dashboard that is entirely separate from the EIP platform administration surface, so that I never see platform-internal data and the two surfaces never bleed into each other.

#### Acceptance Criteria

1. THE Customer_Dashboard SHALL be served exclusively under `/app` routes (excluding `/app/platform`) and SHALL NOT share route segments or navigation items with the Super Admin Control Plane at `/app/platform`.
2. WHEN a client organization user is authenticated, THE Client_Sidebar SHALL NOT render any PLATFORM group items, ELLINES ORGANIZATION group items, or any route that maps to a `PlatformSectionId` — zero such elements SHALL appear in the rendered DOM.
3. WHEN a Platform Admin is authenticated, THE Control_Plane at `/app/platform` SHALL remain fully operational — all items in PLATFORM_LIVE_SECTIONS SHALL remain accessible and return their current data — and SHALL NOT be altered by any change introduced by this feature.
4. IF a client organization user manually navigates to `/app/platform` or any `?section=` variant, THEN THE System SHALL render an access-denied state client-side before any platform API call is made and the router SHALL push to `/app` within 2 seconds, without including any platform data in the response.
5. THE Client_Sidebar SHALL be registered as a distinct navigation group in `app-navigation.ts` using the single-source-of-truth pattern; no NavItem with the same `id` or `href` may appear in more than one navigation registry.

---

### Requirement 2: Role-Adaptive Command Center

**User Story:** As a business user, I want the Command Center to adapt to my assigned role so that I see only the information and actions relevant to my responsibilities.

#### Acceptance Criteria

1. WHEN an Owner or Executive logs in, THE Command_Center SHALL display: revenue, expenses, profit, growth trends, receivables, payables, inventory summary, employee count, business health score (connector health ratio + count of open critical alerts), major active alerts (severity `critical` or `high` only), pending approvals requiring owner action, connector health summary, and an Ellinea insight panel — each sourced from a live database query or connected system.
2. WHEN a Manager logs in, THE Command_Center SHALL display: assigned business or branch performance KPIs, pending approvals in their scope, staff activity summary, operational alerts, metrics configured for their assigned scope via the organization's KPI assignment configuration, and assigned reports — filtered strictly to their assigned organizational scope (`branch_id` or `department_id`).
3. WHEN a Staff member logs in, THE My_Work dashboard SHALL display: assigned tasks, approvals requiring their personal action, notifications, records they are permitted to view, upcoming calendar items, and recent activity — with zero executive-level financial information (specifically revenue, profit, expense totals, and growth trend metrics) unless the `view_financials` permission has been explicitly granted to that user by an Owner or Executive via the organization's permission settings.
4. WHILE a user session is active, THE Command_Center SHALL enforce role boundaries server-side — the API SHALL return only records whose `organization_id` matches the authenticated user's org AND whose scope (branch, department) matches the user's assignment; client-side role filtering is insufficient and SHALL NOT be used as the sole guard.
5. IF a client user's role changes during an active session, THEN THE Command_Center SHALL reflect the new role's data scope within 5 seconds of the user's next page navigation or manual refresh.
6. THE Command_Center SHALL NOT render any hardcoded numeric values as business metrics — every KPI count, sum, or percentage MUST derive from a real database query or connector response.
7. IF a user's role record is missing or cannot be resolved, THEN THE Command_Center SHALL display an error state indicating "Your role could not be determined. Contact your organization administrator." and SHALL NOT render any business metrics.

---

### Requirement 3: Dashboard Engine — Persistence and Lifecycle

**User Story:** As an authorized business user, I want to create, customize, and persist named dashboards so that my teams have stable, tailored views of the business.

#### Acceptance Criteria

1. THE Dashboard_API SHALL support CREATE, READ, UPDATE, DELETE, DUPLICATE, and SET_DEFAULT operations for dashboards, with every operation scoped by mandatory `organization_id` equality filter.
2. WHEN an authorized user creates a dashboard, THE Dashboard_Engine SHALL persist: name (1–120 characters), description (0–500 characters), owner_user_id, organization_id, visibility (private / shared / published), is_default flag, layout configuration (JSON, maximum 512 KB), refresh_policy (30–86400 seconds), created_at, and updated_at — in the `dashboards` table.
3. WHEN a dashboard is set as default for a user, THE Dashboard_Engine SHALL execute a serializable transaction that explicitly sets `is_default = false` on all other dashboards belonging to the same user and organization before setting `is_default = true` on the target dashboard.
4. WHEN an authorized user deletes a dashboard that is marked `is_default`, THE Dashboard_Engine SHALL clear the default state and SHALL return an explicit status in the response body indicating that the default was cleared.
5. THE Dashboard_Engine SHALL support the following dashboard types: Executive, Operations, Finance, HR, Sales, Inventory, CRM, Custom, Staff_My_Work — stored as an enum on the dashboard record. IF an invalid dashboard type enum value is supplied, THE Dashboard_API SHALL return a 422 and SHALL NOT persist any record.
6. WHEN a dashboard is shared or published, THE Dashboard_Engine SHALL record the sharing action in the audit log within the same transaction as the visibility update, with: actor, dashboard_id, organization_id, visibility_before, visibility_after, timestamp.
7. IF a dashboard operation (create, read, update, delete, duplicate, publish, share, set_default) is performed by a user who does not hold the required permission for that operation class, THEN THE Dashboard_API SHALL return a 403 and no database read or write SHALL execute.
8. IF creating a dashboard would cause the organization's total dashboard count to meet or exceed 500, THEN THE Dashboard_API SHALL return a 422 — no dashboard is created.

---

### Requirement 4: Widget System

**User Story:** As a dashboard owner, I want to add, configure, resize, and remove modular widgets so that I can build a dashboard that shows exactly the business data I need.

#### Acceptance Criteria

1. THE Widget_Registry SHALL define the following widget families: KPI, Metric, Trend, LineChart, BarChart, AreaChart, PieChart, DonutChart, Gauge, Table, Ranking, Status, Timeline, ActivityFeed, AlertList, ApprovalList, TaskList, ConnectorHealth, SystemHealth, ReportEmbed, EllineaInsight, Comparison, FinancialSummary, InventorySummary — each identified by a `widgetTypeId` string that is unique, immutable once published, and no longer than 64 characters.
2. WHEN a new widget type is added to the Widget_Registry, THE Dashboard_Engine SHALL make it available to authorized dashboards without requiring changes to the dashboard layout renderer.
3. WHEN a user adds a widget to a dashboard, THE Dashboard_API SHALL persist: dashboard_id, widget_type_id, position (col, row, width, height), config (JSON), data_source_ref, refresh_override_seconds, created_at — in the `dashboard_widgets` table. IF the insert fails due to a database error, THE Dashboard_API SHALL return an error response and the dashboard state SHALL remain unchanged.
4. WHEN a user reorders or resizes a widget, THE Dashboard_API SHALL persist the updated layout atomically — partial layout updates that leave the dashboard in an inconsistent state MUST be prevented by wrapping the layout update in a transaction. IF the transaction fails, THE Dashboard_API SHALL return an error response and the dashboard state SHALL remain at its last confirmed state.
5. EACH widget SHALL expose: data_source (connector_id / report_id / UEM entity / built-in query), freshness_policy, last_fetched_at, permission_scope, and error_state — and SHALL surface these fields to the Freshness_Indicator component.
6. WHEN a widget's data source is a connector that becomes DISABLED or ERROR, THE Widget SHALL display its error_state with a visible indicator and SHALL NOT render stale data as current — the previous value MAY be shown with a staleness label if it is still within the widget's configured staleness tolerance. IF no staleness tolerance is configured on the widget, the default staleness tolerance is 3600 seconds.
7. WHERE a widget type supports drill-down (KPI, Table, FinancialSummary, InventorySummary, AlertList), THE Widget SHALL provide a drill-down affordance that navigates through the evidence chain (summary → detail → source record) without opening a new browser tab unless the final destination is an external source system. WHEN the drill-down chain reaches depth 3 (summary, detail, source record), THE Widget SHALL NOT navigate deeper and SHALL indicate that the source system is the terminal point.
8. WHEN a user removes a widget, THE Dashboard_API SHALL delete the widget record and return a success response. IF deletion fails, THE Dashboard_API SHALL return an error response and the widget SHALL remain in the dashboard unchanged.
9. IF a widget's `config` JSON exceeds 64 KB, THE Dashboard_API SHALL reject the request with an error indicating the configuration is too large.

---

### Requirement 5: Data Freshness

**User Story:** As a business user, I want every data widget to clearly show me how fresh the data is, so that I can distinguish live information from cached or stale information.

#### Acceptance Criteria

1. EVERY live-data widget on the Customer_Dashboard SHALL display a Freshness_Indicator whose label matches: "LIVE" (≤ 5 s old), "Updated N seconds ago" (5–59 s), "Updated N minutes ago" (1–59 min), "Cached — N minutes old" (≥ 60 min), "Snapshot" (point-in-time export), "Historical" (date-ranged archive query), or "Unavailable" (source unreachable / connector in ERROR state).
2. THE Freshness_Indicator SHALL derive its label from `last_fetched_at` in the widget record — it SHALL NOT be hardcoded or faked.
3. WHEN a widget's data source cannot be reached, THE Dashboard_Engine SHALL update the widget's `error_state` and set the Freshness_Indicator to "Unavailable" within 30 seconds of the first failed retrieval attempt.
4. THE Dashboard_Engine SHALL NEVER display a Freshness_Indicator of "LIVE" for data whose `last_fetched_at` timestamp is more than 10 seconds older than the current server time.
5. WHEN a dashboard is configured with a refresh_policy, THE Client_Dashboard_Renderer SHALL schedule client-side re-fetch intervals matching the policy and SHALL clear all intervals on component unmount.

---

### Requirement 6: Attention Center

**User Story:** As a business user, I want a centralized Attention Center that surfaces the most important items requiring my action, so that I never miss critical business events.

#### Acceptance Criteria

1. THE Attention_Center SHALL aggregate and display attention items from the following categories: overdue invoices, failed payments, low/zero inventory, failed or degraded connectors, pending approvals in the user's scope, unusual expense spikes (> 2× 30-day average), security events, workflow execution failures — filtered to the user's effective permission scope.
2. EACH attention item SHALL carry: severity (critical / high / medium / low), category, source system or connector_id, affected business entity, evidence (record IDs or counts), timestamp of detection, available action (view / approve / investigate / dismiss), and assigned_to (if applicable).
3. WHEN the Attention_Center contains items of severity "critical" or "high", THE Client_Sidebar notification indicator SHALL display a badge count equal to the number of unresolved critical+high items.
4. WHEN a user dismisses an attention item, THE Attention_Center SHALL record the dismissal in the audit log with user_id, item_id, category, severity, and timestamp, and SHALL remove the item from the active list.
5. WHEN a previously dismissed attention item recurs (e.g. the same connector fails again after recovery), THE Attention_Center SHALL surface it as a new item with a "recurrence" flag rather than suppressing it.
6. THE Attention_Center SHALL NOT surface attention items from organizations other than the authenticated user's `organization_id` — cross-tenant attention data is a critical defect.

---

### Requirement 7: Multi-Business Dashboard Switching

**User Story:** As an Owner who controls multiple businesses, I want to switch between business contexts in a single dashboard header, so that I can monitor each business independently without logging out.

#### Acceptance Criteria

1. WHEN a user is a member of more than one organization, THE Dashboard_Header SHALL display a business selector dropdown listing all organizations the user is a member of, labeled with the organization name and the user's role in that organization.
2. WHEN a user selects a different organization in the business selector, THE Command_Center SHALL re-render with the data scope of the selected organization — no data from the previously selected organization SHALL remain visible in widgets.
3. WHEN a Portfolio (All Businesses) view is selected, THE Dashboard_Engine SHALL aggregate KPIs across ONLY the organizations the authenticated user is a member of — it SHALL NOT aggregate data from organizations the user does not belong to.
4. WHEN a Comparison view is active (Business A vs B), THE Dashboard_Engine SHALL enforce that both organizations are in the authenticated user's membership list before returning any comparison data — a 403 SHALL be returned for any organization outside the user's memberships.
5. THE Dashboard_Header SHALL always display the currently selected organization name prominently so that a user can never be uncertain which business context is active.

---

### Requirement 8: Client Sidebar Navigation

**User Story:** As a business user, I want a single, collapsible sidebar that shows only the modules I can access based on my role and package, so that navigation is clear and uncluttered.

#### Acceptance Criteria

1. THE Client_Sidebar SHALL be the single navigation surface for client organization users — no second sidebar rail, nested rail, or competing navigation component may exist in the same rendered layout.
2. THE Client_Sidebar SHALL be registered exclusively in `apps/web/src/lib/app-navigation.ts`; no other file may define overlapping client sidebar navigation items.
3. THE Client_Sidebar SHALL organize items into the following groups — visible only when the user's role and package entitlement grant access to at least one item in the group: HOME (Command Center, My Work, Alerts, Approvals, Activity), BUSINESS (Overview, Performance, Reports, Analytics), OPERATIONS (Sales, Purchases, Inventory, Customers, Suppliers, Payments, Expenses, Assets, Branches, Warehouses), PEOPLE (Employees, Departments, Attendance, Leave, Payroll, Users, Roles), CUSTOMER RELATIONSHIP (Customers, Leads, Opportunities, Activities, Follow-ups), INTEGRATIONS (Connected Systems, Connector Health, Integration Requests), AUTOMATION (Rules, Workflows, Schedules, Executions), INTELLIGENCE (Ellinea AI, Insights, Recommendations), ADMINISTRATION (Users & Access, Business Settings, Notifications, Audit, Data/Privacy).
4. WHEN a user's effective role is Owner, THE Client_Sidebar SHALL display all navigation groups and items for which the organization's package grants entitlement.
5. WHEN a user's effective role is Manager, THE Client_Sidebar SHALL display: HOME, BUSINESS, OPERATIONS, PEOPLE, CUSTOMER RELATIONSHIP, INTEGRATIONS (view-only items only), INTELLIGENCE — and SHALL NOT display ADMINISTRATION items not assigned to that manager's scope.
6. WHEN a user's effective role is member or viewer (Staff), THE Client_Sidebar SHALL display: HOME (Command Center, My Work, Alerts, Approvals only), and any OPERATIONS items explicitly granted to the user's role — and SHALL NOT display BUSINESS analytics, PEOPLE management, ADMINISTRATION, or INTEGRATIONS management items.
7. WHERE a navigation item maps to a capability that is not included in the organization's service package, THE Client_Sidebar SHALL render the item with `available: false` and a descriptive `note` field — it SHALL NOT create a live route for an unavailable capability.
8. THE Client_Sidebar SHALL be keyboard-navigable with visible focus indicators and screen-reader labels on every item.
9. WHEN the viewport is tablet-width (< 1024 px), THE Client_Sidebar SHALL collapse to an icon-only rail; WHEN the viewport is mobile-width (< 768 px), THE Client_Sidebar SHALL be replaced by a bottom navigation bar or drawer.

---

### Requirement 9: Professional Glass UI Visual System

**User Story:** As a business user, I want the customer dashboard to have a premium, readable, enterprise-grade visual appearance, so that I can work confidently in a professional environment.

#### Acceptance Criteria

1. THE Glass_UI system SHALL define a CSS custom-property token set covering: surface backgrounds (base, elevated, overlay), border colors (default, strong, focus), blur radius (panel blur, modal blur), shadow scale (sm, md, lg), corner radius (sm, md, lg, xl), spacing scale (4 px base grid), and typography scale (display, heading-1 through heading-4, body-lg, body-md, body-sm, caption) — defined in a single shared CSS module imported by all customer dashboard components.
2. EVERY customer dashboard page SHALL apply the Glass_UI token system — no dashboard component may use hardcoded hex color values or pixel measurements that bypass the token system. IF a component references a hex color value or pixel measurement not defined through a Glass_UI token, treat it as a build-time constraint violation to be caught by code review.
3. THE Glass_UI system SHALL maintain WCAG 2.1 AA contrast ratios (minimum 4.5:1 for body text, 3:1 for large text and UI components) across all surface/text combinations, including when backdrop blur and transparency are applied.
4. WHEN backdrop-filter (blur) is applied to a panel, THE Glass_UI system SHALL ensure that text content on that panel achieves a minimum 4.5:1 contrast ratio for body text and 3:1 for large text against the blurred composite background — not merely against the raw background color.
5. THE Glass_UI SHALL define five visual hierarchy levels: L1 (page title / primary purpose), L2 (section headings), L3 (card/data group containers), L4 (individual data values), L5 (supporting metadata / timestamps / labels) — and every dashboard component SHALL apply the corresponding level to its elements without skipping levels.
6. THE Glass_UI SHALL enforce reduced-motion: WHEN the user's OS reports `prefers-reduced-motion: reduce`, ALL animations and transitions in the customer dashboard SHALL be suppressed to instantaneous state changes — explicitly: `transition-duration: 0ms` and `animation-duration: 0ms`; no animation with duration > 0ms SHALL remain active.
7. THE Glass_UI SHALL use the Exo 2 typeface and the Ellines brand color palette (`#6F2D8D` primary, `#0F172A` dark surface, `#2563EB` accent) as defined in `assets/brand/` — no alternative typeface or brand color outside this palette may be introduced.
8. NO customer dashboard screen SHALL contain decorative visual effects that make any data value or status indicator unreadable when viewed at 100% zoom on a 1280 × 800 display. "Readable" is defined as achieving a 4.5:1 contrast ratio between the text or indicator foreground and the immediate background after all visual effects are composited.

---

### Requirement 10: Dashboard Header

**User Story:** As a business user, I want a persistent dashboard header that shows my current business context, role, notification state, and quick access to Ellinea, so that I always know where I am and can act quickly.

#### Acceptance Criteria

1. THE Dashboard_Header SHALL be rendered on every customer dashboard route and SHALL display: the current organization name, the current user's role in that organization, a notification badge (unread item count from Attention_Center, displaying `0` when there are no unread items), a global search/command trigger, a refresh-state indicator, a profile menu, and an Ellinea access button.
2. WHEN a multi-organization user is active, THE Dashboard_Header SHALL display the business selector dropdown as specified in Requirement 7.
3. THE Dashboard_Header SHALL NOT be re-rendered on client-side navigation between dashboard sections — it SHALL persist using a shared layout component that does not unmount between route transitions.
4. WHEN all active data-fetch operations complete, THE Dashboard_Header SHALL clear the "Refreshing…" state within 2 seconds.
5. THE Dashboard_Header SHALL be keyboard-accessible: all interactive elements (business selector, notification, search, profile, Ellinea) SHALL be reachable via `Tab` key and activatable via `Enter` or `Space`.
6. IF a data-fetch operation remains active for more than 30 seconds, THE Dashboard_Header SHALL clear the "Refreshing…" state and display an error indicator — the header SHALL NOT display "Refreshing…" indefinitely.

---

### Requirement 11: Accessibility

**User Story:** As a business user with accessibility needs, I want the customer dashboard to be fully usable with assistive technologies, so that I am not excluded from any operational capability.

#### Acceptance Criteria

1. THE Customer_Dashboard SHALL support full keyboard navigation: every interactive element SHALL be reachable by `Tab`/`Shift+Tab` and all focusable elements SHALL display a visible focus ring that meets the 3:1 contrast requirement against the adjacent background color.
2. EVERY chart widget SHALL provide a screen-reader-accessible alternative representation (data table or ARIA description) containing the same data values displayed visually, so that data values are accessible without a visual display.
3. EVERY dialog and modal in the customer dashboard SHALL implement focus trapping (focus locked inside the dialog while open) and SHALL return focus to the trigger element that opened it when closed.
4. ALL form fields in the customer dashboard SHALL have programmatically associated labels (using `<label for="">` or `aria-labelledby`) — placeholder text alone SHALL NOT serve as the accessible label.
5. THE Customer_Dashboard SHALL expose a skip-navigation link as the first focusable element on each page, allowing keyboard users to bypass the sidebar rail and reach the main content area directly.
6. EVERY status badge, severity indicator, and icon-only button SHALL include an `aria-label` or `title` attribute that describes its meaning without relying on color alone to convey state.
7. IF a dynamic content region (notification count, refresh indicator, inline error) updates without a full page navigation, THE Customer_Dashboard SHALL mark that region with an appropriate ARIA live region attribute (`aria-live="polite"` or `aria-live="assertive"`).

---

### Requirement 12: Connector Governance — Super Admin Authority

**User Story:** As a Platform Admin, I want connector installation and activation to be exclusively my operations, so that client organization users cannot install, modify, or remove connectors without platform oversight.

#### Acceptance Criteria

1. THE Connector_API SHALL enforce a `platformAdmin` check at the API layer (not only RBAC) for the following operations: connector install, connector activate, connector deactivate, connector delete, connector replace — and SHALL return a 403 with an error body indicating insufficient privilege for any request that does not originate from a verified Platform Admin session.
2. WHEN a connector install is requested and the calling user is not a Platform Admin, THE Connector_API SHALL return a 403 and SHALL write an audit record with: actor_id, organization_id, operation = "connector:install:denied", reason = "insufficient_privilege", timestamp — the audit write SHALL NOT be omitted even if the request is rejected before reaching business logic.
3. THE `max_connectors` entitlement check SHALL be performed inside the same database transaction as the connector insert — if the insert would meet or exceed the entitlement, the transaction SHALL be rolled back, no connector record SHALL be persisted, and a 422 SHALL be returned with a descriptive error; UI-only entitlement checks are not acceptable.
4. WHEN a connector install succeeds, THE Connector_API SHALL write an audit record within the same transaction as the insert — containing: actor_id (Platform Admin), organization_id, connector_id, connector_type, max_connectors_at_time, timestamp — so that a failed audit write rolls back the install.
5. CLIENT organization users (any role inside a client org) SHALL be permitted to: view the list of installed connectors, view connector health and sync status, view role-appropriate error messages, and submit Integration_Requests — these are the only connector-related operations available to client org users. Any other connector operation attempted by a client org user SHALL return a 403.
6. WHEN a client org user submits an Integration_Request, THE Connector_API SHALL persist the request with: requester_user_id, organization_id, requested_system_name, requested_connector_type, business_justification, requested_at, status = "pending" — and SHALL NOT automatically install any connector. IF any of the required fields (requester_user_id, organization_id, requested_system_name, requested_connector_type, requested_at) are absent, THE Connector_API SHALL return a 422 without persisting any record.
7. ALL connector credential fields (`apiKey`, `bearerToken`, `basicPass`, `imapPassword`, `sftpPassword`, `sftpPrivateKey`, `connectionString`, `clientSecret`, `privateKey`) SHALL be encrypted using `encrypt()` from `packages/shared/src/encryption.ts` before writing to the database — no credential value SHALL appear in any database record, API response, log entry, or audit record.

---

### Requirement 13: Connector Credential Security

**User Story:** As a Platform Admin, I want all connector credentials to be encrypted at rest and never exposed in API responses or logs, so that secrets cannot be extracted from the system.

#### Acceptance Criteria

1. BEFORE any connector credential field (`apiKey`, `bearerToken`, `basicPass`, `imapPassword`, `sftpPassword`, `sftpPrivateKey`, `connectionString`, `clientSecret`, `privateKey`) is written to the database, THE Connector_API SHALL invoke `encrypt()` from `packages/shared/src/encryption.ts` — plaintext storage of any credential field is a critical security defect.
2. WHEN a connector record is returned by any API endpoint (GET, LIST, health, status), THE response payload SHALL NOT include any credential field value — credential fields SHALL either be omitted entirely or replaced with the redaction marker `••••••••`.
3. WHEN a connector health check, sync operation, or test-connection call writes to any log, audit record, or error message, THE System SHALL ensure no credential value appears in the written record — the `encrypt()` output (ciphertext) SHALL also be excluded from logs.
4. THE Connector_API SHALL verify that the `encrypt()` function has been called successfully before executing the database insert — if `encrypt()` throws, the insert SHALL be aborted and a 500 returned without persisting plaintext.
5. WHEN a connector's credentials are rotated, THE Connector_API SHALL encrypt the new credentials before storing them and SHALL write an audit record containing: actor_id, connector_id, organization_id, operation = "connector:credentials:rotated", timestamp — with zero credential values in the audit payload.

---

### Requirement 14: SSRF Protection and Egress Policy

**User Story:** As a Platform Admin, I want all outbound connector requests to pass through a single hardened egress function, so that a malicious base URL cannot be used to probe internal network infrastructure.

#### Acceptance Criteria

1. ALL outbound HTTP requests initiated by any connector (REST, OpenAPI, GraphQL, SOAP, custom HTTP, browser connector, OpenAPI importer test calls) SHALL be routed exclusively through the `Egress_Function` in `packages/shared` — no connector module may construct and execute an independent `fetch()` or HTTP client call outside this function.
2. THE SSRF_Guard inside the Egress_Function SHALL block and reject any request whose resolved destination matches: private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`), cloud metadata endpoint (`169.254.169.254`), and any non-HTTPS scheme.
3. WHEN the SSRF_Guard blocks a request, THE Egress_Function SHALL return a structured error object containing: blocked_url (hostname only, not full path), block_reason, timestamp — and SHALL NOT make any network connection to the destination.
4. THE SSRF_Guard SHALL resolve the hostname to its IP address before comparing against the block list — it SHALL NOT rely solely on lexical hostname matching, which can be bypassed by DNS rebinding.
5. WHEN a connector test-connection call is made against a URL that the SSRF_Guard blocks, THE Connector_API SHALL return a 422 with the safe error message "This URL cannot be reached from EIP" — it SHALL NOT expose the internal block_reason to the client.
6. THE Egress_Function SHALL enforce per-connector timeout and retry limits (maximum 30 s timeout, maximum 3 retries with exponential backoff) — connectors that exceed these limits SHALL be placed in a DEGRADED state.

---

### Requirement 15: Connector Tenant Isolation

**User Story:** As a Platform Admin, I want every connector query and operation to be scoped to the correct organization, so that one client's connector configuration and data cannot be accessed by another client.

#### Acceptance Criteria

1. EVERY database query in the Connector_API that reads or writes connector data SHALL include a mandatory `organization_id` equality filter — a query without this filter is a critical defect and SHALL NOT be merged.
2. WHEN the Connector_API receives a request for connector details, the server SHALL verify that the connector's `organization_id` matches the authenticated user's `organization_id` before returning any data — a mismatch SHALL return a 403 and write a security audit record.
3. THE Connector_API SHALL NOT expose connector names, types, credentials, health data, or sync history from one organization in any response to a user from a different organization.
4. WHEN a connector sync run is triggered, THE sync worker SHALL read the `organization_id` from the connector record and scope all data writes (UEM records, audit rows, health metrics) to that `organization_id` — it SHALL NOT reuse or share UEM records across organizations.
5. THE connector health endpoint SHALL include the `organization_id` in its cache key so that health data for Organization A is never served to Organization B.

---

### Requirement 16: Connector Types and Authentication

**User Story:** As a Platform Admin, I want to configure connectors for any protocol and authentication method a business system uses, so that EIP is not limited to a single vendor's API pattern.

#### Acceptance Criteria

1. THE Connector_API SHALL support the following connector protocol types: REST, OpenAPI, GraphQL, SOAP, PostgreSQL, MySQL, SQL_Server, Oracle, CSV_SFTP, XLSX_SFTP, JSON_File, XML_File, Webhook_Inbound, SMTP_IMAP_Email, Browser_Automation, Custom_HTTP — each identified by a stable `connectorType` enum value.
2. THE Connector_API SHALL support the following authentication adapters: API_Key (header or query param), Bearer_Token, Basic_Auth, OAuth2_Client_Credentials, OAuth2_Authorization_Code, OIDC, Custom_Header, HMAC_Signed, mTLS — each configured via a typed `authConfig` JSON object.
3. WHEN an OAuth2 access token expires, THE Connector_API SHALL automatically attempt a token refresh using the stored (encrypted) refresh token before marking the connector as AUTH_REQUIRED — if refresh fails, the connector SHALL be set to AUTH_REQUIRED and an audit record SHALL be written.
4. THE Custom_HTTP connector type SHALL support configuration of: system name, system type, base URL, auth adapter, additional headers, query parameters, HTTP method, endpoint path, request body template, pagination strategy (offset/cursor/page), response format (JSON/XML), timeout, retry policy, rate limit, date range parameters, response field mapping, and entity type mapping.
5. WHERE a connector type requires database credentials (PostgreSQL, MySQL, SQL_Server, Oracle), THE connector config SHALL store the connection string exclusively via `encrypt()` and SHALL NOT allow the connection string to be read back in plaintext through any API endpoint.

---

### Requirement 17: OpenAPI Import Flow

**User Story:** As a Platform Admin, I want to import an OpenAPI/Swagger document to automatically generate a connector configuration, so that connecting OpenAPI-documented systems requires minimal manual field entry.

#### Acceptance Criteria

1. THE OpenAPI_Importer SHALL accept an OpenAPI v2.0 (Swagger) or OpenAPI v3.0/v3.1 document, provided as a URL or file upload, and SHALL parse: server base URL, security schemes, endpoint paths, HTTP methods, operation IDs, request schemas, response schemas, and available tags.
2. WHEN the OpenAPI_Importer successfully parses a document, THE Connector_API SHALL generate an initial connector configuration record containing the detected base URL, auth type (mapped from `securitySchemes`), and a list of available endpoint definitions.
3. WHEN the OpenAPI_Importer encounters a document it cannot parse (malformed JSON/YAML, unsupported version), THE Connector_API SHALL return a 422 with a descriptive error identifying the failure location — it SHALL NOT silently produce an empty or partial connector config.
4. WHEN an imported OpenAPI connector is test-connected, THE test call SHALL pass through the Egress_Function and SSRF_Guard before any network connection is made.
5. THE OpenAPI_Importer SHALL NOT execute any endpoint in the imported document as part of the import/parse step — endpoint execution occurs only during the explicit test-connection step in Step 4 of the Connector_Wizard.
6. AFTER OpenAPI import, THE Platform Admin SHALL be able to select which discovered capabilities (endpoints) are activated for the connector — deselected capabilities SHALL NOT be callable by the connector at runtime.

---

### Requirement 18: Connector Discovery

**User Story:** As a Platform Admin, I want EIP to discover the available entities, fields, and operations of a connected system, so that mapping and capability configuration is based on what the system actually exposes.

#### Acceptance Criteria

1. WHEN a connector enters the discovery phase (Connector_Wizard Step 5), THE Connector_API SHALL probe the connected system and record: available endpoints or entity types, supported HTTP methods per endpoint, response schema (field names and inferred types), pagination strategy, available filter parameters, identifier fields, and timestamp fields.
2. THE discovery result SHALL be stored in the connector record's `discoverySnapshot` JSON field with a `discoveredAt` timestamp, so that schema drift can be detected by comparing subsequent discovery runs.
3. IF discovery reveals a schema change (new fields, removed fields, changed types) relative to the stored `discoverySnapshot`, THEN THE Connector_API SHALL set the connector's `schemaDriftDetected` flag to true and SHALL surface a drift warning in the Connector_Health display without deactivating the connector.
4. THE Connector_API SHALL NOT assume that two different system instances of the same vendor expose identical API structure — each connector instance maintains its own discovery snapshot.
5. WHERE a connected system provides an OpenAPI description, THE discovery phase SHALL prefer the OpenAPI document over manual endpoint probing; WHERE no OpenAPI is available, THE discovery phase SHALL use configured manual endpoint definitions.

---

### Requirement 19: Field Mapping

**User Story:** As a Platform Admin, I want to configure how a connected system's fields map to EIP's universal entity model, so that EIP can normalize data from any system into a consistent format.

#### Acceptance Criteria

1. THE Field_Mapping subsystem SHALL support the following transformation types per field: rename (source field name → UEM field name), type_cast (string→number, string→boolean, string→date), trim (leading/trailing whitespace), normalize (uppercase/lowercase/titlecase), default_value (apply when source field is null/absent), date_format (ISO 8601 normalization from a specified source format), string_compose (combine multiple source fields → one UEM field), string_split (split one source field → multiple UEM fields).
2. WHEN a field mapping is saved, THE Connector_API SHALL validate that the target UEM field path exists in the UEM schema — unknown UEM paths SHALL be rejected with a 422; unmapped source-specific fields MAY be retained as `_extensions.{sourceFieldName}` on the normalized record.
3. WHEN a connector performs a sync, THE mapping engine SHALL apply the configured Field_Mapping to each source record before writing to the UEM store; if a required UEM field (marked `required: true` in the UEM schema) has no valid mapping and no default, THE sync SHALL mark that record as `mapping_error` and continue processing remaining records.
4. THE Field_Mapping configuration SHALL be versioned — each mapping change increments `mappingVersion` on the connector record and THE normalized records produced after the change SHALL carry the new `mappingVersion`.
5. EVERY normalized UEM record SHALL carry: `sourceSystem` (connector_id), `sourceEntity` (source entity type name), `sourceRecordId` (original PK from source), `businessId` (organization_id), `retrievedAt` (UTC timestamp from EIP clock, not source), `mappingVersion`.

---

### Requirement 20: Connector Lifecycle

**User Story:** As a Platform Admin, I want to manage the full lifecycle of a connector — from initial discovery through to eventual removal — so that I can maintain, pause, resume, and revoke connectors safely.

#### Acceptance Criteria

1. THE Connector_API SHALL support the following lifecycle state transitions, enforced as valid state machine moves: Discover → Configure → Authenticate → Test → Validate → Map → Authorize → Enable → Monitor → Reauthorize → Rotate → Pause → Resume → Disconnect → Revoke → Remove — invalid transitions (e.g. Enable → Rotate without Monitor) SHALL be rejected with a 422.
2. WHEN a connector is Paused, THE sync scheduler SHALL stop scheduling new sync runs for that connector without deleting the connector configuration, field mappings, or sync history.
3. WHEN a connector is Resumed from Pause, THE Connector_API SHALL schedule the next sync run within the connector's configured sync interval and SHALL write an audit record for the Resume operation.
4. WHEN a connector is Revoked, THE Connector_API SHALL: clear all stored credentials (overwrite encrypted fields with a null/empty marker), set state to REVOKED, stop all sync activity, and write a full revocation audit record — it SHALL NOT delete the connector record or its sync history.
5. WHEN a connector is Removed (after Revocation), THE Connector_API SHALL delete the connector record and its field mappings; associated audit records and normalized UEM records SHALL be retained per data retention policy.

---

### Requirement 21: Connector Health Monitoring

**User Story:** As a client org user, I want to see the health status of every connector installed on my organization, so that I know immediately when a data source is unavailable or degraded.

#### Acceptance Criteria

1. THE Connector_Health display SHALL show for each connector: status (CONNECTED / SYNCING / DEGRADED / AUTH_REQUIRED / ERROR / DISABLED / REVOKED / UNAVAILABLE), last successful connection timestamp, last sync attempt timestamp, latency (ms), error count (last 24 h), auth status, record count processed in last sync run, capability status per declared capability, last error message (redacted of credentials), and next scheduled sync time.
2. THE Connector_Health data SHALL be sourced exclusively from the live `connector_installations` and `connector_sync_runs` database tables — hardcoded or placeholder values (e.g. "Last sync: N/A" when a sync record exists) are not acceptable.
3. WHEN a connector's status changes (e.g. CONNECTED → DEGRADED), THE Connector_API SHALL write an audit record with: connector_id, organization_id, previous_status, new_status, reason, timestamp.
4. WHEN a connector has status AUTH_REQUIRED, THE Connector_Health display SHALL surface a call-to-action for the Platform Admin (not the client org user) to reauthorize, without exposing any credential values.
5. THE Connector_Health display SHALL be accessible to client org users for read purposes; the reauthorize, pause, resume, and rotate controls SHALL be rendered only for Platform Admins.
6. WHEN a connector has not successfully synced within twice its configured sync interval, THE Connector_API SHALL automatically set its status to DEGRADED and add an attention item to the Attention_Center for the owning organization.

---

### Requirement 22: Connector Failure and Recovery

**User Story:** As a Platform Admin, I want failed connector sync runs to be captured, retried with bounded backoff, and replayable, so that transient failures do not cause permanent data gaps.

#### Acceptance Criteria

1. WHEN a connector sync run encounters a network error, timeout, or HTTP 5xx response, THE sync engine SHALL retry the run up to 3 times with exponential backoff (base 30 s, max 8 min) before marking the run as FAILED.
2. WHEN a sync run is marked FAILED after exhausting retries, THE Connector_API SHALL: record the failure in `connector_sync_runs` with error_code, error_message, retry_count, failed_at; set the connector status to ERROR if it was SYNCING; and add a critical attention item to the Attention_Center.
3. WHEN a sync run produces individual record-level failures (mapping error, validation error, duplicate key), THE sync engine SHALL capture the failed records in a `connector_failed_records` table with: connector_id, organization_id, source_record_id, failure_reason, raw_payload_hash — and SHALL continue processing remaining records in the batch.
4. A Platform Admin SHALL be able to replay a failed sync run; THE replay operation SHALL use idempotency keys (`sourceSystem` + `sourceRecordId`) to prevent duplicate writes — replaying a run that already produced successful records SHALL NOT create duplicates.
5. WHEN a connector is in ERROR state and a subsequent sync run succeeds, THE Connector_API SHALL set the connector status to CONNECTED and SHALL clear the active attention item added during the error period.
6. THE sync engine SHALL never write a partial record to the UEM store — if the mapping or validation of a record fails mid-way, the entire record insert SHALL be rolled back; only fully validated records are committed.

---

### Requirement 23: Connector Data Policy

**User Story:** As a business owner, I want EIP to retrieve my business data live rather than automatically copying my entire operational database, so that I retain control over what is persisted in EIP.

#### Acceptance Criteria

1. THE Connector_API SHALL retrieve operational business data (records, transactions, inventory levels) live from connected systems on-demand or on the configured sync schedule — it SHALL NOT automatically bulk-copy the client's entire operational database into EIP unless an explicit snapshot has been requested and authorized.
2. THE System SHALL persist the following connector-derived artifacts without requiring a separate authorization step: field mappings, connector metadata, audit records, derived aggregate metrics (counts, sums, averages), connector health records, and explicit snapshots requested by an authorized user.
3. WHEN a user requests an explicit data snapshot, THE Connector_API SHALL record: requester_user_id, organization_id, connector_id, entity_type, record_count, snapshot_at, authorized_by — and SHALL make the snapshot available for offline or export use.
4. THE Dashboard_Engine SHALL clearly distinguish between LIVE data (fetched within the widget's refresh window), SNAPSHOT data (point-in-time export), and CACHED data (within the staleness tolerance) using the Freshness_Indicator — displaying any of these as "LIVE" when they are not is a critical defect.
5. WHEN a connector is paused or disconnected, THE Dashboard_Engine SHALL mark all widgets sourcing data from that connector as "Unavailable" rather than showing the last-fetched value without a staleness indicator.

---

### Requirement 24: Customer Connector Setup Wizard

**User Story:** As an authorized business user, I want to submit a connector setup request through a guided wizard, so that I can initiate connecting a business system without needing to understand the technical configuration details.

#### Acceptance Criteria

1. THE Connector_Wizard SHALL present exactly 8 sequential steps: (1) What are you connecting? (2) How does it provide access? (3) Authentication configuration, (4) Connection test, (5) Discovery preview, (6) Field mapping review, (7) Capabilities selection, (8) Enable / submit request.
2. THE Connector_Wizard SHALL offer the following system categories in Step 1: ERP, POS, CRM, HR, Accounting, Hospital_System, Website, Database, REST_API, Other — and SHALL always include an "I don't see my system" route that routes to the Custom_HTTP connector type.
3. WHEN a user completes the Connector_Wizard and submits at Step 8, THE Connector_API SHALL create an Integration_Request record with status "pending" — the wizard SHALL NOT directly install or activate a connector; installation requires Platform Admin approval.
4. WHEN the Connector_Wizard is at Step 4 (connection test), THE test call SHALL pass through the Egress_Function and SSRF_Guard; IF the SSRF_Guard blocks the URL, THE wizard SHALL display "This URL cannot be reached from EIP" and SHALL NOT advance to Step 5.
5. THE Connector_Wizard SHALL preserve wizard state across browser refreshes using the session store (not localStorage) — a user who refreshes at Step 5 SHALL return to Step 5 with their Step 1–4 selections intact.
6. WHEN the Connector_Wizard is at Step 3 (authentication), THE credential fields SHALL be masked (type="password") and the values SHALL be transmitted exclusively over HTTPS; the wizard client SHALL NOT log, cache, or echo credential values.
7. THE Connector_Wizard SHALL be keyboard-accessible: tab order follows wizard step order, the "Next" and "Back" buttons are reachable via keyboard, and focus moves to the first interactive element of each new step upon step transition.

---

### Requirement 25: Browser / Website Connector

**User Story:** As a Platform Admin, I want to configure a browser automation connector for systems that have no accessible API, so that EIP can still retrieve authorized data from web-based business systems.

#### Acceptance Criteria

1. THE Browser_Connector type SHALL support the following authorized operations: authenticated login/session initialization, page navigation to authorized URLs, structured data extraction from rendered HTML, controlled form interaction (fill and submit), file download from authorized file endpoints, file upload to authorized upload endpoints.
2. THE Browser_Connector SHALL NOT attempt to: bypass authentication flows, solve or simulate CAPTCHA/MFA challenges, exceed rate limits set by the target system, access pages outside the authorized URL scope defined in the connector config, or violate any mechanism that signals programmatic access is not permitted (`X-Robots-Tag: noindex`, `robots.txt` disallow, explicit `noai` directives).
3. WHEN a Browser_Connector is configured, THE configuration MUST include: a signed authorization record from the data owner confirming permission to automate access, the authorized URL scope (base URL + allowed path patterns), and the maximum request rate (requests per minute).
4. ALL Browser_Connector outbound requests SHALL pass through the Egress_Function and SSRF_Guard — the browser automation layer SHALL NOT use a separate HTTP path that bypasses SSRF protection.
5. WHEN a Browser_Connector encounters an authentication failure, CAPTCHA challenge, or MFA prompt during an automated run, THE connector SHALL immediately halt execution, set status to AUTH_REQUIRED, record the failure event, and surface an attention item — it SHALL NOT attempt to solve or simulate the challenge.

---

### Requirement 26: Connector Fallback Architecture

**User Story:** As a business user, I want EIP to continue operating as much as possible when one connector fails, using alternative data paths where available, so that a single system outage does not black out my entire dashboard.

#### Acceptance Criteria

1. THE Connector_API SHALL support a connector fallback chain: Preferred_API → Alternative_API → Database → File_SFTP → Webhook_Event → Browser_Automation — the chain is configured per connector group, and each step is only attempted if the previous step fails.
2. WHEN a fallback step is used to satisfy a dashboard widget request, THE Freshness_Indicator SHALL display the data source and freshness of the actual data path used, not the preferred path — displaying fallback data with LIVE freshness when it came from a file export is a critical defect.
3. THE fallback chain SHALL respect all authorization and connector policy checks for each step — a fallback step that the organization or Platform Admin has not authorized SHALL be skipped, even if technically capable.
4. WHEN EIP falls back to an alternative data source for a widget, THE widget SHALL display a visible indicator showing "Data from: [alternative source name]" in addition to the Freshness_Indicator.
5. WHEN all configured fallback options for a connector group are exhausted, THE affected widgets SHALL display "Unavailable" with a timestamp of last known data — they SHALL NOT display zero, empty, or fabricated values.

---

### Requirement 27: Connector ↔ Dashboard Integration

**User Story:** As a dashboard owner, I want my dashboard to automatically reflect the capabilities and health of connected systems, so that I can add widgets only for data that is actually available from my connected systems.

#### Acceptance Criteria

1. WHEN a connector is enabled for an organization, THE Dashboard_Engine SHALL update the Widget_Registry's availability map for that organization so that widget types dependent on that connector's declared capabilities become selectable in the widget picker.
2. WHEN a connector is paused, disabled, or enters ERROR state, THE Dashboard_Engine SHALL mark all widgets sourcing data from that connector as "Unavailable" and update their Freshness_Indicator within one polling cycle (≤ 30 s).
3. THE widget data source picker SHALL ONLY offer connector data sources for which the authenticated user holds at least READ capability within their Effective_Permission — it SHALL NOT offer data sources the user's role cannot access.
4. THE Connector_API SHALL NOT dictate dashboard layout, widget arrangement, or presentation style — connector capabilities are inputs to the Dashboard_Engine, not layout prescriptions.
5. WHEN a new connector capability is added to an existing enabled connector (e.g. REPORT capability added), THE Dashboard_Engine SHALL make the corresponding widget types available in the picker within one capability-sync cycle (≤ 60 s) without requiring a page reload.

---

### Requirement 28: Ellinea AI in the Customer Dashboard

**User Story:** As a business user, I want to ask Ellinea questions about my business data and receive answers that cite real evidence from connected systems, so that AI insights are trustworthy and verifiable.

#### Acceptance Criteria

1. WHEN a user submits a query to Ellinea from the Customer_Dashboard, THE Ellinea subsystem SHALL ground its response exclusively in data the user is authorized to access within their organization — it SHALL NOT access data from other organizations or data sources outside the user's Effective_Permission.
2. EVERY Ellinea response displayed in the Customer_Dashboard SHALL include: the evidence records consulted (as linked references), the data source (connector_id or built-in query), the data freshness timestamp, and an explicit uncertainty statement where the AI cannot draw a confident conclusion.
3. THE Ellinea subsystem SHALL NOT generate synthetic or estimated values for missing business data — if the data needed to answer a question is unavailable (connector offline, no sync records), THE response SHALL state this explicitly: "I cannot answer this question because [data source] is currently unavailable."
4. WHEN a user asks a comparison query (e.g. "Compare this month with last month"), THE Ellinea subsystem SHALL verify that records for both comparison periods exist before generating the comparison — if one period has no data, THE response SHALL report the gap rather than treating the missing period as zero.
5. THE Ellinea insight widget on the Command_Center SHALL be dismissed per-session (not permanently hidden) and SHALL NOT be shown on the Staff My_Work dashboard unless the organization's Owner has explicitly enabled it for staff roles.

---

### Requirement 29: Dashboard Exports

**User Story:** As an authorized business user, I want to export dashboard views and reports, so that I can share business data in standard formats with stakeholders.

#### Acceptance Criteria

1. THE Dashboard_Engine SHALL support export of the current dashboard view in the following formats: PDF (print-ready layout), CSV (tabular widget data), XLSX (tabular widget data with formatting), JSON (machine-readable widget data payloads).
2. WHEN a user requests a dashboard export, THE Dashboard_API SHALL verify that the user holds the EXPORT permission for that dashboard before generating the export — a 403 SHALL be returned for unauthorized export attempts.
3. WHEN an export is generated, THE Dashboard_API SHALL write an audit record with: actor_id, organization_id, dashboard_id, export_format, widget_count, exported_at.
4. WHEN a scheduled report is configured, THE Dashboard_Engine SHALL generate the report on the configured schedule and deliver it to the configured recipients — the delivery mechanism SHALL use the existing notification outbox (SMTP) and SHALL NOT introduce a parallel email path.
5. THE exported data SHALL reflect the same authorization scope as the live dashboard — exports SHALL NOT include data the requesting user cannot see in the live view.

---

### Requirement 30: Audit — Dashboard and Connector Operations

**User Story:** As a Platform Admin, I want all sensitive dashboard and connector operations to be audited so that I can investigate any changes to the customer environment.

#### Acceptance Criteria

1. THE System SHALL write an audit record for each of the following dashboard operations: dashboard created, dashboard deleted, dashboard published, dashboard shared, sensitive widget configured (Ellinea insight, financial summary), dashboard exported, scheduled report created or deleted.
2. THE System SHALL write an audit record for each of the following connector operations: connector installed, connector activated, connector deactivated, connector credentials rotated, connector paused, connector resumed, connector revoked, connector removed, integration request submitted, integration request approved or rejected.
3. EACH audit record SHALL include: actor_id, actor_role, organization_id, operation, entity_type, entity_id, result (success/failure/denied), reason (if applicable), timestamp, correlation_id.
4. THE audit records for connector operations SHALL NOT include any credential value — credential fields SHALL be omitted or replaced with `[REDACTED]`.
5. THE audit records written by this feature SHALL conform to the `audit_rows` schema and SHALL be queryable through the existing `/api/v1/platform/audit-logs` endpoint by Platform Admins.

---

### Requirement 31: Build and TypeScript Compliance

**User Story:** As a developer, I want all new client dashboard and connector platform code to pass the required build gates, so that this feature does not break the existing CI pipeline.

#### Acceptance Criteria

1. WHEN the feature is implemented, `npm run build:shared` SHALL pass with zero TypeScript errors.
2. WHEN the feature is implemented, `npm run build -w @ellines-eip/web` SHALL produce a successful static export with all expected pages — no new TypeScript errors may be introduced.
3. THE implementation SHALL NOT introduce any `// @ts-ignore` or untyped `any` cast without an explanatory comment stating why the cast is necessary and what the safe type constraint is.
4. WHEN `npm run verify:pages-functions` is run, THE script SHALL report no new broken imports introduced by this feature.
5. ALL new `PlatformSectionId` or client section id values introduced by this feature SHALL be added to the appropriate union type in `app-navigation.ts` before use in any component or route.
6. THE `resolveContent()` function (or equivalent router) SHALL have exhaustive case entries for every new section id before any default/fallback case.
7. WHEN Prisma schema changes are required to support new tables (`dashboards`, `dashboard_widgets`, `connector_failed_records`, etc.), THE schema MUST be updated in `services/identity/prisma/schema.prisma` and both `ellines_eip_local` and the Supabase production database MUST receive the schema change via `npm run db:push` before the feature is considered implemented.

---

### Requirement 32: Real-World Connector Proof

**User Story:** As a Platform Admin, I want EIP to be proven against at least one real external business system before the connector platform is considered complete, so that the implementation is verified against actual runtime behaviour rather than mocked tests.

#### Acceptance Criteria

1. THE feature is NOT complete until a real external business system (not a mock or stub) has been successfully connected, demonstrating: Authentication → Connection → Discovery → Data Retrieval → UEM Normalization → Dashboard Widget display → Freshness Indicator → Error handling → Audit record.
2. WHEN the real connector experiment runs, EIP SHALL authenticate against the target system using the configured auth adapter, retrieve at least 4 real records, and display them in a dashboard widget with a correct Freshness_Indicator.
3. WHEN a forced failure is injected (target system made unreachable), THE connector SHALL transition to ERROR state within 90 seconds, THE Attention_Center SHALL surface the failure item, and the dashboard widget SHALL display "Unavailable".
4. WHEN the target system is restored after a forced failure, THE connector SHALL automatically recover (resume CONNECTED state) within the next sync cycle, THE attention item SHALL be resolved, and the widget SHALL resume displaying live data.
5. THE real-world experiment SHALL produce an evidence record (connector_id, organization_id, sync run records, audit rows, freshness timestamps) that can be queried from the live database — screenshots or source-code assertions are not sufficient evidence of runtime correctness.
