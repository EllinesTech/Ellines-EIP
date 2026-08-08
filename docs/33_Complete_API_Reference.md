# Ellines EIP — Complete API Reference

**Version:** v1.0  
**Date:** August 8, 2026  
**Base URL (local):** `http://localhost:3100/api/v1`  
**Base URL (production):** `https://eip.ellines.co.ke/api/v1`  
**Authentication:** Bearer JWT in `Authorization` header

---

## Table of Contents

1. [System Health & Info](#1-system-health--info)
2. [Authentication](#2-authentication)
3. [Organization Management](#3-organization-management)
4. [Platform Super Admin](#4-platform-super-admin)
5. [Users & Members](#5-users--members)
6. [RBAC & Permissions](#6-rbac--permissions)
7. [Connectors](#7-connectors)
8. [Dashboards](#8-dashboards)
9. [Workflows & Approvals](#9-workflows--approvals)
10. [Ellinea AI](#10-ellinea-ai)
11. [Enterprise Data](#11-enterprise-data)
12. [Notifications](#12-notifications)
13. [Webhooks](#13-webhooks)
14. [Audit Logs](#14-audit-logs)

---

## 1. System Health & Info

### GET `/health`

**Description:** Service health check

**Authentication:** None (public)

**Request:**
```bash
GET /api/v1/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "ellines-eip-pages",
  "version": "1.0.0",
  "ts": "2026-08-08T10:00:00.000Z",
  "uptimeSeconds": 3600,
  "email": {
    "provider": "smtp",
    "live": true
  }
}
```

---


## 2. Authentication

### POST `/auth/register`

**Description:** Register new organization with owner account

**Authentication:** None

**Request Body:**
```json
{
  "organizationName": "Acme Corp",
  "organizationSlug": "acme-corp",
  "ownerName": "John Doe",
  "ownerEmail": "john@acme.com",
  "password": "SecurePass123!"
}
```

**Response (201 Created):**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "user_001",
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "owner",
    "organizationId": "org_001"
  },
  "organization": {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp"
  }
}
```

---

### POST `/auth/login`

**Description:** Login with email and password

**Authentication:** None

**Request Body:**
```json
{
  "email": "john@acme.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "user_001",
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "owner",
    "organizationId": "org_001"
  }
}
```

---

### GET `/auth/me`

**Description:** Get current user info

**Authentication:** Required

**Request:**
```bash
GET /api/v1/auth/me
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "id": "user_001",
  "name": "John Doe",
  "email": "john@acme.com",
  "role": "owner",
  "organizationId": "org_001",
  "organizationName": "Acme Corp",
  "createdAt": "2026-08-01T10:00:00Z"
}
```

---

### PATCH `/auth/me`

**Description:** Update user profile

**Authentication:** Required

**Request Body:**
```json
{
  "name": "John A. Doe"
}
```

**Response (200 OK):**
```json
{
  "id": "user_001",
  "name": "John A. Doe",
  "email": "john@acme.com",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### POST `/auth/forgot-password`

**Description:** Request password reset email

**Authentication:** None

**Request Body:**
```json
{
  "email": "john@acme.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset email sent if account exists"
}
```

---

### POST `/auth/reset-password`

**Description:** Reset password with token

**Authentication:** None

**Request Body:**
```json
{
  "token": "reset_token_123",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successful"
}
```

---

### POST `/auth/change-password`

**Description:** Change password (authenticated user)

**Authentication:** Required

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

**Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

---

## 3. Organization Management

### GET `/orgs/me`

**Description:** Get current organization info

**Authentication:** Required

**Request:**
```bash
GET /api/v1/orgs/me
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "id": "org_001",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "createdAt": "2026-08-01T10:00:00Z",
  "settings": {
    "timezone": "Africa/Nairobi",
    "dateFormat": "DD/MM/YYYY",
    "timeFormat": "24h"
  }
}
```

---

### GET `/orgs/me/settings`

**Description:** Get org date/time settings

**Authentication:** Required

**Response (200 OK):**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "fiscalYearStart": "01-01"
}
```

---

### PATCH `/orgs/me/settings`

**Description:** Update org settings

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY"
}
```

**Response (200 OK):**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/status`

**Description:** Get organization status

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "active",
  "userCount": 25,
  "connectorCount": 8,
  "lastSyncAt": "2026-08-08T09:45:00Z"
}
```

---

### GET `/orgs/my-orgs`

**Description:** List all orgs user belongs to (multi-org support)

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "role": "owner"
  },
  {
    "id": "org_002",
    "name": "Subsidiary Inc",
    "slug": "subsidiary",
    "role": "admin"
  }
]
```

---

### POST `/orgs/switch`

**Description:** Switch to different organization

**Authentication:** Required

**Request Body:**
```json
{
  "organizationId": "org_002"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGc...",
  "organizationId": "org_002",
  "organizationName": "Subsidiary Inc"
}
```

---

## 4. Platform Super Admin

> **Note:** These endpoints require Platform Admin email to be in `PLATFORM_ADMIN_EMAILS` environment variable

### GET `/platform/orgs`

**Description:** List all organizations (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Request:**
```bash
GET /api/v1/platform/orgs
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "createdAt": "2026-08-01T10:00:00Z",
    "userCount": 25,
    "status": "active"
  },
  {
    "id": "org_002",
    "name": "Beta Corp",
    "slug": "beta-corp",
    "createdAt": "2026-08-02T11:00:00Z",
    "userCount": 12,
    "status": "suspended"
  }
]
```

---

### PATCH `/platform/orgs/:id`

**Description:** Update organization status (suspend/activate)

**Authentication:** Required (Platform Admin)

**Path Parameters:**
- `id` — Organization ID

**Request Body:**
```json
{
  "status": "suspended"
}
```

**Valid status values:** `active`, `suspended`

**Response (200 OK):**
```json
{
  "id": "org_002",
  "status": "suspended",
  "updatedAt": "2026-08-08T10:00:00Z",
  "updatedBy": "admin@platform.com"
}
```

---

### GET `/platform/orgs/:id/settings`

**Description:** Get org settings (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Response (200 OK):**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "status": "active"
}
```

---

### PATCH `/platform/orgs/:id/settings`

**Description:** Update org settings (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Request Body:**
```json
{
  "timezone": "UTC",
  "status": "active"
}
```

**Response (200 OK):**
```json
{
  "timezone": "UTC",
  "dateFormat": "DD/MM/YYYY",
  "status": "active",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/platform/flags`

**Description:** List platform feature flags

**Authentication:** Required (Platform Admin)

**Response (200 OK):**
```json
{
  "flags": {
    "ellinea_ai_enabled": true,
    "multi_org_enabled": true,
    "sso_enabled": true,
    "api_gateway_enabled": false
  }
}
```

---

### GET `/platform/connector-packs`

**Description:** List all connector packs (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Response (200 OK):**
```json
[
  {
    "id": "pack_001",
    "slug": "erp-suite",
    "name": "ERP Suite Pack",
    "description": "Full ERP integration pack",
    "templateCount": 5,
    "published": true
  }
]
```

---

### POST `/platform/connector-packs`

**Description:** Create new connector pack (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Request Body:**
```json
{
  "slug": "accounting-pack",
  "name": "Accounting Pack",
  "description": "Accounting systems integration",
  "catalogId": "cat_001",
  "published": false
}
```

**Response (201 Created):**
```json
{
  "id": "pack_002",
  "slug": "accounting-pack",
  "name": "Accounting Pack",
  "description": "Accounting systems integration",
  "published": false,
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 5. Users & Members

### GET `/orgs/me/users`

**Description:** List organization members

**Authentication:** Required (Owner/Admin)

**Request:**
```bash
GET /api/v1/orgs/me/users
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "user_001",
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "owner",
    "status": "active",
    "createdAt": "2026-08-01T10:00:00Z"
  },
  {
    "id": "user_002",
    "name": "Jane Smith",
    "email": "jane@acme.com",
    "role": "manager",
    "status": "active",
    "createdAt": "2026-08-02T11:00:00Z"
  }
]
```

---

### POST `/orgs/me/users`

**Description:** Invite user to organization

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "email": "newuser@acme.com",
  "name": "New User",
  "role": "member"
}
```

**Valid roles:** `admin`, `manager`, `member`, `viewer`

**Response (201 Created):**
```json
{
  "id": "user_003",
  "email": "newuser@acme.com",
  "name": "New User",
  "role": "member",
  "status": "invited",
  "invitedAt": "2026-08-08T10:00:00Z"
}
```

---

### PATCH `/orgs/me/users/:userId`

**Description:** Update user role or status

**Authentication:** Required (Owner/Admin)

**Path Parameters:**
- `userId` — User ID to update

**Request Body:**
```json
{
  "role": "manager"
}
```

**Response (200 OK):**
```json
{
  "id": "user_003",
  "role": "manager",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/branches`

**Description:** List organization branches

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "branch_001",
    "name": "Nairobi HQ",
    "location": "Nairobi, Kenya",
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/orgs/me/branches`

**Description:** Create new branch

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Mombasa Office",
  "location": "Mombasa, Kenya"
}
```

**Response (201 Created):**
```json
{
  "id": "branch_002",
  "name": "Mombasa Office",
  "location": "Mombasa, Kenya",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/departments`

**Description:** List organization departments

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "dept_001",
    "name": "Finance",
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/orgs/me/departments`

**Description:** Create new department

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Operations"
}
```

**Response (201 Created):**
```json
{
  "id": "dept_002",
  "name": "Operations",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 6. RBAC & Permissions

> **See also:** [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) for detailed RBAC documentation

### GET `/orgs/me/roles`

**Description:** List all custom roles

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "role_001",
    "name": "Finance Manager",
    "description": "Manages financial reports and approvals",
    "permissions": [
      "report.create",
      "report.edit",
      "approval.view",
      "approval.decide"
    ],
    "isActive": true,
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/orgs/me/roles`

**Description:** Create custom role

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "IT Operator",
  "description": "System administrator",
  "permissions": [
    "connector.install",
    "connector.test",
    "connector.sync"
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "role_002",
  "name": "IT Operator",
  "permissions": ["connector.install", "connector.test", "connector.sync"],
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/permissions`

**Description:** Get current user's effective permissions

**Authentication:** Required

**Response (200 OK):**
```json
{
  "userId": "user_001",
  "permissions": [
    "org.view",
    "org.edit_settings",
    "report.create",
    "approval.decide",
    "connector.install"
  ],
  "effectiveRole": "owner",
  "isElevated": false
}
```

---

### POST `/orgs/me/custom-roles/assign`

**Description:** Assign custom role to user

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "userId": "user_003",
  "customRoleId": "role_001"
}
```

**Response (200 OK):**
```json
{
  "userId": "user_003",
  "customRoleId": "role_001",
  "isActive": true,
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 7. Connectors

### GET `/api/v1/connectors/templates`

**Description:** List available connector templates

**Authentication:** Required

**Query Parameters:**
- `category` (optional) — Filter by category

**Request:**
```bash
GET /api/v1/connectors/templates?category=ERP
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "tmpl_erp_001",
    "name": "SAP ERP Connector",
    "category": "ERP",
    "description": "Connect to SAP ERP systems",
    "version": "1.0.0"
  },
  {
    "id": "tmpl_sql_001",
    "name": "SQL Database",
    "category": "Database",
    "description": "Generic SQL database connector",
    "version": "1.0.0"
  }
]
```

---

### GET `/api/v1/connectors/templates/:id`

**Description:** Get connector template details

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "tmpl_sql_001",
  "name": "SQL Database",
  "category": "Database",
  "description": "Generic SQL database connector",
  "configSchema": {
    "host": { "type": "string", "required": true },
    "port": { "type": "number", "default": 5432 },
    "database": { "type": "string", "required": true },
    "username": { "type": "string", "required": true },
    "password": { "type": "string", "required": true, "secure": true }
  },
  "version": "1.0.0"
}
```

---

### POST `/api/v1/connectors/install-from-template`

**Description:** Install connector from template

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "organizationId": "org_001",
  "templateId": "tmpl_sql_001",
  "displayName": "Production Database",
  "templateConfig": {
    "host": "db.acme.com",
    "port": 5432,
    "database": "production",
    "username": "eip_user",
    "password": "encrypted_pass"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "conn_001",
  "name": "Production Database",
  "templateId": "tmpl_sql_001",
  "status": "connected",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/api/v1/orgs/me/connectors/installations`

**Description:** List installed connectors

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "conn_001",
    "name": "Production Database",
    "templateId": "tmpl_sql_001",
    "status": "connected",
    "lastSyncAt": "2026-08-08T09:45:00Z"
  }
]
```

---

### POST `/api/v1/orgs/me/connectors/[id]/sync`

**Description:** Trigger connector sync

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "conn_001",
  "syncStartedAt": "2026-08-08T10:00:00Z",
  "status": "syncing"
}
```

---

### POST `/api/v1/connectors/test-template`

**Description:** Test connector configuration

**Authentication:** Required

**Request Body:**
```json
{
  "templateId": "tmpl_sql_001",
  "config": {
    "host": "db.acme.com",
    "port": 5432,
    "database": "production",
    "username": "eip_user",
    "password": "test_pass"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Connection successful",
  "latencyMs": 45
}
```

---

## 8. Dashboards

### GET `/api/v1/dashboards`

**Description:** List all dashboards

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "dash_001",
    "name": "Executive Dashboard",
    "description": "CEO overview",
    "widgetCount": 8,
    "isPublic": false,
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/api/v1/dashboards`

**Description:** Create new dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "organizationId": "org_001",
  "name": "Sales Dashboard",
  "description": "Sales metrics and KPIs",
  "layout": [],
  "refreshRate": 300,
  "isPublic": false,
  "createdBy": "user_001"
}
```

**Response (201 Created):**
```json
{
  "id": "dash_002",
  "name": "Sales Dashboard",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/api/v1/dashboards/:id`

**Description:** Get dashboard details

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "dash_001",
  "name": "Executive Dashboard",
  "description": "CEO overview",
  "layout": [
    {
      "widgetId": "widget_001",
      "position": { "x": 0, "y": 0, "w": 6, "h": 4 }
    }
  ],
  "widgets": [
    {
      "id": "widget_001",
      "type": "metric",
      "title": "Total Revenue",
      "config": { "metric": "revenue", "format": "currency" }
    }
  ]
}
```

---

### PATCH `/api/v1/dashboards/:id`

**Description:** Update dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Executive Dashboard v2",
  "description": "Updated overview"
}
```

**Response (200 OK):**
```json
{
  "id": "dash_001",
  "name": "Executive Dashboard v2",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### DELETE `/api/v1/dashboards/:id`

**Description:** Delete dashboard

**Authentication:** Required

**Response (204 No Content)**

---

### POST `/api/v1/dashboards/:id/widgets`

**Description:** Add widget to dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "organizationId": "org_001",
  "type": "chart",
  "title": "Monthly Sales",
  "config": {
    "chartType": "line",
    "dataSource": "conn_001"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "widget_002",
  "type": "chart",
  "title": "Monthly Sales",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 9. Workflows & Approvals

### GET `/api/v1/orgs/me/approvals`

**Description:** List pending approvals

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "appr_001",
    "type": "purchase_order",
    "title": "Purchase Order #12345",
    "amount": 5000,
    "currency": "KES",
    "requestedBy": "user_002",
    "requestedAt": "2026-08-08T09:00:00Z",
    "status": "pending"
  }
]
```

---

### POST `/api/v1/orgs/me/approvals/:id/decide`

**Description:** Approve or reject request

**Authentication:** Required (with approval.decide permission)

**Request Body:**
```json
{
  "decision": "approved",
  "comment": "Approved for Q3 budget"
}
```

**Valid decisions:** `approved`, `rejected`

**Response (200 OK):**
```json
{
  "id": "appr_001",
  "status": "approved",
  "decidedBy": "user_001",
  "decidedAt": "2026-08-08T10:00:00Z",
  "comment": "Approved for Q3 budget"
}
```

---

### GET `/api/v1/workflows/rules`

**Description:** List workflow automation rules

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "rule_001",
    "name": "Auto-approve small purchases",
    "trigger": "approval.created",
    "condition": "amount < 1000",
    "action": "auto_approve",
    "isActive": true
  }
]
```

---

### POST `/api/v1/workflows/rules`

**Description:** Create workflow rule

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Notify finance on large purchases",
  "trigger": "approval.created",
  "condition": "amount > 10000",
  "action": "send_notification",
  "config": {
    "recipients": ["finance@acme.com"]
  }
}
```

**Response (201 Created):**
```json
{
  "id": "rule_002",
  "name": "Notify finance on large purchases",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 10. Ellinea AI

> **See also:** [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md) for detailed Ellinea AI documentation

### POST `/api/v1/ellinea/ask`

**Description:** Ask Ellinea AI a question

**Authentication:** Required

**Request Body:**
```json
{
  "question": "What is our current cash position?",
  "summary": {
    "status": "synced",
    "healthScore": 85,
    "openAlerts": 2,
    "connectedSystems": 8
  },
  "role": "ceo",
  "organizationName": "Acme Corp"
}
```

**Response (200 OK):**
```json
{
  "answer": "Your current cash position is KES 2.5M as of today...",
  "mode": "template+rag",
  "grounding": "Based on Financial Connector sync at 09:45 today",
  "recommendations": [
    {
      "id": "rec_001",
      "title": "Review pending invoices",
      "priority": "medium"
    }
  ]
}
```

---

### POST `/api/v1/ellinea/brief`

**Description:** Get daily brief for user role

**Authentication:** Required

**Request Body:**
```json
{
  "summary": {
    "status": "synced",
    "healthScore": 85
  },
  "role": "ceo",
  "organizationName": "Acme Corp"
}
```

**Response (200 OK):**
```json
{
  "brief": "Good morning. Here's your daily brief for Acme Corp..."
}
```

---

### POST `/api/v1/ellinea/recommend`

**Description:** Get AI recommendations

**Authentication:** Required

**Request Body:**
```json
{
  "summary": {
    "status": "synced",
    "healthScore": 85,
    "openAlerts": 2
  },
  "role": "ceo"
}
```

**Response (200 OK):**
```json
{
  "recommendations": [
    {
      "id": "rec_001",
      "title": "Address cash flow alerts",
      "priority": "high",
      "detail": "2 cash flow alerts require attention"
    }
  ]
}
```

---

### GET `/api/v1/orgs/me/ellinea-memory`

**Description:** Get organization's Ellinea memory notes

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "note_001",
    "title": "Q3 Strategy",
    "body": "Focus on customer retention...",
    "updatedAt": "2026-08-07T15:00:00Z"
  }
]
```

---

### PUT `/api/v1/orgs/me/ellinea-memory`

**Description:** Update Ellinea memory notes

**Authentication:** Required

**Request Body:**
```json
[
  {
    "id": "note_001",
    "title": "Q3 Strategy",
    "body": "Updated strategy..."
  }
]
```

**Response (200 OK):**
```json
{
  "message": "Memory updated",
  "count": 1
}
```

---

## 11. Enterprise Data

### POST `/api/v1/enterprise/ingest`

**Description:** Ingest enterprise data snapshot

**Authentication:** Required

**Request Body:**
```json
{
  "connectorId": "conn_001",
  "data": {
    "customers": [...],
    "transactions": [...]
  },
  "timestamp": "2026-08-08T10:00:00Z"
}
```

**Response (200 OK):**
```json
{
  "ingested": true,
  "recordCount": 1500,
  "timestamp": "2026-08-08T10:00:00Z"
}
```

---

### GET `/api/v1/enterprise/summary`

**Description:** Get enterprise data summary

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "synced",
  "healthScore": 85,
  "openAlerts": 2,
  "openDecisions": 5,
  "connectedSystems": 8,
  "syncedAt": "2026-08-08T09:45:00Z"
}
```

---

## 12. Notifications

### GET `/api/v1/orgs/me/notifications`

**Description:** List user notifications

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "notif_001",
    "type": "approval_request",
    "title": "Approval needed: Purchase Order #12345",
    "body": "John Doe requests approval for KES 5,000",
    "read": false,
    "createdAt": "2026-08-08T09:00:00Z"
  }
]
```

---

### PATCH `/api/v1/orgs/me/notifications/:id/read`

**Description:** Mark notification as read

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "notif_001",
  "read": true,
  "readAt": "2026-08-08T10:00:00Z"
}
```

---

### POST `/api/v1/notifications/push-subscription`

**Description:** Subscribe to push notifications

**Authentication:** Required

**Request Body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

**Response (200 OK):**
```json
{
  "subscribed": true
}
```

---

### GET `/api/v1/orgs/me/notify-policy`

**Description:** Get notification policy

**Authentication:** Required

**Response (200 OK):**
```json
{
  "emailEnabled": true,
  "pushEnabled": true,
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

---

### PUT `/api/v1/orgs/me/notify-policy`

**Description:** Update notification policy

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "emailEnabled": true,
  "pushEnabled": true,
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

**Response (200 OK):**
```json
{
  "message": "Notification policy updated"
}
```

---

## 13. Webhooks

### GET `/api/v1/orgs/me/webhook-secret`

**Description:** Get webhook signing secret

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "secret": "whsec_abc123...",
  "createdAt": "2026-08-01T10:00:00Z"
}
```

---

### POST `/api/v1/orgs/me/webhook-secret`

**Description:** Rotate webhook secret

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "secret": "whsec_xyz789...",
  "createdAt": "2026-08-08T10:00:00Z",
  "rotatedBy": "user_001"
}
```

---

### POST `/api/v1/webhooks/inbound`

**Description:** Receive inbound webhook (from external systems)

**Authentication:** Webhook signature verification

**Headers:**
- `X-EIP-Signature` — HMAC signature

**Request Body:**
```json
{
  "event": "invoice.created",
  "data": {
    "invoiceId": "INV-001",
    "amount": 5000,
    "currency": "KES"
  }
}
```

**Response (200 OK):**
```json
{
  "received": true,
  "eventId": "evt_001"
}
```

---

## 14. Audit Logs

### GET `/api/v1/orgs/me/audit-logs`

**Description:** List audit logs

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) — Number of logs to return (default: 80)

**Request:**
```bash
GET /api/v1/orgs/me/audit-logs?limit=50
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "log_001",
    "action": "user.invited",
    "actor": "user_001",
    "actorEmail": "john@acme.com",
    "target": "user_003",
    "targetEmail": "newuser@acme.com",
    "metadata": {
      "role": "member"
    },
    "timestamp": "2026-08-08T10:00:00Z",
    "ipAddress": "192.168.1.1"
  }
]
```

---

## 15. API Keys

### GET `/api/v1/orgs/me/api-keys`

**Description:** List organization API keys

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
[
  {
    "id": "key_001",
    "name": "Production API Key",
    "prefix": "eip_live_abc",
    "createdBy": "user_001",
    "createdAt": "2026-08-01T10:00:00Z",
    "expiresAt": "2027-08-01T10:00:00Z",
    "lastUsedAt": "2026-08-08T09:30:00Z"
  }
]
```

