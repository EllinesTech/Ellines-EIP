# RBAC API Reference

**Version:** v1.1  
**Date:** August 1, 2026  
**Base URL:** `http://localhost:3100/api/v1` (local) or `https://eip.ellines.co.ke/api/v1` (production)  
**Authentication:** Bearer JWT (in `Authorization` header)

---

## Overview

The RBAC API provides 8 endpoints for managing custom roles, permissions, and role assignments:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/orgs/me/roles` | List all custom roles |
| POST | `/orgs/me/roles` | Create new custom role |
| GET | `/orgs/me/roles/{id}` | Get role details |
| PATCH | `/orgs/me/roles/{id}` | Update role |
| DELETE | `/orgs/me/roles/{id}` | Delete role |
| POST | `/orgs/me/custom-roles/assign` | Assign role to user |
| GET | `/orgs/me/permissions` | Get user's effective permissions |
| POST | `/orgs/me/members/{userId}/elevate` | Temporarily elevate role |
| POST | `/orgs/me/members/{userId}/delegate-permission` | Delegate specific permission |

---

## Endpoints

### 1. List Custom Roles

**Endpoint:** `GET /orgs/me/roles`

**Description:** Fetch all custom roles in the organization.

**Required Permissions:** `org.view` (any authenticated user)

**Query Parameters:** None

**Request:**
```bash
GET /api/v1/orgs/me/roles
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "role_fin_mgr_001",
    "name": "Finance Manager",
    "description": "Manages financial reports and approvals",
    "permissions": [
      "report.create",
      "report.edit",
      "report.schedule",
      "report.export",
      "approval.view",
      "approval.decide",
      "dashboard.view_all",
      "org_system.view_finance",
      "ellinea.ask",
      "ellinea.recommend"
    ],
    "isActive": true,
    "createdBy": "user_owner_001",
    "createdAt": "2026-08-01T10:30:00Z",
    "updatedAt": "2026-08-01T10:30:00Z"
  },
  {
    "id": "role_it_op_001",
    "name": "IT Operator",
    "description": "System administrator and connector management",
    "permissions": [
      "connector.install",
      "connector.test",
      "connector.sync",
      "connector.configure_auth",
      "connector.autoscan",
      "org.manage_branches",
      "org.manage_departments",
      "settings.manage_webhooks",
      "settings.manage_api_keys"
    ],
    "isActive": true,
    "createdBy": "user_owner_001",
    "createdAt": "2026-08-01T11:00:00Z",
    "updatedAt": "2026-08-01T11:00:00Z"
  }
]
```

**Error Responses:**
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org member

---

### 2. Create Custom Role

**Endpoint:** `POST /orgs/me/roles`

**Description:** Create a new custom role with specified permissions.

**Required Permissions:** `org.edit_settings` (Owner or Admin only)

**Request Body:**
```json
{
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals with dashboard access",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend"
  ]
}
```

**Field Validation:**
- `name` — Required, 1–100 characters, unique within org
- `description` — Optional, 0–500 characters
- `permissions` — Required, array of valid permission strings
  - Must have at least 1 permission
  - All permissions must exist (see [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md))

**Request:**
```bash
POST /api/v1/orgs/me/roles
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Finance Manager",
  "description": "...",
  "permissions": [...]
}
```

**Response (201 Created):**
```json
{
  "id": "role_fin_mgr_001",
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals with dashboard access",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend"
  ],
  "isActive": true,
  "createdBy": "user_owner_001",
  "createdAt": "2026-08-01T10:30:00Z",
  "updatedAt": "2026-08-01T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request` — Invalid permission name, missing fields, name already exists
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 3. Get Role Details

**Endpoint:** `GET /orgs/me/roles/{id}`

**Description:** Fetch a specific custom role.

**Required Permissions:** `org.view`

**Path Parameters:**
- `id` — Role ID (e.g., `role_fin_mgr_001`)

**Request:**
```bash
GET /api/v1/orgs/me/roles/role_fin_mgr_001
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "id": "role_fin_mgr_001",
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend"
  ],
  "isActive": true,
  "createdBy": "user_owner_001",
  "createdAt": "2026-08-01T10:30:00Z",
  "updatedAt": "2026-08-01T10:30:00Z"
}
```

**Error Responses:**
- `404 Not Found` — Role does not exist
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org member

---

### 4. Update Custom Role

**Endpoint:** `PATCH /orgs/me/roles/{id}`

**Description:** Update role name, description, or permissions.

**Required Permissions:** `org.edit_settings` (Owner or Admin only)

**Path Parameters:**
- `id` — Role ID

**Request Body:**
```json
{
  "name": "Finance Manager (Updated)",
  "description": "Updated description",
  "permissions": [
    "report.create",
    "report.edit",
    "approval.view"
  ]
}
```

