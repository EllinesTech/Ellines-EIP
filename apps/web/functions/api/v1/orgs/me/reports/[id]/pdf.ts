/**
 * Pages Function: GET /api/v1/orgs/me/reports/:id/pdf
 * Return HTML version of report for PDF printing/download (browser print-to-PDF).
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../../shared/auth';

type ScheduledReport = {
  id: string; title: string; cadence: string; template?: string; enabled: boolean;
  lastRunAt: string | null; nextRunHint: string; createdAt: string;
};

type MemoryNote = { id: string; title: string; body: string };

function asObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalize(raw: unknown): ScheduledReport[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ScheduledReport[]).filter(
    (x) => x && typeof x === 'object' && typeof x.id === 'string',
  ).slice(0, 40);
}

function buildHTMLReport(params: {
  title: string;
  orgName: string;
  runAt: string;
  healthScore: number;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  briefHighlight: string;
  timeline: { title: string; detail: string }[];
  memoryNotes: MemoryNote[];
  template?: string;
}): string {
  const templateTitle = params.template === 'executive' ? 'Executive Report'
    : params.template === 'operational' ? 'Operational Report'
    : params.template === 'department' ? 'Department Report'
    : 'Custom Report';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${params.title}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #0f172a;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      border-bottom: 3px solid #6F2D8D;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo-area {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 10px;
    }
    .logo {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #6F2D8D 0%, #2563EB 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 20px;
    }
    .brand {
      flex: 1;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 600;
      color: #6F2D8D;
      margin: 0;
    }
    .tagline {
      font-size: 12px;
      color: #64748b;
      margin: 2px 0 0 0;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
      margin: 15px 0 5px 0;
    }
    .report-meta {
      font-size: 14px;
      color: #64748b;
      margin: 5px 0;
    }
    .template-badge {
      display: inline-block;
      background: #ede9fe;
      color: #6F2D8D;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
    }
    .section {
      margin: 30px 0;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #6F2D8D;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
    }
    .kpi-label {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .kpi-value {
      font-size: 32px;
      font-weight: 700;
      color: #0f172a;
    }
    .health-score {
      font-size: 48px;
      color: #6F2D8D;
    }
    .brief-box {
      background: linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%);
      border-left: 4px solid #6F2D8D;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .brief-box p {
      margin: 0;
      color: #1e293b;
      line-height: 1.7;
    }
    .timeline-item, .memory-item {
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .timeline-item:last-child, .memory-item:last-child {
      border-bottom: none;
    }
    .timeline-title, .memory-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .timeline-detail, .memory-body {
      color: #64748b;
      font-size: 14px;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
    }
    .footer-brand {
      font-weight: 600;
      color: #6F2D8D;
    }
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #6F2D8D;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 1000;
    }
    .print-button:hover {
      background: #5a2472;
    }
    @media print {
      body { padding: 0; }
      .section { page-break-inside: avoid; }
      .print-button { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print()">📥 Save as PDF</button>
  
  <div class="header">
    <div class="logo-area">
      <div class="logo">E</div>
      <div class="brand">
        <p class="brand-name">Ellines EIP</p>
        <p class="tagline">Where Enterprise Systems Think Together</p>
      </div>
    </div>
    <h1>${params.title}</h1>
    <p class="report-meta"><strong>Organization:</strong> ${params.orgName}</p>
    <p class="report-meta"><strong>Generated:</strong> ${new Date(params.runAt).toLocaleString()}</p>
    <span class="template-badge">${templateTitle}</span>
  </div>

  <div class="section">
    <h2 class="section-title">Enterprise Health Summary</h2>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Health Score</div>
        <div class="kpi-value health-score">${params.healthScore}<span style="font-size: 20px; color: #64748b;">/100</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Connected Systems</div>
        <div class="kpi-value">${params.connectedSystems}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Open Alerts</div>
        <div class="kpi-value" style="color: ${params.openAlerts > 0 ? '#ef4444' : '#10b981'};">${params.openAlerts}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Open Decisions</div>
        <div class="kpi-value" style="color: ${params.openDecisions > 0 ? '#f59e0b' : '#10b981'};">${params.openDecisions}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Ellinea AI Brief</h2>
    <div class="brief-box">
      <p>${params.briefHighlight || 'No brief available — sync a connector to generate insights.'}</p>
    </div>
  </div>

  ${params.timeline.length ? `
  <div class="section">
    <h2 class="section-title">Recent Timeline</h2>
    ${params.timeline.slice(0, 6).map(ev => `
    <div class="timeline-item">
      <div class="timeline-title">${ev.title}</div>
      <div class="timeline-detail">${ev.detail}</div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${params.memoryNotes.length ? `
  <div class="section">
    <h2 class="section-title">Key Memory Notes</h2>
    ${params.memoryNotes.slice(0, 5).map(note => `
    <div class="memory-item">
      <div class="memory-title">${note.title}</div>
      <div class="memory-body">${note.body.slice(0, 200)}${note.body.length > 200 ? '…' : ''}</div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  <div class="footer">
    <p>Generated by <span class="footer-brand">Ellines EIP</span> · Powered by Ellinea AI</p>
    <p>Ellines Tech — Where Enterprise Systems Think Together</p>
  </div>
</body>
</html>`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const adminErr = requireOrgAdmin(auth.role);
  if (adminErr) return adminErr;

  const reportId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data: existing, error: readErr } = await supabase
    .from('organizations')
    .select('settings, name')
    .eq('id', auth.organizationId)
    .maybeSingle();
  if (readErr) return json({ statusCode: 500, message: readErr.message }, 500);

  const settings = asObj(existing?.settings);
  const orgName = (existing as { name?: string })?.name || 'Your Organization';
  const reports = normalize(settings.workflowReports);
  const report = reports.find((r) => r.id === reportId);
  if (!report) return json({ statusCode: 404, message: 'Report not found' }, 404);

  // Build report content from snapshot + memory
  const snapshot = asObj(settings.enterpriseSnapshot || {});
  const memoryRaw = settings.ellineaMemory;
  const memoryNotes: MemoryNote[] = Array.isArray(memoryRaw)
    ? (memoryRaw as MemoryNote[]).filter((n) => n && typeof n.id === 'string').slice(0, 10)
    : [];

  const html = buildHTMLReport({
    title: report.title,
    orgName,
    runAt: report.lastRunAt || new Date().toISOString(),
    healthScore: typeof snapshot.healthScore === 'number' ? snapshot.healthScore : 0,
    openAlerts: typeof snapshot.openAlerts === 'number' ? snapshot.openAlerts : 0,
    openDecisions: typeof snapshot.openDecisions === 'number' ? snapshot.openDecisions : 0,
    connectedSystems: typeof snapshot.connectedSystems === 'number' ? snapshot.connectedSystems : 0,
    briefHighlight: typeof snapshot.briefHighlight === 'string' ? snapshot.briefHighlight : '',
    timeline: Array.isArray(snapshot.timeline) ? (snapshot.timeline as { title: string; detail: string }[]).slice(0, 6) : [],
    memoryNotes,
    template: report.template,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
};
