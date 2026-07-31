# Ellines EIP — Build Queue (Agent Worklist)

**Product:** Ellines EIP v1.0 Foundation  
**Authoritative scope:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)  
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

Cloud Agents and Automations **must pick the first `next` item** (or continue an `in_progress` item), implement it, update status in this file, **build, then land on `main`** (PR + merge preferred) so Pages/Identity deploy. Humans keep local in sync with `git pull origin main`.

**Keep going:** Do not pause for confirmation between queue items. Land on `main`, take the next `next` / continue `in_progress`, repeat until blocked.

**Ellinea standalone how-to:** Deferred — after Phase 6 extract, document and demo how to use the Ellinea “brain” (Memory + DNA + learning) as a standalone product. Do **not** stop current Owner/Admin work for that explanation.

---

## Where we are (2026-07-31)

| Phase | Status | Notes |
|-------|--------|-------|
| **1 — Platform Foundation** | ~98% | Audit Center + change password shipped; org profile still todo |
| **2 — Integration Hub** | ~99% | Connector health on Owner/IT Overview |
| **3 — Owner / Admin Command Center** | ~98% | **Active** — Owner/Admin path nearly complete |
| **4 — Ellinea AI** | ~72% | Feedback loop shipping; DNA/signals next; standalone how-to later |
| **5 — Workflow & Automation** | ~15% | Approvals stub; deep workflow after Owner/Admin dash |
| **Hosting** | Live | Pages via GitHub Actions only (no dual CF Git builds; no Pages cron) |

### Priority order (first → next → later)

1. **Now — Owner / IT Admin dashboard** (`3.7` → `3.8` → left-behind Owner/Admin items).
2. **Next — Owner/Admin intelligence** (Ellinea + Approvals for Owner/IT).
3. **Then — Ellinea learning** (`4.7`–`4.9`).
4. **Then — other role consoles.**
5. **Later —** workflow depth, email/push, LLM (`4.10`), **Ellinea standalone** (`4.S` / Phase 6) + **how-to use the brain**.

**Critical path:** Owner/Admin Work Console → Owner/Admin Ellinea → learn & recommend → other roles → workflow / LLM → Ellinea reusable engine (+ how-to).

**Feature settings rule:** preference-shaped features ship a System Settings control + a queue note.

---

## Phase 1 — Platform Foundation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 1.1 | Monorepo & CI | `done` | Workspaces, Pages deploy workflow; lint/test CI thin |
| 1.2 | Identity Core | `done` | NestJS: register/login JWT, orgs, branches, depts, invite, roles, AuditLog model |
| 1.2a | Harden Identity | `done` | RolesGuard; forgot/reset; Jest unit tests |
| 1.2b | Auth UX complete | `done` | Pages forgot/reset + SSO; login/register wired |
| 1.2c | Change password (profile) | `done` | Profile form + `/api/v1/auth/change-password` |
| 1.3 | API Gateway | `todo` | Deferred — Hub first |
| 1.4 | Audit Trail | `done` | Writes + Owner/IT Audit Center UI |
| 1.4a | Audit Center UI | `done` | `/app/audit` + Pages list API |
| 1.5 | Admin Console | `done` | `/app/admin` + `/app/platform` |
| 1.5a | Owner vs IT authority | `done` | Only Owner assigns Owner & IT |
| 1.6 | Org structure UI (branches / depts) | `done` | Pages Functions + Org Admin forms |
| 1.7 | Org profile (name / slug display) | `done` | Owner renames org in System Settings; slug read-only |

---

## Phase 2 — Integration Hub

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 2.1 | Connector Framework + SDK | `done` | |
| 2.2 | REST API Connector | `done` | |
| 2.2a | Install wizard + per-org config | `done` | |
| 2.2b | OpenAPI / Swagger ingest | `done` | |
| 2.3 | PostgreSQL Connector | `done` | |
| 2.3a | Platform connector packs | `done` | |
| 2.4 | CSV/File Connector | `done` | |
| 2.5 | Email Connector | `done` | |
| 2.5a | SFTP / folder drop | `done` | |
| 2.6 | Universal Enterprise Model | `done` | |
| 2.7 | Sync Scheduler | `done` | No Pages cron |
| 2.8 | Connector health on Owner/IT Overview | `done` | Install status chips on admin Overview |
| 2.x | `services/integration-hub` | `todo` | Optional microservice |
| 2.x | Webhooks / events | `todo` | System B pushes to EIP |
| 2.x | SQL Server / MySQL | `todo` | When HIS needs it |

---

