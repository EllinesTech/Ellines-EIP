# RBAC Troubleshooting Guide

**Version:** v1.1  
**Date:** August 1, 2026  

---

## Common Issues & Solutions

### Issue 1: User can't access feature despite having role

**Symptoms:**
- User has custom role with permission
- Feature still returns "Access Denied"
- Works for other users with same role

**Possible Causes:**
1. **Permission cache not refreshed** — Most common
2. **Role assignment not synced**
3. **Permission name typo in role**
4. **Frontend cached old session**

**Solutions:**

**Quick Fix (try first):**
```bash
# Wait 10 seconds (cache TTL)
# Then have user log out and log in again
```

**Check role permissions:**
1. Go to Settings → Custom Roles
2. Click the role
3. Verify permission is checked (e.g., "report.create")
4. Look in permission matrix for exact spelling

**Check user's effective permissions:**
```bash
# As admin, call:
GET /api/v1/orgs/me/permissions (as the affected user)

# Response should include the permission:
{
  "permissions": [
    "report.create",    # ← Should be here
    "report.view_all",
    ...
  ]
}
```

**Clear frontend cache:**
```javascript
// In browser console:
localStorage.clear();
sessionStorage.clear();
// Then refresh page
```

**If still not working:**
- Check server logs for permission denials
- Verify user is assigned to the correct role (not a fixed role)
- Restart browser completely

---

### Issue 2: Can't delete a custom role

**Symptoms:**
- Delete button appears
- Click delete → nothing happens or error

**Possible Causes:**
1. **Role still assigned to users**
2. **Insufficient permissions** (not Owner/Admin)
3. **Network error**

**Solutions:**

**Check who has the role:**
1. Go to Admin → Members
2. See if any users show the role
3. If yes, reassign them to a different role first

**Reassign users:**
```bash
# For each user with the role:
PATCH /api/v1/orgs/me/members/{userId}
{
  "role": "member"  # or another fixed role
}
```

**Then delete:**
1. Go to Settings → Custom Roles
2. Click Delete on the role
3. Confirm

**If network error:**
- Check internet connection
- Try again in 10 seconds
- Check browser console for errors

**If permission error:**
- Make sure you're Owner or Admin
- Check your effective permissions:
  ```bash
  GET /api/v1/orgs/me/permissions
  # Should include "org.edit_settings"
  ```

---

### Issue 3: Role name already exists

**Symptoms:**
- Try to create role "Finance Manager"
- Get error: "Role name already exists"
- But don't see it in the role list

**Possible Causes:**
1. **Role exists but inactive**
2. **Case-sensitive matching**
3. **Another org with same role** (multi-company)

**Solutions:**

**Search for existing role:**
1. Go to Settings → Custom Roles
2. Use Ctrl+F (browser Find) to search for the name
3. Check inactive roles section

**Use unique name:**
- Append department: "Finance Manager (NYC)"
- Append team: "Finance Manager (Accounting)"
- Append version: "Finance Manager v2"

**Check other orgs:**
- If using multi-company (switches), check other orgs
- Each org has its own custom roles

---

### Issue 4: Permission denied (403) on API endpoint

**Symptoms:**
- Calling an API endpoint that should work
- Get 403 Forbidden response
- Error: "User lacks permission: report.create"

**Possible Causes:**
1. **Permission not in user's role**
2. **Role not assigned to user**
3. **User on wrong org**
4. **Expired temporary elevation**

**Solutions:**

**Check user's permissions:**
```bash
GET /api/v1/orgs/me/permissions

# Response:
{
  "permissions": ["report.view_all", "events.view"],
  "effectiveRole": "member",
  "message": "Missing report.create permission"
}
```

**Add permission to role:**
1. Admin goes to Settings → Custom Roles
2. Edit the user's role
3. Check "report.create" permission
4. Click Update

**Check role assignment:**
```bash
GET /api/v1/orgs/me/roles

# Verify user's role is listed and has the needed permission
```

**If elevation expired:**
```bash
# Check if user is still elevated
GET /api/v1/orgs/me/permissions

# Response:
{
  "isElevated": false,  # ← Elevation expired
  "elevatedUntil": "2026-08-01T12:00:00Z"  # ← Was this time
}

# To re-elevate:
POST /api/v1/orgs/me/members/{userId}/elevate
{
  "targetRole": "admin",
  "durationMinutes": 120,
  "reason": "Re-elevate"
}
```

---

### Issue 5: Frontend showing "Create" button but backend denies it

**Symptoms:**
- UI shows "Create Report" button
- Click it → 403 Forbidden from server
- Permission check disagrees with backend

**Possible Causes:**
1. **Frontend cache out of sync with backend**
2. **Permission changed between page load and submit**
3. **Bug in frontend permission checker**

**Solutions:**

**Refresh and retry:**
1. Refresh page (Ctrl+R / Cmd+R)
2. Retry the action
3. Check if browser shows updated permissions

**Clear local cache:**
```javascript
// In browser console:
localStorage.removeItem('eip_permissions');
localStorage.removeItem('eip_session');
// Refresh page
```

**Check backend logs:**
```bash
# Server should log: "Permission denied: user_X -> report.create"
# Look for timestamp matching the denied request
```

**If still mismatched:**
- Report a bug with details:
  - User ID and role
  - Permission that should work
  - Browser console errors
  - Server logs from that time

---

### Issue 6: Can't see custom role options when creating user

**Symptoms:**
- Go to Admin → Members → Add User
- Only see fixed roles (Owner, Admin, Manager, etc.)
- Custom roles not in dropdown

