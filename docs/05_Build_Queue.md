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

## Where we are (2026-08-01)

### What we are building (do not drift)

**Ellines EIP** = Enterprise Intelligence Platform **above** existing Systems of Record (ERP, CRM, HIS like Hospidia, HR, etc.).

- **Tagline:** Where Enterprise Systems Think Together.
- **AI:** **Ellinea AI** — always in the loop (brief, recommend, memory, DNA, detect connectors, summarize org tasks).
- EIP **connects and observes**; it does **not** replace or become the SoR.
- After connect/sync, EIP surfaces **everything connected org systems can expose** (via UEM / connectors) in **Organization System** as actionable capabilities for Owner/IT (later authorized roles) — reports, people, patients/clients, inventory, finance glance, branches, alerts, documents, tasks, etc.
- **Access layers:** Work Console roles; Owner/IT regulate; Platform Super Admin regulates orgs (suspend/rights). See [09_Access_Layers.md](./09_Access_Layers.md).

| Phase | Status | Notes |
|-------|--------|-------|
| **1 — Platform Foundation** | ~99% | Audit, password, org rename done |
| **2 — Integration Hub** | ~100% | SQL Server + MySQL read-only connectors shipped |
| **3 — Owner / Admin Command Center** | ~99% | Owner/IT path solid; Organization System capability catalog |
| **4 — Ellinea AI** | ~100% | Standalone package + guide; enterprise reasoning upgrade |
| **5 — Workflow & Automation** | ~100% | Approvals, rules, reports, event bus — all server-persisted |
| **6 — Ellinea product** | ~100% | 6.1–6.7 done |
| **7 — Mobile Work Companion** | 7.1–7.8 `done` | Web PWA companion complete; native apps remain future |
| **v1.1 — Multi-company** | `done` | OrganizationMembership + parentOrgId; my-orgs, switch, create-child APIs; OrgSwitcher UI; child-org in Admin |
| **Sprint 1 — Supreme upgrade** | `done` | Document Hub, real People+Fleet+Search+Inbox, invite email, approval email, report email, live notification badge |
| **Sprint 2 — Supreme upgrade** | `done` | Approval detail modal, combined Timeline, Platform per-org stats, Settings security+webhook sections |
| **Sprint 3 — Completion** | `done` | Glance live refresh + trends, Reports email delivery status, Approval notification emails |
| **Sprint 4 — Security & Quality** | `done` | Rate limiting, input validation, error standardization, strict TypeScript, Jest test infrastructure |
| **Hosting** | Live | Pages via GitHub Actions; Identity Fly needs `FLY_API_TOKEN` once |

### Priority order (first → next → later)

1. **Done —** Owner/IT side-nav rearrange; Console href = `/app/ellinea-console` (Ask stays float/workspace).
2. **Done —** notification SMTP/Resend + Web Push/VAPID outbox (secrets optional; simulated without them).
3. **Done —** Mobile Work Companion **vision brief** ([13_Mobile_Work_Companion_Brief.md](./13_Mobile_Work_Companion_Brief.md)).
4. **Done —** Responsive phone shell / PWA stub (7.2): installable manifest, viewport, bottom nav, Ask float prefs.
5. **Done —** Fleet + People + Glance + Inbox companion stubs (7.3–7.7) with empty-state degrade.
6. **Done —** Access prefs for Ask float / hide-from-work-users (7.8).
7. **Human blockers —** Pages env for live mail/push; GitHub `FLY_API_TOKEN` for Identity Fly. Native iOS/Android still out of scope.
8. **Done —** Connector auto-scan / Ellinea detect (IT): Owner/IT Auto-scan on Connectors (+ Console/Settings links); online edge probe + local browser ports; Hospidia catalog hint; Connect → wizard prefill. Access: `isOrgAdminRole` only; Settings notes later authorize-others.
9. **Done —** Organization System hub + **capability catalog** (Owner/IT): data-driven domains; live UEM pages (branches, departments, tasks, assets, documents, alerts, finance); companion deep links (people/fleet/glance/inbox); appointments/inventory/attendance stubs until kinds exist; Settings **Allow work roles to open Organization System** (default off) + route/nav guard.

