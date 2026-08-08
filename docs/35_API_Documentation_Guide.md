# Ellines EIP API Documentation Guide (B.3.3)

## Overview

The Ellines EIP API is fully documented using **OpenAPI 3.0** (Swagger) specification. Interactive API documentation is available at `/api/docs` with a built-in testing interface.

## Accessing API Documentation

### Local Development
```
http://localhost:3001/api/docs
```

### Production
```
https://eip.ellines.co.ke/api/docs
```

### From Web App
Navigate to `/api-docs` in the web application, which will redirect to the full Swagger UI.

## Authentication

All authenticated endpoints require a **JWT Bearer token** in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Getting a Token

**1. Register a new organization:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePassword123!",
  "fullName": "John Doe",
  "organizationName": "Acme Corp"
}
```

**2. Login:**
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h",
  "user": {
    "id": "usr_123",
    "email": "admin@example.com",
    "fullName": "John Doe",
    "role": "owner"
  },
  "organization": {
    "id": "org_abc",
    "name": "Acme Corp",
    "slug": "acme-corp"
  }
}
```

## Rate Limiting

All API requests are subject to rate limits based on your organization's tier:

| Tier | Requests/Day | Requests/Hour | Requests/Minute |
|------|-------------|---------------|-----------------|
| **Free** | 100 | 20 | 5 |
| **Starter** | 1,000 | 200 | 20 |
| **Professional** | 10,000 | 2,000 | 100 |
| **Enterprise** | 100,000 | 20,000 | 1,000 |

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9847
X-RateLimit-Reset: 2026-08-09T00:00:00Z
X-RateLimit-Tier: Professional
```

### Rate Limit Exceeded

When limits are exceeded, you'll receive a `429 Too Many Requests` response:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-08-09T00:00:00Z

{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Tier: Professional. Limit: 10000 requests. Try again in 3600 seconds.",
  "limit": 10000,
  "remaining": 0,
  "reset": "2026-08-09T00:00:00Z",
  "tier": "Professional"
}
```

## API Endpoints by Category

### Authentication
- `POST /api/v1/auth/register` - Register new organization
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/change-password` - Change password
- `GET /api/v1/auth/me` - Get current user

### Organizations
- `GET /api/v1/orgs/me` - Get organization profile
- `PATCH /api/v1/orgs/me` - Update organization
- `GET /api/v1/orgs/me/users` - List users
- `POST /api/v1/orgs/me/users` - Invite user
- `PATCH /api/v1/orgs/me/users/:id` - Update user
- `DELETE /api/v1/orgs/me/users/:id` - Delete user

### Connectors
- `GET /api/v1/connectors` - List connectors
- `GET /api/v1/connectors/installations` - List installations
- `POST /api/v1/connectors/installations` - Install connector
- `PATCH /api/v1/connectors/installations/:id` - Update installation
- `DELETE /api/v1/connectors/installations/:id` - Delete installation
- `POST /api/v1/connectors/installations/:id/test` - Test connection
- `POST /api/v1/connectors/installations/:id/sync` - Sync data

### Dashboards
- `GET /api/v1/orgs/me/dashboards` - List dashboards
- `POST /api/v1/orgs/me/dashboards` - Create dashboard
- `GET /api/v1/orgs/me/dashboards/:id` - Get dashboard
- `PATCH /api/v1/orgs/me/dashboards/:id` - Update dashboard
- `DELETE /api/v1/orgs/me/dashboards/:id` - Delete dashboard

### Workflows
- `GET /api/v1/orgs/me/approvals` - List approvals
- `POST /api/v1/orgs/me/approvals` - Create approval
- `POST /api/v1/orgs/me/approvals/:id/decide` - Decide on approval
- `GET /api/v1/orgs/me/rules` - List business rules
- `POST /api/v1/orgs/me/rules` - Create rule
- `GET /api/v1/orgs/me/reports` - List scheduled reports
- `POST /api/v1/orgs/me/reports` - Create report
- `POST /api/v1/orgs/me/reports/:id/run` - Run report

### Agents
- `GET /api/v1/orgs/me/agents` - List agents
- `POST /api/v1/orgs/me/agents` - Create agent
- `GET /api/v1/orgs/me/agents/:id` - Get agent
- `PATCH /api/v1/orgs/me/agents/:id` - Update agent
- `DELETE /api/v1/orgs/me/agents/:id` - Delete agent
- `POST /api/v1/orgs/me/agents/:id/execute` - Execute agent

### RBAC
- `GET /api/v1/orgs/me/custom-roles` - List custom roles
- `POST /api/v1/orgs/me/custom-roles` - Create custom role
- `GET /api/v1/orgs/me/custom-roles/:id` - Get custom role
- `PATCH /api/v1/orgs/me/custom-roles/:id` - Update custom role
- `DELETE /api/v1/orgs/me/custom-roles/:id` - Delete custom role
- `POST /api/v1/orgs/me/custom-roles/assign` - Assign role

### Rate Limits
- `GET /api/v1/rate-limits/tiers` - List rate limit tiers (public)
- `GET /api/v1/rate-limits/orgs/:orgId/tier` - Get organization tier
- `POST /api/v1/rate-limits/orgs/:orgId/tier` - Assign tier (platform admin)
- `GET /api/v1/rate-limits/orgs/:orgId/usage` - Get usage stats

### Ellinea AI
- `POST /api/v1/ellinea/ask` - Ask Ellinea a question
- `POST /api/v1/ellinea/brief` - Get executive brief
- `POST /api/v1/ellinea/recommend` - Get recommendations
- `GET /api/v1/orgs/me/ellinea-memory` - Get memory notes
- `PUT /api/v1/orgs/me/ellinea-memory` - Save memory notes

### Platform (Admin)
- `GET /api/v1/platform/orgs` - List all organizations
- `PATCH /api/v1/platform/orgs/:id` - Update organization
- `GET /api/v1/platform/flags` - Get feature flags

## Using the Interactive Documentation

### 1. Open Swagger UI
Navigate to `http://localhost:3001/api/docs`

