# Track D: Advanced RBAC (Custom Roles & Permissions)

**Status:** 🚀 READY TO START  
**Date:** August 1, 2026  
**Priority:** 2 (after Track E OAuth2/SAML)  
**Effort:** 2–3 weeks (1–2 engineers)  
**Blocker:** None (independent track)

---

## Overview

**Current State:** 4 fixed roles (owner, admin, manager, member, viewer)

**v1.1 Goal:** Flexible permission system with:
- ✅ Custom role creation (Owner/Admin)
- ✅ 50+ granular permissions (CRUD on each feature)
- ✅ Attribute-based access control (ABAC)
- ✅ Temporary role elevation (CEO needs admin access for 2 hours)
- ✅ Permission delegation (Manager can grant specific permission to another user)
- ✅ Role audit trail (who changed what, when)

**Why:** Different orgs need different permission models. Hospital CTO ≠ Finance company.

---

## Architecture

### Permission Model

**Permissions (50+):**
```
AUTH:
  - auth.register_org
  - auth.invite_user
  - auth.change_password
  
ORG_ADMIN:
  - org.view
  - org.edit_name
  - org.edit_settings
  - org.manage_members
  - org.create_child_org
  
CONNECTORS:
  - connector.install
  - connector.test
  - connector.sync
  - connector.delete
  - connector.configure_auth
  
REPORTS:
  - report.create
  - report.edit
  - report.delete
  - report.schedule
  - report.export
  
WORKFLOWS:
  - workflow.create
  - workflow.edit
  - workflow.delete
  - workflow.execute
  
APPROVALS:
  - approval.view
  - approval.decide
  - approval.create_template
  
DASHBOARDS:
  - dashboard.create
  - dashboard.edit
  - dashboard.delete
  - dashboard.export
  
SETTINGS:
  - settings.view_audit
  - settings.manage_sso
  - settings.manage_webhooks
  - settings.manage_api_keys
```

### Role Structure

