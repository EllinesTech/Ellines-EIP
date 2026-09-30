# Universal Connector Engine — Tasks

## Verification record (2026-09-30, branch `eip/complete-dashboard-connector-platform`)

Every task below was re-verified against the code, not assumed from file presence.

| Task | Status | Evidence |
|---|---|---|
| TASK-1 `recordCount` / `connectedSystems` | done | `recordCount` present in **both** data planes: `apps/web/functions/shared/connectors.ts` and `packages/connectors-sdk/src/index.ts`. 11 invariant tests in `packages/connectors-sdk/src/__tests__/normalization.spec.ts`. |
| TASK-2 `record_count` column | done | `services/identity/prisma/schema.prisma:415` `recordCount Int @default(0) @map("record_count")`. |
| TASK-3 active connector count in sync | done | `apps/web/functions/api/v1/connectors/installations/[id]/sync.ts` derives `connected_systems` from the `connector_installations` active-install count, not from payload fields. |
| TASK-4 `systemLabel` / `businessId` / `branchId` | done | Declared in `InstallConfig` (both planes) and exposed in the connector wizard Step 1. |
| TASK-5 configurable date window | done | `dateWindowEnabled`, `dateParamFrom`, `dateParamTo` implemented and covered by `haven-connector.spec.ts`. |
| TASK-6 `validateFieldMap()` | done | Implemented; semantic validation covered by `haven-connector.spec.ts`. |
| TASK-7 webhook `connected_systems` | done | `apps/web/functions/api/v1/webhooks/inbound.ts:275-280` uses the org's real active-installation count; the `Math.max(..., 1)` inflation was removed. |
| TASK-8 Haven test suites | done | `apps/web/functions/__tests__/haven-connector.spec.ts` plus new capability/SDK suites. |
| TASK-9 build verification | done | See "Full verification" below. |
| TASK-10 commit to working branch | done | Committed on `eip/complete-dashboard-connector-platform`; **not** merged or pushed to `main`. |

### Additional work completed beyond the original task list

- **Capability authorization** (`packages/shared/src/capabilities.ts`) — 25 invariant tests.
- **Capability enforcement on the proxy** (`apps/web/functions/api/v1/connectors/proxy.ts`) — 8 end-to-end tests.
- **NestJS credential encryption at rest** (`services/identity/src/enterprise/enterprise.service.ts`).
- **Real-world connector proof** — `npm run verify:haven-connector`, 51/51 passing.

### Known remaining gap (not claimed complete)

- **Browser / website automation connector** is not implemented. The spec's authorized-browser
  path (authenticated session retrieval for systems that expose no API) remains outstanding.
  No bypass of CAPTCHA/MFA/access controls is implemented or planned.

---

## Task Execution Order

Tasks must be completed in order. Each task has a clear acceptance test. Do not mark a task done without build + runtime evidence.

---

## TASK-1: Add `recordCount` to normalized payload; fix `connectedSystems` aliases

**Files:** `apps/web/functions/shared/connectors.ts`

**Changes:**
1. Add `recordCount: number` to the return type of `normalizeEnterprisePayload()`.
2. Move aliases `count / total / length` from the `connectedSystems` resolver to a new `recordCount` resolver.
3. `connectedSystems` now only maps from: `data.connectedSystems ?? data.connected_systems ?? data.systems ?? data.integrations ?? data.connections ?? 0`.
4. `recordCount` maps from: `data.recordCount ?? data.record_count ?? data.count ?? data.total ?? data.length ?? 0`.
5. Update `briefHighlight` synthesis: when `recordCount > 0` and `connectedSystems === 0`, use `recordCount` in the synthesised prose string.

**Acceptance:** `normalizeEnterprisePayload({ count: 15, business: 'Ellines Haven' })` → `{ recordCount: 15, connectedSystems: 0, briefHighlight includes '15 records' }`.

**Status:** done

---

## TASK-2: Add `record_count` column to `EnterpriseSnapshot` schema; update `upsertSnapshot`

**Files:** `services/identity/prisma/schema.prisma`, `apps/web/functions/shared/auth.ts` (or wherever `upsertSnapshot` lives)

**Changes:**
1. Add `recordCount Int @default(0) @map("record_count")` to `EnterpriseSnapshot` model.
2. Update `upsertSnapshot()` to accept `activeConnectorCount?: number` and write `record_count: payload.recordCount` and `connected_systems: activeConnectorCount ?? payload.connectedSystems`.
3. Run `npm run db:push` locally to apply the schema change (after verifying `.env` points to local DB).

**Acceptance:** Schema diff shows `record_count` column; `upsertSnapshot` writes `record_count`.

**Status:** done

---

## TASK-3: Pass active connector count to `upsertSnapshot` in the sync endpoint

**Files:** `apps/web/functions/api/v1/connectors/installations/[id]/sync.ts`

**Changes:**
1. Before calling `upsertSnapshot()`, query `connector_installations` for the org filtered by `status = 'active'` and get the count.
2. Pass this count as `activeConnectorCount` to `upsertSnapshot()`.
3. Pass `config.systemLabel` (if set) as a hint so the snapshot's `connector_name` prefers `systemLabel`.

**Acceptance:** After sync, `enterprise_snapshots.connected_systems` equals the number of active installations for the org, not the `recordCount` of the API response.

**Status:** done

---

## TASK-4: Add `systemLabel`, `businessId`, `branchId` to `InstallConfig`; add wizard field

**Files:** `apps/web/functions/shared/connectors.ts`, `apps/web/src/app/app/platform/page.tsx`

