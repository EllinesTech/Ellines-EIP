/**
 * Organization System capability catalog — data-driven tasks for Owner/IT.
 * EIP observes connected Systems of Record; it does not replace them.
 */

import type { EnterpriseSummaryDto } from '@/lib/api';

const HEALTHCARE_RE =
  /hospidia|hospital|clinic|health|patient|medical|his|ehr|emr|pharmacy|care\b/i;

export function detectHealthcareLabel(summary: EnterpriseSummaryDto | null): 'patients' | 'clients' {
  if (!summary) return 'clients';
  const hay = [
    summary.connectorName,
    summary.briefHighlight,
    summary.model?.sourceSystem || '',
    ...(summary.model?.capabilities || []),
  ]
    .join(' ')
    .toLowerCase();
  return HEALTHCARE_RE.test(hay) ? 'patients' : 'clients';
}

export function isPeopleKind(kind: string): boolean {
  const k = kind.toLowerCase();
  return (
    k === 'person' ||
    k === 'people' ||
    k === 'user' ||
    k === 'staff' ||
    k === 'employee' ||
    k === 'worker'
  );
}

export function isClientOrPatientKind(kind: string): boolean {
  const k = kind.toLowerCase();
  return (
    k === 'patient' ||
    k === 'client' ||
    k === 'customer' ||
    k === 'guest' ||
    k === 'appointment' ||
    k === 'visit' ||
    k === 'encounter'
  );
}

export type OrgSystemDomainId =
  | 'intelligence'
  | 'people'
  | 'customers'
  | 'operations'
  | 'clinical'
  | 'finance'
  | 'documents'
  | 'alerts'
  | 'reports'
  | 'connectors';

export type OrgSystemDomain = {
  id: OrgSystemDomainId;
  label: string;
  blurb: string;
};

export const ORG_SYSTEM_DOMAINS: OrgSystemDomain[] = [
  {
    id: 'intelligence',
    label: 'Intelligence',
    blurb: 'Ellinea brief and recommendations over the live enterprise snapshot.',
  },
  {
    id: 'people',
    label: 'People & HR',
    blurb: 'Workforce directory and stubs for attendance / org structure from HR SoR.',
  },
  {
    id: 'customers',
    label: 'Customers / Patients / Clients',
    blurb: 'Today’s activity and registers — label follows healthcare vs commercial heuristics.',
  },
  {
    id: 'operations',
    label: 'Operations',
    blurb: 'Branches, tasks, assets / fleet, and inventory-style observe views.',
  },
  {
    id: 'clinical',
    label: 'Clinical / Service today',
    blurb: 'Healthcare-oriented today view when HIS / clinical connectors are detected.',
  },
  {
    id: 'finance',
    label: 'Finance glance',
    blurb: 'Health, decisions, and pressure proxies until a finance SoR publishes metrics.',
  },
  {
    id: 'documents',
    label: 'Documents / files',
    blurb: 'Document objects synced from connected systems (read-only).',
  },
  {
    id: 'alerts',
    label: 'Alerts & decisions',
    blurb: 'Open alerts digest and approval / decision queues.',
  },
  {
    id: 'reports',
    label: 'Reports',
    blurb: 'Period summaries and scheduled report previews.',
  },
  {
    id: 'connectors',
    label: 'Connectors / Auto-scan',
    blurb: 'Install, sync, and Ellinea-assisted discovery of Systems of Record.',
  },
];

/** What unlocks a “live” badge after sync. */
export type LiveSignal =
  | 'synced'
  | 'people'
  | 'branches'
  | 'departments'
  | 'documents'
  | 'assets'
  | 'tasks'
  | 'notifications'
  | 'events'
  | 'openAlerts'
  | 'openDecisions'
  | 'timeline'
  | 'clients'
  | 'healthcare'
  | 'always';

export type CapabilityView =
  | 'objects'
  | 'timeline'
  | 'metrics'
  | 'brief'
  | 'recommendations'
  | 'stub'
  | 'link';

export type OrgSystemCapability = {
  id: string;
  domain: OrgSystemDomainId;
  title: string;
  purpose: string;
  href: string;
  liveWhen: LiveSignal[];
  /** Dynamic capability page renderer (ignored for external deep links). */
  view?: CapabilityView;
  objectKinds?: string[];
  /** Case-insensitive name / status substring hints when kinds alone are thin. */
  nameHints?: string[];
  healthcareOnly?: boolean;
  emptyHint?: string;
};

