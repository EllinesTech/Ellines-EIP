import type { ReactElement, ReactNode } from 'react';
import type { NavIconId } from '@/lib/app-navigation';

/**
 * The only navigation icon set. Icons are presentation only — `@/lib/app-navigation`
 * decides which id each destination uses.
 */

function Stroke({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {children}
    </svg>
  );
}

export function IconOverview(): ReactElement {
  return (
    <Stroke>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Stroke>
  );
}

export function IconEllinea(): ReactElement {
  return (
    <Stroke>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </Stroke>
  );
}

export function IconConnectors(): ReactElement {
  return (
    <Stroke>
      <path d="M8 12h8" />
      <path d="M6 8a3 3 0 110 6H5a3 3 0 010-6h1z" />
      <path d="M18 8h1a3 3 0 110 6h-1a3 3 0 110-6z" />
    </Stroke>
  );
}

export function IconAdmin(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
    </Stroke>
  );
}

export function IconPlatform(): ReactElement {
  return (
    <Stroke>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Stroke>
  );
}

export function IconTimeline(): ReactElement {
  return (
    <Stroke>
      <path d="M12 4v16" />
      <circle cx="12" cy="7" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
    </Stroke>
  );
}

export function IconNotifications(): ReactElement {
  return (
    <Stroke>
      <path d="M6 9a6 6 0 0112 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 004 0" />
    </Stroke>
  );
}

export function IconApprovals(): ReactElement {
  return (
    <Stroke>
      <path d="M9 11l3 3L20 6" />
      <path d="M4 6h8M4 12h5M4 18h12" />
    </Stroke>
  );
}

export function IconReports(): ReactElement {
  return (
    <Stroke>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M9 12h6M9 16h4" />
    </Stroke>
  );
}

export function IconRules(): ReactElement {
  return (
    <Stroke>
      <path d="M5 7h14M5 12h10M5 17h7" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </Stroke>
  );
}

export function IconAudit(): ReactElement {
  return (
    <Stroke>
      <path d="M8 6h11M8 12h11M8 18h8" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Stroke>
  );
}

export function IconSettings(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" />
    </Stroke>
  );
}

export function IconDragHandle(): ReactElement {
  return (
    <Stroke>
      <path d="M8 7h8M8 12h8M8 17h8" />
    </Stroke>
  );
}

export function IconFleet(): ReactElement {
  return (
    <Stroke>
      <path d="M3 16h13V8H3z" />
      <path d="M16 10h3l2 3v3h-5v-6z" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </Stroke>
  );
}

export function IconPeople(): ReactElement {
  return (
    <Stroke>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c1.2-2.8 3.2-4.2 6-4.2S16.8 16.2 18 19" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M19.5 19c.7-1.6 1.5-2.6 2.5-3.2" />
    </Stroke>
  );
}

export function IconGlance(): ReactElement {
  return (
    <Stroke>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15v-4M12 15V8M16 15v-6" />
    </Stroke>
  );
}

export function IconInbox(): ReactElement {
  return (
    <Stroke>
      <path d="M4 8l8-4 8 4v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
      <path d="M4 12h4l2 3h4l2-3h4" />
    </Stroke>
  );
}

export function IconOrgSystem(): ReactElement {
  return (
    <Stroke>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11M14 13h4M14 16h4" />
    </Stroke>
  );
}

export function IconOrgData(): ReactElement {
  return (
    <Stroke>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M17 14v6M14 17h6" />
    </Stroke>
  );
}

export function IconAutomation(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </Stroke>
  );
}

export function IconDocuments(): ReactElement {
  return (
    <Stroke>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Stroke>
  );
}

/* ---------------------------------------------------------------- client organizations */

export function IconPortfolio(): ReactElement {
  return (
    <Stroke>
      <path d="M3 20.5a2.5 2.5 0 012.5-2.5h13a2.5 2.5 0 012.5 2.5V21H3z" />
      <path d="M6 10h12M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" />
      <path d="M9.5 14h5" />
    </Stroke>
  );
}

export function IconOrganizations(): ReactElement {
  return (
    <Stroke>
      <path d="M3 21V6l7-3v18" />
      <path d="M10 10h11v11" />
      <path d="M6 9h1M6 13h1M6 17h1M14 14h2M14 18h2" />
    </Stroke>
  );
}

export function IconRegisterClient(): ReactElement {
  return (
    <Stroke>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  );
}

export function IconUsersAccess(): ReactElement {
  return (
    <Stroke>
      <path d="M17 21v-2a4 4 0 00-3-3.87M9 21v-2a4 4 0 013-3.87" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M20 8.5l1.8 1.8" />
      <circle cx="18.5" cy="7" r="2.5" />
    </Stroke>
  );
}

export function IconServices(): ReactElement {
  return (
    <Stroke>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" />
    </Stroke>
  );
}