---

### POST `/api/v1/orgs/me/api-keys`

**Description:** Create new API key

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Integration Key",
  "expiresInDays": 365
}
```

**Response (201 Created):**
```json
{
  "id": "key_002",
  "name": "Integration Key",
  "key": "eip_live_xyz123...",
  "createdAt": "2026-08-08T10:00:00Z",
  "expiresAt": "2027-08-08T10:00:00Z"
}
```

> **Note:** The full `key` value is only shown once at creation time.

---

### DELETE `/api/v1/orgs/me/api-keys`

**Description:** Revoke API key

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "id": "key_002"
}
```

**Response (200 OK):**
```json
{
  "message": "API key revoked",
  "revokedAt": "2026-08-08T10:00:00Z"
}
```

---

## 16. Documents & Knowledge

### GET `/api/v1/orgs/me/documents`

**Description:** List organization documents

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "doc_001",
    "name": "Q3 Budget.xlsx",
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size": 45120,
    "tags": ["finance", "budget"],
    "uploadedBy": "user_001",
    "uploadedAt": "2026-08-07T14:00:00Z",
    "branch": "Nairobi HQ",
    "department": "Finance"
  }
]
```

---

### POST `/api/v1/orgs/me/documents`

**Description:** Upload document

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Policy Manual.pdf",
  "mimeType": "application/pdf",
  "content": "base64_encoded_content...",
  "tags": ["policy", "hr"],
  "branch": "Nairobi HQ",
  "department": "HR",
  "summary": "Updated employee policy manual"
}
```

