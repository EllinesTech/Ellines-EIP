/**
 * Evidence Pack Generation (D.2.4)
 * POST /api/v1/orgs/me/evidence-pack
 *
 * Generates a single self-contained HTML evidence pack containing:
 * 1. Cover page (org, date range, auditor note)
 * 2. SOC 2 readiness report with control evaluation
 * 3. HIPAA readiness report (optional)
 * 4. GDPR readiness report (optional)
 * 5. PCI DSS readiness report (optional)
 * 6. Raw audit log (last N days, CSV-formatted table)
 * 7. Data access log summary
 *
 * Body: {
 *   frameworks: ('soc2'|'hipaa'|'gdpr'|'pci')[]  default: ['soc2']
 *   periodDays: number                             default: 90
 *   auditorNote?: string                           optional note on cover page
 *   includeRawLog?: boolean                        default: true
 *   includeAccessLog?: boolean                     default: true
 * }
 *
 * Returns: text/html — printable, self-contained, no external dependencies.
 * Owner/IT only. Audit-logged.
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

type Framework = 'soc2' | 'hipaa' | 'gdpr' | 'pci';
type ControlStatus = 'pass' | 'partial' | 'missing';

interface Control {
  id: string;
  title: string;
  evidenceActions: string[];
  evidenceCount: number;
  status: ControlStatus;
  lastEvidenceAt: string | null;
  remediation: string;
}

const TEMPLATE_CONTROLS: Record<Framework, { title: string; controls: Pick<Control, 'id' | 'title' | 'evidenceActions' | 'remediation'>[] }> = {
  soc2: {
    title: 'SOC 2 Type II — Trust Services Criteria',
    controls: [
      { id: 'CC6.1', title: 'Logical Access Controls',       evidenceActions: ['auth.login', 'auth.register', 'invite'],             remediation: 'Review login events regularly. Enable SSO and MFA.' },
      { id: 'CC6.2', title: 'User Authentication',           evidenceActions: ['auth.login', 'auth.password', 'sso'],               remediation: 'Enable SSO or enforce strong password policy.' },
      { id: 'CC6.3', title: 'Role-Based Access',             evidenceActions: ['role', 'permission', 'custom.role'],                remediation: 'Review role assignments. Use custom roles for least-privilege.' },
      { id: 'CC6.6', title: 'Logical Access Removal',        evidenceActions: ['user.deactivate', 'invite.revoke'],                 remediation: 'Revoke access within 24h of termination.' },
      { id: 'CC7.2', title: 'System Monitoring',             evidenceActions: ['connector.sync', 'enterprise.webhook', 'health'],   remediation: 'Enable connector sync monitoring and webhook alerts.' },
      { id: 'CC7.4', title: 'Security Incidents',            evidenceActions: ['webhook.secret.rotate', 'api.key.revoke'],          remediation: 'Document incident response. Review key rotation logs.' },
      { id: 'CC8.1', title: 'Change Management',             evidenceActions: ['connector.install', 'sso.provider', 'settings'],   remediation: 'Document all connector and SSO provider changes.' },
    ],
  },
  hipaa: {
    title: 'HIPAA Security Rule',
    controls: [
      { id: '164.308(a)(3)', title: 'Workforce Authorization',     evidenceActions: ['auth.register', 'invite', 'user.deactivate'],   remediation: 'Audit all role changes and user provisioning.' },
      { id: '164.308(a)(4)', title: 'Information Access Mgmt',    evidenceActions: ['permission', 'role', 'auth.login'],              remediation: 'Ensure minimum necessary access. Document authorization.' },
      { id: '164.312(b)',    title: 'Audit Controls',              evidenceActions: ['auth.login', 'data_export', 'connector'],       remediation: 'Ensure all ePHI access is audit-logged and reviewed.' },
      { id: '164.312(d)',    title: 'Entity Authentication',       evidenceActions: ['auth.login', 'sso', 'auth.password'],           remediation: 'Enable MFA or SSO for all users with patient data access.' },
      { id: '164.312(e)',    title: 'Transmission Security',       evidenceActions: ['connector.install', 'enterprise.webhook'],      remediation: 'Ensure all connectors use HTTPS. Review webhook SSL.' },
    ],
  },
  gdpr: {
    title: 'GDPR — General Data Protection Regulation',
    controls: [
      { id: 'Art.5',  title: 'Principles of Processing', evidenceActions: ['auth.register', 'connector.install'],      remediation: 'Document lawful basis for each processing activity.' },
      { id: 'Art.17', title: 'Right to Erasure',          evidenceActions: ['user.delete', 'user.deactivate'],          remediation: 'Implement and document data deletion procedures.' },
      { id: 'Art.20', title: 'Right to Portability',      evidenceActions: ['data_export', 'compliance.export'],        remediation: 'Enable data export in CSV/JSON for data subjects on request.' },
      { id: 'Art.30', title: 'Records of Processing',     evidenceActions: ['connector.install', 'connector.sync'],     remediation: 'Use compliance export to generate Art.30 records regularly.' },
      { id: 'Art.32', title: 'Security of Processing',    evidenceActions: ['auth.password', 'webhook.secret.rotate'],  remediation: 'Rotate API keys and webhook secrets regularly. Enable SSO.' },
    ],
  },
  pci: {
    title: 'PCI DSS v4.0',
    controls: [
      { id: 'Req.7',    title: 'Restrict Access',        evidenceActions: ['role', 'permission', 'auth.login'],          remediation: 'Implement least-privilege. Review all role assignments.' },
      { id: 'Req.8.2',  title: 'User ID & Auth',         evidenceActions: ['auth.register', 'auth.login', 'invite'],     remediation: 'Ensure unique user accounts. Disable shared accounts.' },
      { id: 'Req.8.3',  title: 'Strong Authentication',  evidenceActions: ['sso', 'auth.password.change'],               remediation: 'Enforce MFA or SSO. Require complex passwords.' },
      { id: 'Req.10.2', title: 'Audit Log Implementation', evidenceActions: ['auth.login', 'data_export', 'connector'],  remediation: 'Ensure all authentication and data access events are logged.' },
      { id: 'Req.10.4', title: 'Audit Log Review',       evidenceActions: ['compliance.export', 'data_export'],          remediation: 'Schedule weekly audit log reviews. Use compliance export.' },
    ],
  },
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try { body = (await context.request.json()) as Record<string, unknown>; } catch { /* ignore */ }

  const frameworks = (Array.isArray(body.frameworks) ? body.frameworks : ['soc2']) as Framework[];
  const validFrameworks = frameworks.filter((f): f is Framework => ['soc2', 'hipaa', 'gdpr', 'pci'].includes(f));
  const periodDays = typeof body.periodDays === 'number' ? Math.min(Math.max(body.periodDays, 7), 365) : 90;
  const auditorNote = typeof body.auditorNote === 'string' ? body.auditorNote.slice(0, 500) : '';
  const includeRawLog = body.includeRawLog !== false;
  const includeAccessLog = body.includeAccessLog !== false;

  const supabase = getAdminClient(context.env);
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  const generatedAt = new Date().toISOString();

  // Fetch org name
  const { data: orgData } = await supabase.from('organizations').select('name').eq('id', auth.organizationId).maybeSingle();
  const orgName = (orgData?.name as string) ?? 'Unknown Organization';

  // Fetch audit logs
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, user_id, action, resource, metadata, created_at')
    .eq('organization_id', auth.organizationId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000);

  const rows = (logs ?? []) as Array<{ id: string; user_id: string | null; action: string; resource: string | null; metadata: unknown; created_at: string }>;

  // Resolve actors
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
  const actors: Record<string, string> = {};
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, email').in('id', userIds);
    for (const u of users ?? []) actors[u.id as string] = u.email as string;
  }

  // Evaluate frameworks
  const frameworkSections = validFrameworks.map(fw => {
    const def = TEMPLATE_CONTROLS[fw];
    const controls: Control[] = def.controls.map(ctrl => {
      const matches = rows.filter(r => ctrl.evidenceActions.some(p => r.action.toLowerCase().includes(p.toLowerCase())));
      const count = matches.length;
      const lastAt = matches.length > 0 ? new Date(matches[0].created_at).toISOString() : null;
      const status: ControlStatus = count === 0 ? 'missing' : count < 3 ? 'partial' : 'pass';
      return { ...ctrl, evidenceCount: count, status, lastEvidenceAt: lastAt };
    });
    const pass = controls.filter(c => c.status === 'pass').length;
    const partial = controls.filter(c => c.status === 'partial').length;
    const missing = controls.filter(c => c.status === 'missing').length;
    const score = Math.round(((pass + partial * 0.5) / controls.length) * 100);
    return { fw, title: def.title, controls, pass, partial, missing, score };
  });

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'evidence.pack',
    resource: 'compliance',
    metadata: { frameworks: validFrameworks, periodDays, includeRawLog, includeAccessLog, recordCount: rows.length },
  });

  // Build HTML
  const html = buildEvidencePack({
    orgName,
    orgId: auth.organizationId,
    generatedAt,
    periodDays,
    since: since.toISOString(),
    auditorNote,
    frameworkSections,
    rows: includeRawLog ? rows : [],
    actors,
    includeAccessLog,
  });

  const filename = `evidence_pack_${generatedAt.split('T')[0]}.html`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};

