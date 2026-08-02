# RBAC Setup Guide: Creating and Managing Custom Roles

**Version:** v1.1  
**Date:** August 1, 2026  
**Audience:** Organization owners, IT admins  
**Related:** [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) · [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)

---

## Overview

Custom roles let you tailor permissions to your organization's needs. Rather than assigning fixed roles (Owner, Admin, Manager, Member, Viewer), you can create roles like "Finance Manager," "IT Operator," or "Approval Officer" with exactly the permissions they need.

### Fixed Roles vs. Custom Roles

**Fixed Roles (built-in):**
- Owner — Full access
- Admin — Almost full access (can't delete org)
- Manager — Team leads (reports, approvals, some admin)
- Member — Standard users (create reports, use features)
- Viewer — Read-only

**Custom Roles (you create):**
- Tailored permission sets
- Named for your org's roles (e.g., "Finance Manager")
- Can combine features (e.g., "IT Operator" has connectors + settings)
- Can delegate specific permissions (e.g., "Can decide approvals" only)
- Easily updated or deleted

---

## Creating a Custom Role

### Step 1: Navigate to Custom Roles

1. Go to **Settings** (bottom of left sidebar)
2. Click the gear icon → **System Settings**
3. Scroll down and click **Custom Roles** (in org settings section)
4. Or go directly to `/app/settings/custom-roles`

### Step 2: Create New Role

1. Click the **Create custom role** button
2. Fill in the form:
   - **Role name** (e.g., "Finance Manager") — required
   - **Description** (e.g., "Manages financial reports and approvals") — optional but recommended
   - **Role badge color** — choose Violet, Blue, or Teal (visual hint for role cards)

### Step 3: Select Permissions

The permission matrix shows 12 feature groups with 50+ granular permissions:

#### Permission Groups

**1. Authentication & Organization** (4 permissions)
- `auth.register_org` — Create a new organization
- `auth.invite_user` — Invite users to org
- `auth.change_password` — Change own password
- `auth.manage_sso_providers` — Configure OAuth2/SAML

**2. Organization Administration** (8 permissions)
- `org.view` — View org info
- `org.edit_name` — Rename organization
- `org.edit_settings` — Modify org settings
- `org.manage_members` — Add/remove/modify team members
- `org.create_child_org` — Create linked org (multi-company)
- `org.manage_branches` — Create/edit branches
- `org.manage_departments` — Create/edit departments
- `org.view_audit_logs` — View audit trail

**3. System Connectors** (8 permissions)
- `connector.install` — Add new system connector
- `connector.test` — Test connector connectivity
- `connector.sync` — Manually trigger sync
- `connector.delete` — Remove connector
- `connector.configure_auth` — Update credentials
- `connector.autoscan` — Auto-detect systems
- `connector.view_history` — See sync logs
- `connector.manage_webhook` — Configure webhooks

**4. Reports & Analytics** (8 permissions)
- `report.create` — Create new report
- `report.edit` — Modify existing report
- `report.delete` — Remove report
- `report.schedule` — Set up recurring reports
- `report.export` — Download report data (CSV/PDF)
- `report.share` — Send report to team
- `report.run_now` — Execute report manually
- `report.view_all` — See all org reports

**5. Workflows & Automation** (6 permissions)
- `workflow.create` — Create workflow
- `workflow.edit` — Modify workflow
- `workflow.delete` — Remove workflow
- `workflow.execute` — Run workflow
- `workflow.view_history` — See execution logs
- `workflow.manage_templates` — Create/edit templates

**6. Approvals** (6 permissions)
- `approval.view` — See pending approvals
- `approval.decide` — Approve/reject requests
- `approval.create_template` — Create approval workflow
- `approval.edit_template` — Modify template
- `approval.delete_template` — Remove template
- `approval.view_history` — See approval history

**7. Dashboards & KPIs** (6 permissions)
- `dashboard.create` — Create dashboard
- `dashboard.edit` — Modify dashboard
- `dashboard.delete` — Remove dashboard
- `dashboard.export` — Download dashboard data
- `dashboard.share` — Send dashboard to team
- `dashboard.view_all` — See all org dashboards

**8. Organization System & UEM** (8 permissions)
- `org_system.view` — Access org system hub
- `org_system.view_people` — See people/employees
- `org_system.view_fleet` — See assets/fleet
- `org_system.view_documents` — See documents
- `org_system.view_alerts` — See alerts & issues
- `org_system.view_finance` — See financial data
- `org_system.view_branches` — See branch structure
- `org_system.view_tasks` — See tasks/workflow items

**9. Ellinea AI & Intelligence** (8 permissions)
- `ellinea.ask` — Use Ask Ellinea
- `ellinea.brief` — Get daily brief
- `ellinea.recommend` — Receive recommendations
- `ellinea.memory_read` — Access enterprise memory
- `ellinea.memory_write` — Update enterprise memory
- `ellinea.dna_read` — View enterprise DNA
- `ellinea.dna_write` — Train enterprise DNA
- `ellinea.feedback` — Give recommendation feedback

**10. Settings & Configuration** (7 permissions)
- `settings.view_audit` — View audit logs
- `settings.manage_webhooks` — Configure webhooks
- `settings.manage_api_keys` — Generate/revoke API keys
- `settings.manage_sso` — Set up OAuth2/SAML
- `settings.manage_notification_policy` — Control email/push
- `settings.manage_ui_policy` — Set org-wide UI rules
- `settings.view_org_settings` — View general settings

**11. Events & Notifications** (6 permissions)
- `events.create` — Create events
- `events.view` — View events feed
- `events.delete` — Remove events
- `events.manage_subscriptions` — Configure event subscriptions
- `notifications.view` — See notifications
- `notifications.delete` — Clear notifications

**12. Platform Administration** (4 permissions)
- `platform.suspend_org` — Suspend organization (Super Admin only)
- `platform.resume_org` — Re-activate organization (Super Admin only)
- `platform.view_all_orgs` — See all orgs on platform (Super Admin)
- `platform.manage_platform_settings` — Manage platform config (Super Admin)

### Step 4: Select Permissions

1. **Click group headers** to toggle all permissions in that group
2. **Check/uncheck individual permissions** for fine-grained control
3. **Use toolbar:**
   - **Select all** — Check all 50+ permissions (start here if using role as template)
   - **Clear all** — Uncheck everything (start fresh)
4. **See real-time counter** — "X selected" feedback
5. **Responsive grid** — Adapts to screen size (mobile-friendly)

### Step 5: Save

1. Verify role name is entered
2. Check that at least 1 permission is selected
3. Click **Create role** to save
4. Success message appears
5. Role now visible in role list

---

## Common Role Templates

Start with these pre-built templates and customize as needed:

### 1. Finance Manager

**Permissions:** 10 total
- `report.create`, `report.edit`, `report.schedule`, `report.export`, `report.view_all`
- `approval.view`, `approval.decide`
- `dashboard.view_all`
- `org_system.view_finance`
- `ellinea.ask`, `ellinea.recommend`

**Use case:** CFO, accounting director, financial analyst
**What they can do:**
- Create and schedule financial reports
- Export data for external use
- Approve financial workflows
- View financial dashboards
- Get Ellinea AI insights on spending/budget

### 2. IT Operator

**Permissions:** 13 total
- `connector.install`, `connector.test`, `connector.sync`, `connector.configure_auth`, `connector.autoscan`, `connector.view_history`, `connector.manage_webhook`
- `org.manage_branches`, `org.manage_departments`
- `settings.manage_webhooks`, `settings.manage_api_keys`
- `ellinea.ask`
- `events.view`

**Use case:** IT Admin, system administrator, DevOps engineer
**What they can do:**
- Install and manage system connectors (SQL, REST, etc.)
- Configure branch/department structure
- Set up webhooks for data flows
- Generate API keys for integrations
- Monitor system events

### 3. Analyst

**Permissions:** 10 total
- `report.create`, `report.edit`, `report.export`, `report.run_now`, `report.view_all`
- `dashboard.create`, `dashboard.view_all`
- `org_system.view`, `org_system.view_people`, `org_system.view_fleet`
- `ellinea.ask`, `ellinea.recommend`

**Use case:** Data analyst, business analyst, BI developer
**What they can do:**
- Create and modify reports without admin
- Create custom dashboards
- Run reports on-demand
- View org data through Organization System
- Get Ellinea recommendations for trends

### 4. Approval Officer

**Permissions:** 7 total
- `approval.view`, `approval.decide`, `approval.view_history`
- `workflow.view_history`
- `org.view`
- `org_system.view`
- `ellinea.ask`
- `events.view`

**Use case:** Compliance officer, quality reviewer, procurement manager
**What they can do:**
- Review and approve/reject workflows
- See approval history for audit trails
- View workflow execution logs
- Access org system for context
- No ability to create workflows (protected)

### 5. Department Manager

**Permissions:** 12 total
- `org.view`, `org.manage_members`, `org.manage_departments`
- `report.create`, `report.view_all`
- `approval.view`, `approval.decide`
- `org_system.view`, `org_system.view_people`
- `ellinea.ask`
- `events.view`
- `notifications.view`

**Use case:** Department head, team lead, regional manager
**What they can do:**
- Manage team members in their department
- Create/view reports for team
- Approve team requests
- View organizational structure
- See team availability and performance

---

## Best Practices

### 1. Principle of Least Privilege

Grant only the permissions needed for the role.

❌ **Bad:** Finance Manager gets `connector.install`, `settings.manage_sso`
✅ **Good:** Finance Manager gets only report/approval/dashboard permissions

### 2. Use Descriptive Names

Role names should be clear about responsibility.

❌ **Bad:** "Manager 1", "Role A", "User with perms"
✅ **Good:** "Finance Manager", "IT Operator", "Approval Officer"

### 3. Document Custom Roles

Create a reference in your org wiki:

```
## Custom Roles

- **Finance Manager:** Can create/view financial reports, approve financial workflows
- **IT Operator:** Can manage system connectors and infrastructure
- **Analyst:** Can create reports and dashboards
```

### 4. Start with Templates

Don't create roles from scratch.

1. Click **Select all** to get all 50+ permissions
2. Then **uncheck** groups you don't need
3. Or start with a template name (Finance Manager) and customize

### 5. Test Before Rolling Out

1. Create the role
2. Assign to 1–2 test users
3. Have them test workflows
4. Refine permissions if needed
5. Roll out to full team

### 6. Avoid Permission Explosion

Don't create a new role for every edge case.

❌ **Bad:** "Finance Manager (Approvals)", "Finance Manager (Reports)", "Finance Manager (No Delete)", etc.
✅ **Good:** One "Finance Manager" with all needed perms; delegate specific perms to individuals if needed

### 7. Periodic Audits

Every quarter, review custom roles:
- Are they still used?
- Do assignments match descriptions?
- Should permissions be adjusted?

Use the audit log (`org.view_audit_logs`) to see who has what access.

### 8. Name Permissions in Descriptions

When describing a role, list key permissions:

```
Finance Manager
Manages financial reports and approvals
Key permissions: report.*, approval.view/decide, dashboard.view_all, org_system.view_finance
```

---

## Editing and Deleting Roles

### Edit a Role

1. Go to **Settings** → **Custom Roles**
2. Click **Edit** on the role card
3. Modify name, description, or permissions
4. Click **Update role**
5. All users with this role immediately get the new permissions

### Delete a Role

1. Go to **Settings** → **Custom Roles**
2. Click **Delete** on the role card
3. Confirm deletion (cannot be undone)
4. Users keep their org access but lose the role's permissions
   - They revert to fixed roles or other custom roles
   - Monitor audit log for permission changes

### Disable Instead of Delete

To temporarily disable a role without deleting:

1. Edit the role
2. Remove all permissions (leave it empty)
3. Save → role is now inactive
4. Users can't use it but it's not permanently deleted
5. Later, add permissions back to re-enable

---

## Troubleshooting

### Problem: User still can't access feature after assigning role

**Causes:**
- Permissions cache not refreshed (TTL: 5 seconds)
- User not logged out/in after role change
- Wrong permission name in role

**Solution:**
1. Wait 10 seconds
2. Have user log out and log back in
3. Check role via Settings → Custom Roles (verify permissions)
4. Check user's effective permissions: `GET /api/v1/orgs/me/permissions`

### Problem: Can't delete a role

**Cause:** Role is still assigned to users

**Solution:**
1. Go to Org Admin → Members
2. Find users with that role
3. Reassign them to a different role
4. Now delete the role

### Problem: Role name conflicts with another role

**Cause:** Duplicate role name in org

**Solution:**
1. Edit the conflicting role
2. Add a suffix (e.g., "Finance Manager v2")
3. Or include department: "Finance Manager (NYC)"

### Problem: Too many permissions, hard to find one

**Solution:**
1. Use browser Find (Ctrl+F / Cmd+F) to search the page
2. Or use permission group headers (click to toggle groups)
3. Start with "Select all" then uncheck groups you don't need

---

## Related Resources

- **[31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md)** — API endpoints for custom roles
- **[32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)** — Complete permission reference table
- **[33_RBAC_Troubleshooting.md](./33_RBAC_Troubleshooting.md)** — Common issues and solutions
- **[34_RBAC_UI_Guide.md](./34_RBAC_UI_Guide.md)** — Visual walkthrough of Settings UI
- **[29_Track_D_RBAC_Implementation.md](./29_Track_D_RBAC_Implementation.md)** — Technical implementation details

---

## FAQ

**Q: Can I modify fixed roles (Owner, Admin, etc.)?**
A: No, fixed roles are built-in and unchangeable. Custom roles are your way to tailor permissions.

**Q: What if I need different permissions per department?**
A: Create multiple custom roles:
- "Finance Manager (NYC)"
- "Finance Manager (LA)"
- Each with slightly different permissions if needed
- Or use one "Finance Manager" and delegate specific permissions to individuals via the Elevate / Delegate features.

**Q: Can I create a role with no permissions?**
A: The UI requires at least 1 permission. But you can remove all permissions to effectively disable a role.

**Q: How many custom roles can I create?**
A: Unlimited (within reason). Most orgs have 5–10 custom roles.

**Q: Can users have multiple custom roles?**
A: Not simultaneously in this version. A user has one fixed role or one custom role. Future versions may support role stacking.

**Q: How long does a permission change take to apply?**
A: Up to 5 seconds (cache TTL). If urgent, have user log out/in.

**Q: Can I export/import custom roles?**
A: Not in v1.1. Custom roles are per-organization. To replicate across orgs, you'd recreate them manually or contact support.

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Feedback:** For issues, see [33_RBAC_Troubleshooting.md](./33_RBAC_Troubleshooting.md)