**All fields optional** — Only send fields to update

**Request:**
```bash
PATCH /api/v1/orgs/me/roles/role_fin_mgr_001
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule"
  ]
}
```

**Response (200 OK):**
```json
{
  "id": "role_fin_mgr_001",
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule"
  ],
  "isActive": true,
  "createdBy": "user_owner_001",
  "createdAt": "2026-08-01T10:30:00Z",
  "updatedAt": "2026-08-01T11:00:00Z"
}
```

**Note:** Changes apply immediately to all users with this role (up to 5-second cache TTL).

**Error Responses:**
- `400 Bad Request` — Invalid permission, empty permission set, duplicate name
- `404 Not Found` — Role not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 5. Delete Custom Role

**Endpoint:** `DELETE /orgs/me/roles/{id}`

**Description:** Delete a custom role. Users with this role lose it but keep org access.

**Required Permissions:** `org.edit_settings` (Owner or Admin only)

**Path Parameters:**
- `id` — Role ID

**Request:**
```bash
DELETE /api/v1/orgs/me/roles/role_fin_mgr_001
Authorization: Bearer <jwt>
```

**Response (204 No Content):**
```
(empty body)
```

**Side Effects:**
- Users assigned this role revert to their fixed role
- Audit log records deletion
- Cannot be undone (permanent)

**Error Responses:**
- `404 Not Found` — Role not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 6. Assign Role to User

**Endpoint:** `POST /orgs/me/custom-roles/assign`

**Description:** Assign a custom role to a user.

**Required Permissions:** `org.manage_members`

**Request Body:**
```json
{
  "userId": "user_john_001",
  "customRoleId": "role_fin_mgr_001"
}
```

**Request:**
```bash
POST /api/v1/orgs/me/custom-roles/assign
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "userId": "user_john_001",
  "customRoleId": "role_fin_mgr_001"
}
```

**Response (200 OK):**
```json
{
  "userId": "user_john_001",
  "customRoleId": "role_fin_mgr_001",
  "isActive": true,
  "createdAt": "2026-08-01T10:35:00Z"
}
```

**Note:** User immediately gains all permissions in the role (up to 5-second cache).

**Error Responses:**
- `404 Not Found` — User or role not found
- `400 Bad Request` — Invalid user/role IDs
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org member manager

---

### 7. Get User's Effective Permissions

**Endpoint:** `GET /orgs/me/permissions`

**Description:** Fetch the current user's effective permissions (including delegated and elevated).

**Required Permissions:** None (every user can check their own)

**Request:**
```bash
GET /api/v1/orgs/me/permissions
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "userId": "user_john_001",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "report.view_all",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend",
    "org.view",
    "events.view",
    "notifications.view"
  ],
  "effectiveRole": "custom:role_fin_mgr_001",
  "isElevated": false,
  "delegatedPermissions": [],
  "cacheValidUntil": "2026-08-01T10:45:00Z"
}
```

**Fields:**
- `userId` — Current user's ID
- `permissions` — Array of all permissions user can exercise
- `effectiveRole` — Current role (fixed or custom)
- `isElevated` — Whether user is temporarily elevated
- `delegatedPermissions` — Any delegated-to-me permissions (future feature)
- `cacheValidUntil` — When this cache expires (permission check will re-fetch)

**Use case:** Client code can check `permissions.includes('report.create')` to show/hide UI

**Error Responses:**
- `401 Unauthorized` — Not authenticated

---

### 8. Temporary Role Elevation

**Endpoint:** `POST /orgs/me/members/{userId}/elevate`

**Description:** Temporarily elevate a user to a higher role (e.g., member → admin for 2 hours).

**Required Permissions:** `org.manage_members` (Owner/Admin only)

**Path Parameters:**
- `userId` — User to elevate

**Request Body:**
```json
{
  "targetRole": "admin",
  "durationMinutes": 120,
  "reason": "Emergency database migration"
}
```

**Fields:**
- `targetRole` — Target role: `owner`, `admin`, `manager`, `member`, `viewer`, or custom role ID
- `durationMinutes` — How long (max 1440 = 24 hours)
- `reason` — Why (logged to audit trail)

**Request:**
```bash
POST /api/v1/orgs/me/members/user_john_001/elevate
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "targetRole": "admin",
  "durationMinutes": 120,
  "reason": "Emergency database migration"
}
```

**Response (200 OK):**
```json
{
  "id": "elev_abc123",
  "userId": "user_john_001",
  "fromRole": "member",
  "toRole": "admin",
  "reason": "Emergency database migration",
  "elevatedBy": "user_owner_001",
  "expiresAt": "2026-08-01T12:30:00Z",
  "createdAt": "2026-08-01T10:30:00Z"
}
```

**Note:**
- Audit log records elevation
- After `expiresAt`, user reverts to original role
- Can be manually revoked before expiry

