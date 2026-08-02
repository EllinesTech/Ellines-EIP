# RBAC Permission Matrix Reference

**Version:** v1.1  
**Date:** August 1, 2026  
**Total Permissions:** 50+  
**Feature Areas:** 12 groups  

---

## Permission Matrix Table

Complete reference of all permissions with fixed role assignments and custom use cases.

### Legend

- **✅** = Permission included by default
- **−** = Permission not included
- **Fixed Roles** = Owner, Admin, Manager, Member, Viewer
- **Custom Use** = Example custom roles that might need this

---

| # | Permission ID | Feature Area | Description | Owner | Admin | Manager | Member | Viewer | Custom Use |
|---|---|---|---|---|---|---|---|---|---|
| 1 | auth.register_org | Auth | Create a new organization | ✅ | − | − | − | − | — |
| 2 | auth.invite_user | Auth | Invite users to organization | ✅ | ✅ | − | − | − | Org Admin |
| 3 | auth.change_password | Auth | Change own password | ✅ | ✅ | ✅ | ✅ | ✅ | All users |
| 4 | auth.manage_sso_providers | Auth | Configure OAuth2/SAML | ✅ | ✅ | − | − | − | IT Admin |
| **5–12** | **org.*** | Org Admin | Organization management | | | | | | |
| 5 | org.view | Org Admin | View organization info | ✅ | ✅ | ✅ | ✅ | ✅ | All users |
| 6 | org.edit_name | Org Admin | Rename organization | ✅ | − | − | − | − | Owner only |
| 7 | org.edit_settings | Org Admin | Modify org settings | ✅ | ✅ | − | − | − | IT Admin |
| 8 | org.manage_members | Org Admin | Add/remove/modify team members | ✅ | ✅ | ✅ | − | − | Manager, Dept Head |
| 9 | org.create_child_org | Org Admin | Create linked org (multi-company) | ✅ | − | − | − | − | Parent Org Owner |
| 10 | org.manage_branches | Org Admin | Create/edit branches | ✅ | ✅ | − | − | − | IT Admin |
| 11 | org.manage_departments | Org Admin | Create/edit departments | ✅ | ✅ | ✅ | − | − | Dept Manager |
| 12 | org.view_audit_logs | Org Admin | View audit trail | ✅ | ✅ | − | − | − | Compliance Officer |
| **13–20** | **connector.*** | Connectors | System integration | | | | | | |
| 13 | connector.install | Connectors | Add new system connector | ✅ | ✅ | − | − | − | IT Operator |
| 14 | connector.test | Connectors | Test connector connectivity | ✅ | ✅ | − | − | − | IT Operator |
| 15 | connector.sync | Connectors | Manually trigger sync | ✅ | ✅ | − | − | − | IT Operator |
| 16 | connector.delete | Connectors | Remove connector | ✅ | ✅ | − | − | − | IT Operator |
| 17 | connector.configure_auth | Connectors | Update credentials | ✅ | ✅ | − | − | − | IT Operator |
| 18 | connector.autoscan | Connectors | Auto-detect systems | ✅ | ✅ | − | − | − | IT Admin |
| 19 | connector.view_history | Connectors | See sync logs | ✅ | ✅ | − | − | − | IT Operator |
| 20 | connector.manage_webhook | Connectors | Configure webhooks | ✅ | ✅ | − | − | − | IT Admin |
| **21–28** | **report.*** | Reports | Report management | | | | | | |
| 21 | report.create | Reports | Create new report | ✅ | ✅ | ✅ | ✅ | − | Finance Manager, Analyst |
| 22 | report.edit | Reports | Modify existing report | ✅ | ✅ | ✅ | ✅ | − | Finance Manager, Analyst |
| 23 | report.delete | Reports | Remove report | ✅ | ✅ | ✅ | − | − | Report Owner |
| 24 | report.schedule | Reports | Set up recurring reports | ✅ | ✅ | ✅ | − | − | Finance Manager |
| 25 | report.export | Reports | Download report data (CSV/PDF) | ✅ | ✅ | ✅ | ✅ | − | Finance Manager |
| 26 | report.share | Reports | Send report to team | ✅ | ✅ | ✅ | ✅ | − | Finance Manager |
| 27 | report.run_now | Reports | Execute report manually | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 28 | report.view_all | Reports | See all org reports | ✅ | ✅ | ✅ | − | ✅ | Analyst, Viewer |
| **29–34** | **workflow.*** | Workflows | Automation | | | | | | |
| 29 | workflow.create | Workflows | Create workflow | ✅ | ✅ | − | − | − | Process Manager |
| 30 | workflow.edit | Workflows | Modify workflow | ✅ | ✅ | − | − | − | Process Manager |
| 31 | workflow.delete | Workflows | Remove workflow | ✅ | ✅ | − | − | − | Process Manager |
| 32 | workflow.execute | Workflows | Run workflow | ✅ | ✅ | ✅ | ✅ | − | Team Lead |
| 33 | workflow.view_history | Workflows | See execution logs | ✅ | ✅ | ✅ | − | − | Analyst |
| 34 | workflow.manage_templates | Workflows | Create/edit templates | ✅ | ✅ | − | − | − | Process Manager |
| **35–40** | **approval.*** | Approvals | Request workflows | | | | | | |
| 35 | approval.view | Approvals | See pending approvals | ✅ | ✅ | ✅ | − | − | All decision makers |
| 36 | approval.decide | Approvals | Approve/reject requests | ✅ | ✅ | ✅ | − | − | Manager, Officer |
| 37 | approval.create_template | Approvals | Create approval workflow | ✅ | ✅ | − | − | − | Process Manager |
| 38 | approval.edit_template | Approvals | Modify template | ✅ | ✅ | − | − | − | Process Manager |
| 39 | approval.delete_template | Approvals | Remove template | ✅ | ✅ | − | − | − | Process Manager |
| 40 | approval.view_history | Approvals | See approval history | ✅ | ✅ | ✅ | − | − | Compliance, Audit |
| **41–46** | **dashboard.*** | Dashboards | Custom KPI views | | | | | | |
| 41 | dashboard.create | Dashboards | Create dashboard | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 42 | dashboard.edit | Dashboards | Modify dashboard | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 43 | dashboard.delete | Dashboards | Remove dashboard | ✅ | ✅ | ✅ | − | − | Dashboard Owner |
| 44 | dashboard.export | Dashboards | Download dashboard data | ✅ | ✅ | ✅ | ✅ | − | Executive, Analyst |
| 45 | dashboard.share | Dashboards | Send dashboard to team | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 46 | dashboard.view_all | Dashboards | See all org dashboards | ✅ | ✅ | ✅ | − | − | Finance Manager |
| **47–54** | **org_system.*** | Org System | UEM catalog access | | | | | | |
| 47 | org_system.view | Org System | Access org system hub | ✅ | ✅ | ✅ | − | − | Manager, Analyst |
| 48 | org_system.view_people | Org System | See people/employees | ✅ | ✅ | ✅ | − | − | Manager, HR |
| 49 | org_system.view_fleet | Org System | See assets/fleet | ✅ | ✅ | − | − | − | Fleet Manager |
| 50 | org_system.view_documents | Org System | See documents | ✅ | ✅ | − | − | − | Document Manager |
| 51 | org_system.view_alerts | Org System | See alerts & issues | ✅ | ✅ | ✅ | − | − | Incident Commander |
| 52 | org_system.view_finance | Org System | See financial data | ✅ | ✅ | − | − | − | Finance Manager |
| 53 | org_system.view_branches | Org System | See branch structure | ✅ | ✅ | − | − | − | Regional Manager |
| 54 | org_system.view_tasks | Org System | See tasks/workflow items | ✅ | ✅ | ✅ | − | − | Task Manager |
| **55–62** | **ellinea.*** | Ellinea AI | Intelligence features | | | | | | |
| 55 | ellinea.ask | Ellinea AI | Use Ask Ellinea | ✅ | ✅ | ✅ | ✅ | − | All users (toggle) |
| 56 | ellinea.brief | Ellinea AI | Get daily brief | ✅ | ✅ | ✅ | ✅ | − | Executive, Manager |
| 57 | ellinea.recommend | Ellinea AI | Receive recommendations | ✅ | ✅ | ✅ | ✅ | − | Manager, Analyst |
| 58 | ellinea.memory_read | Ellinea AI | Access enterprise memory | ✅ | ✅ | ✅ | − | − | Decision Maker |
| 59 | ellinea.memory_write | Ellinea AI | Update enterprise memory | ✅ | ✅ | − | − | − | Memory Curator |
| 60 | ellinea.dna_read | Ellinea AI | View enterprise DNA | ✅ | ✅ | − | − | − | Executive |
| 61 | ellinea.dna_write | Ellinea AI | Train enterprise DNA | ✅ | ✅ | − | − | − | AI Trainer |
| 62 | ellinea.feedback | Ellinea AI | Give recommendation feedback | ✅ | ✅ | ✅ | ✅ | − | All users |
| **63–69** | **settings.*** | Settings | Configuration | | | | | | |
| 63 | settings.view_audit | Settings | View audit logs | ✅ | ✅ | − | − | − | Compliance, Audit |
| 64 | settings.manage_webhooks | Settings | Configure webhooks | ✅ | ✅ | − | − | − | IT Admin |
| 65 | settings.manage_api_keys | Settings | Generate/revoke API keys | ✅ | ✅ | − | − | − | Developer, IT |
| 66 | settings.manage_sso | Settings | Set up OAuth2/SAML | ✅ | ✅ | − | − | − | IT Admin, Security |
| 67 | settings.manage_notification_policy | Settings | Control email/push | ✅ | ✅ | − | − | − | IT Admin |
| 68 | settings.manage_ui_policy | Settings | Set org-wide UI rules | ✅ | ✅ | − | − | − | IT Admin |
| 69 | settings.view_org_settings | Settings | View general settings | ✅ | ✅ | − | − | − | All users (read-only) |
| **70–75** | **events.*** / **notifications.*** | Events | System events | | | | | | |
| 70 | events.create | Events | Create events | ✅ | ✅ | − | − | − | Automation, System |
| 71 | events.view | Events | View events feed | ✅ | ✅ | ✅ | ✅ | − | All users |
| 72 | events.delete | Events | Remove events | ✅ | ✅ | − | − | − | Admin |
| 73 | events.manage_subscriptions | Events | Configure subscriptions | ✅ | ✅ | − | − | − | IT Admin |
| 74 | notifications.view | Notifications | See notifications | ✅ | ✅ | ✅ | ✅ | − | All users |
| 75 | notifications.delete | Notifications | Clear notifications | ✅ | ✅ | ✅ | ✅ | − | All users |
| **76–79** | **platform.*** | Platform | Super-admin (global) | | | | | | |
| 76 | platform.suspend_org | Platform | Suspend organization | ✅ | − | − | − | − | Platform Super Admin |
| 77 | platform.resume_org | Platform | Re-activate organization | ✅ | − | − | − | − | Platform Super Admin |
| 78 | platform.view_all_orgs | Platform | See all orgs on platform | ✅ | − | − | − | − | Platform Super Admin |
| 79 | platform.manage_platform_settings | Platform | Manage platform config | ✅ | − | − | − | − | Platform Super Admin |