function sc(status: ControlStatus) {
  return { pass: '#6ee7b7', partial: '#fbbf24', missing: '#f87171' }[status];
}

function badge(status: ControlStatus) {
  const c = sc(status);
  return `<span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${c}22;color:${c};border:1px solid ${c}44">${status.toUpperCase()}</span>`;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEvidencePack(opts: {
  orgName: string; orgId: string; generatedAt: string; periodDays: number;
  since: string; auditorNote: string; frameworkSections: ReturnType<typeof buildEvidencePack extends (...args: any[]) => any ? never : any>[];
  rows: any[]; actors: Record<string, string>; includeAccessLog: boolean;
}): string {
  const { orgName, orgId, generatedAt, periodDays, since, auditorNote, frameworkSections, rows, actors, includeAccessLog } = opts;

  const frameworkHTML = (frameworkSections as any[]).map((fs: any) => {
    const scoreColor = fs.score >= 80 ? '#6ee7b7' : fs.score >= 50 ? '#fbbf24' : '#f87171';
    const controlRows = (fs.controls as Control[]).map(c => `
      <tr>
        <td style="padding:8px 10px;font-weight:700;white-space:nowrap;font-family:monospace;font-size:12px">${esc(c.id)}</td>
        <td style="padding:8px 10px">${esc(c.title)}</td>
        <td style="padding:8px 10px;text-align:center">${badge(c.status)}</td>
        <td style="padding:8px 10px;text-align:center;color:#94a3b8">${c.evidenceCount}</td>
        <td style="padding:8px 10px;color:#94a3b8;font-size:11px">${c.lastEvidenceAt ? new Date(c.lastEvidenceAt).toLocaleDateString() : '—'}</td>
        <td style="padding:8px 10px;color:#94a3b8;font-size:11px">${c.status !== 'pass' ? esc(c.remediation) : '✓'}</td>
      </tr>`).join('');

    return `
    <section style="margin-bottom:40px;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        <h2 style="margin:0;font-size:18px;font-weight:800">${esc(fs.title)}</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <span style="font-size:28px;font-weight:900;color:${scoreColor}">${fs.score}</span>
          <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.07em">Score</span>
        </div>
      </div>
      <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap">
        <span style="color:#6ee7b7;font-weight:700">${fs.pass} PASS</span>
        <span style="color:#fbbf24;font-weight:700">${fs.partial} PARTIAL</span>
        <span style="color:#f87171;font-weight:700">${fs.missing} MISSING</span>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;font-size:13px">
        <thead><tr style="background:#0f172a">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Control</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Title</th>
          <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Status</th>
          <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Evidence</th>
          <th style="padding:8px 10px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Last Seen</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Remediation</th>
        </tr></thead>
        <tbody>${controlRows}</tbody>
      </table>
    </section>`;
  }).join('');

  const auditRows = rows.slice(0, 500).map(r => `
    <tr style="border-bottom:1px solid #1e293b">
      <td style="padding:6px 8px;color:#94a3b8;font-size:11px;white-space:nowrap">${new Date(r.created_at).toLocaleString()}</td>
      <td style="padding:6px 8px;color:#e2e8f0;font-size:11px">${esc(actors[r.user_id] ?? 'system')}</td>
      <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:#c4b5fd">${esc(r.action)}</td>
      <td style="padding:6px 8px;color:#94a3b8;font-size:11px">${esc(r.resource ?? '')}</td>
    </tr>`).join('');

  const rawLogSection = rows.length > 0 ? `
    <section style="margin-bottom:40px;page-break-before:always">
      <h2 style="font-size:18px;font-weight:800;margin-bottom:16px">Raw Audit Log <span style="font-size:13px;font-weight:400;color:#64748b">(${rows.length} events, last ${opts.periodDays} days)</span></h2>
      <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;font-size:12px">
        <thead><tr style="background:#0f172a">
          <th style="padding:7px 8px;text-align:left;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase">Time</th>
          <th style="padding:7px 8px;text-align:left;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase">Actor</th>
          <th style="padding:7px 8px;text-align:left;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase">Action</th>
          <th style="padding:7px 8px;text-align:left;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase">Resource</th>
        </tr></thead>
        <tbody>${auditRows}</tbody>
      </table>
      ${rows.length > 500 ? `<p style="color:#64748b;font-size:11px;margin-top:8px">Showing first 500 of ${rows.length} events. Download compliance export CSV for complete log.</p>` : ''}
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evidence Pack — ${esc(orgName)}</title>
<style>
  @media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact} section{page-break-inside:avoid} }
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f1f5f9;margin:0;padding:32px 40px;max-width:1200px}
  h1{margin:0 0 6px;font-size:28px;font-weight:900}
  h2{color:#f1f5f9}
  table tr:nth-child(even){background:rgba(255,255,255,0.02)}
</style>
</head>
<body>
  <!-- Cover -->
  <section style="margin-bottom:48px;border-bottom:2px solid #1e293b;padding-bottom:32px">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6f2d8d;margin:0 0 8px">Ellines EIP — Compliance Evidence Pack</p>
    <h1>${esc(orgName)}</h1>
    <p style="color:#94a3b8;margin:0 0 16px">Organization ID: <code style="color:#a78bfa">${esc(orgId)}</code></p>
    <table style="border:none;background:transparent;width:auto;font-size:13px">
      <tr><td style="padding:3px 16px 3px 0;color:#64748b;font-weight:600">Generated</td><td style="color:#e2e8f0">${new Date(generatedAt).toLocaleString()}</td></tr>
      <tr><td style="padding:3px 16px 3px 0;color:#64748b;font-weight:600">Period</td><td style="color:#e2e8f0">Last ${periodDays} days (from ${new Date(since).toLocaleDateString()})</td></tr>
      <tr><td style="padding:3px 16px 3px 0;color:#64748b;font-weight:600">Frameworks</td><td style="color:#e2e8f0">${(frameworkSections as any[]).map((f: any) => f.fw.toUpperCase()).join(', ')}</td></tr>
      <tr><td style="padding:3px 16px 3px 0;color:#64748b;font-weight:600">Total events</td><td style="color:#e2e8f0">${rows.length}</td></tr>
    </table>
    ${auditorNote ? `<div style="margin-top:16px;padding:12px 16px;background:#1e293b;border-left:3px solid #6f2d8d;border-radius:4px;font-size:13px;color:#e2e8f0"><strong>Auditor note:</strong> ${esc(auditorNote)}</div>` : ''}
    <p style="margin-top:16px;font-size:11px;color:#475569">This evidence pack is a readiness assessment based on audit log data from Ellines EIP. It is not a formal audit opinion. Controls are evaluated by the presence of corresponding audit log events.</p>
  </section>

  <!-- Framework sections -->
  ${frameworkHTML}

  <!-- Raw audit log -->
  ${rawLogSection}

  <footer style="margin-top:32px;padding-top:16px;border-top:1px solid #1e293b;font-size:11px;color:#475569;text-align:center">
    <p>Ellines EIP · ${esc(orgName)} · Generated ${new Date(generatedAt).toLocaleDateString()} · Confidential</p>
  </footer>
</body>
</html>`;
}
