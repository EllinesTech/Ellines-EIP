'use client';

import { ReactNode } from 'react';

export type PlatformSection =
  | 'overview'
  | 'businesses'
  | 'organizations'
  | 'onboarding'
  | 'access'
  | 'services'
  | 'packages'
  | 'health'
  | 'activity'
  | 'configuration'
  | 'alerts'
  | 'audit'
  | 'ai';

export type PlatformNavGroup = 'ELLINES ORGANIZATION' | 'CLIENT ORGANIZATIONS' | 'PLATFORM' | 'ELLINEA';

export interface PlatformNavItem {
  section: PlatformSection;
  label: string;
  href: string;
  icon: ReactNode;
  group: PlatformNavGroup;
  /** Shown only when genuinely available today. */
  available?: boolean;
}

function icon(path: string, extra?: string) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
      {extra ? <path d={extra!} /> : null}
    </svg>
  );
}

/**
 * Single-source Super Admin navigation.
 *
 * Routes are query-param driven on the existing `/app/platform` route — no new
 * pages or fake routes are introduced. Items that have no live route today are
 * kept in the architecture but marked `available: false` so they can render as
 * planned/disabled without inventing functionality.
 */
export const PLATFORM_NAV_ITEMS: PlatformNavItem[] = [
  {
    section: 'overview',
    label: 'Command Center',
    href: '/app/platform',
    icon: icon('M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M12 12l8-4.5M12 12v9M12 12L4 7.5'),
    group: 'PLATFORM',
    available: true,
  },
  {
    section: 'businesses',
    label: 'Client Portfolio',
    href: '/app/platform?section=businesses',
    icon: icon('M4 19.5A2.5 2.5 0 016.5 15h11A2.5 2.5 0 0120 17.5V19a1 1 0 01-1 1H5a1 1 0 01-1-1v-.5z', 'M9 11a3 3 0 116 0 3 3 0 01-6 0z'),
    group: 'CLIENT ORGANIZATIONS',
    available: true,
  },
  {
    section: 'organizations',
    label: 'Organizations',
    href: '/app/platform?section=organizations',
    icon: icon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 7a3 3 0 013 3 3 3 0 01-3 3M21 7a3 3 0 01-3 3 3 3 0 013 3'),
    group: 'CLIENT ORGANIZATIONS',
    available: false,
  },
  {
    section: 'onboarding',
    label: 'Register Client',
    href: '/app/platform?section=onboarding',
    icon: icon('M12 5v14M5 12h14'),
    group: 'CLIENT ORGANIZATIONS',
    available: true,
  },
  {
    section: 'access',
    label: 'Users & Access',
    href: '/app/platform?section=access',
    icon: icon('M17 21v-2a4 4 0 00-3-3.87M9 21v-2a4 4 0 013-3.87M12 12a4 4 0 100-8 4 4 0 000 8z'),
    group: 'CLIENT ORGANIZATIONS',
    available: true,
  },
  {
    section: 'services',
    label: 'Services',
    href: '/app/platform?section=services',
    icon: icon('M12 12V3l7 4v6c0 2.2-.6 4.3-1.7 6l-1.5 2.3 1.7 2 5.5-3V9l-5-3v6c0 1.7-.5 3.3-1.5 4.5-1 1.3-2.4 2.3-4 2.8-1.6.5-3.4.7-5.3.5-1.8-.2-3.5-.8-5-1.7l1.5-2.3c-.5-1.3-.8-2.7-.8-4.2V7l7-4z'),
    group: 'CLIENT ORGANIZATIONS',
    available: false,
  },
  {
    section: 'packages',
    label: 'Service Packages',
    href: '/app/platform?section=packages',
    icon: icon('M12 12V3l7 4v6c0 2.2-.6 4.3-1.7 6l-1.5 2.3 1.7 2 5.5-3V9l-5-3v6c0 1.7-.5 3.3-1.5 4.5-1 1.3-2.4 2.3-4 2.8-1.6.5-3.4.7-5.3.5-1.8-.2-3.5-.8-5-1.7l1.5-2.3c-.5-1.3-.8-2.7-.8-4.2V7l7-4z'),
    group: 'CLIENT ORGANIZATIONS',
    available: true,
  },
  {
    section: 'health',
    label: 'Health & Connectivity',
    href: '/app/platform?section=health',
    icon: icon('M12 17V5a5 5 0 00-5 5v5m10-5a5 5 0 01-10 0v0m10 0h2a2 2 0 012 2v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5a2 2 0 012-2h2'),
    group: 'CLIENT ORGANIZATIONS',
    available: true,
  },
  {
    section: 'activity',
    label: 'Activity & Usage',
    href: '/app/platform?section=activity',
    icon: icon('M3 12h4l3 8 4-16 3 8h4', 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z'),
    group: 'CLIENT ORGANIZATIONS',
    available: false,
  },
  {
    section: 'configuration',
    label: 'Configuration',
    href: '/app/platform?section=configuration',
    icon: icon('M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6'),
    group: 'CLIENT ORGANIZATIONS',
    available: false,
  },
  {
    section: 'alerts',
    label: 'Alerts & Issues',
    href: '/app/platform?section=alerts',
    icon: icon('M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4M12 17h.01'),
    group: 'CLIENT ORGANIZATIONS',
    available: false,
  },
  {
    section: 'audit',
    label: 'Client Audit',
    href: '/app/platform?section=audit',
    icon: icon('M8 6h11M8 6l3-3m-3 3l3 3m-3-3H4'),
    group: 'CLIENT ORGANIZATIONS',
    available: true,
  },
  {
    section: 'configuration',
    label: 'System Configuration',
    href: '/app/platform?section=configuration',
    icon: icon('M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6'),
    group: 'PLATFORM',
    available: true,
  },
  {
    section: 'ai',
    label: 'Ellinea AI',
    href: '/app/platform?section=ai',
    icon: icon('M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z', 'M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z'),
    group: 'ELLINEA',
    available: true,
  },
];

/** Group labels rendered as section headers in the unified sidebar. */
export const PLATFORM_NAV_GROUPS: PlatformNavGroup[] = [
  'CLIENT ORGANIZATIONS',
  'PLATFORM',
  'ELLINEA',
];
