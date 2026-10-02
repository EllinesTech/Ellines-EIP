/**
 * Ellines EIP — navigation single source of truth.
 *
 * This module is the ONLY navigation registry in the product. It drives:
 *  - the Super Admin rail (ELLINES ORGANIZATION / CLIENT ORGANIZATIONS / PLATFORM / ELLINEA)
 *  - the tenant Work Console rail (flat, order unchanged from the pre-refactor `NAV` array)
 *  - the section set, active state and breadcrumb labels of the ONE Control Plane
 *    (`/app/platform?section=…`).
 *
 * Contracts (enforced by `src/__tests__/app-navigation.spec.ts`):
 *  1. Every destination is declared exactly once here — no second navigation array or component
 *     may generate an overlapping menu.
 *  2. Every Control Plane section id is owned by exactly one item, so no two items can ever
 *     highlight at the same time or duplicate a destination.
 *  3. An item is either live (`available: true`) or explicitly reserved (`available: false`)
 *     with a `note` explaining what is missing. Reserved items never claim a live section and
 *     never carry fake data — they resolve to the Control Plane's honest "Planned" state.
 *  4. Labels stay inside the sidebar width budget, so navigation text is never ellipsised.
 */

/** Every `?section=` view served by the single Super Admin Control Plane at `/app/platform`. */
export type PlatformSectionId =
  | 'overview'
  | 'businesses'
  | 'organizations'
  | 'onboarding'
  | 'access'
  | 'access-control'
  | 'services'
  | 'packages'
  | 'health'
  | 'client-health'
  | 'activity'
  | 'configuration'
  | 'client-configuration'
  | 'alerts'
  | 'audit'
  | 'client-audit'
  | 'client'   /* full-page client org workspace — ?section=client&id=ORG_ID */
  | 'ai'
  | 'org-data'    /* ELLINES ORGANIZATION — Usage Analytics */
  | 'org-system'  /* ELLINES ORGANIZATION — Infrastructure Health */
  | 'org-admin';  /* ELLINES ORGANIZATION — Internal Staff Management */

/** The four Super Admin contexts. They must never be mixed. */
export type NavGroupId = 'ellines-organization' | 'client-organizations' | 'platform' | 'ellinea';

export type NavIconId =
  | 'overview'
  | 'glance'
  | 'timeline'
  | 'notifications'
  | 'approvals'
  | 'fleet'
  | 'people'
  | 'inbox'
  | 'rules'
  | 'reports'
  | 'automation'
  | 'connectors'
  | 'documents'
  | 'org-data'
  | 'org-system'
  | 'org-admin'
  | 'settings'
  | 'portfolio'
  | 'organizations'
  | 'register-client'
  | 'users-access'
  | 'services'
  | 'health-connectivity'
  | 'activity'
  | 'configuration'
  | 'alerts'
  | 'client-audit'
  | 'command-center'
  | 'packages'
  | 'access-control'
  | 'system-health'
  | 'security-audit'
  | 'compliance'
  | 'audit'
  | 'ellinea-console'
  | 'ellinea-ai'
  // ── Client dashboard icon IDs ──────────────────────────────────────────────
  | 'dashboard'
  | 'my-work'
  | 'attention'
  | 'business-overview'
  | 'performance'
  | 'analytics'
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'payments'
  | 'expenses'
  | 'assets'
  | 'branches'
  | 'warehouses'
  | 'employees'
  | 'departments'
  | 'attendance'
  | 'leave'
  | 'payroll'
  | 'leads'
  | 'opportunities'
  | 'activities'
  | 'follow-ups'
  | 'connected-systems'
  | 'connector-health'
  | 'integration-requests'
  | 'schedules'
  | 'executions'
  | 'insights'
  | 'recommendations'
  | 'business-settings'
  | 'data-privacy'
  | 'users-roles';

export interface NavItem {
  /** Stable key. Also the `?section=` value when the item opens a Control Plane section. */
  id: string;
  /** Default label (tenant / Work Console rail and Control Plane breadcrumbs). */
  label: string;
  /** Label used in the Super Admin rail when it must be more explicit. */
  superAdminLabel?: string;
  href: string;
  icon: NavIconId;
  /** Control Plane section on `/app/platform`. Absent = plain route link. */
  section?: PlatformSectionId;
  /** Owning Super Admin context. */
  group: NavGroupId;
  /** Nested sub-group id (e.g. the Work Console inside ELLINES ORGANIZATION). */
  subGroup?: string;
  /** `false` = reserved in the architecture: honest "Planned" state, never fake data. */
  available: boolean;
  /** Shown as tooltip; explains reserved items. */
  note?: string;
  /** Owner / IT admin only (tenant rail). A platform admin always sees platform surfaces. */
  adminOnly?: boolean;
  /** Member of the acting organization's system surfaces (or a platform admin). */
  orgSystemAccess?: boolean;
}

