# Ellines EIP — Build Queue (Agent Worklist)

**Product:** Ellines EIP v1.0 Foundation  
**Authoritative scope:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)  
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

Cloud Agents and Automations **must pick the first `next` item** (or continue an `in_progress` item), implement it, update status in this file, **verify → build → push `main` (deploy)** , then **immediately start the next `next` item**. Do not stop to ask the human between items.

### Continuous agent loop (mandatory)

```
while queue has next/in_progress and not blocked:
  1. Implement the item (one scoped slice)
  2. Update this file (mark done; set following item to next)
  3. npm run verify:pages-functions   # if Functions touched
  4. npm run build:shared             # if shared touched
  5. npm run build -w @ellines-eip/web
  6. identity build if identity touched
  7. git commit + git push origin main   # Pages deploys from Actions
  8. Start step 1 on the new next item — DO NOT ASK
```

**Stop only if:** item is `blocked`, secrets missing, or a build you cannot fix after a genuine attempt. Never pause for “should I continue?” — the answer is always yes until blocked.

**Ellinea standalone how-to:** Deferred — after Phase 6 extract. Do **not** stop Owner/Admin or learning work for that explanation.

---

## Where we are (2026-07-31)

| Phase | Status | Notes |
|-------|--------|-------|
| **1 — Platform Foundation** | ~99% | Audit, password, org rename done |
| **2 — Integration Hub** | ~100% | SQL Server + MySQL read-only connectors shipped |
| **3 — Owner / Admin Command Center** | ~98% | Owner/Admin path solid |
| **4 — Ellinea AI** | ~100% | Standalone package + guide shipped |
| **5 — Workflow & Automation** | ~55% | Approvals, rules, reports, event bus done |
| **6 — Ellinea product** | ~100% | 6.1–6.7 done |
| **7 — Mobile Work Companion** | `todo` | v1.1+ simplified phone app (roadmap) |
| **Hosting** | Live | Pages via GitHub Actions; Identity Fly needs `FLY_API_TOKEN` once |

### Priority order (first → next → later)

1. **Now —** Platform Super Admin: suspend / disable org.
2. **Later —** workflow depth, email SMTP worker, **Mobile Work Companion** (v1.1).
3. **Do not build mobile in v1.0** unless a tiny stub is explicitly queued.

**Critical path:** SQL connectors done → Platform suspend/disable → Mobile Companion in v1.1 (wraps SoR; Ellinea central).

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
| 1.3 | API Gateway | `done` | `services/api-gateway` Nest proxy stub |
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
| 2.x | `services/integration-hub` | `done` | Optional microservice |
| 2.x | Webhooks / events | `done` | `POST /api/v1/webhooks/enterprise` + secret rotate on Connectors |
| 2.x | SQL Server / MySQL | `done` | Read-only `sqlserver` + `mysql` catalog; Identity TCP via `mssql` / `mysql2` |

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
| 4.8 | Enterprise DNA capture | `done` | Memory + Approvals + feedback → DNA traits |
| 4.9 | Continuous learning signals | `done` | Signals strip on Ask Ellinea |
| 5.1a | Multi-step approval templates | `done` | simple / IT→Owner / Manager→Exec→Owner |
| 5.2 | Business rules (local) | `done` | `/app/rules` + Overview flags |
| 5.3 | Scheduled Reports | `done` | Local schedules + preview |
| 3.x | Other-role Overview polish | `done` | Role-specific copy, real CTAs, empty sync state |
| 3.x | Email/push notifications | `done` | Server policy + simulated outbox (`/api/v1/notifications/deliver`) |
| 5.4 | Event Bus | `done` | Local pub/sub + log on Rules / Approvals |
| 4.4a | Server Enterprise Memory API | `done` | `GET/PUT /api/v1/orgs/me/ellinea-memory` |
| 4.10 | LLM / RAG | `done` | RAG retrieve + `POST /api/v1/ellinea/ask` |
| 6.1 | Extract `services/ellinea-ai` | `done` | `@ellines-eip/ellinea-ai` + Nest stub |
| 6.2 | Ellinea API contract | `done` | docs/11 + Nest ask/brief/recommend/memory/feedback |
| 6.3 | `@ellines/ellinea-sdk` | `done` | `@ellines-eip/ellinea-sdk` createEllineaClient |
| 6.4 | Bring-your-own connectors | `done` | `POST /api/v1/enterprise/ingest` + Connectors UI |
| 6.5 | Tenant learning isolation | `done` | Server Memory + Learning (feedback/DNA) per org JWT |
| 6.6 | Ellinea console (thin) | `done` | `/app/ellinea-console` Owner/IT **operator / API lab** only — not Work Console nav |
| 6.7 | Standalone operator guide | `done` | [12_Ellinea_Standalone_HowTo.md](./12_Ellinea_Standalone_HowTo.md) |
| 4.H | How to use Ellinea brain | `done` | Same as 6.7 |
| 1.3 | API Gateway | `done` | Edge routing service |
| 2.x | Integration hub service | `done` | `services/integration-hub` |
| 2.x | Webhooks / events | `done` | Pages webhook + org secret; catalog available |

