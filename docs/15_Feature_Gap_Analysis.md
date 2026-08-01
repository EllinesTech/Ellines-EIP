# Ellines EIP — Feature Gap Analysis (2026-08-01)

**Status after v1.0 + v1.1:** All queued phases complete. System is live. This document identifies what makes it "good" vs what makes it "supreme."

---

## What's Solid (Do Not Regress)

| Area | Status |
|------|--------|
| Auth + RBAC + SSO | ✅ Production-grade |
| Multi-tenant orgs | ✅ Solid |
| 6 connector types + packs | ✅ Working |
| Auto-scan | ✅ Working |
| Role-adaptive dashboard | ✅ Working |
| Ellinea AI (RAG + LLM) | ✅ Working |
| Enterprise Memory + DNA | ✅ Working |
| Approvals + Rules + Reports | ✅ Server-persisted |
| Event Bus | ✅ Working |
| Notifications (email + push) | ✅ Wired |
| Multi-company (OrgSwitcher) | ✅ v1.1 done |
| PWA shell + phone nav | ✅ Working |
| Platform Super Admin | ✅ Working |
| Audit trail | ✅ Working |

---

## GAP 1 — Mobile Companion is Mostly Empty Stubs (HIGH PRIORITY)

**Current:** Fleet, People, Inbox pages are skeletons. They only show data if a connector happens to surface `asset` / `person` objects in the UEM snapshot. Most orgs will see "No assets yet — connect a system."

**Supreme version needs:**
- Fleet: Real asset table with search/filter, status badges, last seen, assigned user, branch
- People: Real employee directory with search, role tags, department, contact, active/inactive
- Inbox: Real email connector UI — not just "install email connector" CTA. Show actual summarized emails once connector is wired, with Ellinea summarize button per thread
- Glance: Live refresh, trend indicators (up/down vs last sync), per-domain health bars

---

## GAP 2 — Enterprise Search is a Stub (HIGH PRIORITY)

**Current:** `/app/search` page exists but likely just shows a search box with no real backend. No full-text search across connected data.

**Supreme version needs:**
- Search across UEM objects (people, assets, branches, tasks, documents)
- Search across Memory notes, Approval history, Event log, Audit log
- Search results grouped by domain (People / Assets / Events / Intelligence)
- Keyboard navigation, recent searches, search suggestions
- "Ask Ellinea about: [query]" shortcut from results

---

## GAP 3 — No Real Document Hub (HIGH PRIORITY per Blueprint)

**Current:** `documents` is listed in UEM counts/objects but there's no Document Hub page, no upload, no browse, no AI summarize.

**Supreme version needs:**
- `/app/documents` — upload documents (PDF, DOCX, images)
- Organize by branch/department, tag, date
- Ellinea can reference documents in Memory and answer questions about them
- Ingest pipeline: document → chunks → Memory notes → RAG searchable

---

## GAP 4 — Reports are Schedule Stubs Only (HIGH PRIORITY)

**Current:** Scheduled Reports page lets you create daily/weekly reports and "Run now" — but the report is just a text preview string. No actual PDF, no actual email delivery of content, no charts.

**Supreme version needs:**
- Report actually generates real content (from enterprise snapshot + memory)
- Report delivered via email (Resend already wired)
- Report preview shows charts and KPI table, not just one string
- Export to PDF (even simple HTML→CSS print media)
- Report history (last 5 runs, view/download each)

---

## GAP 5 — Notifications are Outbox-Only, Not Real-Time (MEDIUM PRIORITY)

**Current:** Notification outbox fires email/push on explicit POST. No real-time in-app notifications that arrive without page reload. No unread count badge (badge is hard-coded).

**Supreme version needs:**
- Real unread count from server (badge on notification bell, dynamic)
- In-app toast/snackbar when a new event fires or approval is decided
- Notification center shows proper read/unread state per item, not just delete
- Polling or server-sent events for live count (30s poll is acceptable for MVP)
- Notification categories: Approvals, Alerts, System, Ellinea

---

## GAP 6 — No User Invitation Flow (HIGH PRIORITY)

**Current:** IT Admin page has an "Invite user" form that calls the API. But the invited user has no invite email with a link — they get a temporary password the admin must manually share.

**Supreme version needs:**
- Invite sends an email (via Resend, already wired) with a magic link
- User clicks link → sets own password → lands in the org
- Pending invites list (show "invited but not accepted" users)
- Resend invite, revoke invite
- Bulk invite (CSV upload of emails)

