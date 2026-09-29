# Requirements Document

## Introduction

This feature delivers the **ELLINES ORGANIZATION** section of the EIP Super Admin control plane — the internal operating dashboard for Ellines Tech staff. Unlike the CLIENT ORGANIZATIONS section (which governs external customer tenants), the Ellines Org Dashboard surfaces real-time EIP platform health, internal user management, usage telemetry, and system configuration. It reads data directly from the EIP database and platform services — no connectors are required for EIP's own operation. The section has five sub-areas: Organization Overview, Organization Data, Organization System, Organization Admin, and System Settings. Every metric displayed must derive from a real database query; hardcoded or placeholder values are not permitted on live surfaces.

---

## Glossary

- **EIP**: Ellines Enterprise Intelligence Platform — the product owned and operated by Ellines Tech.
- **Ellines Org Dashboard**: The `ELLINES ORGANIZATION` section visible only to platform admins (Ellines internal staff) in the Super Admin rail.
- **Platform Admin**: An Ellines operator whose email is in the `PLATFORM_ADMIN_EMAILS` allowlist. Not an org-level role.
- **Internal User**: A user whose `organizationId` matches the Ellines operator organization (identified by `slug = 'ellines-platform'`). These are Ellines staff, not client employees.
- **Client Organization**: An external customer tenant registered in EIP — distinct from the Ellines operator org.
- **Client User**: A user belonging to a client organization. Must never appear in Internal User management surfaces.
- **Organization Overview**: Sub-section of the Ellines Org Dashboard showing platform-wide KPIs and health.
- **Organization Data**: Sub-section showing cross-platform usage analytics — requests, connector activity, Ellinea usage, audit volume.
- **Organization System**: Sub-section showing infrastructure health — database, identity service, Pages Functions, dependency probes.
- **Organization Admin**: Sub-section for managing internal Ellines staff accounts and their access.
- **System Settings**: Sub-section for platform-wide configuration — feature flags, CORS, rate-limit tiers, datetime defaults.
- **Platform_Metrics_API**: The `/api/v1/platform/metrics` Pages Function endpoint that returns cross-platform aggregates.
- **Health_Summary_API**: The `/api/v1/platform/health/summary` Pages Function endpoint that probes live dependencies.
- **Audit_API**: The `/api/v1/platform/audit-logs` Pages Function endpoint for filtered audit log retrieval.
- **Supabase**: The hosted PostgreSQL provider used in production (Cloudflare Pages environment).
- **Prisma**: The ORM used by the NestJS identity service in local development.
- **Control_Plane**: The single `/app/platform` page with `?section=` routing that hosts all Super Admin surfaces.
- **Section_Resolver**: The `resolveContent()` function inside `PlatformSuperAdminPage` that maps a `PlatformSectionId` to its JSX content.
- **PLATFORM_LIVE_SECTIONS**: The exported constant in `app-navigation.ts` that lists every live section id.

---

## Requirements

### Requirement 1: Access Control and User Separation

**User Story:** As a Platform Admin, I want the Ellines Org Dashboard to be visible only to Ellines internal operators, so that client organization users can never access or see internal platform data.

#### Acceptance Criteria

1. WHEN a user whose email is NOT in `PLATFORM_ADMIN_EMAILS` navigates to any Ellines Org Dashboard section, THE Control_Plane SHALL deny access and display an "access denied" message without leaking any platform data.
2. WHEN a Platform Admin is authenticated, THE Control_Plane SHALL display the ELLINES ORGANIZATION group in the sidebar rail with all five sub-section items.
3. WHEN a non-platform-admin user is authenticated (client org role), THE Control_Plane SHALL NOT render any Ellines Org Dashboard section items in that user's sidebar.
4. THE Ellines_Org_Dashboard SHALL source internal user lists exclusively from the Ellines operator organization (`slug = 'ellines-platform'`), with a mandatory `organization_id` equality filter on every query.
5. IF a query for internal users is constructed without an `organization_id` filter matching the Ellines operator org, THEN THE System SHALL reject the query and log a security error before returning a 500.
6. WHEN the Platform Admin views Organization Admin, THE Organization_Admin_Section SHALL list only users whose `organizationId` matches the Ellines operator organization — no client org users may appear.