---

## Summary by Feature Area

### Authentication & Organization (4 perms)
- Required by: Owner, IT Admin
- Custom roles: Org Admin, IT Admin
- Total: 4 permissions

### Organization Administration (8 perms)
- Required by: Owner, Admin, some Managers
- Custom roles: Org Admin, Dept Manager, HR Admin
- Total: 8 permissions

### System Connectors (8 perms)
- Required by: Admin
- Custom roles: IT Operator, IT Admin, System Engineer
- Total: 8 permissions

### Reports & Analytics (8 perms)
- Required by: Manager, Member
- Custom roles: Finance Manager, Analyst, Report Writer
- Total: 8 permissions

### Workflows & Automation (6 perms)
- Required by: Admin
- Custom roles: Process Manager, Automation Engineer
- Total: 6 permissions

### Approvals (6 perms)
- Required by: Manager, some Members
- Custom roles: Approval Officer, Compliance Manager
- Total: 6 permissions

### Dashboards & KPIs (6 perms)
- Required by: Manager, Member
- Custom roles: BI Developer, Analyst, Executive
- Total: 6 permissions

### Organization System & UEM (8 perms)
- Required by: Manager, Member (some)
- Custom roles: Analyst, Manager, Fleet Manager, HR Admin
- Total: 8 permissions

