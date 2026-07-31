# Ellines EIP — Build Queue (Agent Worklist)

**Product:** Ellines EIP v1.0 Foundation  
**Authoritative scope:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)  
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

Cloud Agents and Automations **must pick the first `next` item** (or continue an `in_progress` item), implement it, update status in this file, **build, then land on `main`** (PR + merge preferred) so Pages/Identity deploy. Humans keep local in sync with `git pull origin main`.

---

## Where we are (2026-07-31)

| Phase | Status | Notes |
|-------|--------|-------|
| **1 — Platform Foundation** | ~95% | Owner vs IT authority hardened; System Settings + profile shell shipped |
| **2 — Integration Hub** | ~98% | MVP connectors + UEM + sync schedules shipped. Optional: hub service / webhooks / SQL Server |
| **3 — Executive Command Center** | ~90% | KPIs + UEM + Timeline + Search + **Notifications** shipped |
| **4 — Ellinea AI** | ~15% | Thin brief + template Q&A — **next** deepen |
| **5 — Workflow & Automation** | 0% | Not started |
| **Hosting** | Live | Pages via GitHub Actions → [eip.ellines.co.ke](https://eip.ellines.co.ke); Functions import verify gates deploy |

**Critical path remaining:** **Ellinea AI deepen (4.x)** → email/push notifications → Workflows / write under Owner policy.

**Feature settings rule:** new user-facing surfaces must ship a System Settings control when behavior is preference-shaped (display, density, notification filters, etc.).

**MVP launch connectors (scope 2.2–2.5):** all `done`. Optional later: SQL Server/MySQL, webhooks, dedicated `integration-hub` service.

---

## Phase 1 — Platform Foundation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 1.1 | Monorepo & CI | `done` | Workspaces, Pages deploy workflow; lint/test CI thin |
| 1.2 | Identity Core | `done` | NestJS: register/login JWT, orgs, branches, depts, invite, roles, AuditLog model |
| 1.2a | Harden Identity (tests, password reset, role guards on all routes) | `done` | RolesGuard on org writes; forgot/reset password + PasswordResetToken; Jest unit tests |
| 1.2b | Auth UX complete (register/login/forgot/SSO on live Pages) | `done` | Fixed register `updated_at`; Pages forgot/reset + work-email SSO; login/register UI wired |
| 1.3 | API Gateway | `todo` | Deferred — Hub connectors unlock more value first; resume when multi-service needs it |
| 1.4 | Audit Trail | `in_progress` | Prisma model exists; invite/update user audited on Pages + Nest |
| 1.5 | Admin Console | `done` | `/app/admin` + `/app/platform`; Owner vs IT labels + authority |
| 1.5a | Owner vs IT authority | `done` | Only Owner assigns/manages Owner & IT; IT invites work roles only |

---

## Phase 2 — Integration Hub

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 2.1 | Connector Framework + SDK | `done` | SDK + Demo JSON; OpenAPI parse; Postgres helpers; capability catalog |
| 2.2 | REST API Connector | `done` | SDK `createRestApiConnector` + Connectors UI endpoint + sample JSON sync |
| 2.2a | Install wizard + per-org config | `done` | Type → credentials → map → test/sync; `connector_installations` (not localStorage) |
| 2.2b | OpenAPI / Swagger ingest | `done` | Upload JSON → list capabilities → select GET routes → sync |
| 2.3 | PostgreSQL Connector | `done` | Read-only SELECT via Identity (`pg`); Pages saves config (TCP sync needs Nest) |
| 2.3a | Platform connector packs | `done` | Super Admin publish pack; Org IT install with credentials only |
| 2.4 | CSV/File Connector | `done` | Paste/import CSV — no API path |
| 2.5 | Email Connector | `done` | IMAP via Identity (`imapflow`); Pages saves config |
| 2.5a | SFTP / folder drop | `done` | Pull CSV via Identity (`ssh2-sftp-client`); Pages saves config |
| 2.6 | Universal Enterprise Model | `done` | Shared UEM types + normalize; timeline stores events+model; Command Center shows counts/objects |
| 2.7 | Sync Scheduler | `done` | Per-install interval + nextSyncAt; run-due on Connectors load (no Pages cron — deploy-safe) |
| 2.x | `services/integration-hub` microservice | `todo` | Logic hosted on Identity + Pages Functions for now |
| 2.x | Webhooks / events | `todo` | Planned — System B pushes to EIP |
| 2.x | SQL Server / MySQL | `todo` | Same pattern as Postgres when HIS needs it |

---

## Phase 3 — Executive Command Center

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 3.1 | Executive Dashboard shell | `done` | Role-adaptive Work Console |
| 3.2 | KPI Widgets (live) | `done` | From `/api/v1/enterprise/summary` after connector sync |
| 3.3 | Enterprise Health Score | `done` | Snapshot `healthScore` |
| 3.4 | Enterprise Timeline | `done` | `/app/timeline` + Overview rail; uses org clock prefs + sync timestamps |
| 3.5 | Enterprise Search | `done` | `/app/search` + topbar; queries snapshot, timeline, UEM objects, installs |
| 3.6 | Notification Center | `done` | `/app/notifications` + bell; settings for badge/alerts/sync; snapshot-derived feed |
| 3.x | Email/push notifications | `todo` | Needs `services/notification` + org policy |

---

## Phase 4 — Ellinea AI

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 4.1–4.6 | NL Q&A, Daily Brief, Memory, Chat | `in_progress` | Template Q&A now uses UEM counts/objects/timeline; LLM still deferred |

---

## Phase 5 — Workflow & Automation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 5.1–5.4 | Approvals, rules, reports, event bus | `todo` | `services/workflow` missing |

---

## Recently landed on main (through 2026-07-31)

- Sync scheduler: per-install intervals, run-due on Connectors load, Pages cron hook
- Universal Enterprise Model normalize + Command Center object counts
- Pages Functions import verify gate; Work Console density + settings typography
- System Settings, profile shell, org datetime prefs (Pages)
- Owner vs IT hardening; Email IMAP + SFTP; connector wizard + packs
- REST API + CSV/file connectors; live sync into enterprise snapshot
- Access layers + Auth UX + Identity hardening; brand refresh; Fly Identity deploy

---

## Agent run protocol

1. Read `AGENTS.md` and this queue.
2. Take the highest-priority `next` (or continue `in_progress`).
3. Branch: `agent/<id>-short-slug` (e.g. `agent/1.2a-identity-hardening`).
4. Implement + run required builds (`build:shared`, web; identity if touched).
5. Update this file: mark item `done` or leave `in_progress` with notes; set the following item to `next`.
6. Open a PR to `main`, then **merge** it (or land verified commits on `main`). Never force-push.
7. Deploy: Pages on `main` push; Identity Fly workflow when identity paths change.
8. Humans: `git pull origin main` to match what shipped.

Automation prompt copy-paste: [06_Automation_Prompt.md](./06_Automation_Prompt.md)  
Demo login: [07_Demo_Login.md](./07_Demo_Login.md)  
Live Identity (Fly) one-time: [08_Live_Identity_Setup.md](./08_Live_Identity_Setup.md)  
Access layers: [09_Access_Layers.md](./09_Access_Layers.md)

---

*Last status review: 2026-07-31*