---

### Requirement 2: Organization Overview — Platform KPIs

**User Story:** As a Platform Admin, I want to see a real-time overview of how EIP is performing as a product, so that I can monitor platform health at a glance without navigating to individual client workspaces.

#### Acceptance Criteria

1. WHEN a Platform Admin navigates to Organization Overview (`?section=overview`), THE Overview_Section SHALL display the following KPIs sourced from Platform_Metrics_API: total client organizations onboarded, total active users across all client orgs, API requests in the last 24 hours, and audit events in the last 24 hours.
2. WHEN the Platform_Metrics_API returns a value for a KPI, THE Overview_Section SHALL display that value; WHEN the value is genuinely unavailable (e.g. the table does not exist), THE Overview_Section SHALL display `—` and not a hardcoded number.
3. THE Overview_Section SHALL display the live EIP health status sourced from Health_Summary_API, including overall status (`ok` / `degraded`) and database dependency status.
4. WHEN the health status is `ok`, THE Overview_Section SHALL render the status indicator with the `statusOk` CSS class; WHEN the status is not `ok`, THE Overview_Section SHALL render it with the `statusBad` CSS class.
5. THE Overview_Section SHALL auto-refresh platform metrics and health every 30 seconds using a `setInterval` that is cleared on component unmount.
6. THE Overview_Section SHALL show a "quick actions" row with links to Register Client, Client Portfolio, Service Packages, and Diagnostics — each linking to the correct `?section=` value in the Control_Plane.
7. WHEN the Platform Admin views the Overview, THE Overview_Section SHALL show a business summary table of the 8 most recently onboarded client organizations, sourced from the live `organizations` database table.

---

### Requirement 3: Organization Data — Usage Analytics

**User Story:** As a Platform Admin, I want to see cross-platform usage data for EIP, so that I can understand how the platform is being used and identify growth patterns or anomalies.

#### Acceptance Criteria

1. WHEN a Platform Admin navigates to Organization Data (`?section=org-data`), THE Organization_Data_Section SHALL be routed by the Section_Resolver and render a dedicated analytics view.
2. THE Organization_Data_Section SHALL display the following metrics sourced from Platform_Metrics_API: API requests in the last 24 hours, total audit events in the last 24 hours, total connector installations across all client orgs, and failed connector installations.
3. THE Organization_Data_Section SHALL display Ellinea AI usage data: if an `ellinea_usage` or equivalent table exists, THE Organization_Data_Section SHALL query it scoped by the 24-hour window; IF the table does not exist yet, THE Organization_Data_Section SHALL display `—` with a note "Ellinea usage tracking not yet active" rather than a placeholder number.
4. THE Organization_Data_Section SHALL display a breakdown of client organizations by status (`active` vs `suspended`) sourced from the `organizations` table.
5. WHEN data for a metric is loading, THE Organization_Data_Section SHALL show a loading indicator for that metric slot rather than a stale value.
6. THE Organization_Data_Section SHALL NOT display any data from a single client organization's workspace — all data is platform-aggregate, not per-tenant.

---

### Requirement 4: Organization System — Infrastructure Health

**User Story:** As a Platform Admin, I want to see the health of EIP's own infrastructure and services, so that I can detect and investigate system issues before they affect client organizations.

#### Acceptance Criteria