**Response (201 Created):**
```json
{
  "id": "doc_002",
  "name": "Policy Manual.pdf",
  "size": 102400,
  "uploadedAt": "2026-08-08T10:00:00Z"
}
```

---

### DELETE `/api/v1/orgs/me/documents`

**Description:** Delete document

**Authentication:** Required (Owner/Admin or document owner)

**Request Body:**
```json
{
  "id": "doc_002"
}
```

**Response (200 OK):**
```json
{
  "message": "Document deleted",
  "deletedAt": "2026-08-08T10:00:00Z"
}
```

---

## 17. Reports

### GET `/api/v1/orgs/me/reports`

**Description:** List scheduled reports

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "report_001",
    "name": "Weekly Financial Summary",
    "schedule": "0 9 * * MON",
    "recipients": ["finance@acme.com"],
    "format": "pdf",
    "lastRunAt": "2026-08-05T09:00:00Z",
    "nextRunAt": "2026-08-12T09:00:00Z"
  }
]
```

---

### POST `/api/v1/orgs/me/reports`

**Description:** Create scheduled report

**Authentication:** Required (with report.schedule permission)

**Request Body:**
```json
{
  "name": "Monthly Sales Report",
  "schedule": "0 8 1 * *",
  "recipients": ["sales@acme.com"],
  "format": "excel",
  "dashboardId": "dash_002"
}
```

**Response (201 Created):**
```json
{
  "id": "report_002",
  "name": "Monthly Sales Report",
  "schedule": "0 8 1 * *",
  "nextRunAt": "2026-09-01T08:00:00Z",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 18. Alert Correlations

### GET `/api/v1/orgs/me/alert-correlations`

**Description:** Get real-time alert correlation analysis

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "correlations": [
    {
      "id": "corr_001",
      "pattern": "cash_flow_decline",
      "alerts": ["alert_001", "alert_003"],
      "severity": "high",
      "recommendation": "Review AR aging and collections",
      "detectedAt": "2026-08-08T09:30:00Z"
    }
  ],
  "totalAlerts": 5,
  "correlatedAlerts": 2
}
```

---

## 19. Learning & Training

### GET `/api/v1/orgs/me/ellinea-learning`

**Description:** Get Ellinea learning data

**Authentication:** Required

**Response (200 OK):**
```json
{
  "insights": [
    {
      "topic": "cash_flow",
      "learned": "Peak collections on Fridays",
      "confidence": 0.85
    }
  ],
  "lastUpdated": "2026-08-08T09:00:00Z"
}
```

---

### PUT `/api/v1/orgs/me/ellinea-learning`

**Description:** Update Ellinea learning data

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "insights": [
    {
      "topic": "inventory",
      "learned": "Reorder threshold: 100 units",
      "confidence": 0.9
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "message": "Learning data updated",
  "insightCount": 1
}
```

