# Ellines EIP API Quick Reference

**Base URL (Local):** `http://localhost:3100/api/v1`  
**Base URL (Production):** `https://eip.ellines.co.ke/api/v1`

---

## Authentication

```bash
# Login
curl -X POST /api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}'

# Returns: { "accessToken": "eyJhbGc..." }

# Use token in subsequent requests
Authorization: Bearer eyJhbGc...
```

---

## Platform Super Admin (Quick Reference)

### List All Organizations
```bash
GET /api/v1/platform/orgs
Authorization: Bearer <admin-jwt>

Response:
[
  {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "userCount": 25,
    "status": "active",
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

### Suspend Organization
```bash
PATCH /api/v1/platform/orgs/:id
Content-Type: application/json
Authorization: Bearer <admin-jwt>

{ "status": "suspended" }
```

### Activate Organization
```bash
PATCH /api/v1/platform/orgs/:id
Content-Type: application/json
Authorization: Bearer <admin-jwt>

{ "status": "active" }
```

### View Feature Flags
```bash
GET /api/v1/platform/flags
Authorization: Bearer <admin-jwt>

Response:
{
  "flags": {
    "ellinea_ai_enabled": true,
    "multi_org_enabled": true,
    "sso_enabled": true
  }
}
```

---

## Organizations

```bash
# Get current org
GET /api/v1/orgs/me

# Get org settings
GET /api/v1/orgs/me/settings

# Update org settings
PATCH /api/v1/orgs/me/settings
{ "timezone": "Africa/Nairobi" }

# List my organizations
GET /api/v1/orgs/my-orgs

# Switch organization
POST /api/v1/orgs/switch
{ "organizationId": "org_002" }
```

---

## Users & Members

```bash
# List org members
GET /api/v1/orgs/me/users

# Invite user
POST /api/v1/orgs/me/users
{
  "email": "new@example.com",
  "name": "New User",
  "role": "member"
}

# Update user role
PATCH /api/v1/orgs/me/users/:userId
{ "role": "manager" }
```

---

## RBAC & Permissions

```bash
# List custom roles
GET /api/v1/orgs/me/roles

# Create custom role
POST /api/v1/orgs/me/roles
{
  "name": "Finance Manager",
  "permissions": ["report.create", "approval.decide"]
}

# Get my permissions
GET /api/v1/orgs/me/permissions

# Assign role to user
POST /api/v1/orgs/me/custom-roles/assign
{
  "userId": "user_003",
  "customRoleId": "role_001"
}
```

---

## Connectors

```bash
# List connector templates
GET /api/v1/connectors/templates

# Get template details
GET /api/v1/connectors/templates/:id

# Install connector
POST /api/v1/connectors/install-from-template
{
  "organizationId": "org_001",
  "templateId": "tmpl_sql_001",
  "displayName": "Production DB",
  "templateConfig": { "host": "db.example.com", ... }
}

# List installed connectors
GET /api/v1/orgs/me/connectors/installations

# Sync connector
POST /api/v1/orgs/me/connectors/:id/sync
```

---

## Dashboards

```bash
# List dashboards
GET /api/v1/dashboards

# Create dashboard
POST /api/v1/dashboards
{
  "organizationId": "org_001",
  "name": "Sales Dashboard",
  "createdBy": "user_001"
}

# Get dashboard
GET /api/v1/dashboards/:id

# Add widget
POST /api/v1/dashboards/:id/widgets
{
  "organizationId": "org_001",
  "type": "chart",
  "title": "Monthly Sales"
}
```

---

## Workflows & Approvals

```bash
# List pending approvals
GET /api/v1/orgs/me/approvals

# Approve/reject
POST /api/v1/orgs/me/approvals/:id/decide
{
  "decision": "approved",
  "comment": "Approved for Q3 budget"
}

# List workflow rules
GET /api/v1/workflows/rules

