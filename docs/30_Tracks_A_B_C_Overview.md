# Tracks A, B, C: Quick Start Overview

**Status:** Ready to start (after Track D RBAC)  
**Parallel Execution:** All 3 can run simultaneously (no inter-dependencies)

---

## Track A: Enterprise Connectors Framework

**Goal:** Pre-built templates for 20+ systems (not vendor-locked)

**System Categories:**
- **Healthcare:** Hospidia, Epic, Cerner
- **ERP:** SAP, Oracle, NetSuite, Dynamics
- **CRM:** Salesforce, HubSpot, Pipedrive
- **HR:** Workday, ADP, BambooHR
- **Finance:** QuickBooks, Xero, FreshBooks
- **Productivity:** Slack, Microsoft Teams, Asana
- **Cloud:** AWS, Azure, GCP
- **Databases:** PostgreSQL, MySQL, SQL Server (already done)

**What to Build:**
1. **Connector Template Library** (`packages/connectors-sdk/templates/`)
   - Each system gets a folder with config schema + normalization rules
   - E.g., `templates/crm/salesforce.ts` exports:
     ```typescript
     export const salesforceTemplate = {
       name: 'Salesforce',
       category: 'crm',
       configSchema: { ... },
       normalizationRules: { ... },
       sampleData: { ... }
     }
     ```

2. **Pages Functions (3 endpoints):**
   - `GET /api/v1/connectors/templates` (list all)
   - `GET /api/v1/connectors/templates/{id}` (get detail + sample data)
   - `POST /api/v1/connectors/install-from-template` (install with template)

3. **Frontend:**
   - `/app/connectors/gallery` (browse templates by category)
   - `/app/connectors/install` (wizard: select template → auto-fill config)

**Effort:** 2–3 weeks (1–2 engineers)

**Success:** User can install Salesforce, SAP, Workday, etc. in < 5 minutes

---

## Track B: BI Dashboards (Custom KPI Builder)

**Goal:** Drag-drop dashboard builder with alerts & export

**What to Build:**
1. **Data Model:**
   - Dashboard (layout, refresh rate, sharing)
   - Widget (gauge, line chart, bar chart, table, KPI card)
   - Alert (threshold, email/Slack notification)
   - Export (scheduled PDF/CSV)

2. **Pages Functions (8 endpoints):**
   - Dashboard CRUD (GET/POST/PATCH/DELETE)
   - Widget CRUD (add/remove/reorder widgets)
   - Alert CRUD (set/delete alerts)
   - Export (PDF, CSV, scheduled email)

3. **Frontend:**
   - `/app/dashboards` (list view)
   - `/app/dashboards/{id}/editor` (drag-drop builder)
   - `/app/dashboards/{id}/view` (read-only view)
   - Widget picker (gauge, chart, table, KPI)
   - Data binding UI (pick data source: snapshot, connector, report, UEM)
   - Alert configuration UI (threshold + action)
   - Export dialog (email schedule, format)

**Data Sources:**
- Enterprise snapshot (health score, open alerts, etc.)
- Connector sync data (CRM opportunities, HR headcount, etc.)
- Reports (pre-calculated metrics)
- UEM (real-time counts)

**Effort:** 2–3 weeks (1–2 engineers + designer for widgets)

**Success:** User creates 50+ custom dashboards with live data, sets alerts, exports PDF

---

## Track C: Autonomous Workflows (AI Agent Rules)

**Goal:** 3 autonomy levels: deterministic → AI-assisted → scheduled

**What to Build:**
1. **Rule Evaluator Service:**
   - Deterministic: `if (openAlerts > 5) then seed_approval`
   - AI-assisted: `if (healthScore drops 10%) then ask_ellinea then auto_approve_if_confident > 95%`
   - Scheduled: `every Monday 9am, run this workflow`

2. **Pages Functions (6 endpoints):**
   - Rule CRUD (GET/POST/PATCH/DELETE)
   - Workflow execution (GET history, retry, dry-run)
   - Review/approve execution (human gate for Level 2)

3. **Frontend:**
   - `/app/workflows/rules` (list + editor)
   - `/app/workflows/executions` (view execution history)
   - Rule builder UI:
     - Level 1: Simple `when/then` (open alerts → seed approval)
     - Level 2: With AI (Ellinea analyzes situation, suggests action)
     - Level 3: Scheduled (cron job)
   - Execution review UI (if Level 2 needs human approval)

4. **Cron Scheduler:**
   - Background job service running every 5 minutes
   - Triggers scheduled workflows
   - Logs all executions
   - Retries failed workflows

**Effort:** 2–3 weeks (1 backend + 0.5 frontend for UI)

**Success:** 100+ scheduled rules executing reliably, Level 2 approvals working

---

## Parallel Execution Strategy