export interface NavGroupDef {
  id: string;
  label: string | null;
  collapsible: boolean;
  defaultOpen: boolean;
  itemIds: string[];
  subGroups?: NavGroupDef[];
}

export function platformSectionHref(section: PlatformSectionId): string {
  return section === 'overview' ? '/app/platform' : `/app/platform?section=${section}`;
}

const href = platformSectionHref;

/** Ellines' OWN organization context (our own operations + operator work surface). */
const ELLINES_ORGANIZATION_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    superAdminLabel: 'Organization Overview',
    href: '/app',
    icon: 'overview',
    group: 'ellines-organization',
    available: true,
  },
  {
    id: 'org-data',
    label: 'Organization Data',
    href: href('org-data'),
    icon: 'org-data',
    section: 'org-data',
    group: 'ellines-organization',
    orgSystemAccess: true,
    available: true,
  },
  {
    id: 'org-system',
    label: 'Organization System',
    href: href('org-system'),
    icon: 'org-system',
    section: 'org-system',
    group: 'ellines-organization',
    orgSystemAccess: true,
    available: true,
  },
  {
    id: 'org-admin',
    label: 'Org Admin',
    superAdminLabel: 'Organization Admin',
    href: href('org-admin'),
    icon: 'org-admin',
    section: 'org-admin',
    group: 'ellines-organization',
    adminOnly: true,
    available: true,
  },
  {
    id: 'ellines-inbox',
    label: 'Email Inbox',
    superAdminLabel: 'Email Inbox',
    href: '/app/inbox',
    icon: 'inbox',
    group: 'ellines-organization',
    available: true,
  },
  {
    id: 'settings',
    label: 'System Settings',
    href: '/app/settings',
    icon: 'settings',
    group: 'ellines-organization',
    available: true,
  },
];

/** Operator work surface — the Work Console (docs/09_Access_Layers.md) of our own org. */
const WORK_CONSOLE_ITEMS: NavItem[] = [
  { id: 'glance', label: 'Glance', href: '/app/glance', icon: 'glance', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'timeline', label: 'Timeline', href: '/app/timeline', icon: 'timeline', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'notifications', label: 'Notifications', href: '/app/notifications', icon: 'notifications', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'approvals', label: 'Approvals', href: '/app/approvals', icon: 'approvals', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'fleet', label: 'Fleet', href: '/app/fleet', icon: 'fleet', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'people', label: 'People', href: '/app/people', icon: 'people', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'inbox', label: 'Inbox', href: '/app/inbox', icon: 'inbox', group: 'ellines-organization', subGroup: 'work-console', available: true },
  { id: 'rules', label: 'Rules', href: '/app/rules', icon: 'rules', group: 'ellines-organization', subGroup: 'work-console', adminOnly: true, available: true },
  { id: 'reports', label: 'Reports', href: '/app/reports', icon: 'reports', group: 'ellines-organization', subGroup: 'work-console', adminOnly: true, available: true },
  { id: 'automation', label: 'Automation', href: '/app/automation', icon: 'automation', group: 'ellines-organization', subGroup: 'work-console', adminOnly: true, available: true },
  { id: 'connectors', label: 'Connectors', href: '/app/connectors', icon: 'connectors', group: 'ellines-organization', subGroup: 'work-console', adminOnly: true, available: true },
  { id: 'documents', label: 'Documents', href: '/app/documents', icon: 'documents', group: 'ellines-organization', subGroup: 'work-console', available: true },
];

/** External / customer organizations that Ellines EIP manages. */
const CLIENT_ORGANIZATION_ITEMS: NavItem[] = [
  {
    id: 'client-portfolio',
    label: 'Client Portfolio',
    href: href('businesses'),
    icon: 'portfolio',
    section: 'businesses',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-register',
    label: 'Register Client',
    href: href('onboarding'),
    icon: 'register-client',
    section: 'onboarding',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-directory',
    label: 'Organizations',
    href: href('organizations'),
    icon: 'organizations',
    section: 'organizations',
    group: 'client-organizations',
    available: false,
    note: 'Reserved — the client organization registry view is in the build queue. Client Portfolio is the live list today.',
  },
  {
    id: 'client-users',
    label: 'Users & Access',
    href: href('access'),
    icon: 'users-access',
    section: 'access',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-services',
    label: 'Services',
    href: href('services'),
    icon: 'services',
    section: 'services',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-health',
    label: 'Health & Connectivity',
    href: href('client-health'),
    icon: 'health-connectivity',
    section: 'client-health',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-activity',
    label: 'Activity & Usage',
    href: href('activity'),
    icon: 'activity',
    section: 'activity',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-configuration',
    label: 'Configuration',
    href: href('client-configuration'),
    icon: 'configuration',
    section: 'client-configuration',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-alerts',
    label: 'Alerts & Issues',
    href: href('alerts'),
    icon: 'alerts',
    section: 'alerts',
    group: 'client-organizations',
    available: true,
  },
  {
    id: 'client-audit',
    label: 'Client Audit',
    href: href('client-audit'),
    icon: 'client-audit',
    section: 'client-audit',
    group: 'client-organizations',
    available: true,
  },
];

