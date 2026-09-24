# EIP Super Admin Control Plane — Design

**Spec:** eip-super-admin-control-plane-evolution  
**Baseline commit:** `c64f97d` (main, 2026-09-24)

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (eip.ellines.co.ke)                          │
│                                                                │
│  Next.js App Router (apps/web/src/app/)                        │
│  ├── /app/platform?section=*    ← Super Admin Control Plane    │
│  ├── /app/*                     ← Work Console (Ellines org)   │
│  └── /register, /login, ...     ← Auth surfaces               │
│                                                                │
│  Pages Functions (apps/web/functions/api/v1/)                  │
│  ├── auth/          ← JWT identity + sessions                  │
│  ├── connectors/    ← Installation + sync + proxy              │
│  ├── platform/      ← Super Admin APIs (platform-admin gated)  │
│  ├── orgs/me/       ← Tenant APIs (org-scoped)                 │
│  └── webhooks/      ← Inbound webhook processing               │
└────────────────────────────────────────────────────────────────┘
         │ Supabase (production) / PostgreSQL local (dev)
         └── Tables managed by Prisma schema (db:push)
```

**Key architectural invariants:**
- No standalone backend service. All API logic runs as Cloudflare Pages Functions.
- Auth is JWT in `localStorage`; every request carries a Bearer token.
- Platform admin is an env-var allowlist (`PLATFORM_ADMIN_EMAILS`), not a database role.
- Tenant isolation is enforced per-query via `organization_id` filter (not row-level security).

---

## 2. Navigation Architecture

### 2.1 Single Source of Truth

`apps/web/src/lib/app-navigation.ts` is the **only** navigation registry. No other file may declare menu items.

### 2.2 Four Super Admin Groups

```
ELLINES ORGANIZATION          ← Ellines' own internal operations
  Overview
  Organization Data
  Organization System
  Org Admin
  System Settings
  └─ WORK CONSOLE (sub-group)
       Glance · Timeline · Notifications · Approvals
       Fleet · People · Inbox · Rules · Reports
       Automation · Connectors · Documents

CLIENT ORGANIZATIONS          ← Customer orgs managed by EIP
  Client Portfolio            [live]
  Register Client             [live]
  Organizations               [planned]
  Users & Access              [live]
  Services                    [planned]
  Health & Connectivity       [live]
  Activity & Usage            [planned]
  Configuration               [live]
  Alerts & Issues             [planned]
  Client Audit                [live]

PLATFORM                      ← EIP infrastructure
  Command Center              [live]
  Service Packages            [live]
  Access & Control            [live]
  System Health               [live]
  Audit                       [live]
  AI                          [live]

ELLINEA                       ← Ellinea AI / console
  Ellinea Console             [live]
  Ellinea AI                  [live]
```

### 2.3 No Second Sidebar

Client organization context is surfaced through:

```
[Client Portfolio]
    → click org row
    → ?section=client&id=ORG_ID

Breadcrumb:  Platform  /  Client Organizations  /  Nairobi Hospital
Client header bar:  [org name]  [status badge]  [package badge]  [tab row]
Tabs:  Overview | People & Access | Services & Entitlements |
       Integrations | Health | Usage | Activity | Audit | Configuration
```

No new sidebar items are added when entering a client workspace. The four-group rail remains unchanged.

### 2.4 Navigation Item States

| `available` | `section` | Rendered as |
|---|---|---|
| `true` | present | Live section link — navigates to `?section=X` |
| `true` | absent | Live route link — navigates to `href` directly |
| `false` | — | Greyed planned item — shows `note` as tooltip; navigates to planned-state UI |

---

## 3. Client Organization Workspace

### 3.1 URL Pattern

```
/app/platform?section=client&id=<org_id>
```

### 3.2 Tab Structure

```
Nairobi Hospital                              [ACTIVE]  [Enterprise]
─────────────────────────────────────────────────────────────────────
Overview │ People & Access │ Services & Entitlements │ Integrations │
Health │ Usage │ Activity │ Audit │ Configuration
```

### 3.3 Overview Tab — Data Sources

Every value must come from a real database query:

| Metric | Source |
|---|---|
| Org status | `organizations.status` |
| Package name | `organization_tiers → rate_limit_tiers.display_name` |
| Users used | `COUNT(org_memberships WHERE org_id = ?)` |
| Users allowed | `organization_tiers → rate_limit_tiers.max_users` |
| Integrations used | `COUNT(connector_installations WHERE org_id = ? AND status = 'active')` |
| Integrations allowed | `organization_tiers → rate_limit_tiers.max_connectors` |
| Last activity | `MAX(audit_logs.created_at WHERE org_id = ?)` |
| Open incidents | `COUNT(connector_installations WHERE org_id = ? AND status = 'error')` |

### 3.4 Integrations Tab — Governance Model

```
Super Admin view (read + write):
  ┌─────────────────────────────────────────────────────┐
  │ Integrations for Nairobi Hospital                   │
  │ 3 / 5 purchased                                     │
  │                                                     │
  │ ● ERP (SAP)           Connected   Last sync: 2m ago │
  │ ● HIS                 Connected   Last sync: 5m ago │
  │ ⚠ Finance             Degraded    Last sync: 1h ago │
  │                                                     │
  │ [+ Add Integration]                                 │
  └─────────────────────────────────────────────────────┘

Client IT view (read-only):
  ┌─────────────────────────────────────────────────────┐
  │ Your Integrations                                   │
  │ 3 / 5 integrations active                          │
  │                                                     │
  │ ✓ ERP (SAP)           Connected                     │
  │ ✓ HIS                 Connected                     │
  │ ⚠ Finance             Degraded — contact support   │
  │                                                     │
  │ [Request another integration]                       │
  └─────────────────────────────────────────────────────┘
```

---

## 4. Connector Governance Architecture

### 4.1 Permission Model (Current → Target)

**Current state (broken):**
```
FIXED_ROLE_PERMISSIONS.admin = ['org:*', 'connector:*', ...]
                                              ↑
                          any org admin can install connectors
```

**Target state:**
```
POST /api/v1/connectors/installations
    ↓
platformAdminFromEnv(env, auth.email)  ← GATE 1: must be Ellines Super Admin
    ↓
body.targetOrgId must be provided      ← GATE 2: explicit target org
    ↓
check org entitlement (max_connectors) ← GATE 3: entitlement check
    ↓
encrypt credentials                    ← GATE 4: security
    ↓
insert to connector_installations
```

The `connector:install` permission in `FIXED_ROLE_PERMISSIONS` must be **removed from `admin`**. Installation is a platform-only operation.

Client org `admin` retains `connector:read` only.

### 4.2 Entitlement Check — Implementation Pattern

```typescript
// In POST /api/v1/connectors/installations

// 1. Require platform admin
if (!platformAdminFromEnv(context.env, auth.email)) {
  return json({ statusCode: 403, message: 'Connector installation requires platform admin' }, 403);
}

// 2. Resolve target org and its package
const targetOrgId = body.targetOrgId;
const { data: tier } = await supabase
  .from('organization_tiers')
  .select('rate_limit_tiers(max_connectors)')
  .eq('organization_id', targetOrgId)
  .maybeSingle();

const maxConnectors = tier?.rate_limit_tiers?.max_connectors ?? null;

// 3. Count existing active installations
const { count } = await supabase
  .from('connector_installations')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', targetOrgId)
  .in('status', ['active', 'draft', 'pending']);

if (maxConnectors !== null && (count ?? 0) >= maxConnectors) {
  return json({
    statusCode: 422,
    message: `Connector limit reached. This organization's package allows ${maxConnectors} connector(s).`,
  }, 422);
}

// 4. Encrypt credential fields
const encryptedConfig = await encryptConnectorConfig(body.config, targetOrgId, context.env);

// 5. Insert
```

### 4.3 Credential Encryption — Helper Design

New function in `apps/web/functions/shared/connectors.ts`:

```typescript
import { encrypt, isEncrypted } from './encryption';

const CREDENTIAL_KEYS: (keyof InstallConfig)[] = [
  'apiKey', 'bearerToken', 'basicPass', 'connectionString',
  'imapPassword', 'sftpPassword', 'sftpPrivateKey',
];

export async function encryptConnectorConfig(
  config: InstallConfig,
  organizationId: string,
  env: { EIP_ENCRYPTION_MASTER_KEY?: string },
): Promise<InstallConfig> {
  const out = { ...config };
  for (const key of CREDENTIAL_KEYS) {
    const val = out[key];
    if (typeof val === 'string' && val.length > 0 && !isEncrypted(val)) {
      (out as Record<string, unknown>)[key] = await encrypt(val, organizationId, env);
    }
  }
  return out;
}

export async function decryptConnectorConfig(
  config: InstallConfig,
  organizationId: string,
  env: { EIP_ENCRYPTION_MASTER_KEY?: string },
): Promise<InstallConfig> {
  const { decrypt } = await import('./encryption');
  const out = { ...config };
  for (const key of CREDENTIAL_KEYS) {
    const val = out[key];
    if (typeof val === 'string' && isEncrypted(val)) {
      (out as Record<string, unknown>)[key] = await decrypt(val, organizationId, env);
    }
  }
  return out;
}
```

`toInstallationDto()` already redacts via `redactConfig()` — that path is preserved.

### 4.4 Connector Lifecycle States

```
draft → pending → active → suspended → error → deleted
  ↑                  ↑
  install         approve/test
```

| State | Who sets it | Meaning |
|---|---|---|
| `draft` | Super Admin on install | Installed but not yet tested |
| `pending` | — | Reserved for approval workflow |
| `active` | Super Admin after successful test | Live and syncing |
| `suspended` | Super Admin | Temporarily paused |
| `error` | Sync engine | Last sync failed |
| `deleted` | Super Admin | Soft-deleted |

---

## 5. SSRF Security Architecture

### 5.1 Current State

Two independent SSRF implementations exist:
1. `autoscan/probe.ts` — `isBlockedHost()` — comprehensive, blocks private IPs + metadata endpoints
2. `connectors/proxy.ts` — `isPrivateTarget()` — regex-only, less thorough

**Target:** one shared function used by both.

### 5.2 Target Implementation

New export in `apps/web/functions/shared/validation.ts` (or a new `egress.ts`):

```typescript
/**
 * Returns true if the URL is safe to fetch from the Cloudflare edge.
 * Rejects: private IPs, localhost, cloud metadata, non-HTTPS, invalid URLs.
 */
