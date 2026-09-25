# Universal Connector Engine — Requirements

## Overview

Ellines EIP is a universal enterprise integration, management, intelligence, and reporting platform. It must connect to any business system without being redesigned per industry. Connectors are the bridge between EIP and external business systems.

This spec covers the six architectural corrections required before P1 acceptance, as documented in the Master Architecture Specification §53.

---

## Requirements

### REQ-1 — Correct `connectedSystems` Semantic Mapping

**Problem:** The current `normalizeEnterprisePayload()` function maps `count / total / length` from an external API response directly to `connectedSystems`. This is semantically wrong. A catalogue count of 15 books means there are 15 records, not 15 connected systems.

**Required behavior:**
1. `connectedSystems` must only be populated from fields that explicitly represent connected system/integration counts (`connectedSystems`, `connected_systems`, `systems`, `integrations`, `connections`).
2. A generic record count from an external API (`count`, `total`, `length`) must map to a new `recordCount` field on the normalized payload — not to `connectedSystems`.
3. `enterprise_snapshots.connected_systems` must reflect the actual number of active connector installations for an organization, not the count of records returned by any one connector.
4. The `briefHighlight` synthesis that currently reads `connectedSystems` for prose generation must be updated to use `recordCount` when appropriate.
5. The Haven test file assertions that validate `count → connectedSystems` must be updated to validate `count → recordCount` instead.

**Acceptance criteria:**
- `normalizeEnterprisePayload({ count: 15, business: "Ellines Haven" })` → `connectedSystems === 0`, `recordCount === 15`
- `normalizeEnterprisePayload({ connectedSystems: 3 })` → `connectedSystems === 3`, `recordCount === 0`
- `enterprise_snapshots.connected_systems` in `upsertSnapshot()` is derived from the count of active `connector_installations` rows for the org, not from the payload.

---

### REQ-2 — Make Date Window Behavior Connector-Configurable, Not Universal

**Problem:** `appendDateWindowToUrl()` unconditionally appends `?window=&from=&to=` to every REST/GraphQL endpoint URL that has a `dateWindow` config set. Many external APIs do not understand these parameters. This pollutes requests with undocumented query strings.

**Required behavior:**
1. A new boolean config field `dateWindowEnabled: boolean` controls whether date parameters are appended at all.
2. A new optional config `dateParamFrom` and `dateParamTo` allow operators to name the actual parameters the external API accepts (e.g. `startDate`, `endDate`, `since`, `until`).
3. When `dateParamFrom` and `dateParamTo` are set, EIP sends `?<dateParamFrom>=<ISO>&<dateParamTo>=<ISO>` instead of the hardcoded `?window=&from=&to=`.
4. When `dateWindowEnabled` is `false` or the config has `dateWindow: 'all'` (unchanged default), no date parameters are appended.
5. The `window` parameter is still appended as a hint only when the operator has not set custom param names.

**Acceptance criteria:**
- Config `{ dateWindow: 'today', dateWindowEnabled: false }` → URL unchanged.
- Config `{ dateWindow: 'today', dateWindowEnabled: true }` → `?window=today&from=...&to=...` appended (existing behavior).
- Config `{ dateWindow: 'today', dateWindowEnabled: true, dateParamFrom: 'startDate', dateParamTo: 'endDate' }` → `?startDate=<ISO>&endDate=<ISO>` (no `window=`).

---

### REQ-3 — Field Mapping Semantic Validation

**Problem:** The current `applyFieldMap()` allows any upstream field to be mapped to any EIP schema field, including semantically incorrect mappings such as `books.count → connectedSystems`.

**Required behavior:**
1. Define a set of **protected EIP semantic fields** whose meaning must be respected: `connectedSystems`, `healthScore`, `openAlerts`, `openDecisions`.
2. When an operator maps a source field to a protected field, the mapping is documented as potentially semantic-altering.
3. Add a `validateFieldMap()` utility that checks for known dangerous patterns (e.g. mapping a record-count field to `connectedSystems`) and returns warnings.
4. The mapping is still applied (operators have authority), but the warnings are logged to the connector's `last_message` so operators are informed.
5. Document clearly in `InstallConfig` that `fieldMap` keys targeting protected fields must represent equivalent semantics.