**Critical path:** Queued web companion + Organization System catalog (with work-role authorize toggle) are complete. Stop only for human secrets or unfixable builds — not for inventing outside the queue.

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
| 2.x | Connector auto-scan / Ellinea detect (IT) | `done` | Generic-first: exact SoR URL any path; REST/OpenAPI prefill; optional HIS/ERP/CRM/Hospidia keyword bonuses; DB ports opt-in; scan≠connect UX. Later: authorize non-admin roles. |

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
| 3.x | Email/push notifications | `done` | Server policy + outbox; SMTP/Resend when secrets set |
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
| 3.x | Side nav rearrange (Owner/IT) | `done` | Edit nav + drag; `eip_nav_order:{orgId}:{userId}`; Ellinea Console stays above Settings by default |
| 3.x | Organization System hub | `done` | `/app/org-system` capability catalog; live UEM pages + companion deep links; Settings **Allow work roles to open Organization System** (default off) + route/nav guard; empty CTAs → Connectors + Auto-scan |

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
| 4.11 | Ellinea enterprise reasoning upgrade | `done` | Multi-hop answers (situation→evidence→risk→action→confidence); smarter RAG boosts; denser Owner brief (watch/decide/delegate); SoR-safe LLM prompt |
| 4.S | Ellinea AI standalone | `done` | Phase 6 complete (package + contract + SDK + console + guide) |
| 4.H | **How to use Ellinea brain (standalone)** | `done` | [12_Ellinea_Standalone_HowTo.md](./12_Ellinea_Standalone_HowTo.md) |

---

## Phase 5 — Workflow & Automation

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 5.1 | Approval Workflows | `done` | Multi-step templates; server-persisted via Pages Functions + Nest identity; localStorage fallback |
| 5.1a | Multi-step approval templates | `done` | IT→Owner, Manager→Exec→Owner, single |
| 5.2 | Business Rules Engine | `done` | `/app/rules` server-persisted; Pages Function + Nest; localStorage fallback |
| 5.3 | Scheduled Reports | `done` | `/app/reports` server-persisted; Pages Function + Nest; run-now; localStorage fallback |
| 5.4 | Event Bus | `done` | Server-drained via POST /api/v1/orgs/me/events; localStorage + CustomEvent mirror for instant UI |
| 4.4a | Server Enterprise Memory | `done` | Persist policies/decisions per org |
| 4.10 | LLM / RAG | `done` | Grounded provider path |
| 3.x | Other-role Overview polish | `done` | Exec/manager/member CTAs + empty state |
| 3.x | Email/push notifications | `done` | Policy + outbox; real send when RESEND/SMTP secrets present |

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
| **Ellinea console** | `/app/ellinea-console` via side nav (Owner/IT) + Settings → “Operator console (API)” | Owner/IT only | Operator / API lab for SDK + contract smoke — **not** everyday chat |

**Do not** add Ask back to the Work Console side nav. Keep the console route (and Owner/IT side-nav link above Settings). Future: console may evolve into a thin **standalone Ellinea operator product** (Phase 6), but Ask stays float-first.

---

## Phase 1 leftovers / platform depth

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 1.3 | API Gateway | `done` | Nest/Fastify edge; route /auth /enterprise /ellinea |
| 2.x | `services/integration-hub` | `done` | Nest stub :3003 |
| 2.x | Webhooks / events | `done` | System B push endpoint + Owner/IT secret |
| 2.x | SQL Server / MySQL | `done` | Read-only connectors; TCP on Identity |
| 1.5b | Platform suspend / disable org | `done` | `settings.platformStatus`; login + sync blocked; Platform UI |
| 3.x | Notification SMTP worker | `done` | Pages deliver: Resend/SMTP when secrets set; else `simulated`. Needs human Pages secrets to go live. |
| 3.x | Web Push / VAPID | `done` | VAPID env + `/sw-push.js` + push-subscription API; simulated without keys. |

---

## v1.1 Track E — OAuth2 / SAML Enterprise SSO

| ID | Item | Status | Notes |
|----|------|--------|-------|
| E.1 | Prisma schema: SsoProvider + SsoProviderUser | `done` | Added to schema; db:push complete |
| E.2 | NestJS OAuth2 service | `done` | services/identity/src/sso/oauth2.service.ts (300 LOC) |
| E.3 | NestJS SAML2 service | `done` | services/identity/src/sso/saml2.service.ts (300 LOC) |
| E.4 | Pages Functions: OAuth2/SAML authorize + callback | `done` | 4 endpoints: authorize, callback (OAuth2); authorize, ACS (SAML2) |
| E.5 | Pages Functions: SSO provider management | `done` | 7 endpoints: GET/POST providers, GET/PATCH/DELETE by ID, test connectivity, linked users |
| E.6 | Public org SSO provider fetch endpoint | `done` | GET /api/v1/orgs/{slug}/sso-providers for login page |
| E.7 | Build verification | `done` | All TypeScript builds pass; 73 Pages Functions verified |
| E.8 | Settings UI: SSO provider configuration | `done` | OAuth2/SAML forms, provider list, test/delete, help text |
| E.9 | Testing: Real Azure AD + Okta | `blocked` | Human: requires real IdP test tenants (out of agent scope) |
| E.10 | Documentation: User guide + API spec | `next` | Deployment runbook for SSO setup |

