# Design Document: Ellines Org Dashboard

## Overview

The Ellines Org Dashboard wires three existing nav items (`org-data`, `org-system`, `org-admin`) into the single Control Plane at `/app/platform?section=` rather than their current standalone routes. No new pages, no second sidebar rail. Every metric derives from existing live APIs (`/api/v1/platform/metrics`, `/api/v1/platform/health/summary`, `/api/v1/health`, `/api/v1/platform/flags`).

## Architecture

### Navigation change (Requirement 7)

Currently `org-data`, `org-system`, `org-admin` items in `ELLINES_ORGANIZATION_ITEMS` have `href: '/app/org-data'` etc and no `section` property — they bypass the Control Plane. This design routes them through the Control Plane:

- Add `'org-data' | 'org-system' | 'org-admin'` to `PlatformSectionId` union type
- Add `section` property and `href = platformSectionHref(...)` to each item
- `PLATFORM_LIVE_SECTIONS` auto-picks them up (it filters `NAV_ITEMS` where `available: true` and `section` is set)
- Add cases to `resolveContent()` in `platform/page.tsx`

### Section content

All four sections use only the data already loaded in the Control Plane (`metrics`, `healthSummary`, `health`, `flags`, `orgs`). No new API calls are needed — the data is already fetched at page load and refreshed every 30 s.

#### org-data — Organization Data (Requirement 3)
- API requests / 24h, audit events / 24h, connector installations, failed connectors — from `metrics`
- Org breakdown by status (active vs suspended) — from `orgs` state (already loaded, filtered to exclude ellines-platform)
- Ellinea usage: if `metrics` has a field, show it; otherwise show `—` with honest label
- Error states: show `—` per slot when data is null

#### org-system — Organization System (Requirement 4)
- Database dep status + latency — from `healthSummary.dependencies`
- Identity service version + status — from `health` (version, status)
- Email status — from `healthSummary.dependencies` (name=email)
- Last checked timestamp — from `healthSummary.checkedAt`
- "Run health check" button — calls `fetchPlatformHealthSummary()` and updates state
- `statusBad` CSS class when dep is down

#### org-admin — Organization Admin (Requirement 5)
- Load internal users: call `listPlatformOrgUsers(ellinesOrgId)` scoped to Ellines operator org only
- The Ellines org id is found from `getSession().user.organizationId` (the platform admin is a member of the Ellines org)
- Show user list with active/total count
- No client org dropdown — context is always the Ellines operator org
- Add user form POSTs to `createPlatformOrgUser(ellinesOrgId, user)`
- Role validation before submit

#### System Settings (already live as `configuration` section — Requirement 6)
- Already implemented. No changes needed — `resolveContent()` already has `case 'configuration'`.

### User separation (Requirement 1)
- The `org-admin` section queries `listPlatformOrgUsers(session.user.organizationId)` — the platform admin's own org IS the Ellines operator org
- Client org users never appear because the query is scoped to a different org id
- Access guard already in place: `allowed` state only becomes `true` when `isPlatformAdmin` is true

## Data flow

```
platform/page.tsx (load())
  ├── fetchPlatformMetrics()      → metrics state
  ├── fetchPlatformHealthSummary() → healthSummary state
  ├── fetchHealth()               → health state
  └── listPlatformFlags()         → flags state

resolveContent():
  case 'org-data'   → reads metrics, orgs (already in state)
  case 'org-system' → reads health, healthSummary (already in state)
  case 'org-admin'  → reads ellinesOrgUsers state (loaded on section enter)
  case 'configuration' → already implemented (reads flags)
```

## CSS

Uses existing `super-admin.module.css` classes: `grid4`, `grid2`, `card`, `kpi`, `service`, `statusOk`, `statusBad`, `statusNeutral`, `ok`, `warn`, `button`, `primary`, `form`, `field`, `input`, `select`, `full`, `muted`, `section`, `tableWrap`, `table`.

## Constraints

- No hardcoded metrics — every value comes from an API response or shows `—`
- No second sidebar rail introduced
- Keyboard navigation via existing shell — no new navigation code
- Build must pass TypeScript strict with zero `@ts-ignore`

---

## Components and Interfaces

### Section Components

#### `OrgDataSection`

Renders the Organization Data analytics view (`?section=org-data`).

```tsx
interface OrgDataSectionProps {
  metrics: PlatformMetrics | null;
  orgs: ClientOrg[];           // already loaded in Control Plane state; Ellines org excluded
  metricsError: string | null;
}
```

Reads: `metrics.apiRequests24h`, `metrics.auditEvents24h`, `metrics.connectorInstalls`, `metrics.failedConnectorInstalls`, `metrics.ellineaUsage24h` (optional field — `—` when absent or null). Org breakdown (active vs suspended) is derived from the `orgs` prop without a new API call.

#### `OrgSystemSection`

Renders the Organization System infrastructure health view (`?section=org-system`).