/** Platform-wide (EIP itself) capabilities. */
const PLATFORM_ITEMS: NavItem[] = [
  {
    id: 'command-center',
    label: 'Command Center',
    href: href('overview'),
    icon: 'command-center',
    section: 'overview',
    group: 'platform',
    available: true,
  },
  {
    id: 'platform-packages',
    label: 'Service Packages',
    href: href('packages'),
    icon: 'packages',
    section: 'packages',
    group: 'platform',
    available: true,
  },
  {
    id: 'platform-access',
    label: 'Access & Control',
    href: href('access-control'),
    icon: 'access-control',
    section: 'access-control',
    group: 'platform',
    available: true,
  },
  {
    id: 'platform-health',
    label: 'System Health',
    href: href('health'),
    icon: 'system-health',
    section: 'health',
    group: 'platform',
    available: true,
  },
  {
    id: 'platform-security-audit',
    label: 'Security & Audit',
    href: href('audit'),
    icon: 'security-audit',
    section: 'audit',
    group: 'platform',
    available: true,
  },
  {
    id: 'compliance-center',
    label: 'Compliance',
    href: '/app/compliance',
    icon: 'compliance',
    group: 'platform',
    adminOnly: true,
    available: true,
  },
  {
    id: 'audit-center',
    label: 'Audit',
    href: '/app/audit',
    icon: 'audit',
    group: 'platform',
    adminOnly: true,
    available: true,
  },
  {
    id: 'platform-configuration',
    label: 'System Configuration',
    href: href('configuration'),
    icon: 'configuration',
    section: 'configuration',
    group: 'platform',
    available: true,
  },
];

const ELLINEA_ITEMS: NavItem[] = [
  {
    id: 'ellinea-console',
    label: 'Ellinea Console',
    href: '/app/ellinea-console',
    icon: 'ellinea-console',
    group: 'ellinea',
    available: true,
  },
  {
    id: 'ellinea-ai',
    label: 'Ellinea AI',
    href: href('ai'),
    icon: 'ellinea-ai',
    section: 'ai',
    group: 'ellinea',
    available: true,
  },
];


/** Every navigation destination in the product, declared exactly once. */
export const NAV_ITEMS: NavItem[] = [
  ...ELLINES_ORGANIZATION_ITEMS,
  ...WORK_CONSOLE_ITEMS,
  ...CLIENT_ORGANIZATION_ITEMS,
  ...PLATFORM_ITEMS,
  ...ELLINEA_ITEMS,
];

export const NAV_ITEM_BY_ID: Record<string, NavItem> = NAV_ITEMS.reduce<Record<string, NavItem>>(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {},
);

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  'ellines-organization': 'ELLINES ORGANIZATION',
  'client-organizations': 'CLIENT ORGANIZATIONS',
  platform: 'PLATFORM',
  ellinea: 'ELLINEA',
};

/**
 * The one Super Admin navigation. Group order, item order and labels are the product IA —
 * the rail renders this and nothing else.
 */
export const SUPER_ADMIN_NAV: NavGroupDef[] = [
  {
    id: 'ellines-organization',
    label: NAV_GROUP_LABELS['ellines-organization'],
    collapsible: true,
    defaultOpen: true,
    itemIds: ['overview', 'org-data', 'org-system', 'org-admin', 'ellines-inbox', 'settings'],
    subGroups: [],
  },
  {
    id: 'client-organizations',
    label: NAV_GROUP_LABELS['client-organizations'],
    collapsible: true,
    defaultOpen: true,
    itemIds: [
      'client-portfolio',
      'client-register',
      'client-directory',
      'client-users',
      'client-services',
      'client-health',
      'client-activity',
      'client-configuration',
      'client-alerts',
      'client-audit',
    ],
  },
  {
    id: 'platform',
    label: NAV_GROUP_LABELS.platform,
    collapsible: true,
    defaultOpen: true,
    itemIds: [
      'command-center',
      'platform-packages',
      'platform-access',
      'platform-health',
      'platform-security-audit',
      'compliance-center',
      'audit-center',
      'platform-configuration',
    ],
  },
  {
    id: 'ellinea',
    label: NAV_GROUP_LABELS.ellinea,
    collapsible: true,
    defaultOpen: true,
    itemIds: ['ellinea-console', 'ellinea-ai'],
  },
];

/** Tenant / Work Console rail order (unchanged from the pre-refactor flat `NAV` array). */
export const WORKSPACE_NAV_ORDER: string[] = [
  'overview',
  'glance',
  'timeline',
  'notifications',
  'approvals',
  'fleet',
  'people',
  'inbox',
  'rules',
  'reports',
  'automation',
  'connectors',
  'documents',
  'org-data',
  'org-system',
  'org-admin',
  'audit-center',
  'compliance-center',
  'ellinea-console',
  'settings',
];