---

## Phase 4 — Ellinea AI (intelligence that keeps learning)

Blueprint: *“Continuously learn from enterprise knowledge through Ellinea AI.”*

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 4.1 | Natural Language Q&A | `done` | Template + UEM |
| 4.2 | CEO Daily Brief | `done` | |
| 4.3 | Explainable Recommendations | `done` | |
| 4.4 | Enterprise Memory | `done` | Local cache + server sync |
| 4.4a | Server Enterprise Memory API | `done` | Org settings `ellineaMemory` via Pages + Nest |
| 4.5 | Context Engine | `done` | Role + org framing |
| 4.6 | Chat Interface | `done` | |
| 4.7 | Recommendation feedback loop | `done` | Helpful/dismiss → re-rank; settings toggle |
| 4.8 | Enterprise DNA capture | `done` | From Memory + Approvals + feedback; Ask Ellinea + settings |
| 4.9 | Continuous learning signals | `done` | Approval rate, alert pressure, feedback bias, memory depth on Ask Ellinea |
| 4.10 | LLM / RAG | `done` | Local RAG + optional OpenAI-compatible Ask; settings toggle |
| 4.S | Ellinea AI standalone | `todo` | Phase 6 — productize engine |
| 4.H | **How to use Ellinea brain (standalone)** | `done` | [12_Ellinea_Standalone_HowTo.md](./12_Ellinea_Standalone_HowTo.md) |

---

## Phase 5 — Workflow & Automation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 5.1 | Approval Workflows | `done` | Local queue + multi-step templates |
| 5.1a | Multi-step approval templates | `done` | IT→Owner, Manager→Exec→Owner, single |
| 5.2 | Business Rules Engine | `done` | `/app/rules` + Overview flag hits (local) |
| 5.3 | Scheduled Reports | `done` | `/app/reports` local schedules + preview |
| 5.4 | Event Bus | `done` | Browser event bus + log |
| 4.4a | Server Enterprise Memory | `done` | Persist policies/decisions per org |
| 4.10 | LLM / RAG | `done` | Grounded provider path |
| 3.x | Other-role Overview polish | `done` | Exec/manager/member CTAs + empty state |
| 3.x | Email/push notifications | `done` | Policy + outbox simulator; SMTP worker later |

---

## Phase 6 — Ellinea AI as a product (after EIP Foundation)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 6.1 | Extract `services/ellinea-ai` | `done` | Package + Nest stub on :3002 |
| 6.2 | Ellinea API contract | `done` | [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md) |
| 6.3 | `@ellines/ellinea-sdk` | `done` | `createEllineaClient` in packages/ellinea-sdk |
| 6.4 | Bring-your-own connectors | `done` | External UEM ingest endpoint + Connectors paste UI |
| 6.5 | Tenant learning isolation | `done` | `GET/PUT /api/v1/orgs/me/ellinea-learning` |
| 6.6 | Ellinea console (thin) | `done` | `/app/ellinea-console` — operator/API smoke UI; linked from Settings |
| 6.7 | Standalone operator guide | `done` | [12_Ellinea_Standalone_HowTo.md](./12_Ellinea_Standalone_HowTo.md) |

### Ellinea surfaces in EIP (product decision — do not invent a second Ask nav)