```tsx
interface OrgSystemSectionProps {
  health: IdentityHealth | null;          // from /api/v1/health
  healthSummary: HealthSummary | null;    // from /api/v1/platform/health/summary
  healthError: string | null;
  onRunHealthCheck: () => Promise<void>;  // triggers fresh fetchPlatformHealthSummary()
}
```

Reads database and email deps from `healthSummary.dependencies`. Identity version + status from `health.version` / `health.status`. "Run health check" button calls `onRunHealthCheck` and the Control Plane updates `healthSummary` state in place.

#### `OrgAdminSection`

Renders the Organization Admin internal staff management view (`?section=org-admin`).

```tsx
interface OrgAdminSectionProps {
  ellinesOrgId: string;                       // session.user.organizationId (always the Ellines operator org)
  users: OrgMember[];                         // loaded on section enter; scoped to ellinesOrgId
  usersLoading: boolean;
  usersError: string | null;
  onCreateUser: (payload: CreateUserPayload) => Promise<void>;
  onToggleUser: (userId: string, active: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}
```

No client org dropdown is rendered. `ellinesOrgId` is always sourced from the authenticated platform admin's session.

### API Helper Functions

| Function | Endpoint | Used by |
|---|---|---|
| `fetchPlatformMetrics()` | `GET /api/v1/platform/metrics` | OrgDataSection, Overview |
| `fetchPlatformHealthSummary()` | `GET /api/v1/platform/health/summary` | OrgSystemSection, Overview |
| `fetchHealth()` | `GET /api/v1/health` | OrgSystemSection |
| `listPlatformOrgUsers(orgId)` | `GET /api/v1/platform/orgs/{orgId}/users` | OrgAdminSection |
| `createPlatformOrgUser(orgId, payload)` | `POST /api/v1/platform/orgs/{orgId}/users` | OrgAdminSection |
| `updatePlatformOrgUser(orgId, userId, patch)` | `PATCH /api/v1/platform/orgs/{orgId}/users/{userId}` | OrgAdminSection |
| `listPlatformFlags()` | `GET /api/v1/platform/flags` | System Settings (already live) |

All helpers are called with the platform admin JWT. None accept an org id for client organizations — the `orgId` parameter in user helpers is always the Ellines operator org id.

---

## Data Models

### `PlatformMetrics`

Returned by `fetchPlatformMetrics()`. Every numeric field is `number | null` — never a hardcoded fallback.

```ts
interface PlatformMetrics {
  businesses: number | null;          // client orgs, excludes ellines-platform
  activeUsers: number | null;         // active users across all client orgs
  apiRequests24h: number | null;
  auditEvents24h: number | null;
  connectorInstalls: number | null;
  failedConnectorInstalls: number | null;
  ellineaUsage24h?: number | null;    // optional — absent when table does not exist
}
```

### `HealthSummary`

Returned by `fetchPlatformHealthSummary()`.

```ts
interface HealthSummary {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;          // ISO 8601 timestamp
  dependencies: HealthDependency[];
}

interface HealthDependency {
  name: string;               // e.g. 'database', 'email'
  status: 'up' | 'down';
  latencyMs?: number;         // present for database dep when up
  detail?: string;            // additional context when down
}
```

### `OrgMember`

Returned by `listPlatformOrgUsers()`. Represents a single internal Ellines staff account.

```ts
interface OrgMember {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  organizationId: string;     // always equals ellinesOrgId — enforced server-side
  createdAt: string;
}
```

### `PlatformSectionId` — Union Type Extension

The existing union in `app-navigation.ts` is extended to include the three new section identifiers:

```ts
// Before
type PlatformSectionId = 'overview' | 'clients' | 'packages' | 'configuration' | /* … */;

// After (additions in this feature)
type PlatformSectionId =
  | 'overview'
  | 'clients'
  | 'packages'
  | 'configuration'
  | 'org-data'      // ← new
  | 'org-system'    // ← new
  | 'org-admin'     // ← new
  | /* remaining existing values */;
```

`PLATFORM_LIVE_SECTIONS` picks these up automatically because it filters `NAV_ITEMS` for items with `available: true` and a `section` property set.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: User Isolation (Org Admin)

*For any* authenticated platform admin session, the list of users rendered by `OrgAdminSection` must contain only records whose `organizationId` equals `session.user.organizationId`. Rendering the section with a dataset containing users from multiple organizations must produce a filtered list that is a strict subset containing zero cross-org records.

**Validates: Requirements 1.4, 5.2, 8.5**

### Property 2: Metric Integrity (No Hardcoded Values)

*For any* `PlatformMetrics` object passed to `OrgDataSection` or the Overview section, every numeric slot rendered in the UI must equal the corresponding field value from the API response. If a field is `null`, the slot must render `—`. No slot may render a value that differs from its source field — hardcoded substitution of any kind is a violation.

**Validates: Requirements 2.2, 3.3, 3.4, 8.1, 8.2**

