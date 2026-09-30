# Implementation Plan: Ellines Org Dashboard

## Overview

Wire three existing nav items (`org-data`, `org-system`, `org-admin`) into the single Control Plane at `/app/platform?section=` by extending `PlatformSectionId`, updating navigation hrefs, and adding the corresponding section content to `resolveContent()` in `platform/page.tsx`. All data comes from APIs and state already loaded in the Control Plane — no new endpoints required.

## Tasks

- [ ] 1. Add org-data, org-system, org-admin to PlatformSectionId and navigation
  - In `apps/web/src/lib/app-navigation.ts`, extend the `PlatformSectionId` union type with `| 'org-data' | 'org-system' | 'org-admin'`
  - Update the three items in `ELLINES_ORGANIZATION_ITEMS`: set `href` to `platformSectionHref('org-data')`, `platformSectionHref('org-system')`, `platformSectionHref('org-admin')` and add the corresponding `section` property to each
  - `PLATFORM_LIVE_SECTIONS` picks up the new ids automatically — no manual update needed
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.5_

- [ ] 2. Add ellinesOrgUsers state and loading to platform/page.tsx
  - In `apps/web/src/app/app/platform/page.tsx`, add state: `const [ellinesOrgUsers, setEllinesOrgUsers] = useState<OrgMember[]>([])`
  - Add a `useEffect` that fires when `activeSection === 'org-admin'` and `allowed === true`: calls `listPlatformOrgUsers(getSession()!.user.organizationId)` and sets `ellinesOrgUsers`
  - Add loading and error states for the org-admin user fetch
  - Add form state for the new internal user form: `const [internalUser, setInternalUser] = useState({ email: '', fullName: '', password: '', role: 'member' })`
  - _Requirements: 5.1, 5.2, 5.7, 1.4_

- [ ] 3. Add org-data section content
  - In `apps/web/src/app/app/platform/page.tsx`, create `const orgDataPage` using `metrics` and `orgs` already in state
  - Show four KPI slots — API requests/24h, audit events/24h, connector installations, failed connectors — sourced from `metrics?.platform` / `metrics?.businessServices`; use `?? '—'` for null safety
  - Show org status breakdown: active vs suspended count derived from the `orgs` array (already in state, excluding ellines-platform)
  - Show Ellinea usage slot: render real value if present, otherwise render `—` with the label "Ellinea usage tracking not yet active"
  - Show loading / error states: if `metrics === null`, show `—` for all numeric slots; show an inline error banner when the API call failed
  - Add `case 'org-data': return orgDataPage;` in `resolveContent()`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.1, 8.2, 8.3, 9.6_

- [ ] 4. Add org-system section content
  - In `apps/web/src/app/app/platform/page.tsx`, create `const orgSystemPage` using `health` and `healthSummary` already in state
  - Show database dependency row: name, status (`up`/`down`), latency — from `healthSummary?.dependencies.find(d => d.name === 'database')`; apply `statusBad` CSS class when status is `'down'`
  - Show identity service row: version and status from `health?.version` / `health?.status`
  - Show email row: `healthSummary?.dependencies.find(d => d.name === 'email')`
  - Show `checkedAt` timestamp from `healthSummary?.checkedAt`
  - Add "Run health check" button that calls `fetchPlatformHealthSummary().then(setHealthSummary)`; on failure, retain previous state and show inline error; button returns to idle state after call
  - Add `case 'org-system': return orgSystemPage;` in `resolveContent()`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 9.6_

- [ ] 5. Add org-admin section content
  - In `apps/web/src/app/app/platform/page.tsx`, create `const orgAdminPage` using `ellinesOrgUsers`, `usersLoading`, and form state
  - Show active/total count: `ellinesOrgUsers.filter(u => u.active).length` / `ellinesOrgUsers.length`
  - Show user table: name, email, role, active status — no "Select client org" dropdown
  - Show empty-state message when `ellinesOrgUsers` is empty and not loading
  - Render add-user form with email, fullName, password, role fields; validate that role is non-empty before allowing submit
  - On submit: call `createPlatformOrgUser(getSession()!.user.organizationId, internalUser)`, prepend result to `ellinesOrgUsers`, clear the form
  - Activate/deactivate toggle: call `updatePlatformOrgUser(getSession()!.user.organizationId, u.id, { isActive: !u.active })`
  - Add `case 'org-admin': return orgAdminPage;` in `resolveContent()`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 1.4, 1.6, 8.5, 9.6_

- [ ] 6. Build verification
  - Run `npm run build:shared` — must exit 0 with zero TypeScript errors
  - Run `npm run build -w @ellines-eip/web` — must produce a successful static export
  - Verify no `// @ts-ignore` or untyped `any` casts were introduced without an explanatory comment
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

## Notes

- Tasks marked with `*` are optional; none exist in this plan as PBT infrastructure is not being set up here
- Task 1 must complete before Tasks 3, 4, and 5 — the new `PlatformSectionId` values must exist before `resolveContent()` can reference them without TypeScript errors
- Task 2 must complete before Task 5 — `ellinesOrgUsers` state and the user form state are consumed by the org-admin section content
- Tasks 3, 4, and 5 can be implemented in parallel once Tasks 1 and 2 are done
- Task 6 is the final build gate and requires all implementation tasks to be complete
- All section content uses existing `super-admin.module.css` classes: `grid4`, `grid2`, `card`, `kpi`, `service`, `statusOk`, `statusBad`, `statusNeutral`, `button`, `primary`, `form`, `field`, `input`, `select`, `full`, `muted`, `section`, `tableWrap`, `table`
- No hardcoded numeric values are permitted — every metric must derive from an API response or render `—`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "4", "5"] },
    { "id": 3, "tasks": ["6"] }
  ]
}
```
