export type ReportRun = {
  id: string;
  reportId: string;
  reportTitle: string;
  reportTemplate: ReportTemplate;
  runAt: string;
  status: 'queued' | 'sent' | 'failed';
  emailStatus: string;
  recipientCount: number;
  reportBody: string; // Full text content
  htmlBody?: string; // HTML version if generated
};

export type ReportCadence = 'daily' | 'weekly';
export type ReportTemplate = 'executive' | 'operational' | 'department' | 'custom';

export type ScheduledReport = {
  id: string;
  title: string;
  cadence: ReportCadence;
  template: ReportTemplate;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunHint: string;
  createdAt: string;
  /** Primary To recipients (empty → actor email on run). */
  recipients: string[];
  cc: string[];
  bcc: string[];
  /** Preferred send hour UTC (0–23), null = morning default. */
  sendHour: number | null;
};

/** Parse comma / semicolon / whitespace separated emails. */
export function parseEmailList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out.slice(0, 40);
}

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
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 40).map((r) => ({
      ...r,
      recipients: Array.isArray(r.recipients) ? r.recipients : [],
      cc: Array.isArray(r.cc) ? r.cc : [],
      bcc: Array.isArray(r.bcc) ? r.bcc : [],
      sendHour: typeof r.sendHour === 'number' ? r.sendHour : null,
    }));
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
  template?: ReportTemplate;
}): string {
  const base = [
    `Health ${input.healthScore}/100 · ${input.connectedSystems} system(s)`,
    `Alerts ${input.openAlerts} · Open decisions ${input.openDecisions}`,
    input.briefHighlight,
  ];

  switch (input.template) {
    case 'executive':
      return [
        `── Executive Report · ${input.orgName} ──`,
        ...base,
        '',
        'Sections: Enterprise Health · Open Decisions · Ellinea Brief · Key KPIs',
        'Audience: CEO, Board, Owner',
      ].join('\n');
    case 'operational':
      return [
        `── Operational Report · ${input.orgName} ──`,
        ...base,
        '',
        'Sections: Connector Status · Sync Health · Active Alerts · Workflow Queue',
        'Audience: IT Admin, Operations Manager',
      ].join('\n');
    case 'department':
      return [
        `── Department Report · ${input.orgName} ──`,
        ...base,
        '',
        'Sections: Dept KPIs · Branch Activity · People Summary · Document Count',
        'Audience: Department Managers, HR',
      ].join('\n');
    default:
      return [
        `── Custom Report · ${input.orgName} ──`,
        ...base,
        '',
        'All sections included. Customize title to match your use case.',
      ].join('\n');
  }
}

/** Default titles and descriptions per template type */
export const REPORT_TEMPLATES: {
  value: ReportTemplate;
  label: string;
  defaultTitle: string;
  description: string;
}[] = [
  {
    value: 'executive',
    label: '📊 Executive',
    defaultTitle: 'CEO Daily Brief',
    description: 'Health score, open decisions, Ellinea brief. For CEO / Board.',
  },
  {
    value: 'operational',
    label: '⚙️ Operational',
    defaultTitle: 'IT Operations Report',
    description: 'Connector status, sync health, alert queue. For IT Admin.',
  },
  {
    value: 'department',
    label: '🏢 Department',
    defaultTitle: 'Department Summary',
    description: 'Branch activity, people, documents. For Dept Managers.',
  },
  {
    value: 'custom',
    label: '✏️ Custom',
    defaultTitle: 'Custom Report',
    description: 'All sections. Set your own title and schedule.',
  },
];
