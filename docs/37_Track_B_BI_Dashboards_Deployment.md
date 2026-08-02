# Track B: BI Dashboards (Custom KPI Builder) — Deployment Guide

**Status:** ✅ Implementation Complete  
**Date:** 2026-08-01  
**Effort:** 2–3 weeks  
**Lead Engineer:** Frontend (UI/Designer)

---

## Overview

Track B introduces **drag-and-drop dashboard builder** for IT and business users to create custom KPI dashboards, monitor real-time metrics, set alerts, and export reports on a schedule.

### Deliverables

- ✅ **Prisma Models** — Dashboard, Widget, Alert, DashboardExport
- ✅ **NestJS Dashboard Service** — CRUD for dashboards, widgets, alerts, exports
- ✅ **Cloudflare Pages Functions (6 endpoints)** — dashboard CRUD, widget CRUD, alert CRUD, exports
- ✅ **Frontend Components** — Dashboard list, editor, widget palette, alert config
- ✅ **5 Widget Types** — Gauge, KPI, Line chart, Bar chart, Table
- ✅ **Export & Scheduling** — PDF/CSV export with optional email scheduling
- ✅ **Seed Data** — Sample dashboard with 3 widgets

---

## Architecture

### Prisma Schema

**Dashboard Model** — top-level dashboard entity:

```prisma
model Dashboard {
  id              String   @id @default(cuid())
  organizationId  String   @map("organization_id")
  name            String
  description     String   @default("")
  layout          Json     @default("[]")                  // Grid layout metadata
  refreshRate     Int      @default(300)                   // Seconds between auto-refresh
  isPublic        Boolean  @default(false)
  createdBy       String   @map("created_by")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  widgets      Widget[]
  exports      DashboardExport[]
}
```

**Widget Model** — individual chart/metric on dashboard:

```prisma
model Widget {
  id              String   @id @default(cuid())
  dashboardId     String   @map("dashboard_id")
  type            String                                   // "gauge" | "kpi" | "line" | "bar" | "table"
  title           String
  config          Json     @default("{}")                  // Widget-specific config
  position        Int                                      // Grid order / position
  size            Json     @default("{\"w\":2,\"h\":2}")   // Width & height in grid units
  dataSourceId    String?  @map("data_source_id")         // Optional reference to connector/query
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  dashboard Dashboard @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
  alerts    Alert[]
}
```

**Alert Model** — threshold-based alerts on widgets:

```prisma
model Alert {
  id              String   @id @default(cuid())
  widgetId        String   @map("widget_id")
  condition       String                                   // "gt" | "lt" | "eq" | "gte" | "lte"
  threshold       Float
  actions         Json     @default("[]")                  // [{ type: "email" | "webhook" | "notification", recipient: "..." }]
  active          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  widget Widget @relation(fields: [widgetId], references: [id], onDelete: Cascade)
}
```

**DashboardExport Model** — scheduled exports:

```prisma
model DashboardExport {
  id              String    @id @default(cuid())
  dashboardId     String    @map("dashboard_id")
  format          String                                   // "pdf" | "csv" | "excel"
  schedule        String?                                  // Cron expression (null = manual only)
  lastRun         DateTime? @map("last_run")
  nextRun         DateTime? @map("next_run")
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  dashboard Dashboard @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
}
```

### NestJS Services

**DashboardService** — `services/identity/src/dashboards/dashboard.service.ts`

```typescript
export class DashboardService {
  listDashboards(organizationId: string)
  getDashboard(id: string, organizationId: string)
  createDashboard(organizationId, input, createdBy)
  updateDashboard(id, organizationId, input)
  deleteDashboard(id, organizationId)
  
  // Widget CRUD
  addWidget(dashboardId, organizationId, input)
  updateWidget(widgetId, dashboardId, organizationId, input)
  deleteWidget(widgetId, dashboardId, organizationId)
  
  // Alert CRUD
  addAlert(widgetId, dashboardId, organizationId, input)
  updateAlert(alertId, dashboardId, organizationId, input)
  deleteAlert(alertId, dashboardId, organizationId)
  
  // Export
  exportDashboard(dashboardId, organizationId, format, schedule?)
  getExports(dashboardId, organizationId)
  deleteExport(exportId, dashboardId, organizationId)
}
```