### Ellinea AI & Intelligence (8 perms)
- Required by: All roles
- Custom roles: All (typically ask/brief/recommend subset)
- Total: 8 permissions

### Settings & Configuration (7 perms)
- Required by: Admin
- Custom roles: IT Admin, Security Officer, Compliance Officer
- Total: 7 permissions

### Events & Notifications (6 perms)
- Required by: All roles (view) / Admin (manage)
- Custom roles: Incident Commander, Automation
- Total: 6 permissions

### Platform Administration (4 perms)
- Required by: Platform Super Admin only
- Custom roles: Not typically used
- Total: 4 permissions

---

## Total Permissions

- **By Feature Area:** 12 groups
- **Total Permissions:** 79+ (with expansion capability)
- **Fixed Roles Covered:** 5 (Owner, Admin, Manager, Member, Viewer)
- **Example Custom Roles:** 5+ (Finance Manager, IT Operator, Analyst, Officer, Manager)

---

## Common Permission Patterns

### Read-Only Role
```
Permissions needed: [].view, [].view_all, org.view, events.view, notifications.view
Example: Viewer role, Analyst (reports only)
```

### Manager Role
```
Permissions needed: org.manage_members, org.manage_departments, approval.*, 
                    report.create/edit/view_all, dashboard.view_all, ellinea.*
Example: Department Manager, Team Lead
```