1. WHEN a Platform Admin navigates to Organization System (`?section=org-system`), THE Organization_System_Section SHALL be routed by the Section_Resolver and render infrastructure health information.
2. THE Organization_System_Section SHALL display database health sourced from Health_Summary_API, including the dependency name (`database`), status (`up` / `down`), and latency in milliseconds when available.
3. THE Organization_System_Section SHALL display EIP identity service version and status sourced from the `/api/v1/health` endpoint, including the `version` and `status` fields.
4. THE Organization_System_Section SHALL display email infrastructure status (`email.live`, `email.provider`) sourced from Health_Summary_API.
5. WHEN a dependency has status `down` or the overall health is `degraded`, THE Organization_System_Section SHALL render that dependency's row with the `statusBad` CSS class.
6. THE Organization_System_Section SHALL display the timestamp of the last health check (`checkedAt`) sourced from Health_Summary_API.
7. THE Organization_System_Section SHALL include a "Run health check" button that triggers a fresh call to Health_Summary_API and updates the display within the same user session without a full page reload.
8. THE Organization_System_Section SHALL NOT require any connector to be installed on the Ellines operator org to populate its data — all readings come directly from EIP's own health endpoints.

---

### Requirement 5: Organization Admin — Internal Staff Management

**User Story:** As a Platform Admin, I want to manage Ellines internal staff accounts from a dedicated surface, so that internal users are never mixed with client organization users in any list or management operation.

#### Acceptance Criteria

1. WHEN a Platform Admin navigates to Organization Admin (`?section=org-admin`), THE Organization_Admin_Section SHALL be routed by the Section_Resolver and render the internal staff management view.
2. THE Organization_Admin_Section SHALL list users with a mandatory `organization_id` filter set to the Ellines operator organization's id — never the full `users` table.
3. WHEN a Platform Admin creates a new internal user, THE Organization_Admin_Section SHALL POST to the existing `/api/v1/platform/orgs/{ellinesOrgId}/users` endpoint with the Ellines operator org id, ensuring the new user is created inside the Ellines org and not a client org.
4. WHEN a Platform Admin activates or deactivates an internal user, THE Organization_Admin_Section SHALL call the existing update endpoint scoped to the Ellines operator org id.
5. THE Organization_Admin_Section SHALL NOT display a "Select client organization" dropdown — the org context is always and only the Ellines operator org.
6. IF a Platform Admin attempts to create a user and the `role` field is missing, THEN THE Organization_Admin_Section SHALL prevent form submission and display a validation message.
7. THE Organization_Admin_Section SHALL display the count of active vs total internal users sourced from the `users` table filtered by the Ellines operator org id.

---

### Requirement 6: System Settings — Platform-Wide Configuration

**User Story:** As a Platform Admin, I want to manage platform-wide settings from a single place, so that global configuration is not scattered across multiple sections.

#### Acceptance Criteria

1. WHEN a Platform Admin navigates to System Settings (`?section=configuration`), THE System_Settings_Section SHALL render the existing feature flag management and tenant date/time sections that are currently live.
2. THE System_Settings_Section SHALL display all feature flags sourced from the `feature_flags` database table via the existing `/api/v1/platform/flags` endpoint, with a toggle for each flag that calls `PATCH /api/v1/platform/flags/{key}`.
3. WHEN a feature flag toggle is changed, THE System_Settings_Section SHALL optimistically update the UI and display a notice on success; IF the API call fails, THE System_Settings_Section SHALL revert the toggle and display an error message.
4. THE System_Settings_Section SHALL include a section showing the current `PLATFORM_ADMIN_EMAILS` allowlist length (count of entries, NOT the actual email addresses) sourced from the server environment, so operators can verify the allowlist is populated without exposing individual addresses.
5. THE System_Settings_Section SHALL display the count of active service packages sourced from the `rate_limit_tiers` table.
6. WHERE a platform configuration change (flag toggle, package update) requires a safeguard reason, THE System_Settings_Section SHALL invoke the existing `ConfirmDialog` component with the appropriate `operationId` before executing the change.

---

### Requirement 7: Navigation Registration