### Cloudflare Pages Functions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/dashboards` | GET | List dashboards for org |
| `/api/v1/dashboards` | POST | Create dashboard |
| `/api/v1/dashboards/:id` | GET | Get dashboard by ID |
| `/api/v1/dashboards/:id` | PATCH | Update dashboard |
| `/api/v1/dashboards/:id` | DELETE | Delete dashboard |
| `/api/v1/dashboards/:id/widgets` | POST | Add widget |
| `/api/v1/dashboards/:id/alerts` | POST | Add alert |
| `/api/v1/dashboards/:id/export` | POST | Export dashboard |

---

## Widget Types

### 1. KPI (Key Performance Indicator)

Displays a single metric with optional trend indicator:

```json
{
  "type": "kpi",
  "title": "Revenue (MTD)",
  "config": {
    "metric": "revenue_mtd",
    "currency": "USD",
    "showTrend": true,
    "trendPeriod": "month-over-month"
  }
}
```

### 2. Gauge

Circular gauge with threshold zones:

```json
{
  "type": "gauge",
  "title": "Health Score",
  "config": {
    "min": 0,
    "max": 100,
    "greenZone": [80, 100],
    "yellowZone": [60, 80],
    "redZone": [0, 60],
    "metric": "health_score"
  }
}
```

### 3. Line Chart

Time-series line chart:

```json
{
  "type": "line",
  "title": "Revenue Trend",
  "config": {
    "period": "12m",
    "metrics": ["revenue", "cost"],
    "aggregate": "sum",
    "xAxis": "date",
    "yAxis": "amount"
  }
}
```

### 4. Bar Chart

Categorical bar chart:

```json
{
  "type": "bar",
  "title": "Sales by Region",
  "config": {
    "dimension": "region",
    "metric": "sales",
    "topN": 10,
    "sort": "desc"
  }
}
```

### 5. Table

Tabular data view:

```json
{
  "type": "table",
  "title": "Recent Transactions",
  "config": {
    "columns": ["date", "description", "amount", "status"],
    "pageSize": 20,
    "sortBy": "date",
    "filterable": true
  }
}
```

---

## Frontend Components

### Pages

1. **/app/dashboards** — Dashboard list
   - List view: card per dashboard
   - Create button → modal with name/description
   - Search and filter by name
   - Recent dashboards (5 most recent)

2. **/app/dashboards/[id]/view** — Read-only dashboard
   - Displays widgets in layout
   - Real-time refresh (configurable interval)
   - Export button → PDF/CSV

3. **/app/dashboards/[id]/editor** — Drag-drop builder
   - Left panel: widget palette + add button
   - Main area: grid canvas with existing widgets
   - Widget properties panel (right)
   - Drag to reorder/resize widgets
   - Save/Cancel buttons

### Components

1. **DashboardList.tsx** — Table/grid of dashboards
2. **DashboardEditor.tsx** — Main builder interface
3. **WidgetPalette.tsx** — Draggable widget types (5 types)
4. **WidgetCard.tsx** — Rendered widget on canvas
5. **WidgetConfig.tsx** — Properties editor for widget
6. **AlertConfig.tsx** — Alert threshold UI
7. **ExportDialog.tsx** — Format + schedule options

---

## API Contracts

### Create Dashboard

```bash
POST /api/v1/dashboards
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "organizationId": "org_...",
  "name": "Executive Overview",
  "description": "Real-time business metrics",
  "layout": [],
  "refreshRate": 60,
  "isPublic": false,
  "createdBy": "user_..."
}

Response 201:
{
  "id": "dash_...",
  "organizationId": "org_...",
  "name": "Executive Overview",
  "layout": [],
  "refreshRate": 60,
  "isPublic": false,
  "createdBy": "user_...",
  "createdAt": "2026-08-01T12:00:00Z",
  "updatedAt": "2026-08-01T12:00:00Z",
  "widgets": [],
  "exports": []
}
```

### Add Widget

```bash
POST /api/v1/dashboards/:id/widgets
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "organizationId": "org_...",
  "type": "kpi",
  "title": "Revenue (MTD)",
  "config": {
    "metric": "revenue_mtd",
    "currency": "USD"
  },
  "position": 0,
  "size": { "w": 2, "h": 1 }
}

Response 201:
{
  "id": "wgt_...",
  "dashboardId": "dash_...",
  "type": "kpi",
  "title": "Revenue (MTD)",
  "config": { ... },
  "position": 0,
  "size": { "w": 2, "h": 1 },
  "createdAt": "2026-08-01T12:00:00Z"
}
```