export function IconHealthConnectivity(): ReactElement {
  return (
    <Stroke>
      <path d="M3 13h3l2.5 5L13 6l2.5 7h5.5" />
    </Stroke>
  );
}

export function IconActivity(): ReactElement {
  return (
    <Stroke>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </Stroke>
  );
}

export function IconConfiguration(): ReactElement {
  return (
    <Stroke>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="15" cy="18" r="2.5" />
    </Stroke>
  );
}

export function IconAlerts(): ReactElement {
  return (
    <Stroke>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Stroke>
  );
}

export function IconClientAudit(): ReactElement {
  return (
    <Stroke>
      <path d="M8 6h11M8 12h11M8 18h6" />
      <circle cx="4.5" cy="6" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <path d="M16 18h6" />
    </Stroke>
  );
}

/* ------------------------------------------------------------------------- platform */

export function IconCommandCenter(): ReactElement {
  return (
    <Stroke>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Stroke>
  );
}

export function IconPackages(): ReactElement {
  return (
    <Stroke>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M8 9.5l4 2.5 4-2.5M12 12v4.5" />
    </Stroke>
  );
}

export function IconAccessControl(): ReactElement {
  return (
    <Stroke>
      <path d="M12 3l7 3v6c0 4-3 7.4-7 9-4-1.6-7-5-7-9V6z" />
      <path d="M9.5 12.5l1.8 1.8 3.2-3.6" />
    </Stroke>
  );
}

export function IconSystemHealth(): ReactElement {
  return (
    <Stroke>
      <path d="M12 21s-7-4.2-7-9.8V6l7-3 7 3v5.2C19 16.8 12 21 12 21z" />
      <path d="M8.5 12h2l1.5 3 2-6 1.5 3h1.5" />
    </Stroke>
  );
}

export function IconSecurityAudit(): ReactElement {
  return (
    <Stroke>
      <path d="M12 3l7 3v6c0 4-3 7.4-7 9-4-1.6-7-5-7-9V6z" />
      <path d="M12 8.5v4M12 15.5h.01" />
    </Stroke>
  );
}

export function IconCompliance(): ReactElement {
  return (
    <Stroke>
      <path d="M6 4h12v16H6z" />
      <path d="M9 9l1.6 1.6L14 7.5M9.5 15h5" />
    </Stroke>
  );
}

export function IconEllineaConsole(): ReactElement {
  return (
    <Stroke>
      <path d="M4 5h16v11H4z" />
      <path d="M8 19h8M12 16v3" />
      <path d="M8 10l2.5 2.5L16 8" />
    </Stroke>
  );
}

/* ---------------------------------------------------------------- client dashboard */

export function IconDashboard(): ReactElement {
  return (
    <Stroke>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Stroke>
  );
}

export function IconMyWork(): ReactElement {
  return (
    <Stroke>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </Stroke>
  );
}

export function IconBusinessOverview(): ReactElement {
  return (
    <Stroke>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M9 22V12h6v10" />
    </Stroke>
  );
}

export function IconPerformance(): ReactElement {
  return (
    <Stroke>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Stroke>
  );
}

export function IconAnalytics(): ReactElement {
  return (
    <Stroke>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </Stroke>
  );
}

export function IconSales(): ReactElement {
  return (
    <Stroke>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Stroke>
  );
}

export function IconPurchases(): ReactElement {
  return (
    <Stroke>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 01-8 0" />
    </Stroke>
  );
}

export function IconInventory(): ReactElement {
  return (
    <Stroke>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </Stroke>
  );
}

export function IconCustomers(): ReactElement {
  return (
    <Stroke>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </Stroke>
  );
}

export function IconSuppliers(): ReactElement {
  return (
    <Stroke>
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="1.5" />
      <circle cx="18.5" cy="18.5" r="1.5" />
    </Stroke>
  );
}

export function IconPayments(): ReactElement {
  return (
    <Stroke>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <path d="M1 10h22" />
    </Stroke>
  );
}

export function IconExpenses(): ReactElement {
  return (
    <Stroke>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </Stroke>
  );
}

export function IconAssets(): ReactElement {
  return (
    <Stroke>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 3H8L6 7h12l-2-4z" />
    </Stroke>
  );
}

export function IconBranches(): ReactElement {
  return (
    <Stroke>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </Stroke>
  );
}

export function IconWarehouses(): ReactElement {
  return (
    <Stroke>
      <path d="M2 20h20M4 20V8l8-6 8 6v12" />
      <path d="M10 20v-5h4v5" />
    </Stroke>
  );
}

export function IconEmployees(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 10-16 0" />
    </Stroke>
  );
}

export function IconDepartments(): ReactElement {
  return (
    <Stroke>
      <rect x="2" y="7" width="6" height="14" rx="1" />
      <rect x="9" y="3" width="6" height="18" rx="1" />
      <rect x="16" y="10" width="6" height="11" rx="1" />
    </Stroke>
  );
}

export function IconAttendance(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </Stroke>
  );
}