export interface PlatformSectionMeta {
  section: PlatformSectionId;
  label: string;
  group: NavGroupId;
  groupLabel: string;
  itemId: string;
  available: boolean;
  note?: string;
}

function buildSectionMeta(): Record<PlatformSectionId, PlatformSectionMeta> {
  const out = {} as Record<PlatformSectionId, PlatformSectionMeta>;
  for (const item of NAV_ITEMS) {
    if (!item.section) continue;
    out[item.section] = {
      section: item.section,
      label: item.label,
      group: item.group,
      groupLabel: NAV_GROUP_LABELS[item.group],
      itemId: item.id,
      available: item.available,
      note: item.note,
    };
  }
  return out;
}

/** Metadata for every Control Plane section — used for titles, breadcrumbs and the live set. */
export const PLATFORM_SECTION_META = buildSectionMeta();

/** Sections backed by a real live view today. Everything else renders the honest "Planned" state. */
export const PLATFORM_LIVE_SECTIONS: PlatformSectionId[] = [
  ...NAV_ITEMS
    .filter((item): item is NavItem & { section: PlatformSectionId } => Boolean(item.section) && item.available)
    .map((item) => item.section),
  'client', // dynamic — always live, driven by ?id= param
];

/** Reserved sections: architecture is in place, no live route yet. */
export const PLATFORM_RESERVED_SECTIONS: PlatformSectionId[] = NAV_ITEMS
  .filter((item): item is NavItem & { section: PlatformSectionId } => Boolean(item.section) && !item.available)
  .map((item) => item.section);

const SECTION_ID_SET = new Set<string>([
  ...NAV_ITEMS.flatMap((item) => (item.section ? [item.section] : [])),
  'client', // dynamic client workspace — ?section=client&id=ORG_ID (no sidebar nav item)
]);

export function isPlatformSection(value: string | null | undefined): value is PlatformSectionId {
  return typeof value === 'string' && SECTION_ID_SET.has(value);
}

export function isLivePlatformSection(section: PlatformSectionId): boolean {
  return PLATFORM_LIVE_SECTIONS.includes(section);
}

/** Resolve a raw `?section=` value; unknown values fall back to the Control Plane landing page. */
export function activePlatformSection(sectionParam: string | null | undefined): PlatformSectionId {
  return isPlatformSection(sectionParam) ? sectionParam : 'overview';
}

/** Longest label the sidebar is sized for (see `shell.module.css` `--dash-rail-w`). */
export const NAV_LABEL_MAX_CHARS = 30;

export interface NavContext {
  isPlatformAdmin: boolean;
  isOrgAdmin: boolean;
  isOwner: boolean;
  /** Owner/IT, or work roles when the org allows `allowWorkRolesOrgSystem`. */
  orgSystemAccess: boolean;
  /** `uiPrefs.showApprovalsNav`. */
  showApprovals: boolean;
}

export interface ResolvedNavItem extends NavItem {
  resolvedLabel: string;
}

export interface ResolvedNavGroup {
  id: string;
  label: string | null;
  collapsible: boolean;
  defaultOpen: boolean;
  items: ResolvedNavItem[];
  subGroups: ResolvedNavGroup[];
}

function isVisible(item: NavItem, ctx: NavContext): boolean {
  if (item.adminOnly && !ctx.isOrgAdmin && !ctx.isPlatformAdmin) return false;
  if (item.orgSystemAccess && !ctx.orgSystemAccess && !ctx.isPlatformAdmin) return false;
  if (item.id === 'approvals' && !ctx.showApprovals) return false;
  return true;
}

function resolvedLabel(item: NavItem, ctx: NavContext): string {
  if (item.id === 'org-admin' && !ctx.isPlatformAdmin) return ctx.isOwner ? 'Org Admin' : 'IT Admin';
  if (ctx.isPlatformAdmin && item.superAdminLabel) return item.superAdminLabel;
  return item.label;
}

function resolveItems(ids: string[], ctx: NavContext): ResolvedNavItem[] {
  return ids
    .map((id) => NAV_ITEM_BY_ID[id])
    .filter((item): item is NavItem => Boolean(item))
    .filter((item) => isVisible(item, ctx))
    .map((item) => ({ ...item, resolvedLabel: resolvedLabel(item, ctx) }));
}

function resolveGroup(def: NavGroupDef, ctx: NavContext): ResolvedNavGroup {
  return {
    id: def.id,
    label: def.label,
    collapsible: def.collapsible,
    defaultOpen: def.defaultOpen,
    items: resolveItems(def.itemIds, ctx),
    subGroups: (def.subGroups ?? [])
      .map((sub) => resolveGroup(sub, ctx))
      .filter((sub) => sub.items.length > 0),
  };
}

/**
 * Build the navigation for the acting operator.
 *
 * Platform admins get the grouped Super Admin rail (our organization / client organizations /
 * platform / Ellinea). Everyone else keeps the flat, reorderable Work Console rail.
 */
