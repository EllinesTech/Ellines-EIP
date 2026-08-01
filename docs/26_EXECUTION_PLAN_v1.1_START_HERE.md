# 🚀 Ellines EIP v1.1 Execution Plan — START HERE

**Status:** ✅ READY TO EXECUTE  
**Date:** August 1, 2026  
**Timeline:** 2–3 weeks (5 parallel tracks)  
**Team:** 4–5 engineers  
**Live Demo:** https://eip.ellines.co.ke

---

## PART 1: Known Issues to Fix FIRST (Before v1.1 Work)

### Issue #1: Auto-Scan AI System Detection ⚠️

**What:** Auto-scan probe detects if a URL is reachable, but **doesn't use AI to identify system type** (Hospital Management System, ERP, CRM, etc.).

**Why:** Original probe was just HTTP reachability check. AI classification step not implemented.

**Fix:** See `docs/25_BUGFIX_AutoScan_AI_Detection.md`
- Add Ellinea AI to analyze HTTP response
- Detect system type (HIS, ERP, CRM, HR, Finance)
- Suggest matching connector templates (Hospidia, SAP, Salesforce)
- **Time:** 4–6 hours
- **Risk:** Low (read-only)

**PR:** Create `agent/fix-autoscan-ai-detection`

---

## PART 2: v1.1 Roadmap Overview

### The 5 Parallel Tracks

| Track | Feature | What It Does | Effort | Docs |
|-------|---------|-------------|--------|------|
| **A** | Enterprise Connectors (System-agnostic) | Pre-built templates for 20+ systems (not just Hospidia) | 2–3 wks | [doc 19](./19_v1.1_Enterprise_Connectors_Framework.md) |
| **B** | BI Dashboards (Custom KPI Builder) | Drag-drop dashboard builder with alerts + export | 2–3 wks | [doc 20](./20_v1.1_BI_Dashboards.md) |
| **C** | Autonomous Workflows (AI Agent Rules) | 3 autonomy levels: deterministic → AI-assisted → scheduled | 2–3 wks | [doc 21](./21_v1.1_Autonomous_Workflows.md) |
| **D** | Advanced RBAC (Custom Roles) | Custom role builder, 50+ permissions, attribute-based access | 2–3 wks | [doc 22](./22_v1.1_Advanced_RBAC_CustomRoles.md) |
| **E** | OAuth2 / SAML SSO (Enterprise Identity) | Login with Azure AD, Okta, etc. Just-in-time provisioning | 2–3 wks | [doc 23](./23_v1.1_OAuth2_SAML_EnterpriseSSO.md) |

**Key:** All independent → no blocking dependencies. Ship in any order.

---

## PART 3: Recommended Execution Order

### Why This Order?

```
E (OAuth2/SAML) → Users need identity to log in
    ↓
D (Advanced RBAC) → Users need permissions
    ↓
A (Connectors) ─┐
B (Dashboards) ─┼─→ All consume enterprise data
C (Workflows)  ─┘
```

### Sprint Schedule (2–3 weeks)

```
Week 1:           Week 2:              Week 3:
---               ---                  ---
E: Dev            E: Integration       E: Deploy
D: Dev            D: Integration       D: Deploy
A: Dev            A: Integration       A: Deploy
B: Dev            B: Integration       B: Deploy
C: Dev            C: Integration       C: Deploy
                                  ↓
                            Week 4: Stabilize + QA
```

---

## PART 4: Step-by-Step Execution

### Step 1: Create Branches & Assign Teams (Today)

```bash
# Create feature branches (one per track)
git checkout main && git pull
git checkout -b agent/e-oauth2-saml
git checkout -b agent/d-advanced-rbac
git checkout -b agent/a-connectors-templates
git checkout -b agent/b-bi-dashboards
git checkout -b agent/c-autonomous-workflows

# Assign team leads:
# Track E: 1 backend engineer (auth expert)
# Track D: 1 backend + 0.5 frontend (permissions)
# Track A: 1 backend + 1 frontend (UI/API)
# Track B: 1 backend + 1 frontend (dashboards)
# Track C: 1 backend (scheduler/rules)
```