### Property 3: Single Control Plane Navigation

*For any* click on an `ELLINES_ORGANIZATION_ITEMS` nav entry, the resulting URL must match `platformSectionHref(section)` — i.e. `/app/platform?section={section}`. No navigation may produce a URL that points to a standalone page (`/app/org-data`, `/app/org-system`, `/app/org-admin`). The sidebar must not instantiate a second rail component as a result of the navigation.

**Validates: Requirements 7.2, 7.4, 7.6**

---

## Error Handling

### API Failure — Metric Slots

When `fetchPlatformMetrics()` returns a network error or a 5xx response:

- Each metric slot in `OrgDataSection` and the Overview section renders `—` (not a stale cached number without qualification).
- An inline error banner is shown at the top of the affected section with a human-readable message.
- The auto-refresh interval is preserved; the next tick retries the call silently.

When a specific metric field is `null` in a successful response (e.g. `ellineaUsage24h` absent):

- That slot renders `—` with its honest static label (e.g. "Ellinea usage tracking not yet active").
- Other slots in the same response continue to render their real values.

### Health Check Errors

When `fetchPlatformHealthSummary()` fails during the automatic 30-second refresh:

- `OrgSystemSection` and the Overview retain the last successfully loaded `healthSummary` value.
- A staleness indicator (e.g. "Last updated X min ago — refresh failed") is shown next to the timestamp.
- The display does not crash or clear; the previous values remain visible.

When the manual "Run health check" button is clicked and the call fails:

- The button returns to its idle state.
- An inline error message is shown; the previous `healthSummary` state is unchanged.

### Session Expiry

When the platform admin's JWT expires while a section is open:

- Any in-flight API call returns 401.
- The Control Plane catches the 401, clears `metrics`, `healthSummary`, `health`, `flags`, and `ellinesOrgUsers` from state, and redirects to `/login`.
- No partial platform data remains visible in the DOM after redirect.

### Missing Environment Configuration

When `PLATFORM_ADMIN_EMAILS` is absent or empty in the server environment:

- All requests to platform admin sections return 403 by default.
- A configuration warning is logged server-side.
- The UI receives a standard access-denied response; no platform data is included in the payload.

---

## Testing Strategy

PBT is applicable here: the section components are pure render functions whose output is fully determined by their props, making them suitable for property-based testing with generated inputs.

### Property-Based Tests

**Library**: `fast-check` (TypeScript-compatible, works in Jest/Vitest).

Each test runs a minimum of 100 iterations.

#### PBT 1 — Metric integrity in OrgDataSection

Generate arbitrary `PlatformMetrics` objects where each numeric field is independently either a random non-negative integer or `null`. For each generated value, render `OrgDataSection` and assert:

- Every non-null field value appears verbatim in the rendered output (no rounding, no substitution).
- Every null field renders the `—` placeholder string.
- No rendered slot contains a number that is not present in the input `metrics` object.

*Tag: Feature: ellines-org-dashboard, Property 2: Metric Integrity*

#### PBT 2 — User isolation in OrgAdminSection

Generate a list of `OrgMember` records drawn from two arbitrary org ids (one matching `ellinesOrgId`, one not). Render `OrgAdminSection` with the mixed list as the `users` prop. Assert:

- Every rendered user row has `organizationId === ellinesOrgId`.
- The count of rendered rows equals the count of input records that belong to `ellinesOrgId`.
- Zero records from the foreign org id appear in the rendered output.

*Tag: Feature: ellines-org-dashboard, Property 1: User Isolation*

#### PBT 3 — `statusBad` class on degraded health

Generate arbitrary `HealthSummary` objects where each dependency's status is independently either `'up'` or `'down'`. Render `OrgSystemSection` with the generated summary. Assert:

- Every dependency row with `status === 'down'` has the `statusBad` CSS class applied.
- Every dependency row with `status === 'up'` does NOT have the `statusBad` class.
- The property holds regardless of the number of dependencies or the order in which they appear.

*Tag: Feature: ellines-org-dashboard, Property 3: Single Control Plane Navigation*

### Unit Tests (Example-Based)

- Navigation: clicking each ELLINES ORGANIZATION sidebar item produces the correct `?section=` URL and does not mount a second `<aside>` element.
- Access guard: rendering the Control Plane without `isPlatformAdmin = true` renders no ELLINES ORGANIZATION items in the DOM.
- Session expiry: a simulated 401 response clears state and triggers redirect to `/login`.
- "Run health check" button: success path updates `healthSummary` in state; failure path retains previous state and shows error message.
- Feature flag toggle: optimistic update reverts on API failure, confirmed by checking toggle state before and after the simulated error.

### Integration Tests

- End-to-end navigation through all three new sections against a seeded local database — verified to return real row counts, not zeros from an empty table.
- `listPlatformOrgUsers` called with the Ellines operator org id returns only internal users; called with a client org id from the same database returns a disjoint set.