**Fixed Roles (built-in):**
- `owner` — Full access, can't be deleted/modified
- `admin` — Almost full access (can't delete org, change owner)
- `manager` — Team lead permissions (reports, approvals, some admin)
- `member` — Standard user (create reports, use connectors)
- `viewer` — Read-only (see reports, dashboards, but can't edit)

**Custom Roles (user-created):**
- e.g., "Finance Manager" — specific set of permissions
- e.g., "Report Writer" — can create/edit reports only
- e.g., "System Operator" — connectors + workflows, no settings

### Advanced Features

**1. Temporary Elevation:**
```
CEO (normally "member") → needs "admin" for 2 hours
POST /api/v1/orgs/me/members/{userId}/elevate
{
  "targetRole": "admin",
  "durationMinutes": 120,
  "reason": "Emergency database migration"
}
```
After 120 min → role reverts to "member"

**2. Permission Delegation:**
```
Manager delegates "approval.decide" to Finance Lead
POST /api/v1/orgs/me/members/{userId}/delegate-permission
{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation"
}
```
Finance Lead can decide approvals until Aug 15 → permission revoked

**3. Attribute-Based Access Control (ABAC):**
```
Rule: "Can view reports from their department only"
  - User.role = "manager"
  - Report.department == User.department
  → CAN VIEW
```

**4. Audit Trail:**
- Every permission change logged
- Who did it, when, why
- Can see who changed roles / delegated permissions
- Can revert accidental changes (future)

---

## Data Model (Prisma Schema Changes)

```prisma
// New models for Track D

model CustomRole {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  name           String   // "Finance Manager"
  description    String?  // "Can manage financial reports and approvals"
  permissions    String[] // ["report.create", "report.edit", "approval.view"]
  createdBy      String   @map("created_by")
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignments    CustomRoleAssignment[]

  @@index([organizationId])
  @@map("custom_roles")
}

model CustomRoleAssignment {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  userId         String   @map("user_id")
  customRoleId   String   @map("custom_role_id")
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")

  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  customRole    CustomRole    @relation(fields: [customRoleId], references: [id], onDelete: Cascade)

  @@unique([userId, customRoleId])
  @@index([organizationId])
  @@index([userId])
  @@map("custom_role_assignments")
}

model RoleElevation {
  id             String    @id @default(cuid())
  organizationId String    @map("organization_id")
  userId         String    @map("user_id")
  fromRole       String    @map("from_role")
  toRole         String    @map("to_role")
  reason         String
  elevatedBy     String    @map("elevated_by")
  expiresAt      DateTime  @map("expires_at")
  revokedAt      DateTime? @map("revoked_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([userId])
  @@index([expiresAt])
  @@map("role_elevations")
}

model PermissionDelegation {
  id             String    @id @default(cuid())
  organizationId String    @map("organization_id")
  userId         String    @map("user_id")
  permission     String
  reason         String?
  delegatedBy    String    @map("delegated_by")
  expiresAt      DateTime  @map("expires_at")
  revokedAt      DateTime? @map("revoked_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([userId])
  @@index([expiresAt])
  @@map("permission_delegations")
}

// Enhance existing User model:
model User {
  // ... existing fields ...
  
  // Track D additions:
  customRoles    CustomRoleAssignment[]
  elevations     RoleElevation[]
  delegations    PermissionDelegation[]
}

// Enhance existing Organization model:
model Organization {
  // ... existing fields ...
  
  // Track D additions:
  customRoles             CustomRole[]
  roleAssignments         CustomRoleAssignment[]
  elevations              RoleElevation[]
  delegations             PermissionDelegation[]
}
```

---

## Implementation Plan

### Phase 1: Backend Services (Week 1)

**1. Permission Evaluator Service:**
```typescript
// services/identity/src/rbac/permission-evaluator.service.ts (300 LOC)

export class PermissionEvaluatorService {
  // Evaluate if user has permission
  async canUserPerform(
    userId: string,
    orgId: string,
    permission: string
  ): Promise<boolean>
  
  // Get all user permissions (including delegated)
  async getUserPermissions(userId: string, orgId: string): Promise<string[]>
  
  // Check elevated role (if still active)
  async getEffectiveRole(userId: string, orgId: string): Promise<string>
  
  // Evaluate ABAC rules
  async evaluateAbacRule(user: User, rule: AbacRule, context: any): Promise<boolean>
}
```

**2. Custom Role Service:**
```typescript
// services/identity/src/rbac/custom-role.service.ts (200 LOC)

export class CustomRoleService {
  // CRUD custom roles
  async createRole(orgId: string, data: CreateRoleDto): Promise<CustomRole>
  async updateRole(roleId: string, data: UpdateRoleDto): Promise<CustomRole>
  async deleteRole(roleId: string): Promise<void>
  async listRoles(orgId: string): Promise<CustomRole[]>
  
  // Validate permissions (must exist in permission enum)
  async validatePermissions(permissions: string[]): Promise<boolean>
}
```

**3. Role Elevation Service:**
```typescript
// services/identity/src/rbac/role-elevation.service.ts (150 LOC)

export class RoleElevationService {
  // Elevate user role temporarily
  async elevateRole(
    orgId: string,
    userId: string,
    toRole: string,
    durationMinutes: number,
    reason: string
  ): Promise<RoleElevation>
  
  // Check if elevation still active
  async isElevated(userId: string, orgId: string): Promise<boolean>
  
  // Revoke elevation early
  async revokeElevation(elevationId: string): Promise<void>
  
  // Cleanup expired elevations (cron job)
  async cleanupExpiredElevations(): Promise<number>
}
```

**4. Permission Delegation Service:**
```typescript
// services/identity/src/rbac/permission-delegation.service.ts (150 LOC)

export class PermissionDelegationService {
  // Delegate specific permission
  async delegatePermission(
    orgId: string,
    userId: string,
    permission: string,
    expiresAt: Date,
    reason?: string
  ): Promise<PermissionDelegation>
  
  // Revoke delegation
  async revokeDelegation(delegationId: string): Promise<void>
  
  // Get active delegations for user
  async getUserDelegations(userId: string, orgId: string): Promise<PermissionDelegation[]>
}
```

### Phase 2: Pages Functions (Week 1–2)

**9 API endpoints:**

```typescript
// Role Management
POST   /api/v1/orgs/me/roles
GET    /api/v1/orgs/me/roles
GET    /api/v1/orgs/me/roles/{id}
PATCH  /api/v1/orgs/me/roles/{id}
DELETE /api/v1/orgs/me/roles/{id}

// Role Assignment
POST   /api/v1/orgs/me/members/{userId}/assign-role
POST   /api/v1/orgs/me/members/{userId}/elevate
POST   /api/v1/orgs/me/members/{userId}/delegate-permission

// Permission Checking (used by frontend)
GET    /api/v1/orgs/me/permissions (returns user's allowed actions)
```

### Phase 3: Frontend Components (Week 2)

**Pages:**
- `/app/settings/roles` (role list + editor)
- `/app/admin/members` (assign roles + elevation + delegation UI)

**Components:**
- `RoleList.tsx` (list custom roles, create/edit/delete)
- `RoleEditor.tsx` (choose permissions from checklist)
- `RoleAssignmentModal.tsx` (assign role to user)
- `ElevateRoleModal.tsx` (temporary elevation)
- `DelegatePermissionModal.tsx` (delegate specific permission)

### Phase 4: Permission Enforcement (Week 2–3)

**Update all Pages Functions:**
- Add `requirePermission(permission)` guard to each endpoint
- Return 403 if user lacks permission
- Log permission denials in audit trail

**Example:**
```typescript
// apps/web/functions/api/v1/connectors.ts
export const onRequest: PagesFunction = async (context) => {
  const auth = requireAuth(context.request);
  
  // Check permission
  const hasPermission = await checkPermission(
    auth.sub,
    auth.organizationId,
    'connector.install'
  );
  
  if (!hasPermission) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }
  
  // Proceed...
};
```

### Phase 5: Testing & Docs (Week 3)

- Unit tests: Permission evaluator, role service
- Integration tests: End-to-end role + permission flow
- Documentation: User guide + API reference
- Deployment: Database migration + build

---

## Migration Path (V1.0 → V1.1)

**Day 1:** Run `npm run db:push`
- Creates `CustomRole`, `CustomRoleAssignment`, `RoleElevation`, `PermissionDelegation` tables
- Existing `User.role` (owner/admin/manager/member/viewer) stays unchanged

**Day 2:** Deploy Pages Functions + Services
- All endpoints live
- Permission checking active
- Default: all fixed roles have permissions as before

**Day 3:** Deploy Frontend
- `/app/settings/roles` for creating custom roles
- `/app/admin/members` for assigning roles

**No downtime:** Existing users keep their fixed roles. Custom roles opt-in.

---

## Testing Checklist

### Unit Tests
- [ ] PermissionEvaluator.canUserPerform() works
- [ ] CustomRoleService.createRole() validates permissions
- [ ] RoleElevationService.isElevated() checks expiry
- [ ] PermissionDelegationService.revokeDelegation() works
- [ ] Cleanup cron removes expired elevations/delegations

### Integration Tests
- [ ] Create custom role "Finance Manager" with permissions
- [ ] Assign role to user → user has those permissions
- [ ] Elevate user to "admin" for 1 hour → permission check works
- [ ] After 1 hour, elevation expires → permission denied
- [ ] Delegate "approval.decide" to user → permission check works
- [ ] Revoke delegation → permission denied

### Frontend Tests
- [ ] Create custom role in Settings
- [ ] Assign role to user in Admin
- [ ] Elevate user → see elevation countdown
- [ ] Delegate permission → user has it
- [ ] Revoke → disappears

### Permission Enforcement
- [ ] Owner can do everything
- [ ] Admin can do most things (not delete org)
- [ ] Custom role can only do assigned permissions
- [ ] Member without specific permission → 403 on API
- [ ] Elevated user can do elevated role permissions
- [ ] Delegated permission works only for that permission

---

## Success Metrics (Track D Definition of Done)

- ✅ 50+ permissions defined and enforced
- ✅ Custom roles created by Owner/Admin
- ✅ Role assignment working
- ✅ Permission checks on all 50+ endpoints
- ✅ Temporary elevation works (tested)
- ✅ Permission delegation works (tested)
- ✅ Audit trail captures all changes
- ✅ Frontend UI intuitive
- ✅ All builds passing (TypeScript strict)
- ✅ Integration tests pass (e2e role flow)

---

## Files to Create/Modify

**Services:**
- `services/identity/src/rbac/permission-evaluator.service.ts`
- `services/identity/src/rbac/custom-role.service.ts`
- `services/identity/src/rbac/role-elevation.service.ts`
- `services/identity/src/rbac/permission-delegation.service.ts`
- `services/identity/src/rbac/permission.enum.ts` (50+ permissions)

**Pages Functions (9 files):**
- `apps/web/functions/api/v1/orgs/me/roles/*.ts`
- `apps/web/functions/api/v1/orgs/me/members/{userId}/assign-role.ts`
- `apps/web/functions/api/v1/orgs/me/members/{userId}/elevate.ts`
- `apps/web/functions/api/v1/orgs/me/members/{userId}/delegate-permission.ts`
- `apps/web/functions/api/v1/orgs/me/permissions.ts`

**Frontend:**
- `apps/web/src/app/app/settings/roles/page.tsx`
- `apps/web/src/app/app/settings/roles/RoleList.tsx`
- `apps/web/src/app/app/settings/roles/RoleEditor.tsx`
- `apps/web/src/app/app/admin/members/RoleAssignmentModal.tsx`
- `apps/web/src/app/app/admin/members/ElevateRoleModal.tsx`

**Database:**
- `services/identity/prisma/schema.prisma` (4 new models + User/Org updates)

---

## Team Assignment

- **Backend engineer (1):** Services + Pages Functions + database migration
- **Frontend engineer (0.5):** Settings UI + Admin UI
- **QA/Testing (0.5):** Permission enforcement testing

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Permission explosion (too many?) | Medium | Start with 50 core permissions; add incrementally |
| Performance (permission checks on every request) | Medium | Cache permissions in memory + Redis TTL |
| Accidental permission denial | Low | Audit trail + rollback capability |
| Elevation abuse | Low | Require reason, audit all elevations, short default TTL |

---

## Next Tracks (After D)

- **Track A (Connectors):** Uses permissions from Track D
- **Track B (Dashboards):** Uses permissions from Track D
- **Track C (Workflows):** Uses permissions from Track D

All consumer tracks depend on Track D permission system.

---

**Status:** Ready to start. See implementation for detailed code structure.
