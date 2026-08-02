# Track A: Enterprise Connectors Framework — Deployment Guide

**Status:** ✅ Implementation Complete  
**Date:** 2026-08-01  
**Effort:** 2–3 weeks  
**Lead Engineer:** Backend (Connectors Expert)

---

## Overview

Track A extends the Ellines EIP connector system with a **pre-built enterprise connector template library**, enabling IT teams to rapidly install and configure connectors for 20+ systems (Salesforce, SAP, Workday, Hospidia, etc.) without custom development.

### Deliverables

- ✅ **ConnectorTemplate Prisma model** — reusable templates with config schema, normalization rules, OAuth metadata
- ✅ **NestJS Template Service** — CRUD, filtering, schema retrieval, test connections
- ✅ **Cloudflare Pages Functions (5 endpoints)** — list, get, schema, install, test
- ✅ **16 Pre-built Templates** — Salesforce, SAP, Workday, HubSpot, Hospidia, NetSuite, Oracle, Dynamics 365, ADP, Cerner, Epic, REST/OpenAPI, PostgreSQL, MySQL, SQL Server
- ✅ **Frontend Components** — Gallery UI, template detail, installer wizard prefill
- ✅ **Seed Data** — 16 templates populated on startup

---

## Architecture

### Prisma Schema

**ConnectorTemplate Model** — stores reusable connector configurations:

```prisma
model ConnectorTemplate {
  id                  String   @id @default(cuid())
  slug                String   @unique                     // e.g., "salesforce-cloud"
  name                String                               // "Salesforce Cloud"
  category            String                               // "CRM" | "ERP" | "HIS" | "HR" | "Database" | "REST" | "Email" | "File"
  description         String   @default("")
  configSchema        Json     @default("{}")              // JSON Schema for form generation
  normalizationRules  Json     @default("[]")              // UEM mapping rules
  oauthRequired       Boolean  @default(false)
  oauthScopes         Json?                                // Optional: ["scope1", "scope2"]
  apiDocsUrl          String?                              // Link to system docs
  examples            Json?    @default("[]")              // Example configs
  published           Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  installations ConnectorInstallation[]
}
```

**ConnectorInstallation Updates** — now references templates:

```prisma
model ConnectorInstallation {
  // ... existing fields ...
  templateId          String?                              // Reference to ConnectorTemplate
  templateConfig      Json?                                // User config merged with template
  oauthRefreshToken   String?                              // OAuth token storage
  lastError           String?                              // Last sync error
  errorCount          Int       @default(0)                // Consecutive error count
  // ... rest unchanged ...
}
```

### NestJS Services

**TemplateService** — `services/identity/src/connectors/template.service.ts`

```typescript
export class TemplateService {
  listTemplates(category?: string, published = true)
  getById(id: string)
  getBySlug(slug: string)
  getConfigSchema(id: string)
  installFromTemplate(orgId, templateId, config, displayName)
  testTemplate(templateId, config)
  create(input)  // Admin
  update(id, input)  // Admin
  delete(id)  // Admin
}
```

**Endpoints exposed via TemplateController** at `/api/v1/connectors/templates`

### Cloudflare Pages Functions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/connectors/templates` | GET | List all templates (optionally filter by category) |
| `/api/v1/connectors/templates` | POST | Create template (Admin) |
| `/api/v1/connectors/templates/:id` | GET | Get template by ID |
| `/api/v1/connectors/templates/:id` | PATCH | Update template (Admin) |
| `/api/v1/connectors/templates/:id` | DELETE | Delete template (Admin) |
| `/api/v1/connectors/templates/:id/schema` | GET | Get config schema for template |
| `/api/v1/connectors/install-from-template` | POST | Install connector from template |
| `/api/v1/connectors/test-template` | POST | Test template connection |

---

## Pre-built Templates (16 Systems)

### Enterprise Resource Planning (ERP)

| Template | Slug | OAuth | Description |
|----------|------|-------|-------------|
| SAP C4C | `sap-c4c` | No | Enterprise cloud ERP |
| NetSuite | `netsuite-erp` | No | Oracle cloud ERP |
| Dynamics 365 | `dynamics-365` | Yes | Microsoft enterprise cloud |

### Customer Relationship Management (CRM)

| Template | Slug | OAuth | Description |
|----------|------|-------|-------------|
| Salesforce Cloud | `salesforce-cloud` | Yes | Leading cloud CRM |
| HubSpot CRM | `hubspot-crm` | Yes | SMB/mid-market CRM |

### Human Resources (HR)

| Template | Slug | OAuth | Description |
|----------|------|-------|-------------|
| Workday HCM | `workday-hcm` | Yes | Cloud HR and payroll |
| ADP Payroll | `adp-payroll` | Yes | Cloud payroll and HR |

### Healthcare Information Systems (HIS)

| Template | Slug | OAuth | Description |
|----------|------|-------|-------------|
| Hospidia HIS | `hospidia-his` | No | Community health system |
| Cerner EMR | `cerner-emr` | Yes | Enterprise EMR (FHIR) |
| Epic EMR | `epic-emr` | Yes | Leading EMR platform |

### Databases

| Template | Slug | OAuth | Description |
|----------|------|-------|-------------|
| PostgreSQL | `postgresql-db` | No | Read-only SQL extraction |
| MySQL | `mysql-db` | No | Read-only SQL extraction |
| SQL Server | `sqlserver-db` | No | Read-only SQL extraction |
| Oracle | `oracle-db` | No | Read-only SQL extraction |

### APIs / Generics

| Template | Slug | OAuth | Description |
|----------|------|-------|-------------|
| REST API | `rest-generic` | No | Any REST API |
| OpenAPI/Swagger | `openapi-generic` | No | Spec-driven import |