**User Story:** As a Platform Admin, I want the five Ellines Org Dashboard sub-sections to appear correctly in the sidebar rail, so that navigation follows the single-source-of-truth contract.

#### Acceptance Criteria

1. THE app-navigation.ts SHALL register `org-data`, `org-system`, and `org-admin` as `PlatformSectionId` values so the Section_Resolver can route them.
2. WHEN the Section_Resolver receives `section = 'org-data'`, `section = 'org-system'`, or `section = 'org-admin'`, THE Control_Plane SHALL render the corresponding section component rather than the `overview` fallback.
3. THE PLATFORM_LIVE_SECTIONS constant SHALL include `'org-data'`, `'org-system'`, and `'org-admin'` so they are treated as live sections, not reserved "Planned" states.
4. THE `ELLINES_ORGANIZATION_ITEMS` array in app-navigation.ts SHALL update the `href` values for `org-data`, `org-system`, and `org-admin` to use `platformSectionHref('org-data')`, `platformSectionHref('org-system')`, and `platformSectionHref('org-admin')` respectively, routing them through the Control_Plane rather than standalone pages.
5. THE `ELLINES_ORGANIZATION_ITEMS` SHALL add `section` properties (`'org-data'`, `'org-system'`, `'org-admin'`) to the corresponding nav items so `activePlatformSection` resolves them correctly.
6. WHEN a Platform Admin clicks any ELLINES ORGANIZATION sidebar item, THE Control_Plane SHALL update the active highlight on the correct item without rendering a second sidebar rail.

---

### Requirement 8: Real Data Integrity

**User Story:** As a Platform Admin, I want every metric on the Ellines Org Dashboard to reflect real database state, so that I can trust the numbers I see when making operational decisions.

#### Acceptance Criteria

1. THE Ellines_Org_Dashboard SHALL NOT render any hardcoded numeric value as a metric — every count, status, or percentage must resolve from a database query or API response.
2. WHEN a database query returns zero results, THE Ellines_Org_Dashboard SHALL display `0` (not `—`) for counts, because zero is a valid real value.
3. WHEN an API call fails (network error or 5xx), THE Ellines_Org_Dashboard SHALL display `—` for affected metrics and show an error banner; it SHALL NOT display a stale cached value as if it were current without a staleness indicator.
4. THE Ellines_Org_Dashboard SHALL NOT source data from any connector installation — EIP platform data (users, orgs, audit logs, health) is queried directly from EIP's own database and services.
5. FOR ALL user-count metrics on Organization Admin, THE queried `organization_id` SHALL equal the Ellines operator org id — this is a round-trip invariant: listing users then counting them must match the count from a direct `COUNT` query with the same filter.
6. WHEN Platform_Metrics_API returns `businesses`, THE Overview_Section SHALL exclude the Ellines operator organization itself from the count (the API already filters `slug != 'ellines-platform'`; the UI must not add to or override this count).

---

### Requirement 9: Build and TypeScript Compliance

**User Story:** As a developer, I want all new Ellines Org Dashboard code to pass the required build gates, so that nothing introduced in this feature breaks the existing CI pipeline.

#### Acceptance Criteria

1. WHEN the feature is implemented, `npm run build:shared` SHALL pass with zero TypeScript errors.
2. WHEN the feature is implemented, `npm run build -w @ellines-eip/web` SHALL produce a successful static export with all expected pages.
3. THE implementation SHALL NOT introduce any `// @ts-ignore` or untyped `any` cast without an explanatory comment.
4. WHEN `npm run verify:pages-functions` is run, THE script SHALL report no new broken imports introduced by this feature.
5. THE new `PlatformSectionId` values (`'org-data'`, `'org-system'`, `'org-admin'`) SHALL be added to the `PlatformSectionId` union type in `app-navigation.ts` before use.
6. THE `resolveContent()` function in `page.tsx` SHALL have exhaustive case entries for `'org-data'`, `'org-system'`, and `'org-admin'` before the default case.
