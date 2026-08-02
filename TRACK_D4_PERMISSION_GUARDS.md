# Track D.4 — Permission Guards Implementation

**Status:** In Progress  
**Date:** August 2, 2026  
**Task:** Inject permission guards into all 50+ Pages Functions endpoints

## Permission Matrix: Endpoints → Permission Requirements

### Connectors (10 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/connectors/packs` | GET | `connector:read` | All | TODO |
| `/connectors/rest-sample` | POST | `connector:read` | All | TODO |
| `/connectors/autoscan/probe` | POST | `connector:read` | All | TODO |
| `/connectors/openapi/parse` | POST | `connector:read` | All | TODO |
| `/connectors/installations` | GET | `connector:read` | All | TODO |
| `/connectors/installations` | POST | `connector:install` | Owner/Admin/Custom | TODO |
| `/connectors/installations/[id]` | GET/PATCH/DELETE | `connector:read`/`update`/`delete` | Owner/Admin/Custom | TODO |
| `/connectors/installations/[id]/sync` | POST | `connector:sync` | Owner/Admin/Custom | TODO |
| `/connectors/installations/[id]/test` | POST | `connector:read` | All | TODO |
| `/connectors/[id]/sync` | POST | `connector:sync` | Owner/Admin/Custom | TODO |

### Approvals (5 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/approvals` | GET | `approval:view` | All | TODO |
| `/orgs/me/approvals` | POST | `approval:request` | All | TODO |
| `/orgs/me/approvals/[id]/decide` | POST | `approval:decide` | Deciders | TODO |

### Rules (5 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/rules` | GET | `rule:view` | All | TODO |
| `/orgs/me/rules` | POST | `rule:create` | Owner/Admin/Custom | TODO |
| `/orgs/me/rules/[id]` | GET/PATCH/DELETE | `rule:*` | Owner/Admin/Custom | TODO |

### Reports (5 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/reports` | GET | `report:view` | All | TODO |
| `/orgs/me/reports` | POST | `report:create` | Owner/Admin/Custom | TODO |
| `/orgs/me/reports/[id]` | GET/PATCH/DELETE | `report:*` | Owner/Admin/Custom | TODO |
| `/orgs/me/reports/[id]/run` | POST | `report:run` | Owner/Admin/Executive/Manager/Custom | TODO |

### Documents (2 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/documents` | GET | `document:view` | All | TODO |
| `/orgs/me/documents` | POST | `document:upload` | Owner/Admin/Executive/Manager/Custom | TODO |

### Organization & Admin (15+ endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/index` | GET | `org:view` | All | TODO |
| `/orgs/me/users` | GET | `org:view` | All | TODO |
| `/orgs/me/users` | POST | `org:manage_members` | Owner/Admin/Custom | TODO |
| `/orgs/me/users/[id]` | PATCH/DELETE | `org:manage_members` | Owner/Admin/Custom | TODO |
| `/orgs/me/branches` | GET | `org:view` | All | TODO |
| `/orgs/me/branches` | POST | `org:manage_branches` | Owner/Admin/Custom | TODO |
| `/orgs/me/branches/[id]` | PATCH/DELETE | `org:manage_branches` | Owner/Admin/Custom | TODO |
| `/orgs/me/departments` | GET | `org:view` | All | TODO |
| `/orgs/me/departments` | POST | `org:manage_departments` | Owner/Admin/Custom | TODO |
| `/orgs/me/departments/[id]` | PATCH/DELETE | `org:manage_departments` | Owner/Admin/Custom | TODO |
| `/orgs/me/settings` | GET | `org:view` | All | TODO |
| `/orgs/me/settings` | PATCH | `org:manage_settings` | Owner/Admin/Custom | TODO |
| `/orgs/me/create-child` | POST | `org:create_child` | Owner only | TODO |

### SSO Providers (7 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/sso-providers` | GET | `sso:view` | Owner/Admin/Custom | TODO |
| `/orgs/me/sso-providers` | POST | `sso:manage` | Owner only | TODO |
| `/orgs/me/sso-providers/[id]` | GET/PATCH/DELETE | `sso:*` | Owner only | TODO |
| `/orgs/me/sso-providers/[id]/test` | POST | `sso:manage` | Owner only | TODO |
| `/orgs/me/sso-providers/[id]/linked-users` | GET | `sso:view` | Owner/Admin/Custom | TODO |