---

## 20. Database Configuration

### GET `/api/v1/orgs/me/database-config`

**Description:** Get organization database configuration

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "type": "postgresql",
  "host": "db.acme.com",
  "port": 5432,
  "database": "acme_prod",
  "schema": "public",
  "connectionPoolSize": 10,
  "configured": true
}
```

---

### POST `/api/v1/orgs/me/database-config`

**Description:** Configure organization database

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "type": "postgresql",
  "host": "db.acme.com",
  "port": 5432,
  "database": "acme_prod",
  "username": "eip_user",
  "password": "secure_password",
  "schema": "public"
}
```

**Response (200 OK):**
```json
{
  "message": "Database configuration saved",
  "testConnection": true
}
```

---

## Common Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request succeeded with no response body |
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated but not authorized for this action |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Resource conflict (e.g., duplicate name) |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

---

## Error Response Format

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Invalid request body: missing required field 'email'",
  "error": "BadRequest",
  "timestamp": "2026-08-08T10:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

---

## Authentication

### Bearer Token

All authenticated endpoints require a JWT token in the Authorization header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key

Some endpoints support API key authentication:

```bash
X-API-Key: eip_live_abc123...
```

### Token Expiration

- JWT tokens expire after 24 hours
- Refresh tokens are not yet implemented (planned for v1.1)
- API keys expire based on configured expiration (default: 365 days)