---

## Phase 7 — Mobile Work Companion (web PWA now; native v1.1+)

Simplified **phone companion** so Owner and permitted employees can track day-to-day ops with **Ellinea AI** in the loop. EIP remains an intelligence layer **above** Systems of Record — it wraps and enhances HIS/ERP/CRM; it does **not** replace them (“god mode” ops view, not a new SoR).

| ID | Item | Status | Notes |
|----|------|--------|-------|
| 7.1 | Mobile Work Companion vision | `done` | [13_Mobile_Work_Companion_Brief.md](./13_Mobile_Work_Companion_Brief.md) |
| 7.2 | Responsive phone shell / PWA stub | `done` | `manifest.webmanifest`, viewport/theme, phone bottom nav, Ask float prefs; installable web |
| 7.3 | Fleet / company car tracking | `done` | `/app/fleet` — UEM `asset` (+ name hints); empty-state until GPS/SoR; Ellinea link |
| 7.4 | Employee register (people directory) | `done` | `/app/people` — UEM person/user read-only; Owner actions stay on Org Admin |
| 7.5 | Pull live data + summary reports | `done` | `/app/glance` — sync KPIs + local report preview + schedule list |
| 7.6 | Ellinea suggestions on mobile | `done` | Glance recs strip + phone bottom Ask + float; full Ask at `/app/ellinea` |
| 7.7 | Work email summarization | `done` | `/app/inbox` — email install detect + Ask CTA; empty without connector |
| 7.8 | Access: Owner + permitted employees | `done` | Same roles; Settings hide-Ask-from-work-users; Console Owner/IT only |

Do **not** implement full native iOS/Android in Foundation runs. Web companion slices 7.2–7.8 are shipped; deeper GPS/mail intelligence waits on live connectors + human secrets.

## Recently landed on main (through 2026-08-01)

- **v1.1 Multi-company consolidation:** `OrganizationMembership` join table + `Organization.parentOrgId` self-FK added to Prisma schema (db:push synced). NestJS `MultiOrgService` in identity: `GET /api/v1/orgs/my-orgs`, `POST /api/v1/orgs/switch` (new JWT for target org), `POST /api/v1/orgs/me/create-child` (Owner only). Matching Cloudflare Pages Functions for all three endpoints. `AuthSession.orgs[]` field in `api.ts`. `OrgSwitcher` dropdown component (lazy-loads org list, zero-regression on single-org). "Create linked org" section in `/app/admin` (Owner only). Org name in topbar now shows the switcher + role pill.

- **Phase 5 server-side workflow:** Prisma models (`ApprovalRequest`, `ApprovalStep`, `BusinessRule`, `ScheduledReport`, `EnterpriseEvent`) added to schema + `db:push` synced. NestJS `WorkflowModule` (controller + service + DTOs) in `services/identity` — REST endpoints for approvals, rules, reports, events under `/api/v1/orgs/me/`. Matching Cloudflare Pages Functions for same-origin static site (approvals GET/POST, decide, rules CRUD, reports CRUD + run, events GET/POST). Frontend pages (Approvals, Rules, Reports) call server first with localStorage fallback. Event bus drains to server on every publish. Phase 5 now 100%.