### Step 2: Track E — OAuth2 / SAML (Priority 1)

**Why First:** Users need to authenticate before anything else works.

**What to Do:**
1. Read `docs/23_v1.1_OAuth2_SAML_EnterpriseSSO.md`
2. Add Prisma models: `SsoProvider`, `SsoProviderUser`
3. Run `npm run db:push`
4. Implement OAuth2 handler: `services/identity/src/sso/oauth2.service.ts`
5. Implement SAML2 handler: `services/identity/src/sso/saml2.service.ts`
6. Create Pages Functions:
   - `POST /api/v1/auth/sso/oauth2/authorize`
   - `GET /api/v1/auth/sso/oauth2/callback`
   - `POST /api/v1/auth/sso/saml2/authorize`
   - `POST /api/v1/auth/sso/saml2/acs`
7. Update login page: add "Sign in with Azure AD" button
8. Test with Azure AD + Okta

**Files to Create:**
- `services/identity/src/sso/oauth2.service.ts` (300 LOC)
- `services/identity/src/sso/saml2.service.ts` (300 LOC)
- `apps/web/functions/api/v1/auth/sso/*.ts` (4 files, 200 LOC)
- `apps/web/src/app/login/SsoButtons.tsx` (150 LOC)
- `apps/web/src/app/app/settings/sso/SsoSetup.tsx` (200 LOC)

**Build:** `npm run build:shared && npm run build -w @ellines-eip/identity && npm run build -w @ellines-eip/web`

**Test:** Login with Azure AD / Okta from https://eip.ellines.co.ke/login

**Time:** 2–3 days

---

### Step 3: Track D — Advanced RBAC (Priority 2)

**Why Second:** Once users authenticate, they need granular permissions.

**What to Do:**
1. Read `docs/22_v1.1_Advanced_RBAC_CustomRoles.md`
2. Add Prisma models: `CustomRole`, `RoleAuditLog`
3. Enhance `OrganizationMembership` with `customRoleId`, `elevatedRole`, `delegatedPermissions`
4. Run `npm run db:push`
5. Implement permission evaluator: `services/identity/src/rbac/permission-evaluator.service.ts` (300 LOC)
6. Add permission checks to all Pages Functions (update `requireAuth` guard)
7. Create role management endpoints:
   - `POST /api/v1/orgs/me/roles` (create custom role)
   - `GET /api/v1/orgs/me/roles` (list)
   - `PATCH /api/v1/orgs/me/roles/{roleId}` (update)
   - `DELETE /api/v1/orgs/me/roles/{roleId}` (delete)
   - `POST /api/v1/orgs/me/members/{userId}/assign-role` (assign)
   - `POST /api/v1/orgs/me/members/{userId}/elevate` (temp elevation)
   - `POST /api/v1/orgs/me/members/{userId}/delegate-permission` (delegation)
8. Build role builder UI: `/app/settings/roles`
9. Build member role assignment UI

**Files to Create:**
- `services/identity/src/rbac/permission-evaluator.service.ts` (300 LOC)
- `apps/web/functions/api/v1/orgs/me/roles/*.ts` (6 files, 400 LOC)
- `apps/web/src/app/app/settings/roles/RoleBuilder.tsx` (300 LOC)
- `apps/web/src/app/app/admin/members/MemberRoleAssignment.tsx` (200 LOC)

**Build:** `npm run build -w @ellines-eip/identity && npm run build -w @ellines-eip/web`

**Test:** Create custom role, assign to user, verify permissions

**Time:** 2–3 days

---

### Step 4: Track A — Enterprise Connectors (Priority 3)

**Why Third:** Other tracks need data to work with. Connectors provide data sources.

**What to Do:**
1. Read `docs/19_v1.1_Enterprise_Connectors_Framework.md`
2. Add Prisma model: `ConnectorTemplate`
3. Run `npm run db:push`
4. Create connector template library:
   - `packages/connectors-sdk/templates/healthcare/hospidia.ts`
   - `packages/connectors-sdk/templates/healthcare/epic.ts`
   - `packages/connectors-sdk/templates/erp/sap.ts`
   - `packages/connectors-sdk/templates/crm/salesforce.ts`
   - `packages/connectors-sdk/templates/hr/adp.ts`
   - ... (10+ total)
