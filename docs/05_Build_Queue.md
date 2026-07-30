# Ellines EIP — Build Queue (Agent Worklist)

**Product:** Ellines EIP v1.0 Foundation  
**Authoritative scope:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)  
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

Cloud Agents and Automations **must pick the first `next` item** (or continue an `in_progress` item), implement it, update status in this file, **build, then land on `main`** (PR + merge preferred) so Pages/Identity deploy. Humans keep local in sync with `git pull origin main`.

---

## Where we are (2026-07-30)

| Phase | Status | Notes |
|-------|--------|-------|
| **1 — Platform Foundation** | ~60% | Identity + web shell live; gateway / full admin / audit wiring incomplete |
| **2 — Integration Hub** | ~5% | SDK README + UI placeholder only |
| **3 — Executive Command Center** | ~25% | Shell + placeholder KPIs; no live data |
| **4 — Ellinea AI** | ~5% | Brand + placeholder page only |
| **5 — Workflow & Automation** | 0% | Not started |
| **Hosting** | Live | Pages → [eip.ellines.co.ke](https://eip.ellines.co.ke) (UI + same-origin `/api/v1` auth); Nest Identity on Fly optional |

**Critical path remaining:** finish Identity/Admin → Integration Hub → live Dashboard → Ellinea AI → Workflows.

---

## Phase 1 — Platform Foundation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 1.1 | Monorepo & CI | `done` | Workspaces, Pages deploy workflow; lint/test CI thin |
| 1.2 | Identity Core | `in_progress` | NestJS: register/login JWT, orgs, branches, depts, invite, roles, AuditLog model |
| 1.2a | Harden Identity (tests, password reset, role guards on all routes) | `next` | First agent target after landing WIP brand/UI |
| 1.3 | API Gateway | `todo` | `apps/api-gateway` not present yet |
| 1.4 | Audit Trail | `in_progress` | Prisma model exists; not consistently written on all actions |
| 1.5 | Admin Console | `in_progress` | Settings shows session; no full user/branch/connector admin UI |

---

## Phase 2 — Integration Hub

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 2.1 | Connector Framework + SDK | `todo` | `packages/connectors-sdk` README only |
| 2.2 | REST API Connector | `todo` | |
| 2.3 | PostgreSQL Connector | `todo` | |
| 2.4 | CSV/File Connector | `todo` | P1 |
| 2.5 | Email Connector | `todo` | P1 |
| 2.6 | Universal Enterprise Model | `todo` | |
| 2.7 | Sync Scheduler | `todo` | |
| 2.x | `services/integration-hub` microservice | `todo` | Scaffold when starting 2.1 |

---

## Phase 3 — Executive Command Center

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 3.1 | Executive Dashboard shell | `in_progress` | `/app` Command Center UI exists; data is placeholder |
| 3.2 | KPI Widgets (live) | `todo` | Needs connectors / mock data layer |
| 3.3 | Enterprise Health Score | `todo` | Placeholder “—” |
| 3.4 | Enterprise Timeline | `todo` | |
| 3.5 | Enterprise Search | `todo` | |
| 3.6 | Notification Center | `todo` | `services/notification` missing |

---

## Phase 4 — Ellinea AI

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 4.1–4.6 | NL Q&A, Daily Brief, Memory, Chat | `todo` | `/app/ellinea` placeholder; `services/ellinea-ai` missing |

---

## Phase 5 — Workflow & Automation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 5.1–5.4 | Approvals, rules, reports, event bus | `todo` | `services/workflow` missing |

---

## Recently landed on main (2026-07-30)

- Brand assets (Ellinea + EIP logos, favicons, splash)
- Splash / login / register / app shell visual refresh
- Agent sync pipeline (land on `main` after build; auto-merge `agent/*` PRs)
- Identity Fly Dockerfile + deploy workflow + demo seed / login docs
- Identity invite DTO / package tweaks

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

---

*Last status review: 2026-07-30*