---

## GAP 7 — Approval Workflow Lacks Full Lifecycle UI (MEDIUM PRIORITY)

**Current:** Approvals page shows list, create button, approve/reject button. Missing:
- No approval detail page (click an approval → see full history, thread of who decided what and when)
- No comment/note field on decisions
- No email notification sent to requester when decided
- No "assigned to me" filter / my pending actions view
- No approval templates management (add/edit custom templates)

**Supreme version needs:**
- Approval detail modal/page with full step history
- Decision comment field
- Automatic email notification on decision (Resend wired)
- "My approvals" dashboard section (pending actions assigned to my role)

---

## GAP 8 — Settings Page Lacks Depth (MEDIUM PRIORITY)

**Current:** Settings has: org name rename, time/date format, UI theme/density, Ellinea prefs, notification policy, Ellinea console link. Missing many org-level settings.

**Supreme version needs:**
- **Security** section: active sessions, MFA toggle, login audit
- **API & Webhooks** section: webhook secret management (currently buried in Connectors), API key generation
- **Billing & Plan** section (stub is fine) — signals commercial readiness
- **Connector defaults** section: default sync interval, auto-scan schedule
- **Notification templates** section: customise email subject/body templates
- **Team defaults**: default role for new invites, default branch/department

---

## GAP 9 — Enterprise Timeline is Connector-Only (LOW PRIORITY)

**Current:** `/app/timeline` shows events from the enterprise snapshot timeline array (connector data). No events from approvals, rules firing, user actions, or system events.

**Supreme version needs:**
- Combined timeline: connector events + approval decisions + rule fires + system events + Ellinea briefs
- Filter by domain (Connectors / Workflow / System / Ellinea)
- Export timeline as CSV/JSON

---

## GAP 10 — No Real Analytics / BI (v2.0 — LOW PRIORITY NOW)

**Current:** KPI widgets and sparklines are derived from the enterprise snapshot (one number). No drill-down, no trend analysis, no historical comparison.

**Note:** This is v2.0 scope. For supreme v1.x, the Glance + Overview KPI depth is sufficient.

---

## GAP 11 — Ellinea Daily Brief Has No Scheduled Delivery (MEDIUM PRIORITY)

**Current:** CEO Daily Brief is generated on-demand when you Ask Ellinea or open `/app/ellinea`. There is no "push the daily brief to my email at 7am."

**Supreme version needs:**
- Setting: "Send daily brief at [time]" toggle in Settings → Ellinea AI
- When Scheduled Report runs (existing), include Ellinea brief in the email
- Or: a dedicated "Daily Brief email" separate from scheduled reports

---

## GAP 12 — Platform Admin Lacks Depth (MEDIUM PRIORITY)

**Current:** Platform Admin shows a list of orgs, can suspend/resume, has feature flags. Missing:
- Per-org usage statistics (users, connectors, events, last active)
- Platform audit log (actions across all orgs)
- Org settings override (enforce/prevent specific features)
- Platform announcements/messages to all orgs
- Super Admin can impersonate (view as) an org (security-sensitive, optional)

---

## Priority Build Order for "Supreme"

### Sprint 1 — Immediate Value (1 week)
1. **Document Hub** (`/app/documents`) — upload, browse, Ellinea reference
2. **Invitation emails** — magic link via Resend for invited users
3. **Approval detail page** — full history, comments, email notification on decision
4. **Real notification unread count** — server-side badge, dynamic

### Sprint 2 — Power Features (1 week)
5. **Enterprise Search** — real search across UEM, Memory, Approvals, Audit
6. **Report PDF / email delivery** — Resend delivers generated report
7. **Ellinea Daily Brief email** — scheduled delivery via existing Resend
8. **People page real directory** — search, filter, contact card

### Sprint 3 — Platform Depth (1 week)
9. **Fleet page real asset table** — search, filter, status
10. **Inbox page email summary** — real email list when IMAP connector wired
11. **Settings depth** — security section, API keys, webhook management
12. **Platform Admin per-org stats** — usage, last active, audit

### Future (v2.0)
- Analytics / BI drill-down
- Digital twin
- Native iOS/Android
- Autonomous agents
- Voice assistant

---

*This document is the authoritative feature gap list for v1.x "supreme" planning.*