- **Auto-scan generic SoR fix:** Exact URL IT enters is primary (any path); REST/OpenAPI wizard prefill from app base; Hospidia/HIS/ERP/CRM are optional keyword bonuses only; DB ports opt-in collapsed hints; scan ≠ connect UX + troubleshooting.
- **Organization System deepen:** Live UEM pages for branches, departments, tasks, assets, documents, alerts digest, finance glance; appointments/inventory as objects when kinds exist (attendance stays stub); companion deep links (Glance/People/Fleet/Inbox); Settings toggle **Allow work roles to open Organization System** (default off) + `canAccessOrgSystem` route/nav guard; empty/sync CTAs → Connectors + Auto-scan; product EIP-above-SoR + Ellinea reminder on hub.
- **Organization System capability catalog:** Data-driven domains (Intelligence → Connectors) in `org-system-catalog.ts`; hub badges live / no data yet / sync to unlock from `model.counts`, objects, timeline, openAlerts/openDecisions; Ellinea brief + recommendations pages; dynamic `/app/org-system/[capability]`.
- **Organization System hub (initial):** Owner/IT side-nav **Organization System** → `/app/org-system`; `/report`, `/employees`, `/clients-today` over UEM.
- **Connector auto-scan / Ellinea detect (IT):** Connectors “Auto-scan for systems” (Online / Local / Hybrid); Pages `POST /api/v1/connectors/autoscan/probe` for public URLs; browser local/LAN port probes IT starts; Hospidia heuristics + Connect → install wizard prefill; Settings + Console links. No silent PC harvest.
- **Phone shell / PWA (7.2):** installable `manifest.webmanifest`, theme-color / apple-web-app meta, phone bottom nav (Home / Glance / Fleet / People / Ask / More), safe-area FAB offset; Settings: Show Ask float + Owner/IT “Hide Ask from work users”; drag-nav drop-target highlight.
- **Companion surfaces (7.3–7.8):** `/app/fleet`, `/app/people`, `/app/glance`, `/app/inbox` — UEM/snapshot-backed with honest empty states; Ellinea recs on Glance; Ask access prefs.
- **Ellinea contract auth stub:** Nest `EllineaAuthStubGuard` (open by default; `ELLINEA_REQUIRE_AUTH=1` requires Bearer); docs/11 aligned with Nest + SDK `getAccessToken`.
- **Ellinea Console nav fix:** Owner/IT side nav → `/app/ellinea-console` (not Ask); Ask title stays “Ask Ellinea”; saved `/app/ellinea` nav slots remap to console.
- **TS hygiene (~89 PagesFunction noise):** exclude `functions/` from Next `tsconfig`; add `functions/tsconfig.json` + ambient `cloudflare:sockets`; fix UEM/autofit/layout/notifications page exports.
- **Mobile vision brief (7.1):** [13_Mobile_Work_Companion_Brief.md](./13_Mobile_Work_Companion_Brief.md).
- **Secrets docs:** Pages mail/push env + Fly `FLY_API_TOKEN` clarified in docs/10, 07, 12 (and 08 for Fly).
- **Ellinea enterprise reasoning upgrade (4.11):** Multi-hop Ask answers; smarter RAG (Memory/alerts/decisions/attention boosts); denser Watch/Decide/Delegate briefs; SoR-safe LLM system prompt; sharper Owner/IT role lenses. (`745445c` — do not regress.)
- **Owner/IT side-nav rearrange:** Edit nav + drag reorder; order persisted in `eip_nav_order:{orgId}:{userId}`; non-admins keep fixed default; new items merge at default relative position (Ellinea Console above Settings by default).
- **Web Push / VAPID:** subscription API + `/sw-push.js`; deliver attempts push when VAPID secrets + browser sub exist; else simulated/failed with clear message. Human Pages secrets required for live push.
- **Notification SMTP / Resend slice:** `POST /api/v1/notifications/deliver` attempts real email when `RESEND_API_KEY` or `SMTP_*` / `ELLINEA_SMTP_*` are on Pages; otherwise keeps `simulated` (CI-safe). Human must set Pages secrets for live mail.
- **Platform suspend/disable org:** Super Admin Suspend/Resume on `/app/platform`; blocks login + connector sync
- **SQL Server / MySQL connectors:** read-only catalog + Identity TCP drivers (`mssql`, `mysql2`); Pages soft-test / 501 sync like Postgres
- **Ellinea placement:** Ask = float (+ full workspace `/app/ellinea`); prefs = System Settings **Ellinea AI** card; console = Owner/IT operator/API lab at `/app/ellinea-console` (side nav above Settings).
- Audit Center (`/app/audit`), change password on Profile, connector health chips on Overview
- Org structure (branches/departments) on Org Admin + Pages APIs
- Owner/IT Overview ops rail + empty states; roadmap keep-going
- Notification delete; Ellinea learning + standalone phases documented
- Approvals stub; Ellinea recs/memory/role context; Org Admin densify
- Pages deploy-safe (no cron); GitHub Actions only

**v1.0 / v1.1 status:** Foundation complete + Phase 5 server-side workflow + Phase 7 PWA companion + Organization System + v1.1 multi-company consolidation (OrgSwitcher, child-org creation, membership API) + Sprints 1–4 (supreme upgrades + security hardening). **Track E (OAuth2/SAML SSO)**: 80% complete — backend APIs + frontend Settings UI deployed; blocked on real IdP testing. All major features shipped, tested, and deployed to production. Remaining v1.1 human blockers: live SMTP/push Pages secrets + `FLY_API_TOKEN` + IdP test tenants for SSO. Native mobile apps and marketplace remain v1.1+/v2.0. Build queue: Track E near-complete (E.9 blocked on external IdP); ready to start Track D (Advanced RBAC) or other parallel tracks.
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

*Last status review: 2026-08-01*