export function IconLeave(): ReactElement {
  return (
    <Stroke>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Stroke>
  );
}

export function IconPayroll(): ReactElement {
  return (
    <Stroke>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 12h.01M18 12h.01" />
    </Stroke>
  );
}

export function IconLeads(): ReactElement {
  return (
    <Stroke>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.36 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </Stroke>
  );
}

export function IconOpportunities(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 3" />
    </Stroke>
  );
}

export function IconFollowUps(): ReactElement {
  return (
    <Stroke>
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </Stroke>
  );
}

export function IconConnectedSystems(): ReactElement {
  return (
    <Stroke>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </Stroke>
  );
}

export function IconConnectorHealth(): ReactElement {
  return (
    <Stroke>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Stroke>
  );
}

export function IconIntegrationRequests(): ReactElement {
  return (
    <Stroke>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="M22 6l-10 7L2 6" />
    </Stroke>
  );
}

export function IconSchedules(): ReactElement {
  return (
    <Stroke>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="12" cy="15" r="2" />
    </Stroke>
  );
}

export function IconExecutions(): ReactElement {
  return (
    <Stroke>
      <path d="M5 3l14 9-14 9V3z" />
    </Stroke>
  );
}

export function IconInsights(): ReactElement {
  return (
    <Stroke>
      <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26A7 7 0 015 9a7 7 0 017-7z" />
    </Stroke>
  );
}

export function IconRecommendations(): ReactElement {
  return (
    <Stroke>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Stroke>
  );
}

export function IconBusinessSettings(): ReactElement {
  return (
    <Stroke>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" />
    </Stroke>
  );
}

export function IconDataPrivacy(): ReactElement {
  return (
    <Stroke>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9.5 12.5l1.8 1.8 3.2-3.6" />
    </Stroke>
  );
}

export function IconUsersRoles(): ReactElement {
  return (
    <Stroke>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M20 8l2 2-6 6" />
      <path d="M22 14l-2-2" />
    </Stroke>
  );
}

export function IconAttention(): ReactElement {
  return (
    <Stroke>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Stroke>
  );
}

const ICON_COMPONENTS: Record<NavIconId, () => ReactElement> = {
  overview: IconOverview,
  glance: IconGlance,
  timeline: IconTimeline,
  notifications: IconNotifications,
  approvals: IconApprovals,
  fleet: IconFleet,
  people: IconPeople,
  inbox: IconInbox,
  rules: IconRules,
  reports: IconReports,
  automation: IconAutomation,
  connectors: IconConnectors,
  documents: IconDocuments,
  'org-data': IconOrgData,
  'org-system': IconOrgSystem,
  'org-admin': IconAdmin,
  settings: IconSettings,
  portfolio: IconPortfolio,
  organizations: IconOrganizations,
  'register-client': IconRegisterClient,
  'users-access': IconUsersAccess,
  services: IconServices,
  'health-connectivity': IconHealthConnectivity,
  activity: IconActivity,
  configuration: IconConfiguration,
  alerts: IconAlerts,
  'client-audit': IconClientAudit,
  'command-center': IconCommandCenter,
  packages: IconPackages,
  'access-control': IconAccessControl,
  'system-health': IconSystemHealth,
  'security-audit': IconSecurityAudit,
  compliance: IconCompliance,
  audit: IconAudit,
  'ellinea-console': IconEllineaConsole,
  'ellinea-ai': IconEllinea,
  // ── client dashboard
  'dashboard': IconDashboard,
  'my-work': IconMyWork,
  'attention': IconAttention,
  'business-overview': IconBusinessOverview,
  'performance': IconPerformance,
  'analytics': IconAnalytics,
  'sales': IconSales,
  'purchases': IconPurchases,
  'inventory': IconInventory,
  'customers': IconCustomers,
  'suppliers': IconSuppliers,
  'payments': IconPayments,
  'expenses': IconExpenses,
  'assets': IconAssets,
  'branches': IconBranches,
  'warehouses': IconWarehouses,
  'employees': IconEmployees,
  'departments': IconDepartments,
  'attendance': IconAttendance,
  'leave': IconLeave,
  'payroll': IconPayroll,
  'leads': IconLeads,
  'opportunities': IconOpportunities,
  'activities': IconActivity,
  'follow-ups': IconFollowUps,
  'connected-systems': IconConnectedSystems,
  'connector-health': IconConnectorHealth,
  'integration-requests': IconIntegrationRequests,
  'schedules': IconSchedules,
  'executions': IconExecutions,
  'insights': IconInsights,
  'recommendations': IconRecommendations,
  'business-settings': IconBusinessSettings,
  'data-privacy': IconDataPrivacy,
  'users-roles': IconUsersRoles,
};

/** Render the icon registered for a navigation item id. */
export function NavIcon({ id }: { id: NavIconId }): ReactElement {
  const Component = ICON_COMPONENTS[id];
  return <Component />;
}