5. Each template exports config schema + normalization rules
6. Create Pages Functions:
   - `GET /api/v1/connectors/templates` (list all)
   - `GET /api/v1/connectors/templates/{templateId}` (get detail)
   - `POST /api/v1/connectors/install-from-template` (install)
7. Build connector gallery UI: `/app/connectors/gallery`
8. Update connector install wizard to pre-fill from template
9. Test with Salesforce, SAP, Workday APIs

**Files to Create:**
- `packages/connectors-sdk/templates/*/*.ts` (10+ files, 800 LOC)
- `apps/web/functions/api/v1/connectors/templates/*.ts` (3 files, 200 LOC)
- `apps/web/src/app/app/connectors/ConnectorGallery.tsx` (200 LOC)
- `apps/web/src/app/app/connectors/ConnectorInstallWizard.tsx` (150 LOC)

**Build:** `npm run build:shared && npm run build -w @ellines-eip/web`

**Test:** Install Salesforce template, test connection, verify sync

**Time:** 2–3 days

---

### Step 5: Track B — BI Dashboards (Priority 4)

**Why Fourth:** Needs connectors for data sources. Complements Glance.

**What to Do:**
1. Read `docs/20_v1.1_BI_Dashboards.md`
2. Add Prisma models: `Dashboard`, `DashboardWidget`, `DashboardAlert`, `DashboardExport`
3. Run `npm run db:push`
4. Create Pages Functions:
   - `GET /api/v1/orgs/me/dashboards` (list)
   - `POST /api/v1/orgs/me/dashboards` (create)
   - `PATCH /api/v1/orgs/me/dashboards/{id}` (update)
   - `POST /api/v1/orgs/me/dashboards/{id}/widgets` (add widget)
   - `GET /api/v1/orgs/me/dashboards/{id}/widgets/{widgetId}/data` (render widget)
   - `POST /api/v1/orgs/me/dashboards/{id}/alerts` (create alert)
   - `POST /api/v1/orgs/me/dashboards/{id}/export` (export PDF/CSV)
5. Build dashboard pages:
   - `/app/dashboards` (list view)
   - `/app/dashboards/{id}` (editor with drag-drop)
   - `/app/dashboards/{id}/widgets/{widgetId}` (widget detail)
6. Build widget types: gauge, line, bar, table, KPI card
7. Add data binding UI (pick data source: snapshot, connector, report, UEM)
8. Add alert configuration UI
9. Add export / email configuration

**Files to Create:**
- `apps/web/functions/api/v1/orgs/me/dashboards/*.ts` (8 files, 600 LOC)
- `apps/web/src/app/app/dashboards/page.tsx` (200 LOC)
- `apps/web/src/app/app/dashboards/DashboardEditor.tsx` (300 LOC)
- `apps/web/src/app/app/dashboards/WidgetTypes/*.tsx` (5 files, 400 LOC)

**Build:** `npm run build -w @ellines-eip/web`

**Test:** Create dashboard with 5 widgets, set alert, export to PDF

**Time:** 2–3 days

---

### Step 6: Track C — Autonomous Workflows (Priority 5)

**Why Fifth:** Builds on dashboards & connectors. AI engine orchestration.

**What to Do:**
1. Read `docs/21_v1.1_Autonomous_Workflows.md`
2. Add Prisma models: `WorkflowExecution`, `ScheduledWorkflow`
3. Enhance `BusinessRule` with `autonomyLevel`, `ellinea`, `humanGate`
4. Run `npm run db:push`
5. Implement rule evaluator: `services/identity/src/workflows/rule-evaluator.service.ts` (400 LOC)
6. Implement cron scheduler: `services/identity/src/workflows/cron-scheduler.service.ts` (300 LOC)
7. Create execution endpoints:
   - `POST /api/v1/orgs/me/rules/autonomous` (create autonomous rule)
   - `POST /api/v1/orgs/me/workflows/scheduled` (create scheduled workflow)
   - `GET /api/v1/orgs/me/workflows/executions` (view execution history)
   - `PATCH /api/v1/orgs/me/workflows/executions/{id}/review` (human gate approval)