---

## Rate Limiting

| Tier | Requests per minute | Requests per hour |
|------|---------------------|-------------------|
| Per User | 100 | 5,000 |
| Per Organization | 1,000 | 50,000 |
| Per IP Address | 300 | 15,000 |
| Platform Global | 10,000 | 500,000 |

**Response Headers:**
- `X-RateLimit-Limit` — Maximum requests allowed
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — Unix timestamp when limit resets

---

## Pagination

List endpoints support pagination using query parameters:

**Query Parameters:**
- `page` — Page number (default: 1)
- `limit` — Items per page (default: 20, max: 100)
- `sort` — Sort field (e.g., `createdAt`)
- `order` — Sort order: `asc` or `desc` (default: `desc`)

**Example:**
```bash
GET /api/v1/orgs/me/users?page=2&limit=50&sort=createdAt&order=asc
```

**Response with Pagination:**
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 150,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": true
  }
}
```

---

## Filtering

Some endpoints support filtering:

**Example:**
```bash
GET /api/v1/orgs/me/users?role=admin&status=active
GET /api/v1/orgs/me/documents?tags=finance,budget&department=Finance
```

---

## Webhooks

### Webhook Events

EIP can send webhooks for these events:

| Event | Trigger |
|-------|---------|
| `org.created` | New organization registered |
| `user.invited` | User invited to organization |
| `user.joined` | User accepted invite |
| `user.role_changed` | User role updated |
| `connector.installed` | Connector installed |
| `connector.synced` | Connector sync completed |
| `connector.error` | Connector sync failed |
| `approval.created` | Approval request created |
| `approval.decided` | Approval decided |
| `dashboard.created` | Dashboard created |
| `alert.triggered` | Alert condition met |
| `report.generated` | Scheduled report generated |

### Webhook Payload Format

```json
{
  "event": "approval.created",
  "timestamp": "2026-08-08T10:00:00Z",
  "organizationId": "org_001",
  "data": {
    "approvalId": "appr_001",
    "type": "purchase_order",
    "amount": 5000,
    "requestedBy": "user_002"
  }
}
```

### Webhook Signature Verification

Webhooks include `X-EIP-Signature` header with HMAC-SHA256 signature:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}
```