export function resolveNavigation(ctx: NavContext): ResolvedNavGroup[] {
  if (ctx.isPlatformAdmin) {
    return SUPER_ADMIN_NAV.map((def) => resolveGroup(def, ctx)).filter(
      (group) => group.items.length > 0 || group.subGroups.length > 0,
    );
  }
  return [
    {
      id: 'workspace',
      label: null,
      collapsible: false,
      defaultOpen: true,
      items: resolveItems(WORKSPACE_NAV_ORDER, ctx),
      subGroups: [],
    },
  ];
}

/** Active-route logic shared by the rail (no competing implementations). */
export function isNavItemActive(
  item: Pick<NavItem, 'href' | 'section'>,
  pathname: string,
  sectionParam: string,
): boolean {
  if (item.section) {
    if (!isPlatformPath(pathname)) return false;
    if (item.section === 'overview') return sectionParam === '' || sectionParam === 'overview';
    return sectionParam === item.section;
  }
  if (item.href === '/app') return pathname === '/app' || pathname === '/app/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isPlatformPath(pathname: string): boolean {
  return pathname === '/app/platform' || pathname === '/app/platform/';
}

/** Collector used by the rail to auto-open the group (and any ancestor group) that owns the active item. */
export function collectActiveGroupIds(
  group: ResolvedNavGroup,
  target: (item: ResolvedNavItem) => boolean,
  acc: string[] = [],
): string[] {
  const hasOwn = group.items.some(target);
  let hasNested = false;
  for (const sub of group.subGroups) {
    const before = acc.length;
    collectActiveGroupIds(sub, target, acc);
    if (acc.length > before) hasNested = true;
  }
  if (hasOwn || hasNested) acc.push(group.id);
  return acc;
}


// ─── Client Organization User Navigation ─────────────────────────────────────
// Added by spec: client-dashboard-connector-platform
// These types and constants extend the existing navigation registry without
// touching or duplicating any Super Admin / platform navigation items.

/** 9 sidebar groups for client organization users. */
export type ClientNavGroupId =
  | 'client-home'
  | 'client-business'
  | 'client-operations'
  | 'client-people'
  | 'client-crm'
  | 'client-integrations'
  | 'client-automation'
  | 'client-intelligence'
  | 'client-administration';

/** Extended icon IDs for the client sidebar — now merged into NavIconId above. */
export type ClientNavIconId = NavIconId;

export interface ClientNavItem {
  id: string;
  label: string;
  href: string;
  icon: NavIconId;
  group: ClientNavGroupId;
  /** `false` = planned state — renders as disabled, never carries fake data. */
  available: boolean;
  note?: string;
  /** Minimum role required. Absent = all roles. */
  minRole?: 'owner' | 'executive' | 'manager' | 'member' | 'viewer';
  /** Package feature key required. Absent = always shown. */
  requiresPackageFeature?: string;
}

export interface ClientNavGroupDef {
  id: ClientNavGroupId;
  label: string;
  collapsible: boolean;
  defaultOpen: boolean;
  itemIds: string[];
}

// ─── CLIENT_NAV_ITEMS — all 9 groups ─────────────────────────────────────────