8. Build `/app/workflows/executions` dashboard
9. Implement Level 2 (AI-assisted) approval flow with Ellinea confidence checks
10. Test rule triggers (healthScore, openAlerts, events)

**Files to Create:**
- `services/identity/src/workflows/rule-evaluator.service.ts` (400 LOC)
- `services/identity/src/workflows/cron-scheduler.service.ts` (300 LOC)
- `apps/web/functions/api/v1/orgs/me/rules/*.ts` (3 files, 200 LOC)
- `apps/web/functions/api/v1/orgs/me/workflows/*.ts` (3 files, 200 LOC)
- `apps/web/src/app/app/workflows/ExecutionDashboard.tsx` (200 LOC)

**Build:** `npm run build -w @ellines-eip/identity && npm run build -w @ellines-eip/web`

**Test:** Create Level 1 rule (deterministic), verify auto-execution. Create Level 2 rule, test Ellinea confidence gate.

**Time:** 2–3 days

---

### Step 7: Integration Testing (Week 4)

Once all 5 tracks are dev-complete:

1. **Cross-track testing:**
   - Login via OAuth2 (E) → check permissions (D) → install connector (A) → build dashboard (B) → create autonomous rule (C)

2. **End-to-end flow:**
   - User logs in with Azure AD
   - Gets "Finance Manager" role
   - Can create dashboard + bind to Salesforce data
   - Rule auto-escalates if revenue drops
   - Dashboard shows trend, triggers alert email

3. **Performance testing:**
   - 100 concurrent dashboards
   - 50 simultaneous rule evaluations
   - RBAC permission check latency

4. **Security review:**
   - SAML signature validation
   - JWT token expiration
   - Permission boundary testing
   - Privilege escalation attempts

5. **Load testing:**
   - Connector template catalog (10+ systems)
   - Dashboard export (PDF generation)
   - Cron job execution (100+ scheduled workflows)

---

## PART 5: Remaining Roadmap Items (v1.2+)

After v1.1 ships, what's left to build?

### Not in v1.1 (Deferred to v1.2+)

| Feature | Why | Timeline |
|---------|-----|----------|
| **Marketplace** | Sell connector templates, dashboards, rules | v1.2 (Q1 2027) |
| **Digital Twin** | Simulated enterprise environment for training | v1.2 (Q1 2027) |
| **Autonomous Agents** | AI agents that make decisions without human input | v2.0 (Q2 2027) |
| **Native iOS/Android** | Apps built with Expo/React Native | v1.2 (Q1 2027) |
| **Voice Assistant** | Alexa/Google/Siri integration | v2.0 (Q2 2027) |
| **Federated Learning** | ML models trained across all tenants | v2.0 (Q2 2027) |

### In Scope for v1.1 Bug Fixes / Polish

- ✅ Auto-scan AI system detection (see `docs/25_BUGFIX_AutoScan_AI_Detection.md`)
- ✅ CSRF token validation on all mutating endpoints
- ✅ JWT token rotation on login
- ✅ Multi-factor authentication (TOTP)
- ✅ API rate limiting per tenant
- ✅ Dashboard performance optimization (caching, lazy loading)
- ✅ Connector sync retry logic (exponential backoff)
- ✅ Autonomous rule dry-run (test before enabling)

---

## PART 6: Success Metrics (v1.1 Definition of Done)

### Track E (OAuth2/SAML)
- ✅ Login with Azure AD works
- ✅ Login with Okta works
- ✅ Auto-provisioning creates users from SAML claims
- ✅ Group mapping (SAML group → EIP role) works
- ✅ SSO enforcement (disable email/password) works

### Track D (RBAC)
- ✅ Owner creates 5+ custom roles
- ✅ Permissions enforced on all 50+ operations
- ✅ Temporary elevation expires automatically
- ✅ Permission delegation time-limited
- ✅ All role changes in audit log