---

## SDK Usage Examples

### JavaScript/TypeScript

```typescript
// Initialize client
import { EIPClient } from '@ellines-eip/client';

const client = new EIPClient({
  baseUrl: 'https://eip.ellines.co.ke/api/v1',
  accessToken: 'eyJhbGc...'
});

// Get current user
const user = await client.auth.me();

// List organizations
const orgs = await client.platform.listOrgs();

// Create custom role
const role = await client.rbac.createRole({
  name: 'Finance Manager',
  permissions: ['report.create', 'approval.decide']
});

// Ask Ellinea AI
const answer = await client.ellinea.ask({
  question: 'What is our cash position?',
  role: 'ceo'
});
```

### Python

```python
from ellines_eip import EIPClient

client = EIPClient(
    base_url='https://eip.ellines.co.ke/api/v1',
    access_token='eyJhbGc...'
)

# Get current user
user = client.auth.me()

# List connectors
connectors = client.connectors.list_templates()

# Create dashboard
dashboard = client.dashboards.create({
    'name': 'Sales Dashboard',
    'description': 'Sales KPIs'
})
```

### cURL

```bash
# Login
curl -X POST https://eip.ellines.co.ke/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@acme.com","password":"SecurePass123!"}'

# Get organizations (Platform Admin)
curl -X GET https://eip.ellines.co.ke/api/v1/platform/orgs \
  -H "Authorization: Bearer eyJhbGc..."

# Create approval
curl -X POST https://eip.ellines.co.ke/api/v1/orgs/me/approvals \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{"type":"purchase_order","amount":5000,"title":"Office Supplies"}'
```