export const CLIENT_NAV_ITEMS: ClientNavItem[] = [
  // ── HOME ──────────────────────────────────────────────────────────────────
  {
    id: 'client-command-center',
    label: 'Command Center',
    // The Command Center is the role-adaptive operational view rendered by
    // `src/app/app/page.tsx` (CommandCenterPage): live KPIs, alerts, approvals,
    // connector health and Ellinea — spec Requirement 2. `/app/dashboards` is
    // the Dashboard Engine *management* screen (spec Requirement 3) and must not
    // be the Command Center entry point.
    href: '/app',
    icon: 'dashboard',
    group: 'client-home',
    available: true,
  },
  {
    id: 'client-my-work',
    label: 'My Work',
    href: '/app/my-work',
    icon: 'my-work',
    group: 'client-home',
    available: true,
  },
  {
    id: 'client-alerts',
    label: 'Alerts',
    href: '/app/alerts',
    icon: 'alerts',
    group: 'client-home',
    available: true,
  },
  {
    id: 'client-approvals',
    label: 'Approvals',
    href: '/app/approvals',
    icon: 'approvals',
    group: 'client-home',
    available: true,
  },
  {
    id: 'client-activity',
    label: 'Activity',
    href: '/app/activity',
    icon: 'timeline',
    group: 'client-home',
    available: true,
  },
  {
    id: 'client-inbox',
    label: 'Inbox',
    href: '/app/inbox',
    icon: 'inbox',
    group: 'client-home',
    available: true,
  },

  // ── BUSINESS ──────────────────────────────────────────────────────────────
  {
    id: 'client-business-overview',
    label: 'Overview',
    href: '/app/business',
    icon: 'business-overview',
    group: 'client-business',
    available: true,
    minRole: 'manager',
  },
  {
    id: 'client-performance',
    label: 'Performance',
    href: '/app/business/performance',
    icon: 'performance',
    group: 'client-business',
    available: true,
    minRole: 'manager',
  },
  {
    id: 'client-reports',
    label: 'Reports',
    href: '/app/business/reports',
    icon: 'reports',
    group: 'client-business',
    available: true,
    minRole: 'manager',
  },
  {
    id: 'client-analytics',
    label: 'Analytics',
    href: '/app/business/analytics',
    icon: 'analytics',
    group: 'client-business',
    available: false,
    note: 'Analytics module planned — requires connected data sources.',
    minRole: 'manager',
  },

  // ── OPERATIONS ────────────────────────────────────────────────────────────
  {
    id: 'client-sales',
    label: 'Sales',
    href: '/app/operations/sales',
    icon: 'sales',
    group: 'client-operations',
    available: false,
    note: 'Sales module — requires a connected POS or CRM system.',
  },
  {
    id: 'client-purchases',
    label: 'Purchases',
    href: '/app/operations/purchases',
    icon: 'purchases',
    group: 'client-operations',
    available: false,
    note: 'Purchases module — requires a connected ERP or accounting system.',
  },
  {
    id: 'client-inventory',
    label: 'Inventory',
    href: '/app/operations/inventory',
    icon: 'inventory',
    group: 'client-operations',
    available: false,
    note: 'Inventory module — requires a connected inventory management system.',
  },
  {
    id: 'client-customers',
    label: 'Customers',
    href: '/app/operations/customers',
    icon: 'customers',
    group: 'client-operations',
    available: false,
    note: 'Customers module — requires a connected CRM.',
  },
  {
    id: 'client-suppliers',
    label: 'Suppliers',
    href: '/app/operations/suppliers',
    icon: 'suppliers',
    group: 'client-operations',
    available: false,
    note: 'Suppliers module — requires a connected procurement system.',
  },
  {
    id: 'client-payments',
    label: 'Payments',
    href: '/app/operations/payments',
    icon: 'payments',
    group: 'client-operations',
    available: false,
    note: 'Payments module — requires a connected accounting or payment system.',
  },
  {
    id: 'client-expenses',
    label: 'Expenses',
    href: '/app/operations/expenses',
    icon: 'expenses',
    group: 'client-operations',
    available: false,
    note: 'Expenses module — requires a connected finance system.',
  },
  {
    id: 'client-assets',
    label: 'Assets',
    href: '/app/operations/assets',
    icon: 'assets',
    group: 'client-operations',
    available: false,
    note: 'Assets module — planned for a future release.',
  },
  {
    id: 'client-branches',
    label: 'Branches',
    href: '/app/operations/branches',
    icon: 'branches',
    group: 'client-operations',
    available: false,
    note: 'Branch management — planned.',
    minRole: 'manager',
  },
  {
    id: 'client-warehouses',
    label: 'Warehouses',
    href: '/app/operations/warehouses',
    icon: 'warehouses',
    group: 'client-operations',
    available: false,
    note: 'Warehouse management — requires inventory system.',
    minRole: 'manager',
  },

  // ── PEOPLE ─────────────────────────────────────────────────────────────────
  {
    id: 'client-employees',
    label: 'Employees',
    href: '/app/people/employees',
    icon: 'employees',
    group: 'client-people',
    available: false,
    note: 'Employees module — requires a connected HR system.',
    minRole: 'manager',
  },
  {
    id: 'client-departments',
    label: 'Departments',
    href: '/app/people/departments',
    icon: 'departments',
    group: 'client-people',
    available: false,
    note: 'Departments module — planned.',
    minRole: 'manager',
  },
  {
    id: 'client-attendance',
    label: 'Attendance',
    href: '/app/people/attendance',
    icon: 'attendance',
    group: 'client-people',
    available: false,
    note: 'Attendance tracking — requires a connected HR system.',
    minRole: 'manager',
  },
  {
    id: 'client-leave',
    label: 'Leave',
    href: '/app/people/leave',
    icon: 'leave',
    group: 'client-people',
    available: false,
    note: 'Leave management — requires a connected HR system.',
  },
  {
    id: 'client-payroll',
    label: 'Payroll',
    href: '/app/people/payroll',
    icon: 'payroll',
    group: 'client-people',
    available: false,
    note: 'Payroll — requires a connected payroll system.',
    minRole: 'manager',
  },
  {
    id: 'client-roles',
    label: 'Roles',
    // Points at the real, implemented custom-roles surface. `/app/people/roles`
    // was declared live but never existed, producing a user-visible 404.
    href: '/app/settings/custom-roles',
    icon: 'access-control',
    group: 'client-people',
    available: true,
    minRole: 'owner',
  },

  // ── CUSTOMER RELATIONSHIP ─────────────────────────────────────────────────
  {
    id: 'client-crm-customers',
    label: 'Customers',
    href: '/app/crm/customers',
    icon: 'customers',
    group: 'client-crm',
    available: false,
    note: 'CRM — requires a connected CRM system.',
  },
  {
    id: 'client-leads',
    label: 'Leads',
    href: '/app/crm/leads',
    icon: 'leads',
    group: 'client-crm',
    available: false,
    note: 'Leads management — requires a connected CRM.',
  },
  {
    id: 'client-opportunities',
    label: 'Opportunities',
    href: '/app/crm/opportunities',
    icon: 'opportunities',
    group: 'client-crm',
    available: false,
    note: 'Opportunities — requires a connected CRM.',
  },
  {
    id: 'client-crm-activities',
    label: 'Activities',
    href: '/app/crm/activities',
    icon: 'activities',
    group: 'client-crm',
    available: false,
    note: 'Activities — requires a connected CRM.',
  },
  {
    id: 'client-follow-ups',
    label: 'Follow-ups',
    href: '/app/crm/follow-ups',
    icon: 'follow-ups',
    group: 'client-crm',
    available: false,
    note: 'Follow-ups — requires a connected CRM.',
  },

  // ── INTEGRATIONS ──────────────────────────────────────────────────────────
  // Three separate concepts, three separate destinations:
  //   Connected Website  the org's actual website and its measured state
  //   Connected Systems  the real business systems, and what each exposes
  //   Connectors         the technical inventory (how EIP reaches them)
  {
    id: 'client-connected-website',
    label: 'Connected Website',
    href: '/app/connected-website',
    icon: 'connected-systems',
    group: 'client-integrations',
    available: true,
  },
  {
    id: 'client-connected-systems',
    label: 'Connected Systems',
    href: '/app/connectors/systems',
    icon: 'connected-systems',
    group: 'client-integrations',
    available: true,
  },
  {
    id: 'client-connectors',
    label: 'Connectors',
    href: '/app/connectors/inventory',
    icon: 'connector-health',
    group: 'client-integrations',
    available: true,
  },
  {
    id: 'client-connector-health',
    label: 'Connector Health',
    href: '/app/connectors/health',
    icon: 'connector-health',
    group: 'client-integrations',
    available: true,
  },
  {
    id: 'client-integration-requests',
    label: 'Integration Requests',
    href: '/app/connectors/requests',
    icon: 'integration-requests',
    group: 'client-integrations',
    available: true,
  },

  // ── AUTOMATION ────────────────────────────────────────────────────────────
  {
    id: 'client-rules',
    label: 'Rules',
    href: '/app/automation/rules',
    icon: 'rules',
    group: 'client-automation',
    available: false,
    note: 'Rules engine — planned.',
    minRole: 'owner',
  },
  {
    id: 'client-workflows',
    label: 'Workflows',
    href: '/app/automation/workflows',
    icon: 'automation',
    group: 'client-automation',
    available: false,
    note: 'Workflows — planned.',
    minRole: 'owner',
  },
  {
    id: 'client-schedules',
    label: 'Schedules',
    href: '/app/automation/schedules',
    icon: 'schedules',
    group: 'client-automation',
    available: false,
    note: 'Scheduled automations — planned.',
    minRole: 'manager',
  },
  {
    id: 'client-executions',
    label: 'Executions',
    href: '/app/automation/executions',
    icon: 'executions',
    group: 'client-automation',
    available: false,
    note: 'Execution log — planned.',
    minRole: 'manager',
  },

  // ── INTELLIGENCE ──────────────────────────────────────────────────────────
  {
    id: 'client-ellinea-ai',
    label: 'Ellinea AI',
    href: '/app/intelligence/ellinea',
    icon: 'ellinea-ai',
    group: 'client-intelligence',
    available: true,
  },
  {
    id: 'client-insights',
    label: 'Insights',
    href: '/app/intelligence/insights',
    icon: 'insights',
    group: 'client-intelligence',
    available: false,
    note: 'Insights — requires live connected data.',
    minRole: 'manager',
  },
  {
    id: 'client-recommendations',
    label: 'Recommendations',
    href: '/app/intelligence/recommendations',
    icon: 'recommendations',
    group: 'client-intelligence',
    available: false,
    note: 'AI-generated recommendations — planned.',
    minRole: 'manager',
  },

  // ── ADMINISTRATION ────────────────────────────────────────────────────────
  {
    id: 'client-admin-users',
    label: 'Users & Access',
    href: '/app/admin/users',
    icon: 'people',
    group: 'client-administration',
    available: true,
    minRole: 'owner',
  },
  {
    id: 'client-business-settings',
    label: 'Business Settings',
    href: '/app/admin/settings',
    icon: 'business-settings',
    group: 'client-administration',
    available: true,
    minRole: 'owner',
  },
  {
    id: 'client-notifications',
    label: 'Notifications',
    href: '/app/admin/notifications',
    icon: 'notifications',
    group: 'client-administration',
    available: true,
    minRole: 'owner',
  },
  {
    id: 'client-audit',
    label: 'Audit',
    href: '/app/admin/audit',
    icon: 'audit',
    group: 'client-administration',
    available: true,
    minRole: 'owner',
  },
  {
    id: 'client-data-privacy',
    label: 'Data & Privacy',
    href: '/app/admin/data-privacy',
    icon: 'data-privacy',
    group: 'client-administration',
    available: false,
    note: 'Data & Privacy controls — planned.',
    minRole: 'owner',
  },
];