**Timeline:**
```
Week 1:
  - Track D: Backend services (Role/Permission system)
  - Track A: Connector templates library
  - Track B: Dashboard data model
  - Track C: Rule evaluator service

Week 2:
  - Track D: Pages Functions + enforce permissions on all endpoints
  - Track A: Pages Functions (template endpoints)
  - Track B: Pages Functions (dashboard CRUD + alerts)
  - Track C: Pages Functions (rule execution + scheduling)

Week 3:
  - Track D: Frontend Settings/Admin UI
  - Track A: Frontend gallery + installer wizard
  - Track B: Frontend dashboard editor (drag-drop)
  - Track C: Frontend rule editor + execution view

Week 4:
  - All tracks: Testing, integration, bug fixes
  - Deploy all 4 tracks together
```

**Resource Allocation:**
```
Team of 5 engineers:
  - 1 full-time: Track D (highest priority, other tracks depend on it)
  - 1 full-time: Track A (templates library)
  - 1.5 full-time: Track B (complex UI, dashboard editor)
  - 1 full-time: Track C (scheduler, rule engine)
  - 0.5 part-time: QA/testing (all tracks)
```

---

## Interdependencies

```
┌─────────────────────────────────┐
│  Track D (RBAC)                 │
│  - Permission system            │
│  - Custom roles                 │
│  - Elevation & delegation       │
└─────────────────────────────────┘
  ▲                 ▲      ▲
  │                 │      │
  └─────────────────┼──────┼───────────────────┐
                    │      │                   │
            ┌───────┴──┐  ┌┴──────────┐  ┌────┴────────┐
            │ Track A  │  │ Track B   │  │ Track C     │
            │(Conn)    │  │(Dashboard)│  │(Workflows) │
            └──────────┘  └───────────┘  └────────────┘
```

**Build Order:**
1. **Track D first** (provides permission system)
2. **Tracks A, B, C** in parallel (each uses permissions from D)

---

## Testing Strategy

### Track D (RBAC)
- Unit tests: Permission evaluator, role service
- Integration: Create role → assign → check permissions
- End-to-end: User with custom role can/can't access features

### Track A (Connectors)
- Unit tests: Template schema validation
- Integration: Install template → config auto-fills → connection works
- End-to-end: Browse gallery → install Salesforce in 2 clicks

### Track B (Dashboards)
- Unit tests: Widget rendering, data binding
- Integration: Create dashboard → add widgets → set alert → export
- End-to-end: Dashboard shows live data, alert triggers

### Track C (Workflows)
- Unit tests: Rule evaluator, cron scheduler
- Integration: Create rule → trigger event → approval created
- End-to-end: Scheduled workflow runs, Level 2 approval sent, human approves

---

## Deployment

**All 4 tracks together:**
```bash
npm run build:shared
npm run build -w @ellines-eip/web
npm run build -w @ellines-eip/identity
npm run verify:pages-functions
npm run db:push  # New tables for D, B, C
git push origin main
# Cloudflare Pages auto-deploys
```

**Rollback plan:** If any track broken
- Revert commits
- Keep previous database state (Prisma migration can rollback)

---

## Success Metrics (v1.1 Release)

### Track D (RBAC)
- 50+ permissions enforced on all endpoints
- Custom roles working
- Elevation + delegation tested

### Track A (Connectors)
- 20+ system templates available
- Template installer working
- User can install any template in < 5 minutes

### Track B (Dashboards)
- 50+ custom dashboards created in UAT
- All widget types working (gauge, chart, table, KPI)
- Alerts triggering correctly
- PDF export working

### Track C (Workflows)
- 100+ scheduled rules executing reliably
- Level 1 (deterministic) rules 100% success
- Level 2 (AI-assisted) approval flow working
- Cron scheduler < 1 min latency

---

## Estimated Timeline

- **Start:** Now (after Track E OAuth2/SAML complete)
- **Week 1–3:** Development (all 4 tracks in parallel)
- **Week 4:** Integration + QA
- **Week 5:** Production deploy
- **Total:** ~4–5 weeks for all 4 tracks

---

## Next After v1.1

**v1.1.1 (1 month later):**
- Real IdP testing (Azure AD, Okta, ADFS)
- Performance optimization (permission caching, dashboard rendering)
- Advanced RBAC (attribute-based rules, AI-driven permissions)

**v1.2 (2–3 months later):**
- Marketplace (sell/buy connector templates, dashboards, workflows)
- Native mobile apps (iOS/Android)
- Multi-company consolidation (parent org visibility + control)

---

## Reference Documents

- Track D Details: `docs/29_Track_D_RBAC_Implementation.md`
- Connectors Framework: `docs/19_v1.1_Enterprise_Connectors_Framework.md`
- BI Dashboards: `docs/20_v1.1_BI_Dashboards.md`
- Autonomous Workflows: `docs/21_v1.1_Autonomous_Workflows.md`
- Execution Plan: `docs/26_EXECUTION_PLAN_v1.1_START_HERE.md`

---

**Status:** Ready to kickoff. Assign teams and start Day 1.