**Possible Causes:**
1. **No custom roles created yet**
2. **UI doesn't support custom role assignment** (v1.1 feature)
3. **Dropdown scrolled past custom roles**

**Solutions:**

**Create a custom role first:**
1. Go to Settings → Custom Roles
2. Click "Create custom role"
3. Fill in name, description, permissions
4. Save

**Then assign it:**
1. Go to Admin → Members
2. Edit user
3. In role dropdown, scroll down to find custom roles
4. Select the custom role
5. Save

**Note:** v1.1 supports custom role assignment. In v1.0, only fixed roles were available.

---

### Issue 7: User still has old permissions after role update

**Symptoms:**
- Admin removes a permission from role
- User still can access that feature
- Permission check says they shouldn't have it

**Possible Causes:**
1. **Cache TTL not expired yet** (up to 5 seconds)
2. **User still logged in from before change**
3. **Browser cache**

**Solutions:**

**Wait and refresh:**
```bash
# Wait 10 seconds (2x cache TTL)
# Have user refresh the page (Ctrl+R)
```

**Force re-login:**
1. User logs out
2. User logs in again
3. Check permissions:
   ```bash
   GET /api/v1/orgs/me/permissions
   ```

**Clear cache:**
```javascript
// User runs in browser console:
localStorage.clear();
sessionStorage.clear();
// Refresh page
```

**If needed, manually invalidate cache:**
```bash
# Admin in server console:
redis-cli DEL eip:permissions:user_X:org_Y
# User's next request will fetch fresh permissions
```

---

### Issue 8: "Invalid permission name" when saving role

**Symptoms:**
- Creating or editing role
- Get error: "Invalid permission name: 'report.does_not_exist'"

**Possible Causes:**
1. **Typo in permission name**
2. **Permission was removed/renamed**
3. **Using wrong case** (case-sensitive)

**Solutions:**

**Check permission spelling:**
1. Go to Settings → Custom Roles
2. Use the permission matrix UI
3. Select permissions from checkboxes (can't typo that way)

**Or use API reference:**
- See [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md)
- See [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)
- Copy exact permission name

**Verify case:**
- Permissions are lowercase with dots: `report.create`
- NOT `Report.Create` or `REPORT.CREATE`

**Example:**
```json
{
  "name": "Analyst",
  "permissions": [
    "report.create",     // ✅ Correct
    "report.Create",     // ❌ Wrong case
    "Report.create",     // ❌ Wrong case
    "report_create"      // ❌ Wrong separator
  ]
}
```

---

### Issue 9: Too many custom roles, hard to manage

**Symptoms:**
- Created 20+ custom roles
- Role list is cluttered
- Hard to find specific role

**Causes:**
- Not following principle of least privilege
- Creating overly-specific roles

**Solutions:**

**Consolidate roles:**
1. Identify overlapping roles
2. Merge into one role with combined permissions
3. Delete the extras

**Better naming:**
- Use department/function: "Finance Manager (NYC)"
- Use level: "Finance Manager (Senior)" vs "Finance Manager (Junior)"
- Use system: "Report Writer", "Dashboard Creator"

**Document roles:**
- Create a simple list in your org wiki
- Include description + use case
- Makes it easier to understand why roles exist

**Example good structure:**
```
- Finance Manager (reports + approvals)
- IT Operator (connectors + settings)
- Analyst (reports + dashboards)
- Approval Officer (approvals only)
- Department Manager (members + reports)
```

---

### Issue 10: Audit log not recording role changes

**Symptoms:**
- Admin changes role
- Look at audit log
- No entry for the change

**Possible Causes:**
1. **Audit permissions missing**
2. **Audit not enabled** (default: on)
3. **Delay in log aggregation** (10-30 sec)

**Solutions:**

**Check audit is enabled:**
1. Go to Settings → Audit Trail
2. Verify "Audit enabled" toggle is ON
3. Verify "Log role changes" is ON (if available)

**Wait for aggregation:**
```bash
# Audit logs aggregate every 10-30 seconds
# Wait 1 minute and refresh the audit page
GET /api/v1/orgs/me/audit-logs
```

**Verify you can view audit:**
```bash
# Must have permission:
"settings.view_audit"

# Check your permissions:
GET /api/v1/orgs/me/permissions
# Should include: "settings.view_audit"
```

**Manual log entry:**
- Record role change in org wiki/notes
- Include: who, what, when, why
- Reference this if audit log fails

---

## Getting Help

If you can't resolve the issue:

1. **Check this guide** — Search for keywords (Issue 1–10)
2. **Check API Reference** — See [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md)
3. **Check Permission Matrix** — See [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)
4. **Contact IT/Admin** — Provide:
   - Your username and org
   - What you tried
   - Error message or screenshot
   - Timestamp of issue
5. **Check server logs** — If you have access:
   ```bash
   docker-compose logs identity | grep -i permission
   docker-compose logs web | grep -i 403
   ```

---

## Quick Reference

### Check user permissions (as that user)
```bash
GET /api/v1/orgs/me/permissions
```

### Check custom roles
```bash
GET /api/v1/orgs/me/roles
```

### View audit log
```bash
GET /api/v1/orgs/me/audit-logs?limit=20
```

### Refresh permissions cache
```bash
# Manual: User logs out then in
# Or: Wait 5 seconds + refresh page
```

### Update role permissions
```bash
PATCH /api/v1/orgs/me/roles/{id}
{
  "permissions": ["report.create", "report.edit"]
}
```

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Status:** Production-ready

**For more help, see:**
- [30_RBAC_Setup_Guide.md](./30_RBAC_Setup_Guide.md)
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md)  
- [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)