### Add Alert

```bash
POST /api/v1/dashboards/:id/alerts
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "organizationId": "org_...",
  "widgetId": "wgt_...",
  "condition": "gt",
  "threshold": 100000,
  "actions": [
    { "type": "email", "recipient": "owner@org.com" },
    { "type": "webhook", "url": "https://..." }
  ],
  "active": true
}

Response 201:
{
  "id": "alt_...",
  "widgetId": "wgt_...",
  "condition": "gt",
  "threshold": 100000,
  "actions": [ ... ],
  "active": true,
  "createdAt": "2026-08-01T12:00:00Z"
}
```

### Export Dashboard

```bash
POST /api/v1/dashboards/:id/export
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "organizationId": "org_...",
  "format": "pdf",
  "schedule": "0 8 * * MON"  // Every Monday at 8 AM (optional)
}

Response 201:
{
  "id": "exp_...",
  "dashboardId": "dash_...",
  "format": "pdf",
  "schedule": "0 8 * * MON",
  "lastRun": null,
  "nextRun": "2026-08-05T08:00:00Z",
  "createdAt": "2026-08-01T12:00:00Z"
}
```

---

## Deployment Checklist

- [x] Prisma schema updated (Dashboard, Widget, Alert, DashboardExport models)
- [x] `npm run db:push` completed
- [x] NestJS DashboardService + DashboardController implemented
- [x] 6 Cloudflare Pages Functions deployed
- [x] Sample dashboard seeded with 3 widgets
- [x] Frontend component scaffolds ready
- [x] Widget types defined (5 types)
- [x] `npm run verify:pages-functions` ✅ (94 functions pass)
- [x] `npm run build:shared` ✅
- [x] `npm run build -w @ellines-eip/web` ✅
- [x] Commit and push to main ✅

---

## Testing

### Manual Test Flow

1. **Create dashboard** → `POST /api/v1/dashboards`
   - Expected: Dashboard created with status 201

2. **Add widget** → `POST /api/v1/dashboards/:id/widgets`
   - Body: `{ type: "kpi", title: "Revenue", config: {...} }`
   - Expected: Widget added to dashboard

3. **Add alert** → `POST /api/v1/dashboards/:id/alerts`
   - Body: `{ widgetId, condition: "gt", threshold: 100000 }`
   - Expected: Alert created

4. **Get dashboard** → `GET /api/v1/dashboards/:id`
   - Expected: Full dashboard with widgets and alerts

5. **Update widget** → `PATCH /api/v1/dashboards/:id/widgets/:wid`
   - Expected: Widget properties updated

6. **Export dashboard** → `POST /api/v1/dashboards/:id/export`
   - Body: `{ format: "pdf", schedule: "..." }`
   - Expected: Export record created

### Seed Verification

```bash
npm run seed:demo

# Output should include:
# ✓ Seeded sample dashboards
# Sample dashboard created with ID
```

---

## Frontend Enhancements (Post-MVP)

- [ ] Real-time data binding (WebSocket for live metrics)
- [ ] Connector data source selection (pick which connector feeds metric)
- [ ] Custom calculated metrics (formulas)
- [ ] Dashboard sharing & permissions
- [ ] Embedded dashboards (iframe)
- [ ] Mobile-optimized dashboard view
- [ ] Dark mode dashboard
- [ ] Widget refresh rate per widget
- [ ] Data cache strategy

---

## Known Limitations & Future Enhancements

1. **Data Source** — `dataSourceId` is a placeholder. Real data binding depends on metrics service (not yet implemented).

2. **Export Scheduling** — Cron expressions stored but scheduling engine in integration-hub (not yet wired).

3. **Alerts Execution** — Alert definitions created but execution/notification depends on rules engine (Track C).

4. **Real-time Updates** — Current design is polling-based. Future: WebSocket for true real-time.

5. **Dashboard Permissions** — Currently creator has full access. Future: share with roles/users.

---

## Related Docs

- **Track A (Connectors):** `docs/36_Track_A_Enterprise_Connectors_Deployment.md`
- **Track C (Workflows):** `docs/38_Track_C_Autonomous_Workflows_Deployment.md`
- **Business Rules:** `docs/21_v1.1_Autonomous_Workflows.md`

---

**Last Updated:** 2026-08-01
