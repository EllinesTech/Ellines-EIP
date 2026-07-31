export type ReportCadence = 'daily' | 'weekly';

export type ScheduledReport = {
  id: string;
  title: string;
  cadence: ReportCadence;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
};

const PREFIX = 'eip_scheduled_reports_';

export function reportsKey(organizationId: string) {
  return `${PREFIX}${organizationId}`;
}

export function readScheduledReports(organizationId: string): ScheduledReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(reportsKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledReport[];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function writeScheduledReports(organizationId: string, items: ScheduledReport[]) {
  localStorage.setItem(reportsKey(organizationId), JSON.stringify(items.slice(0, 40)));
}

export function buildReportPreview(input: {
  orgName: string;
  healthScore: number;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  briefHighlight: string;
}): string {
  return [
    `Ellines EIP · Executive report — ${input.orgName}`,
    `Health ${input.healthScore}/100 · ${input.connectedSystems} system(s)`,
    `Alerts ${input.openAlerts} · Open decisions ${input.openDecisions}`,
    input.briefHighlight,
    'Generated locally until email/PDF service ships.',
  ].join('\n');
}