### 2. Authorize
Click the **Authorize** button at the top right and enter your JWT token:
```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Try Endpoints
- Click any endpoint to expand it
- Click **Try it out**
- Fill in required parameters
- Click **Execute**
- View the response

### 4. View Models
Scroll down to see all request/response models (DTOs) with their schemas.

## Exporting the OpenAPI Spec

### JSON Format
```bash
curl http://localhost:3001/api/docs-json > openapi.json
```

### YAML Format
```bash
curl http://localhost:3001/api/docs-yaml > openapi.yaml
```

## Generating Client SDKs

Use the OpenAPI Generator to create client SDKs in any language:

### TypeScript/JavaScript
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g typescript-fetch \
  -o ./generated/typescript-client
```

### Python
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g python \
  -o ./generated/python-client
```

### Java
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g java \
  -o ./generated/java-client
```

### C#
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g csharp \
  -o ./generated/csharp-client
```

## Common Patterns

### Pagination
Most list endpoints support pagination:
```http
GET /api/v1/orgs/me/users?page=1&limit=50
```

### Filtering
```http
GET /api/v1/orgs/me/approvals?status=pending
```

### Sorting
```http
GET /api/v1/orgs/me/users?sortBy=createdAt&sortOrder=desc
```

### Search
```http
GET /api/v1/orgs/me/users?q=john
```

## Error Responses

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email must be a valid email address"
    }
  ]
}
```

### Common Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Webhooks

Configure webhooks to receive real-time events:

```http
POST /api/v1/orgs/me/webhook-secret
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/ellines",
  "events": ["connector.synced", "approval.created", "agent.executed"]
}
```

Webhook payloads include:
```json
{
  "event": "connector.synced",
  "organizationId": "org_abc",
  "timestamp": "2026-08-08T12:00:00Z",
  "data": {
    "connectorId": "conn_123",
    "status": "success",
    "recordCount": 150
  }
}
```

## Support

- **Documentation**: https://eip.ellines.co.ke/api/docs
- **Email**: ellines.tech@gmail.com
- **GitHub**: https://github.com/EllinesTech/Ellines-EIP

## Changelog

### v2.0.0 (2026-08-08)
- Added rate limiting with 4 tiers
- Added Swagger/OpenAPI documentation
- Added bulk data export
- Enhanced RBAC with custom roles
- Added autonomous AI agents

### v1.0.0 (2026-08-01)
- Initial release
- Authentication and authorization
- Connector framework
- Ellinea AI integration
- Workflow automation