### Track A (Connectors)
- ✅ 10+ pre-built templates available
- ✅ Any system connectable via framework
- ✅ Install from template in < 5 min
- ✅ OAuth2 connector tokens auto-refresh
- ✅ Real data flowing from Salesforce, SAP, Workday

### Track B (Dashboards)
- ✅ 50+ custom dashboards created in testing
- ✅ All 5 widget types work (gauge, line, bar, table, KPI)
- ✅ Alerts trigger on threshold breach
- ✅ PDF export works
- ✅ Weekly email digests deliver

### Track C (Workflows)
- ✅ Level 1 rules execute deterministically (5-min check)
- ✅ Level 2 rules consult Ellinea, auto-approve at 95%+ confidence
- ✅ Level 3 scheduled workflows run on cron
- ✅ All executions audited
- ✅ Failures trigger alerts to Owner/IT

### Overall
- ✅ All builds pass (TypeScript strict mode)
- ✅ All Pages Functions verified (58+ functions)
- ✅ Integration tests pass (e2e OAuth → RBAC → Connectors → Dashboards → Workflows)
- ✅ Security review complete (SAML, JWT, RBAC, SQL injection, XSS)
- ✅ Load testing complete (100+ concurrent users, 100+ dashboards)
- ✅ Documentation complete (user guides, API docs, deployment runbooks)

---

## PART 7: Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| OAuth2/SAML complexity | Medium | High | Use tested libraries (openid-client, samlify); security review |
| Permission checks slow down API | Medium | Medium | Benchmark permission evaluator; add caching |
| Cron job failures | Low | Medium | Audit every execution; alert on failure; manual retry API |
| Dashboard export crashes | Low | Low | Async job queue; timeout protection |
| Connector template misclassification | Medium | Low | Include fallback to manual selection |

---

## PART 8: Daily Standup Template

```
Each day, each track lead reports:
1. What we built yesterday
2. What we're building today
3. Blockers or risks
4. Code review requests

Example:
---
Track E (OAuth2/SAML):
  ✅ Built: SAML2 handler, signature validation
  🔄 Today: Azure AD integration test, group mapping
  ⚠️ Blocker: Need Azure AD test tenant (IT creating)
  👀 Review: oauth2.service.ts PR #123

Track D (RBAC):
  ✅ Built: Permission evaluator engine
  🔄 Today: Apply to all 50 Pages Functions
  ⚠️ Risk: May need permission cache for performance
  👀 Review: role-builder-ui.tsx PR #124

... (Tracks A, B, C)
---
```

---

## PART 9: Deployment Checklist

Before deploying each track to production:

- [ ] All code reviews approved
- [ ] All tests passing (unit + integration)
- [ ] All TypeScript errors fixed
- [ ] Security review complete
- [ ] Performance benchmarks meet targets
- [ ] Documentation updated
- [ ] Staging environment tested
- [ ] Rollback plan documented
- [ ] Team trained on new features

---

## NEXT ACTIONS (Today)

1. ✅ **Read all 6 design docs** (19–24, + bugfix 25)
2. ✅ **Assign team** (1–2 eng per track)
3. ✅ **Create branches** (E, D, A, B, C)
4. ✅ **Start Track E** (OAuth2/SAML — most blocking)
5. ✅ **Daily standups** (15 min, sync across tracks)
6. ✅ **PR review** (continuous, 24hr SLA)
7. ✅ **Deploy staging** (after each track dev-complete)
8. ✅ **Deploy production** (after integration testing)

---

## Resources

- **Design Docs:** `docs/19-24` (5000+ LOC of architecture + code)
- **Bugfix:** `docs/25_BUGFIX_AutoScan_AI_Detection.md`
- **Live Demo:** https://eip.ellines.co.ke
- **GitHub:** https://github.com/EllinesTech/Ellines-EIP
- **Slack:** #ellines-eip-v1.1-execution

---

**Status:** 🚀 READY. Team assignments pending.  
**Timeline:** Start today → Deploy Week 4  
**Outcome:** Enterprise-grade platform with SSO, custom roles, system-agnostic connectors, dashboards, and AI automation.