## Phase 3 — Owner / Admin Command Center (active)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 3.1 | Executive Dashboard shell | `done` | Role-adaptive Work Console |
| 3.2 | KPI Widgets (live) | `done` | |
| 3.3 | Enterprise Health Score | `done` | |
| 3.4 | Enterprise Timeline | `done` | |
| 3.5 | Enterprise Search | `done` | |
| 3.6 | Notification Center | `done` | Delete one / all; mark read; settings |
| 3.7 | Owner / IT Admin dashboard polish | `done` | Owner/IT copy, ops rail, Approvals/Ellinea KPI links |
| 3.8 | Org structure in Admin | `done` | Branches + departments on `/app/admin` |
| 3.9 | Owner/IT empty states | `done` | No-sync callout on Overview; empty members on Admin |
| 1.4a | Audit Center UI | `done` | `/app/audit` feed |
| 1.7 | Org profile (name) | `done` | Owner renames org in Settings |
| 4.7 | Recommendation feedback | `done` | Helpful/dismiss on Ask Ellinea |
| 4.8 | Enterprise DNA capture | `next` | From Memory + Approvals |
| 3.x | Email/push notifications | `todo` | Later — `services/notification` |
| 3.x | Other-role Overview polish | `todo` | After Owner/Admin Ellinea learning |

---

## Phase 4 — Ellinea AI (intelligence that keeps learning)

Blueprint: *“Continuously learn from enterprise knowledge through Ellinea AI.”*

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 4.1 | Natural Language Q&A | `done` | Template + UEM |
| 4.2 | CEO Daily Brief | `done` | |
| 4.3 | Explainable Recommendations | `done` | |
| 4.4 | Enterprise Memory | `in_progress` | Local notes; server Memory later |
| 4.4a | Server Enterprise Memory API | `todo` | Persist policies/decisions per org |
| 4.5 | Context Engine | `done` | Role + org framing |
| 4.6 | Chat Interface | `done` | |
| 4.7 | Recommendation feedback loop | `done` | Helpful/dismiss → re-rank; settings toggle |
| 4.8 | Enterprise DNA capture | `next` | From Memory + Approvals |
| 4.9 | Continuous learning signals | `todo` | Outcomes over time |
| 4.10 | LLM / RAG | `todo` | After server Memory |
| 4.S | Ellinea AI standalone | `todo` | Phase 6 — productize engine |
| 4.H | **How to use Ellinea brain (standalone)** | `todo` | **Explain + demo later** — after 6.1–6.3; do not block Owner/Admin work |

---

## Phase 5 — Workflow & Automation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 5.1 | Approval Workflows | `in_progress` | Local queue for Owner/IT |
| 5.1a | Multi-step approval templates | `todo` | After Owner/Admin dash solid |
| 5.2 | Business Rules Engine | `todo` | Deferred |
| 5.3 | Scheduled Reports | `todo` | |
| 5.4 | Event Bus | `todo` | |

---

## Phase 6 — Ellinea AI as a product (after EIP Foundation)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 6.1 | Extract `services/ellinea-ai` | `todo` | |
| 6.2 | Ellinea API contract | `todo` | ask / brief / recommend / memory / feedback |
| 6.3 | `@ellines/ellinea-sdk` | `todo` | |
| 6.4 | Bring-your-own connectors | `todo` | UEM snapshots from any System B |
| 6.5 | Tenant learning isolation | `todo` | |
| 6.6 | Ellinea console (thin) | `todo` | |
| 6.7 | Standalone operator guide | `todo` | **How-to:** wire Memory + DNA + API into another Ellines product |

---

## Recently landed on main (through 2026-07-31)

- Audit Center (`/app/audit`), change password on Profile, connector health chips on Overview
- Org structure (branches/departments) on Org Admin + Pages APIs
- Owner/IT Overview ops rail + empty states; roadmap keep-going
- Notification delete; Ellinea learning + standalone phases documented
- Approvals stub; Ellinea recs/memory/role context; Org Admin densify
- Pages deploy-safe (no cron); GitHub Actions only

---

## Agent run protocol

1. Read `AGENTS.md` and this queue.
2. Take the highest-priority `next` (or continue `in_progress`).
3. Branch: `agent/<id>-short-slug` (optional when landing directly on `main` in short agent runs).
4. Implement + run required builds (`build:shared`, web; identity if touched).
5. Update this file; set the following item to `next`.
6. Land on `main`. Never force-push. Never commit secrets.
7. **Continue immediately** to the next queue item — do not wait for human confirmation.
8. Humans: `git pull origin main` to match what shipped.

Automation prompt: [06_Automation_Prompt.md](./06_Automation_Prompt.md)  
Demo login: [07_Demo_Login.md](./07_Demo_Login.md)  
Live Identity: [08_Live_Identity_Setup.md](./08_Live_Identity_Setup.md)  
Access layers: [09_Access_Layers.md](./09_Access_Layers.md)

---

*Last status review: 2026-07-31*