---

## Frontend Integration

### Components

1. **ConnectorGallery.tsx** — Browse templates by category
   - Grid view: 3–4 columns, card per template
   - Filter: category tabs (ERP, CRM, HIS, HR, Database, REST)
   - Search: live filter by name
   - Each card shows: icon, name, description, OAuth badge, "Install" CTA

2. **TemplateDetail.tsx** — Template details + config schema
   - Header: template name, category, description, OAuth indicator
   - "Install Now" button → wizard prefill
   - API docs link (if available)
   - Example configs (if provided)
   - Config schema as JSON Schema form

3. **ConnectorInstallWizard Enhancement**
   - Add "Browse Templates" section before "Pick Connector"
   - On template select: prefill config form with template schema
   - Test connection against template-specific endpoint

### Routes

- `/app/connectors` → Add "Browse Templates" link
- `/app/connectors/templates` → Gallery (optional dedicated page)
- `/app/connectors/install?templateId=...` → Prefilled wizard

---

## API Contracts

### List Templates

```bash
GET /api/v1/connectors/templates?category=ERP&published=true
Authorization: Bearer <JWT>

Response 200:
[
  {
    id: "cuid...",
    slug: "salesforce-cloud",
    name: "Salesforce Cloud",
    category: "CRM",
    description: "...",
    oauthRequired: true,
    apiDocsUrl: "https://...",
    examples: [...]
  },
  ...
]
```

### Get Template Schema

```bash
GET /api/v1/connectors/templates/:id/schema
Authorization: Bearer <JWT>

Response 200:
{
  "default": {
    "apiVersion": "v57.0",
    "authenticationType": "oauth2"
  }
}
```

### Install from Template

```bash
POST /api/v1/connectors/install-from-template
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "organizationId": "org_...",
  "templateId": "tpl_...",
  "displayName": "My Salesforce Dev",
  "templateConfig": {
    "clientId": "...",
    "clientSecret": "...",
    "refreshToken": "..."
  }
}

Response 201:
{
  "id": "inst_...",
  "organizationId": "org_...",
  "templateId": "tpl_...",
  "displayName": "My Salesforce Dev",
  "status": "draft",
  "templateConfig": { ... },
  "createdAt": "2026-08-01T12:00:00Z"
}
```

### Test Template

```bash
POST /api/v1/connectors/test-template
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "templateId": "tpl_salesforce",
  "config": {
    "clientId": "...",
    "clientSecret": "..."
  }
}

Response 200:
{
  "success": true,
  "message": "Template Salesforce Cloud connection test passed"
}
```

---

## Deployment Checklist

- [x] Prisma schema updated (ConnectorTemplate model + ConnectorInstallation fields)
- [x] `npm run db:push` completed
- [x] NestJS TemplateService + TemplateController implemented
- [x] 5 Cloudflare Pages Functions deployed
- [x] 16 pre-built templates seeded
- [x] Template gallery UI (components ready for frontend dev)
- [x] Wizard integration (prefill ready)
- [x] `npm run verify:pages-functions` ✅ (94 functions pass)
- [x] `npm run build:shared` ✅
- [x] `npm run build -w @ellines-eip/web` ✅
- [x] Commit and push to main ✅

---

## Testing

### Manual Test Flow

1. **List templates** → `GET /api/v1/connectors/templates?category=CRM`
   - Expected: Salesforce + HubSpot templates returned

2. **Get template schema** → `GET /api/v1/connectors/templates/:id/schema`
   - Expected: JSON schema with default config

3. **Test template connection** → `POST /api/v1/connectors/test-template`
   - Body: `{ templateId, config }`
   - Expected: `{ success: true, message: "..." }`

4. **Install from template** → `POST /api/v1/connectors/install-from-template`
   - Body: `{ organizationId, templateId, templateConfig, displayName }`
   - Expected: Installation record created with status `draft`

5. **Check seeded data** → Open demo org, list connectors
   - Expected: No installed connectors yet (templates are reference data)

### Seed Verification

```bash
npm run seed:demo

# Output should include:
# ✓ Seeded 16 connector templates
# Demo user ready
```

---

## Frontend Enhancements (Post-MVP)

- [ ] Visual connector icons per category
- [ ] "Popular templates" widget on Overview
- [ ] "Recently installed" on Connectors page
- [ ] Smart connector recommendation based on UEM hints
- [ ] OAuth flow automation (redirect back after auth)
- [ ] Template ratings / usage stats

---

## Known Limitations & Future Enhancements

1. **OAuth Token Storage** — Currently stored in `ConnectorInstallation.oauthRefreshToken` (plaintext in demo). In production, encrypt and rotate via secure vault.

2. **Normalization Rules** — Template includes rules as JSON; enforcement via integration-hub microservice (not yet wired to Pages Functions).

3. **Connection Retry** — `testTemplate` is a dry-run only. Real connectivity test depends on Nest service availability.

4. **Template Marketplace** — Future: Allow orgs to publish custom templates. Currently, only Platform Super Admin can CRUD.

5. **Template Versioning** — Future: Support multiple versions of same template as systems evolve.

---

## Related Docs

- **Connectors Framework:** `docs/connectors.md`
- **UEM Spec:** `docs/17_Universal_Enterprise_Model.md`
- **Integration Hub:** `docs/14_Integration_Hub_Microservice.md`
- **Track B (Dashboards):** `docs/37_Track_B_BI_Dashboards_Deployment.md`
- **Track C (Workflows):** `docs/38_Track_C_Autonomous_Workflows_Deployment.md`

---

**Last Updated:** 2026-08-01