export const ORG_SYSTEM_CAPABILITIES: OrgSystemCapability[] = [
  {
    id: 'brief',
    domain: 'intelligence',
    title: 'Ellinea daily brief',
    purpose: 'Role-framed situation → evidence → watch / decide / delegate from the live snapshot.',
    href: '/app/org-system/brief',
    liveWhen: ['synced'],
    view: 'brief',
  },
  {
    id: 'recommendations',
    domain: 'intelligence',
    title: 'Ellinea recommendations',
    purpose: 'Explainable next actions grounded in alerts, decisions, and UEM pressure.',
    href: '/app/org-system/recommendations',
    liveWhen: ['synced'],
    view: 'recommendations',
  },
  {
    id: 'employees',
    domain: 'people',
    title: 'Employee register',
    purpose: 'People / staff directory from UEM objects synced out of HR or SoR connectors.',
    href: '/app/org-system/employees',
    liveWhen: ['people'],
    view: 'objects',
    objectKinds: ['person', 'user', 'staff', 'employee'],
  },
  {
    id: 'attendance',
    domain: 'people',
    title: 'Attendance',
    purpose: 'Attendance / punch stubs once HR connectors expose presence events.',
    href: '/app/org-system/attendance',
    liveWhen: ['events', 'timeline'],
    view: 'stub',
    emptyHint: 'Sync an HR connector that publishes attendance events to unlock this view.',
  },
  {
    id: 'org-chart',
    domain: 'people',
    title: 'Org chart / departments',
    purpose: 'Department and branch structure from UEM — observe-only hierarchy.',
    href: '/app/org-system/org-chart',
    liveWhen: ['departments', 'branches'],
    view: 'objects',
    objectKinds: ['department', 'branch'],
  },
  {
    id: 'clients-today',
    domain: 'customers',
    title: 'Patients / clients today',
    purpose: 'Today’s patients or clients from timeline and objects — label follows industry.',
    href: '/app/org-system/clients-today',
    liveWhen: ['clients', 'timeline'],
    view: 'objects',
  },
  {
    id: 'clients-register',
    domain: 'customers',
    title: 'Client / patient register',
    purpose: 'Full register of client, patient, or customer-style objects from the SoR.',
    href: '/app/org-system/clients-register',
    liveWhen: ['clients'],
    view: 'objects',
    nameHints: ['patient', 'client', 'customer', 'guest'],
  },
  {
    id: 'appointments',
    domain: 'customers',
    title: 'Appointments',
    purpose: 'Appointment / visit / encounter stubs from clinical or CRM connectors.',
    href: '/app/org-system/appointments',
    liveWhen: ['clients', 'timeline', 'events'],
    view: 'stub',
    nameHints: ['appointment', 'visit', 'encounter', 'booking'],
    emptyHint: 'Sync a connector that publishes appointments or visits to unlock this list.',
  },
  {
    id: 'branches',
    domain: 'operations',
    title: 'Branches / sites',
    purpose: 'Per-site branch objects and counts from multi-site Systems of Record.',
    href: '/app/org-system/branches',
    liveWhen: ['branches'],
    view: 'objects',
    objectKinds: ['branch'],
  },
  {
    id: 'tasks',
    domain: 'operations',
    title: 'Org tasks',
    purpose: 'Open tasks and work items published into UEM by connected systems.',
    href: '/app/org-system/tasks',
    liveWhen: ['tasks'],
    view: 'objects',
    objectKinds: ['task'],
  },
  {
    id: 'assets',
    domain: 'operations',
    title: 'Assets / fleet',
    purpose: 'Vehicles and assets from UEM — companion Fleet view for phone, full list here.',
    href: '/app/org-system/assets',
    liveWhen: ['assets'],
    view: 'objects',
    objectKinds: ['asset'],
    nameHints: ['fleet', 'vehicle', 'car', 'truck', 'van'],
  },
  {
    id: 'inventory',
    domain: 'operations',
    title: 'Inventory snapshot',
    purpose: 'Stock-style assets and inventory objects — read-only observe, not write-back.',
    href: '/app/org-system/inventory',
    liveWhen: ['assets'],
    view: 'stub',
    nameHints: ['inventory', 'stock', 'sku', 'warehouse'],
    emptyHint: 'Sync an inventory-capable connector to unlock stock-style objects.',
  },
  {
    id: 'clinical-today',
    domain: 'clinical',
    title: 'Clinical / service today',
    purpose: 'Healthcare today board when HIS keywords (e.g. Hospidia) are detected.',
    href: '/app/org-system/clinical-today',
    liveWhen: ['healthcare', 'clients', 'timeline'],
    view: 'timeline',
    healthcareOnly: false,
    emptyHint: 'Connect a HIS / clinical SoR, or open Patients today once sync is live.',
  },
  {
    id: 'finance',
    domain: 'finance',
    title: 'Finance glance',
    purpose: 'Enterprise health and decision pressure as a finance proxy until finance metrics sync.',
    href: '/app/org-system/finance',
    liveWhen: ['openDecisions', 'synced'],
    view: 'metrics',
    emptyHint: 'Sync a finance-capable connector for richer metrics; until then health / decisions are shown.',
  },
  {
    id: 'documents',
    domain: 'documents',
    title: 'Documents / files',
    purpose: 'Document objects from connected DMS / SoR — observe and search, do not replace the SoR.',
    href: '/app/org-system/documents',
    liveWhen: ['documents'],
    view: 'objects',
    objectKinds: ['document'],
  },
  {
    id: 'alerts',
    domain: 'alerts',
    title: 'Open alerts digest',
    purpose: 'Prioritized open alerts across connected systems with Ellinea framing.',
    href: '/app/org-system/alerts',
    liveWhen: ['openAlerts', 'notifications'],
    view: 'metrics',
  },
  {
    id: 'decisions',
    domain: 'alerts',
    title: 'Decisions / approvals',
    purpose: 'Open decisions from the snapshot plus the local Approvals queue.',
    href: '/app/org-system/decisions',
    liveWhen: ['openDecisions'],
    view: 'link',
  },
  {
    id: 'report',
    domain: 'reports',
    title: 'Period report',
    purpose: 'Pick a period and summarize health, alerts, and timeline from connected systems.',
    href: '/app/org-system/report',
    liveWhen: ['synced'],
    view: 'link',
  },
  {
    id: 'scheduled-reports',
    domain: 'reports',
    title: 'Scheduled reports',
    purpose: 'Local report schedules and previews (Work Console Reports).',
    href: '/app/reports',
    liveWhen: ['always'],
    view: 'link',
  },
  {
    id: 'connectors',
    domain: 'connectors',
    title: 'Connectors',
    purpose: 'Install and sync Systems of Record — EIP connects and observes only.',
    href: '/app/connectors',
    liveWhen: ['always'],
    view: 'link',
  },
  {
    id: 'autoscan',
    domain: 'connectors',
    title: 'Auto-scan / Ellinea detect',
    purpose: 'Owner/IT discovery of online or local systems with wizard prefill.',
    href: '/app/connectors#eip-autoscan',
    liveWhen: ['always'],
    view: 'link',
  },
];