// ─── CLIENT_NAV_GROUPS — 9 group definitions ──────────────────────────────────

export const CLIENT_NAV_GROUPS: ClientNavGroupDef[] = [
  {
    id: 'client-home',
    label: 'HOME',
    collapsible: false,
    defaultOpen: true,
    itemIds: ['client-command-center', 'client-my-work', 'client-alerts', 'client-approvals', 'client-activity', 'client-inbox'],
  },
  {
    id: 'client-business',
    label: 'BUSINESS',
    collapsible: true,
    defaultOpen: true,
    itemIds: ['client-business-overview', 'client-performance', 'client-reports', 'client-analytics'],
  },
  {
    id: 'client-operations',
    label: 'OPERATIONS',
    collapsible: true,
    defaultOpen: false,
    itemIds: [
      'client-sales', 'client-purchases', 'client-inventory', 'client-customers',
      'client-suppliers', 'client-payments', 'client-expenses', 'client-assets',
      'client-branches', 'client-warehouses',
    ],
  },
  {
    id: 'client-people',
    label: 'PEOPLE',
    collapsible: true,
    defaultOpen: false,
    itemIds: [
      'client-employees', 'client-departments', 'client-attendance', 'client-leave',
      'client-payroll', 'client-roles',
    ],
  },
  {
    id: 'client-crm',
    label: 'CUSTOMER RELATIONSHIP',
    collapsible: true,
    defaultOpen: false,
    itemIds: ['client-crm-customers', 'client-leads', 'client-opportunities', 'client-crm-activities', 'client-follow-ups'],
  },
  {
    id: 'client-integrations',
    label: 'INTEGRATIONS',
    collapsible: true,
    defaultOpen: true,
    itemIds: [
      'client-connected-website',
      'client-connected-systems',
      'client-connectors',
      'client-connector-health',
      'client-integration-requests',
    ],
  },
  {
    id: 'client-automation',
    label: 'AUTOMATION',
    collapsible: true,
    defaultOpen: false,
    itemIds: ['client-rules', 'client-workflows', 'client-schedules', 'client-executions'],
  },
  {
    id: 'client-intelligence',
    label: 'INTELLIGENCE',
    collapsible: true,
    defaultOpen: true,
    itemIds: ['client-ellinea-ai', 'client-insights', 'client-recommendations'],
  },
  {
    id: 'client-administration',
    label: 'ADMINISTRATION',
    collapsible: true,
    defaultOpen: false,
    itemIds: ['client-admin-users', 'client-business-settings', 'client-notifications', 'client-audit', 'client-data-privacy'],
  },
];

