# Tasks: Ellines Org Dashboard

## Task 1 — Add org-data, org-system, org-admin to PlatformSectionId and navigation

**File:** `apps/web/src/lib/app-navigation.ts`

**Changes:**
1. Add `| 'org-data' | 'org-system' | 'org-admin'` to `PlatformSectionId` union type.
2. Update the three items in `ELLINES_ORGANIZATION_ITEMS`:
   - `org-data`: `href: href('org-data')`, add `section: 'org-data'`
   - `org-system`: `href: href('org-system')`, add `section: 'org-system'`
   - `org-admin`: `href: href('org-admin')`, add `section: 'org-admin'`

**Acceptance:** `PLATFORM_LIVE_SECTIONS` automatically includes `'org-data'`, `'org-system'`, `'org-admin'`. TypeScript compiles without errors.

**Status:** todo

---

## Task 2 — Add ellinesOrgUsers state and loading to platform/page.tsx

**File:** `apps/web/src/app/app/platform/page.tsx`

**Changes:**
1. Add state: `const [ellinesOrgUsers, setEllinesOrgUsers] = useState<OrgMember[]>([])`.
2. Add a `useEffect` that fires when `activeSection === 'org-admin'` and `allowed === true`: calls `listPlatformOrgUsers(getSession()!.user.organizationId)` and sets `ellinesOrgUsers`.
3. Add state for the new internal user form: `const [internalUser, setInternalUser] = useState({email:'',fullName:'',password:'',role:'member'})`.

**Acceptance:** When navigating to `?section=org-admin`, the state is populated from the Ellines operator org. No client org users appear.

**Status:** todo

---

## Task 3 — Add org-data section content

**File:** `apps/web/src/app/app/platform/page.tsx`

**Changes:**
1. Create `const orgDataPage = <...>` using `metrics`, `orgs` already in state.
2. Show four KPIs: API requests/24h, audit events/24h, connector installations, failed connectors — all from `metrics?.platform` / `metrics?.businessServices`. Use `?? '—'` for null safety.
3. Show org status breakdown: active vs suspended count from `orgs` array.
4. Show Ellinea usage slot with `—` and label "Ellinea usage tracking not yet active" (honest — no fake data).
5. Loading/error states: if `metrics === null`, show `—` for all slots.
6. Add `case 'org-data': return orgDataPage;` in `resolveContent()`.

**Acceptance:** Section renders real data from `metrics`. Zero hardcoded numbers. Compiles cleanly.

**Status:** todo

---

## Task 4 — Add org-system section content

**File:** `apps/web/src/app/app/platform/page.tsx`

**Changes:**
1. Create `const orgSystemPage = <...>` using `health`, `healthSummary`.
2. Show database dependency row: name, status (`up`/`down`), latency — from `healthSummary?.dependencies.find(d => d.name === 'database')`. Apply `statusBad` class when status is `'down'`.
3. Show identity service row: version + status from `health?.version` / `health?.status`.
4. Show email row: `healthSummary?.dependencies.find(d => d.name === 'email')`.
5. Show `checkedAt` timestamp from `healthSummary?.checkedAt`.
6. Add "Run health check" button that calls `fetchPlatformHealthSummary().then(setHealthSummary)`.
7. Add `case 'org-system': return orgSystemPage;` in `resolveContent()`.

**Acceptance:** Section renders real health data. "Run health check" button updates the display without page reload.

**Status:** todo

---

## Task 5 — Add org-admin section content

**File:** `apps/web/src/app/app/platform/page.tsx`

**Changes:**
1. Create `const orgAdminPage = <...>` using `ellinesOrgUsers` state.
2. Show active/total count: `ellinesOrgUsers.filter(u => u.isActive).length` / `ellinesOrgUsers.length`.
3. Show user table: name, email, role, active status. No "Select client org" dropdown.
4. Add user form: email, fullName, password, role — validates role is non-empty before submit.
5. On submit: call `createPlatformOrgUser(getSession()!.user.organizationId, internalUser)`, prepend to `ellinesOrgUsers`, clear form.
6. Activate/deactivate: call `updatePlatformOrgUser(getSession()!.user.organizationId, u.id, { isActive: !u.isActive })`.
7. Add `case 'org-admin': return orgAdminPage;` in `resolveContent()`.

**Acceptance:** Section lists only Ellines operator org users. Add/activate/deactivate work. Role validation blocks empty-role submit.

**Status:** todo

---

## Task 6 — Build verification

**Steps:**
1. Run `npm run build:shared`.
2. Run `npm run build -w @ellines-eip/web`.
3. Verify zero TypeScript errors, no `@ts-ignore` introduced.

**Acceptance:** Both builds exit 0.

**Status:** todo