/** Slugs handled by `/app/org-system/[capability]` (not dedicated static pages). */
export const ORG_SYSTEM_DYNAMIC_SLUGS = new Set(
  ORG_SYSTEM_CAPABILITIES.filter((c) => {
    const prefix = '/app/org-system/';
    if (!c.href.startsWith(prefix)) return false;
    const slug = c.href.slice(prefix.length).split(/[?#]/)[0];
    return !['report', 'employees', 'clients-today'].includes(slug);
  }).map((c) => c.href.replace(/^\/app\/org-system\//, '').split(/[?#]/)[0]),
);

export function getCapabilityById(id: string): OrgSystemCapability | undefined {
  return ORG_SYSTEM_CAPABILITIES.find((c) => c.id === id);
}

export function getCapabilityBySlug(slug: string): OrgSystemCapability | undefined {
  return ORG_SYSTEM_CAPABILITIES.find((c) => {
    if (!c.href.startsWith('/app/org-system/')) return false;
    return c.href.slice('/app/org-system/'.length).split(/[?#]/)[0] === slug;
  });
}

export type CapabilityAvailability = {
  status: 'live' | 'no-data' | 'needs-sync' | 'ready';
  badge: string;
  count: number | null;
};

function countClients(summary: EnterpriseSummaryDto): number {
  const objects = summary.model?.objects || [];
  const kindHits = objects.filter((o) => isClientOrPatientKind(o.kind)).length;
  if (kindHits) return kindHits;
  return objects.filter((o) =>
    /patient|client|customer|guest|appointment|visit|encounter/i.test(`${o.name} ${o.status || ''}`),
  ).length;
}

function signalValue(signal: LiveSignal, summary: EnterpriseSummaryDto | null): number {
  if (!summary || summary.status !== 'synced') return 0;
  const counts = summary.model?.counts;
  switch (signal) {
    case 'always':
      return 1;
    case 'synced':
      return 1;
    case 'people':
      return counts?.people ?? (summary.model?.objects || []).filter((o) => isPeopleKind(o.kind)).length;
    case 'branches':
      return counts?.branches ?? 0;
    case 'departments':
      return counts?.departments ?? 0;
    case 'documents':
      return counts?.documents ?? 0;
    case 'assets':
      return counts?.assets ?? 0;
    case 'tasks':
      return counts?.tasks ?? 0;
    case 'notifications':
      return counts?.notifications ?? 0;
    case 'events':
      return counts?.events ?? 0;
    case 'openAlerts':
      return summary.openAlerts || 0;
    case 'openDecisions':
      return summary.openDecisions || 0;
    case 'timeline':
      return summary.timeline?.length ?? 0;
    case 'clients':
      return countClients(summary);
    case 'healthcare':
      return detectHealthcareLabel(summary) === 'patients' ? 1 : 0;
    default:
      return 0;
  }
}

export function resolveCapabilityAvailability(
  cap: OrgSystemCapability,
  summary: EnterpriseSummaryDto | null,
): CapabilityAvailability {
  const synced = summary?.status === 'synced';
  if (cap.liveWhen.includes('always')) {
    return { status: 'ready', badge: 'Open', count: null };
  }
  if (!synced) {
    return { status: 'needs-sync', badge: 'Sync to unlock', count: null };
  }

  const values = cap.liveWhen.map((s) => signalValue(s, summary));
  const total = values.reduce((a, b) => a + b, 0);
  const primary = values.find((v) => v > 0) ?? 0;

  if (total > 0) {
    return {
      status: 'live',
      badge: primary > 0 && !cap.liveWhen.every((s) => s === 'synced' || s === 'always')
        ? `Live · ${primary}`
        : 'Live',
      count: primary > 0 ? primary : null,
    };
  }

  return { status: 'no-data', badge: 'No data yet', count: 0 };
}

export function filterObjectsForCapability(
  cap: OrgSystemCapability,
  summary: EnterpriseSummaryDto | null,
): NonNullable<NonNullable<EnterpriseSummaryDto['model']>['objects']> {
  const objects = summary?.model?.objects || [];
  if (!objects.length) return [];

  const kinds = (cap.objectKinds || []).map((k) => k.toLowerCase());
  const hints = (cap.nameHints || []).map((h) => h.toLowerCase());

  if (cap.id === 'clients-register' || cap.id === 'clients-today') {
    return objects.filter(
      (o) =>
        isClientOrPatientKind(o.kind) ||
        hints.some((h) => `${o.name} ${o.status || ''}`.toLowerCase().includes(h)),
    );
  }

  if (cap.id === 'employees') {
    return objects.filter((o) => isPeopleKind(o.kind));
  }

  let hits = objects;
  if (kinds.length) {
    hits = hits.filter((o) => kinds.includes(o.kind.toLowerCase()));
  }
  if (hints.length) {
    const hintHits = objects.filter((o) =>
      hints.some((h) => `${o.name} ${o.status || ''} ${o.kind}`.toLowerCase().includes(h)),
    );
    if (kinds.length) {
      const ids = new Set(hits.map((o) => o.id));
      for (const h of hintHits) if (!ids.has(h.id)) hits = [...hits, h];
    } else {
      hits = hintHits;
    }
  }
  return hits;
}

export function groupCapabilitiesByDomain(
  summary: EnterpriseSummaryDto | null,
): { domain: OrgSystemDomain; items: { cap: OrgSystemCapability; availability: CapabilityAvailability }[] }[] {
  const healthcare = detectHealthcareLabel(summary) === 'patients';
  return ORG_SYSTEM_DOMAINS.map((domain) => {
    const items = ORG_SYSTEM_CAPABILITIES.filter((c) => c.domain === domain.id)
      .filter((c) => {
        if (domain.id === 'clinical' && !healthcare && c.healthcareOnly) return false;
        return true;
      })
      .map((cap) => ({
        cap,
        availability: resolveCapabilityAvailability(cap, summary),
      }));
    return { domain, items };
  }).filter((g) => g.items.length > 0);
}