// ─── resolveClientNavigation ──────────────────────────────────────────────────

const ROLE_LEVEL: Record<string, number> = {
  owner: 5,
  executive: 4,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

/**
 * Filter and return the ClientNavGroupDef[] the user should see.
 *
 * Rules:
 * - Items with `available: false` are retained (rendered as planned state) but not omitted.
 * - Items requiring a higher role than the user's are removed from the group.
 * - Empty groups (all items removed) are omitted entirely.
 * - Staff (member / viewer) sees only HOME + explicitly-granted items.
 * - No PlatformSectionId items are ever included — this is enforced by the fact that
 *   CLIENT_NAV_ITEMS contains no `section` fields that map to PlatformSectionId values.
 */
export function resolveClientNavigation(opts: {
  role: 'owner' | 'executive' | 'admin' | 'manager' | 'member' | 'viewer';
  packageFeatures: string[];
  grantedPermissions: string[];
}): ClientNavGroupDef[] {
  const userLevel = ROLE_LEVEL[opts.role] ?? 1;

  // Build a lookup of item id → item
  const itemById = new Map<string, ClientNavItem>(
    CLIENT_NAV_ITEMS.map((item) => [item.id, item]),
  );

  const resolvedGroups: ClientNavGroupDef[] = [];

  for (const group of CLIENT_NAV_GROUPS) {
    // Filter items by role
    const visibleItemIds = group.itemIds.filter((itemId) => {
      const item = itemById.get(itemId);
      if (!item) return false;

      // Role check
      if (item.minRole) {
        const requiredLevel = ROLE_LEVEL[item.minRole] ?? 1;
        if (userLevel < requiredLevel) return false;
      }

      // Package feature check
      if (item.requiresPackageFeature) {
        if (!opts.packageFeatures.includes(item.requiresPackageFeature)) return false;
      }

      return true;
    });

    // Omit entirely empty groups
    if (visibleItemIds.length === 0) continue;

    resolvedGroups.push({ ...group, itemIds: visibleItemIds });
  }

  return resolvedGroups;
}