**Error Responses:**
- `400 Bad Request` — Invalid target role, negative duration
- `404 Not Found` — User not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 9. Delegate Specific Permission

**Endpoint:** `POST /orgs/me/members/{userId}/delegate-permission`

**Description:** Delegate a specific permission to a user for a limited time.

**Required Permissions:** `org.manage_members`

**Path Parameters:**
- `userId` — User receiving delegation

**Request Body:**
```json
{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation"
}
```

**Fields:**
- `permission` — Permission to delegate (must be valid permission string)
- `expiresAt` — When delegation expires (ISO 8601)
- `reason` — Why (for audit trail)

**Request:**
```bash
POST /api/v1/orgs/me/members/user_finance_lead/delegate-permission
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation, deputizing for approvals"
}
```

**Response (200 OK):**
```json
{
  "id": "deleg_def456",
  "userId": "user_finance_lead",
  "permission": "approval.decide",
  "reason": "Manager on vacation, deputizing for approvals",
  "delegatedBy": "user_manager_001",
  "expiresAt": "2026-08-15T00:00:00Z",
  "createdAt": "2026-08-01T10:35:00Z"
}
```

**Note:**
- User can exercise delegated permission even without it in their base role
- After `expiresAt`, permission is revoked
- Logged to audit trail

**Error Responses:**
- `400 Bad Request` — Invalid permission, past expiry date
- `404 Not Found` — User not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org admin

---

## Error Responses

All endpoints return standard error responses:

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Invalid permission name: 'report.does_not_exist'",
  "error": "BadRequest"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Authorization required",
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Only Owner or Admin can manage custom roles",
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Role not found",
  "error": "NotFound"
}
```

### 409 Conflict
```json
{
  "statusCode": 409,
  "message": "Role name 'Finance Manager' already exists in this organization",
  "error": "Conflict"
}
```

---

## Rate Limiting

- **Per-user rate limit:** 100 requests / minute
- **Global rate limit:** 10,000 requests / minute
- **Response headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Caching

Permission checks are cached:
- **Client-side:** `localStorage` with 5-minute TTL
- **Server-side:** Redis cache with 5-second TTL
- **Cache invalidation:** Automatic on permission change or manual logout/login

---

## Examples

### Complete Workflow: Create and Assign Role

**1. Create role (Admin only)**
```bash
POST /api/v1/orgs/me/roles
{
  "name": "Finance Manager",
  "description": "Financial reports and approvals",
  "permissions": [
    "report.create",
    "report.edit",
    "approval.view",
    "approval.decide"
  ]
}
→ 201 Created: { id: "role_fin_001", ... }
```

**2. Assign to user (Admin)**
```bash
POST /api/v1/orgs/me/custom-roles/assign
{
  "userId": "user_jane_001",
  "customRoleId": "role_fin_001"
}
→ 200 OK: { userId: "user_jane_001", customRoleId: "role_fin_001" }
```

**3. User checks their permissions**
```bash
GET /api/v1/orgs/me/permissions (as user_jane_001)
→ 200 OK: { permissions: ["report.create", "report.edit", "approval.view", "approval.decide", ...] }
```

**4. Frontend checks permission before showing UI**
```typescript
const session = getSession();
if (session.permissions.includes('report.create')) {
  // Show "Create Report" button
}
```

**5. Admin revokes permission temporarily**
```bash
PATCH /api/v1/orgs/me/roles/role_fin_001
{
  "permissions": ["report.view_all", "approval.view"]  // Remove create/edit/decide
}
→ 200 OK: { permissions: ["report.view_all", "approval.view"] }
```

**6. User's next request has reduced permissions**
```bash
GET /api/v1/orgs/me/permissions
→ 200 OK: { permissions: ["report.view_all", "approval.view", ...] }
```

---

## SDK Integration

### JavaScript/TypeScript

```typescript
import { getSession } from '@/lib/api';

// Check permission client-side
const session = getSession();
if (session?.permissions.includes('report.create')) {
  // Show Create button
}

// Or call API
const perms = await fetch('/api/v1/orgs/me/permissions').then(r => r.json());
if (perms.permissions.includes('approval.decide')) {
  // Allow approval workflow
}
```

### NestJS (Backend)

```typescript
import { RbacService } from '@ellines-eip/identity';

constructor(private rbac: RbacService) {}

async canApprove(userId: string, orgId: string) {
  return this.rbac.canUserPerform(userId, orgId, 'approval.decide');
}
```

---

## Related

- [30_RBAC_Setup_Guide.md](./30_RBAC_Setup_Guide.md) — User guide for creating roles
- [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md) — Complete permission reference
- [29_Track_D_RBAC_Implementation.md](./29_Track_D_RBAC_Implementation.md) — Implementation details

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Status:** Production-ready
