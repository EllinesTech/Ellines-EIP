---
inclusion: always
---

# Ellines EIP — Permanent Engineering Rules

These rules are non-negotiable and apply to every session, agent run, and implementation task.
Steering outranks stored memories, prior context, or historical documentation whenever they conflict.

---

## 1. Branch & Git Safety

- **Never modify `main` directly.** All changes go through a branch (`agent/<id>-slug` or `feat/<slug>`).
- **Never force-push** to `main` or any shared branch.
- **Never commit `.env`**, tokens, secrets, or credentials. Use `.env.example` as the template.
- Always verify `git status --short --branch` before any work. Report uncommitted files; do not silently stash or discard them.
- Never mark work complete without a successful build AND evidence of correct runtime behaviour.

---

## 2. Database Rules

- `ellines_eip_local` (localhost:5432) = local dev/test. `ellines_eip` was deleted 2026-08-08 — do not reference it.
- Never run `npm run db:push` while `.env` points to Supabase unless a deliberate schema migration is intended and explicitly confirmed.
- Schema is managed by Prisma. There are no migration files — `db:push` is the mechanism.
- Both local and Supabase must stay schema-identical at all times.

---

## 3. What "Done" Means

A task is **done** only when ALL three are true:

1. **Implementation** — code exists, compiles, and handles edge cases.
2. **Build passes** — `npm run build:shared` and `npm run build -w @ellines-eip/web` both succeed.
3. **Runtime evidence** — the feature can be demonstrated to work against a real database (local or Supabase). Assertions against source text are not evidence.

Historical documents that claim something is `done` are **not authoritative**. Verify against actual code, routes, schema, and runtime. Use the audit status model:

| Status | Meaning |
|---|---|
| **Verified** | Code + build + runtime evidence all confirmed |
| **Implemented** | Code exists; runtime verification outstanding |
| **In Progress** | Partially built |
| **Planned** | Architecture reserved; no implementation yet |
| **Blocked** | Cannot proceed without an external dependency |
| **Broken** | Existing feature fails |
| **Needs Audit** | Documentation claims done; evidence insufficient |

---

## 4. Navigation Rules

- **One navigation source of truth**: `apps/web/src/lib/app-navigation.ts`. No other file may define overlapping menus.
- **Never create a second sidebar rail.** The Super Admin control plane uses one rail with four groups. Client context is shown via breadcrumbs, a client header, and tabs inside the main content area — not a nested rail.
- **Never create a route for an unavailable capability.** Use `available: false` with a `note` explaining what is missing. Reserved items resolve to an honest "Planned" state and never carry fake data.
- Labels must stay inside the sidebar width budget. No ellipsis truncation.
- Navigation must be keyboard-accessible and screen-reader friendly.

---

## 5. Connector Governance Rules (Critical Business Requirement)

- **Connector installation and activation are Super Admin operations.** A client organization administrator (any role inside a client org) must NOT be able to install, activate, delete, or replace a connector.
- `connector:install` permission must be gated on `platformAdmin` check at the API layer, not just a role permission.
- **`max_connectors` entitlement must be enforced server-side** before any connector installation is inserted. The check must happen inside the same database transaction as the insert. UI-only limits are not acceptable.
- Connector credentials (`apiKey`, `bearerToken`, `basicPass`, `imapPassword`, `sftpPassword`, `sftpPrivateKey`, `connectionString`, etc.) must be **encrypted at rest** using the `encrypt()` function from `shared/encryption.ts` before writing to the database. Plaintext storage of any credential field is a security defect.
- Client IT may: view connected integrations, view health/sync status, view role-appropriate errors, and submit an integration request. Nothing else.

---

## 6. Security Rules

- **One shared SSRF policy.** All outbound connector HTTP requests must go through a single, hardened egress function. Multiple independent SSRF implementations are not allowed.
- Private IPs (`10.x`, `172.16-31.x`, `192.168.x`), `localhost`, `169.254.169.254` (cloud metadata), and non-HTTPS protocols must be blocked by default for user-supplied connector URLs.
- Webhook payloads must be verified with HMAC before processing.
- Replay protection (timestamp/nonce check) is required for all inbound webhook handlers.
- No credential value may appear in API responses, logs, or audit records. Redact with `••••••••` or omit the field entirely.
- Tenant isolation: every database query that reads or writes tenant data must include a mandatory `organization_id` equality filter. Cross-tenant reads are a critical defect.

---

## 7. Data Integrity Rules

- **Never use fake, hardcoded, or demo values on production surfaces.** Every metric, count, or status displayed to a Super Admin must derive from a real database query.
- Demo data lives only in `services/identity/prisma/seed-demo.ts` and the local database. It must never bleed into production API responses or platform dashboards.
- Connector health, sync status, and data-freshness metrics must reflect actual connector state from the database. Placeholder text such as "Last sync: N/A" is acceptable only when the data genuinely does not exist yet.

---

## 8. Build Guardrails

Run these before any land on `main`:

```bash
npm run build:shared
npm run build -w @ellines-eip/web
# If identity or Prisma schema changed:
npm run build -w @ellines-eip/identity
# If Pages Functions changed:
npm run verify:pages-functions   # if the script exists
```

TypeScript errors are blockers. Do not suppress with `// @ts-ignore` or `any` casts without an explanation comment.

---

## 9. User Separation Rule

**Ellines internal users** (operators, platform staff) and **client organization users** (customer employees) must never be mixed in the same management surface, query, or list.

Internal user management lives under: `ELLINES ORGANIZATION → People & Access`
Client user management lives under: `CLIENT ORGANIZATIONS → [client] → People & Access`

---

## 10. Scheduler Rule

The connector sync scheduler is **not a continuously running background service**. As of `c64f97d`, sync runs when a user opens the Connectors page (`POST /api/v1/connectors/run-due`). Any documentation claiming otherwise is inaccurate. Do not claim "real-time" connector sync until a proper scheduled trigger (Cloudflare Cron Triggers or equivalent) is in place and verified.

---

## 11. No Invented Work

Do not implement features outside the current spec task or queue item. One item at a time, with evidence of completion before moving to the next.