**Acceptance criteria:**
- `validateFieldMap({ count: 'connectedSystems' })` → returns a warning about semantic risk.
- `validateFieldMap({ total_revenue: 'healthScore' })` → returns a warning.
- `validateFieldMap({ systemName: 'briefHighlight' })` → no warning (safe remapping).
- Warnings appear in `connector_installations.last_message` after sync when present.

---

### REQ-4 — Extend Universal Model with `recordCount` Field

**Problem:** The normalized enterprise payload has no way to represent the count of records returned by a connector without abusing `connectedSystems`. This gap caused the original semantic confusion.

**Required behavior:**
1. Add `recordCount: number` to the normalized payload shape returned by `normalizeEnterprisePayload()`.
2. `recordCount` maps from: `data.recordCount ?? data.record_count ?? data.count ?? data.total ?? data.length ?? 0` (the original aliases now used correctly for record counting rather than system counting).
3. Add `record_count: number` column to `enterprise_snapshots` Prisma schema.
4. `upsertSnapshot()` must write `record_count` from `payload.recordCount`.
5. The `briefHighlight` synthesis must use `recordCount` when generating prose about record syncs.

**Acceptance criteria:**
- Schema has `record_count Int @default(0) @map("record_count")` on `EnterpriseSnapshot`.
- `normalizeEnterprisePayload({ count: 15 })` → `{ recordCount: 15, connectedSystems: 0 }`.
- `upsertSnapshot()` writes `record_count: payload.recordCount` to the database.
- `briefHighlight` synthesis: `"Ellines Haven: 15 records synced."` for a payload with `recordCount: 15, business: "Ellines Haven"`.

---

### REQ-5 — Verify and Harden Webhook Security

**Problem:** Webhook security needs explicit verification before being declared production-ready.

**Required behavior:**
1. HMAC-SHA256 signature verification is already implemented. Verify constant-time comparison is correct.
2. Replay protection via timestamp (5-minute window) is already implemented. Verify it applies before signature verification to avoid timing oracle.
3. Replay protection via webhook ID deduplication against `audit_logs` is already implemented. Verify the query is correct.
4. Add a dedicated webhook security test suite covering: valid HMAC accepted, invalid HMAC rejected, missing signature rejected, replayed ID rejected, expired timestamp rejected, future timestamp rejected, missing org rejected, no webhook secret configured rejected.
5. The webhook's `connected_systems` field must be set to the number of active connector installations for the org, not `Math.max(payload.connectedSystems, 1)` which can produce misleading values.

**Acceptance criteria:**
- Webhook security test suite: all 8 scenarios pass.
- Invalid HMAC → 401.
- Replayed ID → 409.
- Expired timestamp (>300s) → 400.
- No webhook secret → 403.
- `connected_systems` in webhook snapshot is org's active connector count.

---

### REQ-6 — Connector Hierarchy Fields (Organization / Business / Branch)

**Problem:** The connector wizard and `InstallConfig` have no fields for identifying which part of a business hierarchy the connector belongs to. Connectors have no `businessId`, `branchId`, or `systemLabel`. This makes multi-branch, multi-business reporting impossible.

**Required behavior:**
1. Add to `InstallConfig`: `businessId?: string`, `branchId?: string`, `systemLabel?: string`.
2. `systemLabel` is a human-readable name for the external system being connected (e.g. "Haven Catalogue API", "Nairobi Branch POS").
3. `businessId` and `branchId` are optional free-form identifiers that operators set to group connectors under a business or branch.
4. These fields must be stored in `connector_installations.config` (they are part of the JSON config blob, no schema migration required for the identifiers themselves).
5. The normalized payload's `sourceSystem` should prefer `config.systemLabel` when available.
6. The connector wizard form must expose `systemLabel` as a labelled input (Step 1: "System Label / Name").

**Acceptance criteria:**
- `InstallConfig` includes `businessId?`, `branchId?`, `systemLabel?`.
- Wizard Step 1 includes a "System Label" input field.
- After install, `connector_installations.config` JSON includes `systemLabel` when set.
- `normalizeEnterprisePayload` uses `config.systemLabel` as `sourceSystem` fallback.

---

## Out of Scope for This Spec

- Building the Business Owner Platform or Business Staff Platform.
- Multi-business cross-reporting.
- Connector marketplace / SDK.
- Private connector agents (edge/on-premise).
- OAuth connector flows.
- Any work not listed in the six corrections above.