# Create rule
POST /api/v1/workflows/rules
{
  "name": "Auto-approve small purchases",
  "trigger": "approval.created",
  "condition": "amount < 1000",
  "action": "auto_approve"
}
```

---

## Ellinea AI

```bash
# Ask question
POST /api/v1/ellinea/ask
{
  "question": "What is our cash position?",
  "role": "ceo",
  "organizationName": "Acme Corp"
}

# Get daily brief
POST /api/v1/ellinea/brief
{
  "role": "ceo",
  "organizationName": "Acme Corp"
}

# Get recommendations
POST /api/v1/ellinea/recommend
{
  "role": "ceo"
}

# Get memory
GET /api/v1/orgs/me/ellinea-memory

# Update memory
PUT /api/v1/orgs/me/ellinea-memory
[
  { "id": "note_001", "title": "Q3 Strategy", "body": "..." }
]
```

---

## Notifications

```bash
# List notifications
GET /api/v1/orgs/me/notifications

# Mark as read
PATCH /api/v1/orgs/me/notifications/:id/read

# Subscribe to push
POST /api/v1/notifications/push-subscription
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." }
}

# Get notify policy
GET /api/v1/orgs/me/notify-policy

# Update notify policy
PUT /api/v1/orgs/me/notify-policy
{
  "emailEnabled": true,
  "pushEnabled": true
}
```

---

## Webhooks

```bash
# Get webhook secret
GET /api/v1/orgs/me/webhook-secret

# Rotate secret
POST /api/v1/orgs/me/webhook-secret

# Receive webhook (external)
POST /api/v1/webhooks/inbound
X-EIP-Signature: <hmac-signature>

{
  "event": "invoice.created",
  "data": { "invoiceId": "INV-001" }
}
```

---

## Audit & Monitoring

```bash
# List audit logs
GET /api/v1/orgs/me/audit-logs?limit=50

# Platform health
GET /api/v1/health

# Alert correlations
GET /api/v1/orgs/me/alert-correlations
```

---

## API Keys

```bash
# List API keys
GET /api/v1/orgs/me/api-keys

# Create API key
POST /api/v1/orgs/me/api-keys
{
  "name": "Integration Key",
  "expiresInDays": 365
}

# Revoke API key
DELETE /api/v1/orgs/me/api-keys
{ "id": "key_002" }
```

---

## Documents

```bash
# List documents
GET /api/v1/orgs/me/documents

# Upload document
POST /api/v1/orgs/me/documents
{
  "name": "Policy Manual.pdf",
  "mimeType": "application/pdf",
  "content": "base64_encoded_content...",
  "tags": ["policy", "hr"]
}

# Delete document
DELETE /api/v1/orgs/me/documents
{ "id": "doc_002" }
```

---

## Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Server Error |

---

## Environment Variables

```bash
# Platform Admin
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,super@ellines.co.ke

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase (if using)
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# JWT
JWT_SECRET=your-secret-key

# Email (optional)
RESEND_API_KEY=re_...
# or
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Push Notifications (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@ellines.co.ke
```

---

## TypeScript SDK Usage

```typescript
import { EIPClient } from '@ellines-eip/client';

const client = new EIPClient({
  baseUrl: 'https://eip.ellines.co.ke/api/v1',
  accessToken: 'eyJhbGc...'
});

// Platform admin operations
const orgs = await client.platform.listOrgs();
await client.platform.suspendOrg('org_001');

// Organization operations
const myOrg = await client.orgs.getMyOrg();
const users = await client.orgs.listUsers();

// RBAC operations
const roles = await client.rbac.listRoles();
const permissions = await client.rbac.getMyPermissions();

// Ellinea AI
const answer = await client.ellinea.ask({
  question: 'What is our revenue trend?',
  role: 'ceo'
});
```

---

## Rate Limits

- **Per User:** 100 req/min
- **Per Org:** 1,000 req/min
- **Platform:** 10,000 req/min

**Headers:**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Complete Documentation

For full details, see:
- [33_Complete_API_Reference.md](./33_Complete_API_Reference.md) — Full API documentation
- [34_Super_Admin_Dashboard_Spec.md](./34_Super_Admin_Dashboard_Spec.md) — Super admin dashboard spec
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — RBAC detailed docs