### Developer/Admin Role
```
Permissions needed: connector.*, settings.manage_api_keys, settings.manage_webhooks,
                    workflow.*, org.manage_branches, org.manage_departments
Example: IT Operator, System Engineer
```

### Executive Role
```
Permissions needed: org_system.view_*, ellinea.brief, ellinea.dna_read, 
                    dashboard.view_all, report.view_all, approval.view
Example: C-Level, Director, VP
```

### Finance Role
```
Permissions needed: report.*, dashboard.view_all, org_system.view_finance,
                    approval.view/decide, ellinea.ask/recommend
Example: Finance Manager, CFO, Accountant
```

---

## Permission Enforcement Points

Each permission is checked at these locations:

1. **Frontend UI:** Show/hide buttons, menus, pages
2. **Pages Functions:** `requirePermissionAsync()` guard on API endpoints
3. **Backend (Nest):** `@Permissions()` guard on routes
4. **Audit Log:** Record all permission checks + denials

---

## Delegating Permissions

You can delegate specific permissions to individuals without changing their full role:

```typescript
// Give Finance Lead "approval.decide" while their manager is on vacation
POST /api/v1/orgs/me/members/{userId}/delegate-permission
{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation"
}
```

---

## Permission Validation

When creating/updating custom roles:
- ✅ All permission strings must be in this reference
- ✅ At least 1 permission required
- ✅ No duplicates
- ✅ Maximum 50+ permissions per role (recommended)

---

## Related Documentation

- [30_RBAC_Setup_Guide.md](./30_RBAC_Setup_Guide.md) — How to create custom roles
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — API endpoints
- [29_Track_D_RBAC_Implementation.md](./29_Track_D_RBAC_Implementation.md) — Implementation details

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Status:** Production-ready
