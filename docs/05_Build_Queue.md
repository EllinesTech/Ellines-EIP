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
| **2 — Integration Hub** | ~98% | MVP connectors + UEM + sync schedules shipped |
| **3 — Owner / Admin Command Center** | ~92% | **Active focus** — polish Owner + IT Admin dashboard before other roles |
| **4 — Ellinea AI** | ~65% | Brief + recs + memory + role context; **learning + standalone** planned (see 4.7–4.S) |
| **5 — Workflow & Automation** | ~15% | Approvals stub only — pause deep workflow until Owner/Admin dash is solid |
| **Hosting** | Live | Pages via GitHub Actions only (no dual CF Git builds; no Pages cron) |

### Priority order (do this first → next → later)

1. **Now — Owner / IT Admin dashboard** (`3.7`): Org Admin, Connectors, Overview, Notifications, Settings, authority clarity.
2. **Next — Owner/Admin intelligence:** Ellinea as Owner/IT sees it; Approvals decide path.
3. **Then — Ellinea learning loop** (`4.7`–`4.9`): feedback on recommendations → Enterprise DNA → continuous org understanding (helps business people get better advice over time).
4. **Then — other role consoles** (executive / manager / member).
5. **Later —** Workflow depth (5.2+), email/push, LLM/RAG (`4.10`), **Ellinea standalone product** (`4.S`).

**Critical path:** Owner/Admin Work Console → Owner/Admin Ellinea → **learn & recommend better** → other roles → workflow / LLM → **Ellinea as reusable engine**.

**Feature settings rule:** preference-shaped features ship a System Settings control + a queue note.

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

## Phase 3 — Owner / Admin Command Center (active)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 3.1 | Executive Dashboard shell | `done` | Role-adaptive Work Console |
| 3.2 | KPI Widgets (live) | `done` | From `/api/v1/enterprise/summary` after connector sync |
| 3.3 | Enterprise Health Score | `done` | Snapshot `healthScore` |
| 3.4 | Enterprise Timeline | `done` | `/app/timeline` + Overview rail; uses org clock prefs + sync timestamps |
| 3.5 | Enterprise Search | `done` | `/app/search` + topbar; queries snapshot, timeline, UEM objects, installs |
| 3.6 | Notification Center | `done` | Feed + bell; mark read; **delete one / delete all**; settings |
| 3.7 | Owner / IT Admin dashboard polish | `next` | Density, authority copy, admin Overview shortcuts — **do before other roles** |
| 3.x | Email/push notifications | `todo` | Needs `services/notification` + org policy — later |

---

## Phase 4 — Ellinea AI (intelligence that keeps learning)

Blueprint principle: *“Continuously learn from enterprise knowledge through Ellinea AI.”*  
Today: template Q&A + local memory. Target: understand **this** business and recommend with rising confidence.

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 4.1 | Natural Language Q&A | `done` | Template engine over snapshot + UEM (LLM deferred) |
| 4.2 | CEO Daily Brief | `done` | Ask Ellinea + chat; auto-load toggle in System Settings |
| 4.3 | Explainable Recommendations | `done` | Evidence + confidence on Ask Ellinea; settings toggle |
| 4.4 | Enterprise Memory | `in_progress` | Local org notes (browser); **server Memory + RAG** unlocks real learning |
| 4.5 | Context Engine | `done` | Role + org framing; settings toggle; rec filtering |
| 4.6 | Chat Interface | `done` | Panel + `/app/ellinea` |
| 4.7 | Recommendation feedback loop | `todo` | Accept / dismiss / “helpful?” on insights → re-rank next brief (Owner/Admin first) |
| 4.8 | Enterprise DNA capture | `todo` | Learn policies from Memory + Approvals + Owner decisions (lexicon: Enterprise DNA™) |
| 4.9 | Continuous learning signals | `todo` | Store outcomes over time (what was approved, what alerts repeated) so Ellinea adapts per org |
| 4.10 | LLM / RAG | `todo` | External model + retrieval over server Enterprise Memory |
| 4.S | **Ellinea AI standalone** | `todo` | **Productize after EIP core:** `services/ellinea-ai` + SDK/API so other Ellines products (and custom systems) can plug into the same intelligence engine — see Phase 6 |

**Why this matters for business people:** Ellinea should not only answer once — it should remember how *their* org decides, what worked, and recommend the next action with evidence.

---

## Phase 5 — Workflow & Automation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 5.1 | Approval Workflows | `in_progress` | Local queue OK for Owner/IT; multi-step service later |
| 5.2 | Business Rules Engine | `todo` | Deferred until Owner/Admin dash polish (3.7) lands |
| 5.3 | Scheduled Reports | `todo` | Daily/weekly reports |
| 5.4 | Event Bus | `todo` | Internal pub/sub |

---

## Phase 6 — Ellinea AI as a product (after EIP Foundation)

Goal: Ellinea is the **intelligence engine inside EIP**, then also a **standalone Ellines Tech product** other systems can adopt (hospitals, ERP front-ends, new Ellines apps) without forking EIP.

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 6.1 | Extract `services/ellinea-ai` | `todo` | Move engine out of web-only templates into a Nest (or similar) service |
| 6.2 | Ellinea API contract | `todo` | `ask`, `brief`, `recommend`, `memory.write/read`, `feedback` — org-scoped, JWT |
| 6.3 | `@ellines/ellinea-sdk` | `todo` | TypeScript client for EIP + future products |
| 6.4 | Bring-your-own connectors | `todo` | Accept UEM snapshots / events from any System B (not only EIP Hub) |
| 6.5 | Tenant learning isolation | `todo` | Per-org Memory + DNA only — never leak across customers |
| 6.6 | Ellinea console (thin) | `todo` | Optional standalone UI for partners embedding Ellinea |

**Suggestion (product):** Brand **Ellinea AI™** as “Intelligence that empowers” — EIP is the first flagship consumer; SDK is how Ellines builds the next systems faster.

---

## Recently landed on main (through 2026-07-31)

- Notification delete (one / all) + Owner/Admin-first priority in queue
- Approvals queue stub (local) + System Settings toggles
- Ellinea: daily brief, explainable recommendations, local Enterprise Memory + settings toggles
- Org Admin densify; Pages deploy-safe (no cron); GitHub Actions only
- Sync scheduler: per-install intervals, run-due on Connectors load
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
