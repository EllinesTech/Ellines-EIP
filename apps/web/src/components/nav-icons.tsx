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
};

/** Render the icon registered for a navigation item id. */
export function NavIcon({ id }: { id: NavIconId }): ReactElement {
  const Component = ICON_COMPONENTS[id];
  return <Component />;
}