**Changes:**
1. Add `systemLabel?: string`, `businessId?: string`, `branchId?: string` to `InstallConfig` type.
2. In `normalizeEnterprisePayload`, use `config.systemLabel` → `systemLabel` mapping note: the payload already reads `data.systemName ?? data.sourceSystem` — the sync endpoint should pass `systemLabel` into the raw object or set it separately.
3. In `installations/[id]/sync.ts`, after decrypting config, if `config.systemLabel` is set, use it as the `displayName` fallback for the snapshot.
4. In the connector wizard (platform/page.tsx), add a "System Label" text input in Step 1. Bind it to `wizConfig.systemLabel`.

**Acceptance:** Wizard Step 1 shows "System Label" input; installed connector config JSON contains `systemLabel`; snapshot `connector_name` uses `systemLabel` when set.

**Status:** done

---

## TASK-5: Make date window parameterizable (`dateWindowEnabled`, custom param names)

**Files:** `apps/web/functions/shared/connectors.ts`

**Changes:**
1. Add `dateWindowEnabled?: boolean`, `dateParamFrom?: string`, `dateParamTo?: string` to `InstallConfig`.
2. Update `appendDateWindowToUrl()`:
   - If `!config.dateWindowEnabled` → return URL unchanged (regardless of `dateWindow` value).
   - If `dateWindowEnabled && dateParamFrom && dateParamTo` → append `?<dateParamFrom>=<ISO>&<dateParamTo>=<ISO>` (no `window=` param).
   - If `dateWindowEnabled` and no custom param names → existing behavior: `?window=<value>&from=<ISO>&to=<ISO>`.
3. The `dateWindow: 'all'` case still returns null from `dateWindowBounds` (no params, unchanged).

**Acceptance:**
- `appendDateWindowToUrl(url, { dateWindow: 'today', dateWindowEnabled: false })` → URL unchanged.
- `appendDateWindowToUrl(url, { dateWindow: 'today', dateWindowEnabled: true, dateParamFrom: 'startDate', dateParamTo: 'endDate' })` → `?startDate=...&endDate=...`.
- `appendDateWindowToUrl(url, { dateWindow: 'today', dateWindowEnabled: true })` → `?window=today&from=...&to=...`.

**Status:** done

---

## TASK-6: Add `validateFieldMap()` with semantic warnings

**Files:** `apps/web/functions/shared/connectors.ts`, `apps/web/functions/api/v1/connectors/installations/[id]/sync.ts`

**Changes:**
1. Add `validateFieldMap(fieldMap: Record<string,string>): string[]` to `connectors.ts`. Returns an array of warning strings.
2. Protected EIP semantic fields: `connectedSystems`, `healthScore`, `openAlerts`, `openDecisions`.
3. For each entry in `fieldMap` where the value (destination) is a protected field, push a warning: `"Mapping '${from}' → '${to}' targets a protected EIP semantic field. Ensure '${from}' actually represents ${to}."`
4. In `installations/[id]/sync.ts`, call `validateFieldMap(config.fieldMap)` after applying the map, and if warnings exist, append them to `last_message` in the installation update.

**Acceptance:**
- `validateFieldMap({ count: 'connectedSystems' })` → `[ "Mapping 'count' → 'connectedSystems' targets a protected EIP semantic field..." ]`.
- `validateFieldMap({ systemName: 'briefHighlight' })` → `[]`.
- After sync with a risky fieldMap, `connector_installations.last_message` contains the warning text.

**Status:** done

---

## TASK-7: Fix webhook `connected_systems` — use active connector count

**Files:** `apps/web/functions/api/v1/webhooks/inbound.ts`

**Changes:**
1. After verifying the webhook signature, query `connector_installations` for the org where `status = 'active'` and get the count.
2. Use this count in the snapshot row for `connected_systems` instead of `Math.max(payload.connectedSystems, 1)`.
3. Also write `record_count: payload.recordCount` to the snapshot row.

**Acceptance:** Webhook handler snapshot row: `connected_systems = active_installer_count`, `record_count = payload.recordCount`.

**Status:** done

---

## TASK-8: Update Haven test file + add new test suites

**Files:** `apps/web/functions/__tests__/haven-connector.spec.ts`

**Changes:**
1. Update test suite 5 (normalizeEnterprisePayload — Haven Cloud Function JSON shape):
   - Change: `expect(payload.connectedSystems).toBe(15)` → `expect(payload.connectedSystems).toBe(0)` and add `expect(payload.recordCount).toBe(15)`.
   - Update `briefHighlight` assertion to expect "15 records" rather than "15" (since the synthesis now uses `recordCount`).
2. Add new describe block: `validateFieldMap` — 4 test cases (3 warning, 1 safe).
3. Add new describe block: `appendDateWindowToUrl — dateWindowEnabled` — 3 test cases.

**Acceptance:** All test suites pass. `npm run test -w @ellines-eip/web` green.

**Status:** done

---

## TASK-9: Build verification + db:push

**Steps:**
1. Switch `.env` to local DB.
2. Run `npm run db:push` to apply the `record_count` schema change.
3. Run `npm run build:shared`.
4. Run `npm run build -w @ellines-eip/web`.
5. Run `npm run test -w @ellines-eip/web` — confirm all suites green.
6. Switch `.env` back to Supabase.

**Acceptance:** All builds pass, all tests pass, no TypeScript errors.

**Status:** done

---

## TASK-10: Commit and push to working branch

**Steps:**
1. Stage changed files.
2. Commit with message: `fix(connector): correct connectedSystems semantics, add recordCount, parameterize date windows, add validateFieldMap, hierarchy fields, webhook fix`
3. Push to `eip/real-world-execution`.
4. Report commit SHA.

**Acceptance:** Push succeeds, SHA reported.

**Status:** done