### Audit & Logs (3 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/audit-logs` | GET | `audit:view` | Owner/Admin/Custom | TODO |
| `/orgs/me/events` | GET | `org:view` | All | TODO |
| `/orgs/me/events` | POST | `org:view` | All | TODO |

### Custom Roles (5 endpoints) ✅

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/custom-roles` | GET/POST | `rbac:manage` | Owner only | ✅ DONE |
| `/orgs/me/custom-roles/[id]` | GET/PATCH/DELETE | `rbac:manage` | Owner only | ✅ DONE |
| `/orgs/me/custom-roles/assign` | POST | `rbac:assign` | Owner only | ✅ DONE |

### Ellinea AI (3 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/ellinea/ask` | POST | `ellinea:ask` | All | TODO |
| `/orgs/me/ellinea-memory` | GET/PUT | `ellinea:manage` | Owner/Admin/Custom | TODO |
| `/orgs/me/ellinea-learning` | GET/PUT | `ellinea:manage` | Owner/Admin/Custom | TODO |

### Enterprise Data (2 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/enterprise/summary` | GET | `org:view` | All | TODO |
| `/enterprise/ingest` | POST | `connector:read` | All | TODO |

### Notifications (3 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|=========|
| `/orgs/me/notify-policy` | GET/PATCH | `notification:manage` | Owner/Admin/Custom | TODO |
| `/notifications/deliver` | POST | `notification:send` | System | TODO (skip auth) |
| `/notifications/push-subscription` | POST | `notification:subscribe` | All | TODO |

### Webhooks (2 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|------------|----------|--------|
| `/orgs/me/webhook-secret` | GET/POST | `webhook:manage` | Owner/Admin/Custom | TODO |
| `/webhooks/enterprise` | POST | (webhook secret) | External | TODO (skip auth) |

### Multi-Org (3 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|=========|
| `/orgs/my-orgs` | GET | `org:view` | All | TODO |
| `/orgs/switch` | POST | `org:view` | All | TODO |
| `/orgs/[slug]/sso-providers` | GET | (public) | Public | ✅ SKIP |

### Platform Admin (3 endpoints)

| Endpoint | Method | Permission | Audience | Status |
|----------|--------|=========|
| `/platform/orgs` | GET | `platform:admin` | Platform only | TODO |
| `/platform/orgs/[id]` | GET/PATCH | `platform:admin` | Platform only | TODO |
| `/platform/orgs/[id]/stats` | GET | `platform:admin` | Platform only | TODO |
| `/platform/flags` | GET/PATCH | `platform:admin` | Platform only | TODO |
| `/platform/connector-packs` | GET | `connector:read` | All | TODO |

---

## Implementation Strategy

1. **Phase 1 (Priority):** Core workflows (connectors, approvals, rules, reports)
2. **Phase 2:** Organization management (users, branches, departments, settings)
3. **Phase 3:** Admin features (SSO, audit, Ellinea, webhooks)
4. **Phase 4:** Platform features (multi-org, platform admin, notifications)

Each phase:
- Use `requirePermissionAsync` for fast DB lookups
- Fall back to `requirePermission` when no DB lookup is needed (stateless checks)
- Maintain backward compatibility (no breaking changes to existing endpoints)
- Verify builds after each phase

---

## Notes

- **Auth bypass:** GET `/orgs/[slug]/sso-providers` is public (no auth needed) — skip
- **System endpoints:** `/notifications/deliver` and `/webhooks/enterprise` use webhook secrets, not JWT — handle separately
- **Platform admin:** Use separate guard (check `platformAdmin` from env)
- **Fallback:** If custom role lookup fails, fall back to fixed role (graceful degradation)

---

## Build Verification

After each phase:
```bash
npm run build:shared
npm run build -w @ellines-eip/web
npm run verify:pages-functions
```

Expected: All 76+ Pages Functions pass type checks; no new imports or export failures.

---

**Next:** Start Phase 1 implementation with connector endpoints.
