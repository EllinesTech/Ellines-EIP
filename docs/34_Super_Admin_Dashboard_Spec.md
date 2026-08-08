# Super Admin Dashboard Specification

**Version:** 1.0  
**Date:** August 8, 2026  
**Route:** `/app/super-admin`  
**Access:** Platform Admin only (email in `PLATFORM_ADMIN_EMAILS`)

---

## Overview

The Super Admin Dashboard provides platform operators with centralized control and visibility across all organizations using Ellines EIP.

---

## Authentication & Access

### Environment Configuration

```bash
# .env
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,superadmin@ellines.co.ke
```

### Access Check

```typescript
// Client-side route guard
import { useSession } from '@/lib/api';

export default function SuperAdminPage() {
  const session = useSession();
  
  // Check if user is platform admin
  const isPlatformAdmin = session?.isPlatformAdmin || false;
  
  if (!isPlatformAdmin) {
    return <AccessDenied />;
  }
  
  return <SuperAdminDashboard />;
}
```

### Backend Validation

All platform endpoints validate the JWT user email against `PLATFORM_ADMIN_EMAILS`:

```typescript
import { isPlatformAdminEmail, parsePlatformAdminEmails } from '@ellines-eip/shared';

const allowlist = parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
if (!isPlatformAdminEmail(userEmail, allowlist)) {
  throw new ForbiddenException('Platform admin only');
}
```

---

## Dashboard Sections

### 1. Overview / Stats

**API:** Multiple endpoints

**Displays:**
- Total organizations
- Total users across all orgs
- Active organizations (status: "active")
- Suspended organizations (status: "suspended")
- System health status
- Email provider status
- Service uptime

**API Calls:**
```typescript
const orgs = await fetch('/api/v1/platform/orgs');
const health = await fetch('/api/v1/health');
```

---

### 2. Organizations List

**API:** `GET /api/v1/platform/orgs`

**Features:**
- Sortable table of all organizations
- Search/filter by name or slug
- Status indicator (active/suspended)
- User count per org
- Creation date
- Quick actions (view details, suspend/activate)

**Columns:**
- Organization Name
- Slug
- Status (badge: green for active, red for suspended)
- Users
- Created Date
- Actions