---

## Super Admin Dashboard API Summary

The following endpoints are specifically relevant for the **Platform Super Admin Dashboard**:

### Core Super Admin Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/platform/orgs` | List all organizations |
| `PATCH` | `/platform/orgs/:id` | Suspend/activate organization |
| `GET` | `/platform/orgs/:id/settings` | View org settings |
| `PATCH` | `/platform/orgs/:id/settings` | Update org settings |
| `GET` | `/platform/flags` | View feature flags |
| `GET` | `/platform/connector-packs` | List connector packs |
| `POST` | `/platform/connector-packs` | Create connector pack |

### Monitoring & Analytics

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | System health check |
| `GET` | `/orgs/me/audit-logs` | View audit logs (per org) |
| `GET` | `/orgs/me/alert-correlations` | Alert correlation analysis |

---

## Super Admin Dashboard Features

The Super Admin Dashboard should expose:

### 1. Organization Management
- View all organizations with status, user count, creation date
- Suspend/activate organizations
- View org settings (timezone, formats)
- Update org settings if needed
- View per-org statistics (users, connectors, data volume)

### 2. Platform Health
- System uptime and health status
- Email provider status
- Service versions
- API response times
- Error rates

### 3. Feature Flags
- View current feature flag states
- Toggle feature flags (future enhancement)

