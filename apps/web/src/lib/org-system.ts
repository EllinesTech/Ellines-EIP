/** Organization System hub helpers — read-only views over UEM / enterprise snapshot. */

import type { EnterpriseSummaryDto } from '@/lib/api';
import { buildDailyBriefText } from '@/lib/ellinea-engine';

export type OrgSystemPeriod = 'today' | '7d' | '30d' | 'custom';

export type OrgSystemTask = {
  id: string;
  title: string;
  purpose: string;
  href?: string;
  comingSoon?: boolean;
};

export const ORG_SYSTEM_TASKS: OrgSystemTask[] = [
  {
    id: 'report',
    title: 'Generate report',
    purpose: 'Pick a period and summarize health, alerts, and timeline from connected systems.',
    href: '/app/org-system/report',
  },
  {
    id: 'employees',
    title: 'Employee register',
    purpose: 'People / staff directory from UEM objects synced out of HR or SoR connectors.',
    href: '/app/org-system/employees',
  },
  {
    id: 'clients-today',
    title: 'Patients / clients today',
    purpose: 'Today’s patients or clients from timeline and objects — label follows industry.',
    href: '/app/org-system/clients-today',
  },
  {
    id: 'alerts-digest',
    title: 'Open alerts digest',
    purpose: 'Prioritized open alerts across connected systems with Ellinea framing.',
    comingSoon: true,
  },
  {
    id: 'branch-health',
    title: 'Branch health',
    purpose: 'Per-site health and pressure from UEM branches once multi-site sync is live.',
    comingSoon: true,
  },
  {
    id: 'inventory',
    title: 'Inventory snapshot',
    purpose: 'Assets and stock-style objects from SoR — read-only observe, not write-back.',
    comingSoon: true,
  },
];

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

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function periodWindow(
  period: OrgSystemPeriod,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const end = now;
  if (period === 'today') {
    return { from: startOfLocalDay(now), to: end, label: 'Today' };
  }
  if (period === '7d') {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from, to: end, label: 'Last 7 days' };
  }
  if (period === '30d') {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to: end, label: 'Last 30 days' };
  }
  const from = customFrom ? new Date(customFrom) : startOfLocalDay(now);
  const to = customTo ? new Date(customTo) : end;
  const safeFrom = Number.isNaN(from.getTime()) ? startOfLocalDay(now) : from;
  const safeTo = Number.isNaN(to.getTime()) ? end : to;
  return {
    from: safeFrom,
    to: safeTo,
    label: `Custom (${safeFrom.toLocaleDateString()} – ${safeTo.toLocaleDateString()})`,
  };
}

/** Timeline items have no timestamps in the DTO — keep all when synced; filter by keyword heuristics for “today”. */
export function filterTimelineForPeriod(
  timeline: { title: string; detail: string }[],
  period: OrgSystemPeriod,
): { title: string; detail: string }[] {
  if (!timeline.length) return [];
  if (period === 'today') {
    const todayHints = /today|this morning|overnight|now|current|live/i;
    const hit = timeline.filter((e) => todayHints.test(`${e.title} ${e.detail}`));
    return hit.length ? hit : timeline.slice(0, 6);
  }
  if (period === '7d') return timeline.slice(0, 10);
  if (period === '30d') return timeline.slice(0, 16);
  return timeline;
}

export function buildOrgPeriodReport(input: {
  summary: EnterpriseSummaryDto | null;
  orgName: string;
  role: string;
  period: OrgSystemPeriod;
  customFrom?: string;
  customTo?: string;
}): string {
  const { summary, orgName, role, period, customFrom, customTo } = input;
  const window = periodWindow(period, customFrom, customTo);

  if (!summary || summary.status !== 'synced') {
    return [
      `Ellines EIP · Organization report — ${orgName}`,
      `Period: ${window.label}`,
      '',
      'No live connector sync yet. Open Connectors and run Sync so EIP can observe the System of Record.',
      'EIP wraps and summarizes — it does not replace or write back to Hospidia / ERP unless a write path already exists.',
    ].join('\n');
  }

  const events = filterTimelineForPeriod(summary.timeline || [], period);
  const brief = buildDailyBriefText(summary, {
    role,
    organizationName: orgName,
    useRoleContext: true,
  });
  const counts = summary.model?.counts;
  const countLine = counts
    ? `UEM counts — branches ${counts.branches}, people ${counts.people}, tasks ${counts.tasks}, notifications ${counts.notifications}, events ${counts.events}.`
    : 'UEM counts unavailable in this snapshot.';

  const timelineBlock = events.length
    ? events.map((e, i) => `${i + 1}. ${e.title} — ${e.detail}`).join('\n')
    : 'No timeline events in this snapshot window.';

  return [
    `Ellines EIP · Organization report — ${orgName}`,
    `Period: ${window.label}`,
    `Source: ${summary.connectorName}${summary.syncedAt ? ` · synced ${new Date(summary.syncedAt).toLocaleString()}` : ''}`,
    '',
    `Health ${summary.healthScore}/100 · ${summary.connectedSystems} system(s) · alerts ${summary.openAlerts} · decisions ${summary.openDecisions}`,
    countLine,
    '',
    'Ellinea narrative',
    brief,
    '',
    'Timeline (filtered)',
    timelineBlock,
    '',
    'Observe-only: EIP does not write these findings back to the System of Record.',
  ].join('\n');
}

export function filterTodayClientObjects(
  objects: NonNullable<EnterpriseSummaryDto['model']>['objects'],
): NonNullable<EnterpriseSummaryDto['model']>['objects'] {
  const list = objects || [];
  const kindHits = list.filter((o) => isClientOrPatientKind(o.kind));
  if (kindHits.length) return kindHits;
  const nameHits = list.filter((o) =>
    /patient|client|customer|appointment|visit|encounter/i.test(`${o.name} ${o.status || ''}`),
  );
  return nameHits;
}

export function filterTodayTimelineEvents(
  timeline: { title: string; detail: string }[],
): { title: string; detail: string }[] {
  const todayHints = /today|this morning|overnight|appointment|patient|client|visit|check.?in|admission/i;
  const hit = (timeline || []).filter((e) => todayHints.test(`${e.title} ${e.detail}`));
  return hit.length ? hit : (timeline || []).slice(0, 8);
}