**Example Component:**
```typescript
import { useState, useEffect } from 'react';

export function OrganizationsList() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch('/api/v1/platform/orgs', {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(data => {
        setOrgs(data);
        setLoading(false);
      });
  }, []);
  
  return (
    <table>
      <thead>
        <tr>
          <th>Organization</th>
          <th>Status</th>
          <th>Users</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orgs.map(org => (
          <tr key={org.id}>
            <td>
              <div>{org.name}</div>
              <div className="text-sm text-gray-500">{org.slug}</div>
            </td>
            <td>
              <StatusBadge status={org.status} />
            </td>
            <td>{org.userCount}</td>
            <td>{formatDate(org.createdAt)}</td>
            <td>
              <button onClick={() => viewOrgDetails(org.id)}>
                View
              </button>
              <button onClick={() => toggleOrgStatus(org.id, org.status)}>
                {org.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

### 3. Organization Details Modal/Page

**API:** 
- `GET /api/v1/platform/orgs/:id/settings`
- `PATCH /api/v1/platform/orgs/:id` (for status changes)
- `PATCH /api/v1/platform/orgs/:id/settings` (for settings)

**Displays:**
- Organization info (name, slug, ID)
- Current status
- Settings (timezone, date format, time format)
- User count
- Creation date
- Last activity

**Actions:**
- Suspend/Activate organization
- View/edit settings
- View audit logs (future)

**Example:**
```typescript
function OrgDetailsModal({ orgId, onClose }) {
  const [org, setOrg] = useState(null);
  const [settings, setSettings] = useState(null);
  
  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/platform/orgs/${orgId}/settings`),
    ]).then(([settingsRes]) => {
      setSettings(settingsRes.json());
    });
  }, [orgId]);
  
  const toggleStatus = async () => {
    const newStatus = org.status === 'active' ? 'suspended' : 'active';
    await fetch(`/api/v1/platform/orgs/${orgId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    // Refresh org data
  };
  
  return (
    <Modal onClose={onClose}>
      <h2>{org?.name}</h2>
      <div>Status: <StatusBadge status={org?.status} /></div>
      <div>Users: {org?.userCount}</div>
      <div>Timezone: {settings?.timezone}</div>
      
      <button onClick={toggleStatus}>
        {org?.status === 'active' ? 'Suspend Org' : 'Activate Org'}
      </button>
    </Modal>
  );
}
```

---

### 4. Platform Health

**API:** `GET /api/v1/health`

**Displays:**
- Service status (OK/Error)
- Service version
- Uptime
- Email provider status
- Last check timestamp

**Example:**
```typescript
function PlatformHealth() {
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    const checkHealth = () => {
      fetch('/api/v1/health')
        .then(r => r.json())
        .then(setHealth);
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="health-panel">
      <h3>Platform Health</h3>
      <div>
        Status: <StatusIndicator status={health?.status} />
      </div>
      <div>Version: {health?.version}</div>
      <div>Uptime: {formatUptime(health?.uptimeSeconds)}</div>
      <div>
        Email: {health?.email?.live ? 
          <span className="text-green-600">Live ({health.email.provider})</span> : 
          <span className="text-red-600">Not configured</span>
        }
      </div>
      <div className="text-sm text-gray-500">
        Last checked: {health?.ts}
      </div>
    </div>
  );
}
```

---

### 5. Feature Flags

**API:** `GET /api/v1/platform/flags`

**Displays:**
- List of feature flags
- Current state (enabled/disabled)
- Description (future)

**Future Enhancement:**
- Toggle flags on/off
- Schedule flag changes

**Example:**
```typescript
function FeatureFlags() {
  const [flags, setFlags] = useState(null);
  
  useEffect(() => {
    fetch('/api/v1/platform/flags', {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(data => setFlags(data.flags));
  }, []);
  
  return (
    <div className="flags-panel">
      <h3>Feature Flags</h3>
      <table>
        <thead>
          <tr>
            <th>Flag</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {flags && Object.entries(flags).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>
                <span className={value ? 'text-green-600' : 'text-gray-400'}>
                  {value ? 'Enabled' : 'Disabled'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

### 6. Connector Packs

**API:** 
- `GET /api/v1/platform/connector-packs`
- `POST /api/v1/platform/connector-packs`

**Displays:**
- List of connector packs
- Pack name, slug, description
- Template count
- Published status

**Actions:**
- Create new pack
- View pack details
- Publish/unpublish pack (future)

**Example:**
```typescript
function ConnectorPacks() {
  const [packs, setPacks] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  const createPack = async (data) => {
    await fetch('/api/v1/platform/connector-packs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(data)
    });
    // Refresh list
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3>Connector Packs</h3>
        <button onClick={() => setShowCreateForm(true)}>
          Create Pack
        </button>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Templates</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {packs.map(pack => (
            <tr key={pack.id}>
              <td>{pack.name}</td>
              <td><code>{pack.slug}</code></td>
              <td>{pack.templateCount}</td>
              <td>
                {pack.published ? 
                  <span className="text-green-600">Published</span> : 
                  <span className="text-gray-500">Draft</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {showCreateForm && (
        <CreatePackModal 
          onCreate={createPack}
          onClose={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}
```

---

## Layout & Navigation

### Dashboard Layout

```
┌─────────────────────────────────────────────────┐
│  Ellines EIP - Super Admin                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Overview Stats Row                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Orgs   │ │  Users  │ │ Active  │          │
│  │   25    │ │   342   │ │   23    │          │
│  └─────────┘ └─────────┘ └─────────┘          │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  Organizations Table                            │
│  ┌───────────────────────────────────────────┐ │
│  │ Name    Status  Users  Created   Actions │ │
│  │ Acme    Active   25    Aug 1     [View] │ │
│  │ Beta    Active   12    Aug 2     [View] │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
├─────────────────────────────────────────────────┤
│  Platform Health        Feature Flags           │
│  ┌──────────────────┐  ┌──────────────────────┐│
│  │ Status: OK       │  │ ellinea_ai: Enabled  ││
│  │ Uptime: 5d 3h    │  │ multi_org: Enabled   ││
│  │ Email: Live      │  │ sso: Enabled         ││
│  └──────────────────┘  └──────────────────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

### Navigation Structure

```
/app/super-admin
├── /app/super-admin (Overview)
├── /app/super-admin/orgs (Organizations list)
├── /app/super-admin/orgs/:id (Organization details)
├── /app/super-admin/health (Platform health)
├── /app/super-admin/flags (Feature flags)
├── /app/super-admin/packs (Connector packs)
└── /app/super-admin/analytics (Future: Usage analytics)
```

---

## UI Components

### StatusBadge Component

```typescript
export function StatusBadge({ status }: { status: 'active' | 'suspended' }) {
  const styles = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800'
  };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
```

### StatCard Component

```typescript
export function StatCard({ 
  title, 
  value, 
  icon, 
  trend 
}: { 
  title: string; 
  value: number | string; 
  icon?: React.ReactNode; 
  trend?: { value: number; direction: 'up' | 'down' }; 
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          {trend && (
            <p className={`text-sm mt-2 ${trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend.direction === 'up' ? '↑' : '↓'} {trend.value}%
            </p>
          )}
        </div>
        {icon && <div className="text-4xl text-gray-300">{icon}</div>}
      </div>
    </div>
  );
}
```

---

## Security Considerations

### Access Control

1. **Route Protection**
   - All `/app/super-admin/*` routes must check `isPlatformAdmin`
   - Redirect to `/app` if not authorized
   - Show clear "Access Denied" message

2. **API Authorization**
   - All API calls include JWT Bearer token
   - Backend validates email against `PLATFORM_ADMIN_EMAILS`
   - 403 Forbidden returned for unauthorized access

3. **Audit Logging**
   - Log all admin actions (suspend org, change settings)
   - Include timestamp, admin email, action, target
   - Store in audit_logs table

### Data Privacy

- Do not display sensitive organization data (passwords, secrets, API keys)
- Hash/mask sensitive configuration values
- Implement view-only mode for most settings
- Require confirmation for destructive actions (suspend org)

---

## Implementation Checklist

### Phase 1: Basic Dashboard (MVP)

- [ ] Create `/app/super-admin` route
- [ ] Add platform admin check to route guard
- [ ] Implement overview stats component
- [ ] Implement organizations list
- [ ] Implement org details modal
- [ ] Add suspend/activate functionality
- [ ] Implement platform health panel
- [ ] Implement feature flags panel

### Phase 2: Advanced Features

- [ ] Connector packs management
- [ ] Org settings editor
- [ ] Audit log viewer
- [ ] Search and filtering
- [ ] Export organization list
- [ ] Bulk actions (suspend multiple orgs)

### Phase 3: Analytics & Monitoring

- [ ] Usage analytics dashboard
- [ ] API call volume graphs
- [ ] User growth trends
- [ ] Connector usage stats
- [ ] Alert management

---

## File Structure

```
apps/web/src/app/
└── app/
    └── super-admin/
        ├── page.tsx                    # Main dashboard
        ├── layout.tsx                  # Super admin layout
        ├── orgs/
        │   ├── page.tsx               # Organizations list
        │   └── [id]/
        │       └── page.tsx           # Organization details
        ├── health/
        │   └── page.tsx               # Platform health
        ├── flags/
        │   └── page.tsx               # Feature flags
        ├── packs/
        │   └── page.tsx               # Connector packs
        └── components/
            ├── StatusBadge.tsx
            ├── StatCard.tsx
            ├── OrgTable.tsx
            ├── OrgDetailsModal.tsx
            ├── HealthPanel.tsx
            └── FlagsPanel.tsx
```

---

## API Integration Summary

All super admin features use these endpoints:

| Feature | Endpoint | Method |
|---------|----------|--------|
| Organizations list | `/platform/orgs` | GET |
| Org details | `/platform/orgs/:id/settings` | GET |
| Suspend/activate org | `/platform/orgs/:id` | PATCH |
| Update org settings | `/platform/orgs/:id/settings` | PATCH |
| Platform health | `/health` | GET |
| Feature flags | `/platform/flags` | GET |
| Connector packs | `/platform/connector-packs` | GET, POST |

---

## Testing

### Manual Testing

1. **Setup:**
   ```bash
   # Add your email to platform admins
   echo "PLATFORM_ADMIN_EMAILS=your@email.com" >> .env
   
   # Restart services
   npm run dev:identity
   npm run dev:web
   ```

2. **Login as platform admin:**
   - Register/login with the admin email
   - Navigate to `/app/super-admin`
   - Should see dashboard (not access denied)

3. **Test features:**
   - View organizations list
   - Click "View" on an org
   - Try suspending an organization
   - Check platform health
   - View feature flags

### Automated Tests (Future)

```typescript
describe('Super Admin Dashboard', () => {
  it('denies access to non-admin users', async () => {
    // Login as regular user
    // Try to access /app/super-admin
    // Expect redirect or 403
  });
  
  it('shows dashboard to platform admin', async () => {
    // Login as platform admin
    // Access /app/super-admin
    // Expect dashboard content
  });
  
  it('can suspend organization', async () => {
    // Login as platform admin
    // Suspend an org
    // Verify status changed
  });
});
```

---

## Related Documentation

- [33_Complete_API_Reference.md](./33_Complete_API_Reference.md) — Full API documentation
- [09_Access_Layers.md](./09_Access_Layers.md) — Access layer definitions
- [05_Build_Queue.md](./05_Build_Queue.md) — Implementation queue

---

## Notes for Implementation

### Environment Variable

The `PLATFORM_ADMIN_EMAILS` environment variable should be:
- Comma-separated list of emails
- Set in `.env` (local)
- Set in Cloudflare Pages environment variables (production)
- Updated whenever admins are added/removed

**Example:**
```bash
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,superadmin@ellines.co.ke,ops@ellines.co.ke
```

### Session Enhancement

Add `isPlatformAdmin` to session object:

```typescript
// lib/api.ts
export function getSession() {
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  
  const decoded = jwt.decode(token);
  return {
    ...decoded,
    isPlatformAdmin: checkPlatformAdmin(decoded.email)
  };
}

function checkPlatformAdmin(email: string): boolean {
  // Call API or check against known list
  // For security, backend should be source of truth
  return false; // Implement properly
}
```

### Styling

Use the existing EIP design system:
- Colors: `#6F2D8D` (primary purple), `#0F172A` (dark), `#2563EB` (blue)
- Font: Exo 2
- CSS Modules for component styles
- Responsive design (mobile-first)

---

## Future Enhancements

### Phase 4 (v1.1+)

- **User impersonation:** Allow platform admin to "login as" any user for troubleshooting
- **Org migration tools:** Move users between organizations
- **Batch operations:** Bulk suspend/activate orgs
- **Custom metrics:** Define and track custom platform metrics
- **Alert system:** Email alerts for platform issues
- **API rate limit management:** Adjust rate limits per org
- **Resource quotas:** Set limits on connectors, users, data per org
- **Billing integration:** Track usage for billing (if SaaS model)

### Phase 5 (v2.0+)

- **Multi-region support:** Manage organizations across regions
- **Database health:** Monitor database performance
- **Backup management:** Trigger and monitor backups
- **Compliance dashboard:** GDPR, data residency tracking
- **Advanced analytics:** ML-powered insights on platform usage

---

**Document Version:** 1.0.0  
**Status:** Specification Ready  
**Implementation Priority:** Medium (Track E or later)  
**Estimated Effort:** 3-5 days for MVP