| Surface | Route / entry | Who | Role |
|---------|---------------|-----|------|
| **Ask** | Floating “Ask Ellinea AI” (+ optional “Open full Ask workspace” → `/app/ellinea`) | Everyone | Everyday chat / Q&A |
| **Ellinea settings** | System Settings → **Ellinea AI** card (brief, recs, memory, DNA, LLM+RAG, …) | Everyone | Preference home — **not** a top-level nav item |
| **Ellinea console** | `/app/ellinea-console` via Settings → “Operator console (API)” | Owner/IT only | Operator / API lab for SDK + contract smoke — **not** everyday chat; **not** side nav |

**Do not** add Ask or Console back to the Work Console side nav. Keep the console route. Future: console may evolve into a thin **standalone Ellinea operator product** (Phase 6), but EIP Work Console nav stays clean.

---

## Phase 1 leftovers / platform depth

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 1.3 | API Gateway | `done` | Nest/Fastify edge; route /auth /enterprise /ellinea |
| 2.x | `services/integration-hub` | `done` | Nest stub :3003 |
| 2.x | Webhooks / events | `done` | System B push endpoint + Owner/IT secret |
| 2.x | SQL Server / MySQL | `done` | Read-only connectors; TCP on Identity |
| 1.5b | Platform suspend / disable org | `next` | Super Admin: suspend tenant; block login + sync |

---

## Phase 7 — Mobile Work Companion (v1.1+ — roadmap only)

Simplified **phone app** so Owner and permitted employees can track day-to-day ops with **Ellinea AI** in the loop. EIP remains an intelligence layer **above** Systems of Record — it wraps and enhances HIS/ERP/CRM; it does **not** replace them (“god mode” ops view, not a new SoR).

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 7.1 | Mobile Work Companion vision | `todo` | Product brief: phone-first Work Console slice |
| 7.2 | Fleet / company car tracking | `todo` | Via connectors / GPS later — surface status + Ellinea alerts |
| 7.3 | Employee register (people directory) | `todo` | Read from SoR / UEM people; Owner-scoped actions |
| 7.4 | Pull live data + summary reports | `todo` | Sync-backed KPIs and scheduled report previews on phone |
| 7.5 | Ellinea suggestions on mobile | `todo` | Ask Ellinea + recommendations everywhere |
| 7.6 | Work email summarization | `todo` | Build on email connector; Ellinea summarize for work inbox |
| 7.7 | Access: Owner + permitted employees | `todo` | Same role model; no bypass of SoR authority |

Do **not** implement full native apps in v1.0 Foundation runs. Keep this phase `todo` until MVP web path is stable.

## Recently landed on main (through 2026-07-31)

- **SQL Server / MySQL connectors:** read-only catalog + Identity TCP drivers (`mssql`, `mysql2`); Pages soft-test / 501 sync like Postgres
- **Ellinea placement:** Ask = float (+ full workspace `/app/ellinea`); prefs = System Settings **Ellinea AI** card; console = Owner/IT operator/API lab via Settings link only (no side-nav Ask/Console). Mobile Work Companion remains Phase 7 `todo` (v1.1+).
- Audit Center (`/app/audit`), change password on Profile, connector health chips on Overview
- Org structure (branches/departments) on Org Admin + Pages APIs
- Owner/IT Overview ops rail + empty states; roadmap keep-going
- Notification delete; Ellinea learning + standalone phases documented
- Approvals stub; Ellinea recs/memory/role context; Org Admin densify
- Pages deploy-safe (no cron); GitHub Actions only

---

## Agent run protocol

1. Read `AGENTS.md` and this queue (especially **Continuous agent loop**).
2. Take the highest-priority `next` (or continue `in_progress`).
3. Implement + verify + build.
4. Update this file; set the following item to `next`.
5. Commit and push `main` (Pages deploys). Never force-push. Never commit secrets.
6. **Immediately** go to step 2 for the next item — do not ask the human.
7. Stop only when blocked or the queue has no `next` / `in_progress`.
8. Humans: `git pull origin main` to match what shipped.

Automation prompt: [06_Automation_Prompt.md](./06_Automation_Prompt.md)  
Demo login: [07_Demo_Login.md](./07_Demo_Login.md)  
Live Identity: [08_Live_Identity_Setup.md](./08_Live_Identity_Setup.md)  
Access layers: [09_Access_Layers.md](./09_Access_Layers.md)

---

*Last status review: 2026-07-31*