export function isSafeEgressTarget(urlStr: string): { safe: boolean; reason?: string } {
  let url: URL;
  try { url = new URL(urlStr); } catch { return { safe: false, reason: 'Invalid URL' }; }

  if (url.protocol !== 'https:') {
    return { safe: false, reason: 'Only HTTPS targets are allowed' };
  }

  const h = url.hostname.toLowerCase().replace(/\.$/, '');

  const blocked = [
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    '169.254.169.254',        // AWS/GCP metadata
    'metadata.google.internal',
    '100.100.100.200',        // Alibaba metadata
  ];
  if (blocked.includes(h) || h.endsWith('.local')) {
    return { safe: false, reason: 'Blocked host' };
  }

  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return { safe: false, reason: 'Private IP (10.x)' };
    if (a === 127) return { safe: false, reason: 'Loopback' };
    if (a === 0)   return { safe: false, reason: 'Reserved IP' };
    if (a === 169 && b === 254) return { safe: false, reason: 'Link-local (metadata)' };
    if (a === 192 && b === 168) return { safe: false, reason: 'Private IP (192.168.x)' };
    if (a === 172 && b >= 16 && b <= 31) return { safe: false, reason: 'Private IP (172.16-31.x)' };
  }

  return { safe: true };
}
```

All outbound connector fetches (`proxy.ts`, `installations/[id]/sync.ts`, `autoscan/probe.ts`) must use this function.

---

## 6. Webhook Security Architecture

### 6.1 Required Controls

Every inbound webhook path must apply, in order:

1. **HMAC verification** — `X-EIP-Signature: sha256=<hex>` header against stored secret
2. **Timestamp validation** — `X-EIP-Timestamp` must be within ±300 seconds of `Date.now()`
3. **Nonce/idempotency** — check `X-EIP-Event-Id` against a dedupe store (KV or DB); reject replays

### 6.2 Shared Webhook Verifier

New helper:

```typescript
// shared/webhook-verify.ts
export async function verifyWebhookSignature(
  secret: string,
  body: ArrayBuffer,
  signatureHeader: string | null,
  timestampHeader: string | null,
): Promise<{ valid: boolean; reason?: string }> {
  if (!signatureHeader?.startsWith('sha256=')) {
    return { valid: false, reason: 'Missing or malformed signature' };
  }
  if (timestampHeader) {
    const ts = Number(timestampHeader);
    const delta = Math.abs(Date.now() / 1000 - ts);
    if (delta > 300) return { valid: false, reason: 'Timestamp too old or too far in future' };
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const sig = Uint8Array.from(signatureHeader.slice(7).match(/../g)!.map(b => parseInt(b, 16)));
  const valid = await crypto.subtle.verify('HMAC', key, sig, body);
  return valid ? { valid: true } : { valid: false, reason: 'Signature mismatch' };
}
```

---

## 7. Entitlement Enforcement Architecture

### 7.1 Package → Org → Capability flow

```
rate_limit_tiers (package definition)
    max_connectors, max_users, enable_sso, enable_custom_roles,
    enable_agents, enable_advanced_bi, enable_webhooks
         ↓
organization_tiers (assignment)
    organization_id, tier_id, expires_at, custom_limits
         ↓
API endpoint checks before operation
```

### 7.2 Entitlement Resolver — Helper

New function in `shared/auth.ts` or a new `shared/entitlements.ts`:

```typescript
export interface OrgEntitlement {
  maxConnectors: number | null;
  maxUsers: number | null;
  enableSso: boolean;
  enableCustomRoles: boolean;
  enableAgents: boolean;
  enableAdvancedBi: boolean;
  enableWebhooks: boolean;
}

export async function getOrgEntitlement(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgEntitlement> {
  const { data } = await supabase
    .from('organization_tiers')
    .select('custom_limits, rate_limit_tiers(max_connectors, max_users, enable_sso, enable_custom_roles, enable_agents, enable_advanced_bi, enable_webhooks)')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const tier = (data?.rate_limit_tiers ?? {}) as Record<string, unknown>;
  const custom = (data?.custom_limits ?? {}) as Record<string, unknown>;

  return {
    maxConnectors: (custom.max_connectors ?? tier.max_connectors ?? null) as number | null,
    maxUsers: (custom.max_users ?? tier.max_users ?? null) as number | null,
    enableSso: Boolean(custom.enable_sso ?? tier.enable_sso),
    enableCustomRoles: Boolean(custom.enable_custom_roles ?? tier.enable_custom_roles),
    enableAgents: Boolean(custom.enable_agents ?? tier.enable_agents),
    enableAdvancedBi: Boolean(custom.enable_advanced_bi ?? tier.enable_advanced_bi),
    enableWebhooks: Boolean(custom.enable_webhooks ?? tier.enable_webhooks),
  };
}
```

`custom_limits` overrides package defaults, enabling per-org overrides without a new package tier.

### 7.3 Enforcement Checklist

| Operation | Entitlement check | Endpoint |
|---|---|---|
| Install connector | `maxConnectors` — count active installs | `POST /connectors/installations` |
| Invite/create user | `maxUsers` — count active members | `POST /orgs/me/invite` |
| Create SSO provider | `enableSso` | `POST /orgs/me/sso-providers` |
| Create custom role | `enableCustomRoles` | `POST /orgs/me/custom-roles` |
| Create agent | `enableAgents` | `POST /orgs/me/agents` |
| Create webhook | `enableWebhooks` | `POST /orgs/me/webhook-*` |

---

## 8. Command Center Dashboard Architecture

### 8.1 Data Model for Metrics Endpoint

`GET /api/v1/platform/metrics` must eventually return:

```typescript
interface PlatformMetrics {
  clients: {
    total: number;
    active: number;
    onboarding: number;      // status = 'onboarding'
    suspended: number;
    atRisk: number;          // has degraded/error connectors OR no activity > 7 days
  };
  integrations: {
    total: number;
    active: number;
    degraded: number;        // status = 'error' or last_sync_at > threshold
    failed: number;
    capacityTotal: number;   // SUM(max_connectors) across all active org tiers
    capacityUsed: number;    // COUNT(active installations)
  };
  platform: {
    apiHealthy: boolean;
    dbHealthy: boolean;
    emailHealthy: boolean;
    webhookHealthy: boolean;
  };
  security: {
    failedLoginsLast24h: number;
    openAlerts: number;
  };
  generatedAt: string;       // ISO timestamp — consumer can show data age
}
```

All fields must be derived from actual database queries. No hardcoded values.

### 8.2 "At Risk" Definition

A client org is "at risk" when any of:
- 1+ connector in `error` status for > 1 hour
- No audit log activity for > 7 days (org may be churning)
- Package expires within 30 days (when `expires_at` is set)

---

## 9. User Management Architecture

### 9.1 Separation Model

```
ELLINES ORGANIZATION
    Org Admin (/app/admin)
        → reads org_memberships WHERE organization_id = Ellines' own org ID
        → manages Ellines internal staff only

CLIENT ORGANIZATIONS
    Client workspace → People & Access tab
        → reads org_memberships WHERE organization_id = selected client org ID
        → manages that client's users only
```

Both surfaces query the same `org_memberships` table. Isolation is enforced by the mandatory `organization_id` filter. The two surfaces must never share a user list component without an explicit org-scoping prop.

### 9.2 Platform Admin Model (Current)

Platform admin is determined by `PLATFORM_ADMIN_EMAILS` env var (`platformAdminFromEnv()`). This is intentional for the current scale and does not require a database change in this spec. Future: a `platform_staff` table for larger teams.

---

## 10. Scheduler Architecture

### 10.1 Current State

```
User opens /app/connectors
    ↓
UI calls POST /api/v1/connectors/run-due
    ↓
Function queries connector_installations WHERE next_sync_at <= NOW()
    ↓
Syncs due connectors sequentially
```

This is documented honestly as "on-demand". No background sync occurs.

### 10.2 Target State (Planned)

```
Cloudflare Cron Trigger
    scheduled: "*/5 * * * *"  (every 5 minutes)
    ↓
POST /api/v1/connectors/run-due  (internal)
    ↓
Fan-out: sync each due connector with timeout + retry
```

**Prerequisite:** Cloudflare Pages Cron Triggers require a paid plan. This is a Planned item — do not claim it is implemented until the `[triggers]` section is present in `wrangler.toml` and verified in production.

---

## 11. Data Model Changes Required

The following schema changes are needed. All via `npm run db:push` (no migration files).

### 11.1 Connector installations — add `target_org_id` context

Currently, connector installations are created in the context of `auth.organizationId` (the Ellines org). After the governance change, Super Admin installs for a client need to be clearly associated with that client.

The existing `organization_id` field on `connector_installations` already serves this purpose — it should point to the **client org**, not the Ellines operator org. The API change is in who is allowed to write it.

No schema change needed here — behavioral change only.

### 11.2 Integration requests table (new)

```sql
CREATE TABLE integration_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  requested_by    UUID NOT NULL REFERENCES users(id),
  system_name     TEXT NOT NULL,
  purpose         TEXT,
  catalog_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'rejected' | 'fulfilled'
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 11.3 Encryption migration for connector_installations

The `config` column on `connector_installations` stores `InstallConfig` as JSONB. After implementing `encryptConnectorConfig()`, a migration endpoint must re-encrypt existing plaintext credential fields on `connector_installations.config`.

Extend `platform/security/migrate-encryption.ts` to cover this table.

---

## 12. API Contract Changes

### 12.1 POST /api/v1/connectors/installations (breaking change)

**Current body:**
```json
{ "catalogId": "rest-api", "displayName": "...", "config": { ... }, "packId": "..." }
```

**New body:**
```json
{
  "targetOrgId": "<client org UUID>",   ← NEW required field
  "catalogId": "rest-api",
  "displayName": "...",
  "config": { ... },
  "packId": "..."
}
```

**New response errors:**
- `403` — caller is not platform admin
- `422` — connector limit reached (includes `{ limit: N, current: N }` in body)

### 12.2 GET /api/v1/connectors/installations

When called by platform admin with `?orgId=<uuid>`, returns installations for that org.
When called by a regular org user, returns only their own org's installations (read-only, status visible).

### 12.3 New: POST /api/v1/platform/orgs/:id/integration-requests

Creates an integration request from within the client workspace.

### 12.4 New: GET /api/v1/platform/orgs/:id/integration-requests

Lists pending integration requests for a client org (platform admin only).

---

## 13. Files Affected by Implementation

### Security fixes (CRITICAL — implement first)

| File | Change |
|---|---|
| `functions/shared/connectors.ts` | Add `encryptConnectorConfig()`, `decryptConnectorConfig()` |
| `functions/api/v1/connectors/installations.ts` | Add platform-admin gate, entitlement check, credential encryption |
| `functions/api/v1/connectors/installations/[id].ts` | Re-encrypt credentials on PATCH |
| `functions/shared/auth.ts` | Remove `connector:*` from `admin` role; add `connector:read` only |
| `functions/shared/validation.ts` or new `egress.ts` | Add `isSafeEgressTarget()` |
| `functions/api/v1/connectors/proxy.ts` | Replace local `isPrivateTarget()` with shared `isSafeEgressTarget()` |
| `functions/api/v1/connectors/autoscan/probe.ts` | Replace local `isBlockedHost()` with shared `isSafeEgressTarget()` |
| `functions/api/v1/webhooks/enterprise.ts` | Add HMAC verification + timestamp + nonce |
| `functions/api/v1/webhooks/inbound.ts` | Add HMAC verification + timestamp + nonce |
| `functions/api/v1/platform/security/migrate-encryption.ts` | Extend to cover `connector_installations.config` |

### Entitlement enforcement

| File | Change |
|---|---|
| `functions/shared/auth.ts` or new `shared/entitlements.ts` | Add `getOrgEntitlement()` |
| `functions/api/v1/connectors/installations.ts` | Use `getOrgEntitlement()` for `maxConnectors` |
| `functions/api/v1/orgs/me/invite.ts` | Check `maxUsers` |
| `functions/api/v1/orgs/me/sso-providers/index.ts` | Check `enableSso` |
| `functions/api/v1/orgs/me/custom-roles/index.ts` | Check `enableCustomRoles` |
| `functions/api/v1/orgs/me/agents.ts` | Check `enableAgents` |

### Navigation & UI

| File | Change |
|---|---|
| `apps/web/src/lib/app-navigation.ts` | Add `Integrations` nav item to CLIENT ORGANIZATIONS group (planned → live when workspace tab is ready) |
| `apps/web/src/app/app/platform/page.tsx` | Add Integrations tab to client workspace; add read-only view path for client IT; add integration request form |
| `apps/web/src/app/app/connectors/page.tsx` | Restrict to Ellines-own-org work console; client IT sees read-only integration list |

### New files

| File | Purpose |
|---|---|
| `functions/shared/egress.ts` | Shared SSRF-safe outbound fetch policy |
| `functions/shared/entitlements.ts` | `getOrgEntitlement()` resolver |
| `functions/shared/webhook-verify.ts` | HMAC + timestamp + nonce webhook verifier |
| `functions/api/v1/platform/orgs/[id]/integration-requests.ts` | Integration request CRUD (platform admin) |
| `functions/api/v1/orgs/me/integration-requests.ts` | Integration request create + read (client IT) |

---

## 14. Implementation Order (Priority)

Security defects first, architecture second, UI last.

```
P0 — Security (block all other work until done)
  1. Credential encryption in connector installs
  2. Platform-admin gate on connector:install
  3. Shared SSRF egress policy
  4. Webhook HMAC + replay protection

P1 — Entitlement enforcement
  5. max_connectors check in install endpoint
  6. getOrgEntitlement() helper + enforce all capability gates

P2 — Client workspace
  7. Integrations tab in client workspace (read + Super Admin write)
  8. Read-only integration view for client IT users
  9. Integration request workflow

P3 — Dashboard accuracy
  10. Platform metrics endpoint returns real DB-derived values
  11. Command Center displays live counts with loading/error states

P4 — Planned nav items
  12. Services & Entitlements section
  13. Activity & Usage section
  14. Alerts & Issues section
```