### 4. Connector Packs
- View all published connector packs
- Create new connector packs
- View pack usage statistics

### 5. User Analytics (Future)
- Total users across all orgs
- Active users by time period
- User growth trends
- Role distribution

### 6. Usage Metrics (Future)
- API call volume by endpoint
- Data storage per organization
- Connector sync frequency
- Most used features

### 7. Audit Trail
- Platform-level actions (org created, suspended)
- Admin actions across organizations
- Security events
- System configuration changes

---

## Implementation Notes

### Platform Admin Authentication

Platform Admins are identified by email in the `PLATFORM_ADMIN_EMAILS` environment variable:

```bash
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,superadmin@ellines.co.ke
```

The backend validates:
```typescript
import { isPlatformAdminEmail, parsePlatformAdminEmails } from '@ellines-eip/shared';

const allowlist = parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
if (!isPlatformAdminEmail(userEmail, allowlist)) {
  throw new ForbiddenException('Platform admin only');
}
```

### Accessing the Super Admin Dashboard

1. Login with a platform admin email
2. Navigate to `/app/super-admin` (route to be implemented)
3. Dashboard will call platform endpoints with your JWT token
4. Backend validates your email against `PLATFORM_ADMIN_EMAILS`

---

## API Versioning

Current version: **v1**

Base path: `/api/v1`

Future versions will be available at:
- `/api/v2` (when v2 is released)
- `/api/v3` (when v3 is released)

Version 1 will be supported for at least 12 months after v2 release.

---

## CORS Configuration

CORS is enabled for:
- `http://localhost:3100` (development)
- `https://eip.ellines.co.ke` (production)
- `https://*.ellines.co.ke` (subdomains)

Allowed methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`

Allowed headers: `Authorization`, `Content-Type`, `X-API-Key`

---

## Security Best Practices

### For API Consumers

1. **Store tokens securely**
   - Use secure storage (not localStorage for sensitive apps)
   - Never commit tokens to version control
   - Rotate tokens regularly

2. **Validate responses**
   - Check status codes
   - Validate response schema
   - Handle errors gracefully

3. **Use HTTPS**
   - Always use HTTPS in production
   - Never send tokens over HTTP

4. **Implement rate limiting**
   - Respect rate limit headers
   - Implement exponential backoff on 429 responses

5. **Verify webhooks**
   - Always verify webhook signatures
   - Validate event payloads
   - Use timing-safe comparison

### For Platform Admins

1. **Secure admin emails**
   - Use strong passwords
   - Enable 2FA (when available)
   - Limit number of platform admins

2. **Monitor platform access**
   - Review audit logs regularly
   - Watch for suspicious activity
   - Set up alerts for critical actions

3. **Rotate secrets**
   - Rotate webhook secrets regularly
   - Rotate API keys periodically
   - Update admin email list as needed

---

## Testing the API

### Local Development

```bash
# Start services
npm run dev:identity  # Port 3001
npm run dev:web       # Port 3100

# Health check
curl http://localhost:3100/api/v1/health

# Register test org
curl -X POST http://localhost:3100/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test Corp",
    "organizationSlug": "test-corp",
    "ownerName": "Test User",
    "ownerEmail": "test@example.com",
    "password": "TestPass123!"
  }'
```

### Production Testing

```bash
# Health check
curl https://eip.ellines.co.ke/api/v1/health

# Login
curl -X POST https://eip.ellines.co.ke/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"YourPassword"}'
```

### Postman Collection

A Postman collection is available at `docs/postman/EIP_API_v1.postman_collection.json` (to be created).

---

## Changelog

### v1.0.0 (August 8, 2026)

**Initial Release**

- Authentication & Authorization (JWT)
- Organization Management
- Platform Super Admin APIs
- User & Member Management
- RBAC & Custom Roles
- Connector Management
- Dashboard APIs
- Workflow & Approval APIs
- Ellinea AI Integration
- Webhook Support
- Audit Logging
- API Key Management
- Document Storage

---

## Support & Documentation

### Related Documentation

- [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md) — Ellinea AI API details
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — RBAC API complete reference
- [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md) — Permission definitions
- [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md) — Product scope
- [03_Master_Blueprint.md](./03_Master_Blueprint.md) — Architecture overview

### Getting Help

- **Issues:** Report bugs via GitHub Issues
- **Questions:** Contact support@ellines.co.ke
- **Documentation:** https://docs.ellines.co.ke
- **Status Page:** https://status.ellines.co.ke (planned)

---

**Document Version:** 1.0.0  
**Last Updated:** August 8, 2026  
**Status:** Production Ready  
**Maintainer:** Ellines Tech Platform Team

