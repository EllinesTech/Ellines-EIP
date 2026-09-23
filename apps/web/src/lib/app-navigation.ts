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
  | 'ai';

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
  | 'ellinea-ai';

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
    href: '/app/org-data',
    icon: 'org-data',
    group: 'ellines-organization',
    orgSystemAccess: true,
    available: true,
  },
  {
    id: 'org-system',
    label: 'Organization System',
    href: '/app/org-system',
    icon: 'org-system',
    group: 'ellines-organization',
    orgSystemAccess: true,
    available: true,
  },
  {
    id: 'org-admin',
    label: 'Org Admin',
    superAdminLabel: 'Organization Admin',
    href: '/app/admin',
    icon: 'org-admin',
    group: 'ellines-organization',
    adminOnly: true,
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

const href = platformSectionHref;

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
    available: false,
    note: 'Reserved — the client service catalogue is in the build queue and has no live view yet.',
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
    available: false,
    note: 'Reserved — client activity/usage reporting is in the build queue and has no live view yet.',
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
    available: false,
    note: 'Reserved — client incident/alerts triage is in the build queue and has no live view yet.',
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
    available: false,
    note: 'Reserved — internal Ellines staff roles and grants (Phase 4). Client-organization access is live under Client Organizations → Users & Access.',
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
    itemIds: ['overview', 'org-data', 'org-system', 'org-admin', 'settings'],
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

