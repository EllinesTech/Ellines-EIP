# Universal Connector Engine — Design

## Architecture Overview

The connector engine sits between external business systems and the EIP Universal Enterprise Model. It handles connectivity, authentication, data ingestion, normalization, and storage. This design document covers the six corrections required before P1 acceptance.

```
External Business System
        ↓
  HTTPS (safeFetch — SSRF policy)
        ↓
  Connector Config (InstallConfig)
  ├── WHO:    organization_id, businessId, branchId, systemLabel
  ├── WHERE:  endpoint / host
  ├── HOW:    authType + credentials (encrypted at rest)
  ├── WHAT:   fieldMap, dateWindow config
  └── WHEN:   syncIntervalMinutes, nextSyncAt
        ↓
  Raw API Response
        ↓
  Firestore unwrap (if isFirestoreResponse)
        ↓
  applyFieldMap (rename upstream keys → EIP keys, with semantic warnings)
        ↓
  normalizeEnterprisePayload
  ├── recordCount  ← count / total / length / record_count (NEW)
  ├── connectedSystems ← connectedSystems / connected_systems / systems / integrations
  ├── healthScore  ← healthScore / health / score
  ├── openAlerts   ← openAlerts / alerts / open_alerts / issues
  ├── openDecisions ← openDecisions / decisions / open_decisions / pending
  ├── briefHighlight ← briefHighlight / brief / summary / synthesised
  └── timeline     ← timeline / events / activity / record-array fallback
        ↓
  upsertSnapshot (enterprise_snapshots — one row per org)
  └── connected_systems = count of active connector_installations for org
```

---

## Design Decisions

### DD-1: `recordCount` vs `connectedSystems`

**Decision:** `recordCount` is a new output field. `connectedSystems` is reserved for explicit system-count fields from the API. The aliases `count / total / length` are moved from `connectedSystems` to `recordCount`.

**Rationale:** The semantic distinction is critical for correctness. 15 books in a catalogue ≠ 15 connected systems. The old alias chain caused misleading dashboards.

**Impact on tests:** The Haven test fixture currently asserts `count → connectedSystems`. These tests will be updated to assert `count → recordCount` and `connectedSystems → 0`.

**Impact on `enterprise_snapshots`:** A new `record_count` column is added. `connected_systems` is now populated from active connector count, not from the payload.

### DD-2: `appendDateWindowToUrl` — parameterized date params

**Decision:** Add `dateWindowEnabled: boolean`, `dateParamFrom?: string`, `dateParamTo?: string` to `InstallConfig`. The function signature gains an optional `overrides` parameter accepting these values.

**Rationale:** Many real-world APIs use custom parameter names. Hardcoding `from` and `to` is not portable. The operator must explicitly enable date filtering and, optionally, map to their API's param names.

**Backward compatibility:** Existing configs that have `dateWindow` set but not `dateWindowEnabled` will default to `dateWindowEnabled: false` — this is a breaking change for any already-configured connector using `dateWindow`, but since date window is not exposed in the wizard UI yet, there are no real existing usages to break.

### DD-3: `validateFieldMap` — advisory, not blocking

**Decision:** Field mapping warnings are advisory. The mapping is still applied. Warnings go to `last_message`.

**Rationale:** Blocking the mapping would break operators who have legitimate use cases for remapping. Transparency (warning in the admin UI) is the right tradeoff.

**Protected fields:** `connectedSystems`, `healthScore`, `openAlerts`, `openDecisions` — these have clear semantic meaning in EIP's universal model and should not be trivially mapped from arbitrary counts.

### DD-4: `upsertSnapshot` — `connected_systems` from DB count

**Decision:** `upsertSnapshot()` accepts an optional `activeConnectorCount?: number` parameter. When provided, it is written to `connected_systems` instead of `payload.connectedSystems`. The sync endpoint passes the org's active connector count from a DB query.

**Rationale:** The `enterprise_snapshots.connected_systems` column represents the platform state (how many connectors does this org have active), not an inference from the last payload.

### DD-5: Webhook `connected_systems` fix

**Decision:** The webhook handler must query `connector_installations` for the org and use the active count, not `Math.max(payload.connectedSystems, 1)`.

**Rationale:** `Math.max(..., 1)` artificially inflates the count when `payload.connectedSystems` is 0. This produces misleading dashboards.

### DD-6: `systemLabel`, `businessId`, `branchId` in `InstallConfig`

**Decision:** These are free-form string fields added to `InstallConfig`. No DB migration required beyond what's already in `connector_installations.config` (JSON blob). `systemLabel` is surfaced in the wizard UI step 1.

**Rationale:** Enabling hierarchy tagging without requiring a schema migration keeps the change small and non-breaking. The full business/branch hierarchy design belongs in a later phase.

---

## File Change Map

| File | Change |
|------|--------|
| `apps/web/functions/shared/connectors.ts` | Add `recordCount` to payload output; move `count/total/length` aliases from `connectedSystems` to `recordCount`; add `dateWindowEnabled`, `dateParamFrom`, `dateParamTo` to `InstallConfig`; update `appendDateWindowToUrl`; add `validateFieldMap()`; add `businessId`, `branchId`, `systemLabel` to `InstallConfig` |
| `apps/web/functions/api/v1/connectors/installations/[id]/sync.ts` | Pass `activeConnectorCount` to `upsertSnapshot()`; call `validateFieldMap()` and append warnings to `last_message`; pass `config.systemLabel` as source system hint |
| `apps/web/functions/api/v1/webhooks/inbound.ts` | Replace `Math.max(payload.connectedSystems, 1)` with active connector count from DB; add `recordCount` to snapshot write |
| `apps/web/functions/shared/auth.ts` (or `connectors.ts`) | Update `upsertSnapshot()` to accept `activeConnectorCount` and write `record_count` |
| `services/identity/prisma/schema.prisma` | Add `recordCount Int @default(0) @map("record_count")` to `EnterpriseSnapshot` |
| `apps/web/functions/__tests__/haven-connector.spec.ts` | Update `count → connectedSystems` assertions to `count → recordCount`; add `connectedSystems === 0` assertion |
| `apps/web/src/app/app/platform/page.tsx` | Add `systemLabel` field to connector wizard Step 1 |

---

## Schema Change

```prisma
model EnterpriseSnapshot {
  // ... existing fields ...
  recordCount      Int      @default(0) @map("record_count")  // NEW
  // ...
}
```

No other schema changes. The `connected_systems` column continues to exist but its population source changes.

---

## Normalized Payload Shape (updated)

```typescript
type NormalizedEnterprisePayload = {
  healthScore: number;        // 0–100; 0 if unavailable
  connectedSystems: number;   // count of connected systems/integrations (from explicit fields only)
  recordCount: number;        // NEW: count of records returned by this connector
  openAlerts: number;
  openDecisions: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
  model: UemModel | null;
  sourceSystem: string;
};
```

---

## Test Plan

| Test file | Scenarios added/changed |
|-----------|------------------------|
| `haven-connector.spec.ts` | Update 5 existing assertions: `count → recordCount`, add `connectedSystems === 0` |
| `haven-connector.spec.ts` | Add `validateFieldMap` suite: 3 warning cases + 1 safe case |
| `haven-connector.spec.ts` | Add `appendDateWindowToUrl` suite: dateWindowEnabled=false, custom param names, default behavior |
| New: `webhook-security.spec.ts` | 8 security scenarios |
