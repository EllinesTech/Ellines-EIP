/**
 * Compliance Report Templates (D.2.3)
 * GET  /api/v1/orgs/me/compliance-report?template=soc2|hipaa|gdpr|pci
 * POST /api/v1/orgs/me/compliance-report  { template, format }
 *
 * Generates a structured compliance readiness report:
 * - Maps each control to evidence found in audit logs
 * - Marks controls as PASS / PARTIAL / MISSING
 * - Provides remediation hints for gaps
 * - Downloadable as HTML (print-to-PDF) or JSON
 *
 * Owner/IT only.
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

type Template = 'soc2' | 'hipaa' | 'gdpr' | 'pci';
type ControlStatus = 'pass' | 'partial' | 'missing';

interface Control {
  id: string;
  title: string;
  description: string;
  evidenceActions: string[]; // audit_log action patterns that satisfy this control
  evidenceCount: number;
  status: ControlStatus;
  lastEvidenceAt: string | null;
  remediation: string;
}

interface ComplianceReport {
  template: Template;
  templateTitle: string;
  organizationId: string;
  organizationName: string;
  generatedAt: string;
  periodDays: number;
  overallScore: number; // 0-100
  passCount: number;
  partialCount: number;
  missingCount: number;
  controls: Control[];
  summary: string;
}

const TEMPLATE_DEFS: Record<Template, { title: string; controls: Omit<Control, 'evidenceCount' | 'status' | 'lastEvidenceAt'>[] }> = {
  soc2: {
    title: 'SOC 2 Type II — Trust Services Criteria',
    controls: [
      { id: 'CC6.1', title: 'Logical Access Controls', description: 'Access to systems is restricted to authorized users.', evidenceActions: ['auth.login', 'auth.register', 'invite'], remediation: 'Ensure login events are regularly reviewed. Enable SSO and MFA.' },
      { id: 'CC6.2', title: 'User Authentication', description: 'Authentication mechanisms verify user identity before granting access.', evidenceActions: ['auth.login', 'auth.password', 'sso'], remediation: 'Enable SSO or enforce strong password policy. Review failed login attempts.' },
      { id: 'CC6.3', title: 'Role-Based Access', description: 'Access rights are assigned based on job responsibilities.', evidenceActions: ['role', 'permission', 'custom.role', 'rbac'], remediation: 'Review and document all role assignments. Use custom roles for least-privilege.' },
      { id: 'CC6.6', title: 'Logical Access Removal', description: 'Access is removed promptly when no longer needed.', evidenceActions: ['user.deactivate', 'invite.revoke', 'role.remove'], remediation: 'Implement offboarding checklist. Revoke access within 24h of termination.' },
      { id: 'CC7.2', title: 'System Monitoring', description: 'System components are monitored to detect anomalies.', evidenceActions: ['connector.sync', 'alert', 'enterprise.webhook', 'health'], remediation: 'Enable connector sync monitoring. Set up webhook alerts for system events.' },
      { id: 'CC7.4', title: 'Security Incidents', description: 'Security incidents are identified and responded to.', evidenceActions: ['webhook.secret.rotate', 'api.key.revoke', 'compliance.export'], remediation: 'Document incident response procedures. Review webhook secret rotation logs.' },
      { id: 'CC8.1', title: 'Change Management', description: 'Infrastructure and software changes are authorized and tested.', evidenceActions: ['connector.install', 'connector.update', 'sso.provider', 'settings'], remediation: 'Document all connector and SSO provider changes. Maintain change log.' },
      { id: 'A1.2', title: 'Availability Monitoring', description: 'System availability is monitored and incidents are resolved.', evidenceActions: ['health', 'connector.sync', 'sync.error'], remediation: 'Monitor connector health. Set up alerts for sync failures.' },
      { id: 'C1.1', title: 'Data Classification', description: 'Confidential data is identified and protected.', evidenceActions: ['data_export', 'compliance.export', 'document'], remediation: 'Review data export logs. Classify data by sensitivity in connector configurations.' },
      { id: 'P6.1', title: 'Data Retention', description: 'Personal data is retained only as long as necessary.', evidenceActions: ['document.delete', 'user.delete', 'gdpr'], remediation: 'Implement and document data retention policy. Use bulk export before deletion.' },
    ],
  },
  hipaa: {
    title: 'HIPAA Security Rule — Administrative, Physical & Technical Safeguards',
    controls: [
      { id: '164.308(a)(1)', title: 'Risk Analysis', description: 'Conduct accurate and thorough risk analysis of ePHI.', evidenceActions: ['connector.sync', 'enterprise.webhook', 'snapshot'], remediation: 'Document risk analysis covering all data connectors handling patient data.' },
      { id: '164.308(a)(3)', title: 'Workforce Authorization', description: 'Implement procedures for access authorization and termination.', evidenceActions: ['auth.register', 'invite', 'user.deactivate', 'role'], remediation: 'Review user provisioning and deprovisioning procedures. Audit all role changes.' },
      { id: '164.308(a)(4)', title: 'Information Access Management', description: 'Implement policies for authorizing access to ePHI.', evidenceActions: ['permission', 'role', 'custom.role', 'auth.login'], remediation: 'Ensure minimum necessary access. Document access authorization procedures.' },
      { id: '164.308(a)(5)', title: 'Security Awareness', description: 'Implement security awareness and training programs.', evidenceActions: ['auth.password.change', 'api.key', 'webhook.secret'], remediation: 'Conduct regular security training. Document password and key rotation procedures.' },
      { id: '164.312(a)(1)', title: 'Unique User Identification', description: 'Assign unique user IDs to each workforce member.', evidenceActions: ['auth.register', 'auth.login', 'invite'], remediation: 'Ensure all users have unique accounts. No shared credentials.' },
      { id: '164.312(a)(2)', title: 'Emergency Access Procedure', description: 'Establish emergency access procedures for ePHI.', evidenceActions: ['auth.login', 'connector.sync'], remediation: 'Document emergency access procedures. Test quarterly.' },
      { id: '164.312(b)', title: 'Audit Controls', description: 'Implement hardware, software, and procedural mechanisms for audit logs.', evidenceActions: ['auth.login', 'auth.logout', 'data_export', 'connector', 'document'], remediation: 'Ensure all ePHI access is audit-logged. Review logs regularly.' },
      { id: '164.312(c)', title: 'Integrity Controls', description: 'Implement security measures to ensure ePHI is not improperly altered.', evidenceActions: ['connector.sync', 'enterprise.webhook', 'document.upload'], remediation: 'Enable connector data validation. Review sync integrity reports.' },
      { id: '164.312(d)', title: 'Person or Entity Authentication', description: 'Verify that a person seeking access is who they claim to be.', evidenceActions: ['auth.login', 'sso', 'auth.password'], remediation: 'Enable MFA or SSO for all users with access to patient data.' },
      { id: '164.312(e)', title: 'Transmission Security', description: 'Implement security measures to guard against unauthorized access during transmission.', evidenceActions: ['connector.install', 'enterprise.webhook', 'api.key'], remediation: 'Ensure all connectors use HTTPS. Review webhook SSL configuration.' },
    ],
  },
  gdpr: {
    title: 'GDPR — General Data Protection Regulation Compliance',
    controls: [
      { id: 'Art.5', title: 'Principles of Processing', description: 'Personal data is processed lawfully, fairly, and transparently.', evidenceActions: ['auth.register', 'connector.install', 'enterprise.webhook'], remediation: 'Document lawful basis for each data processing activity. Review connector data flows.' },
      { id: 'Art.6', title: 'Lawfulness of Processing', description: 'Processing has a legal basis (consent, contract, legal obligation, etc.).', evidenceActions: ['auth.register', 'invite.accept'], remediation: 'Document consent or legal basis for each data processing activity.' },
      { id: 'Art.13', title: 'Transparency (Privacy Notice)', description: 'Data subjects are informed about processing at collection point.', evidenceActions: ['auth.register', 'invite'], remediation: 'Ensure privacy notice is shown during registration and invite acceptance.' },
      { id: 'Art.17', title: 'Right to Erasure', description: 'Data subjects can request deletion of their personal data.', evidenceActions: ['user.delete', 'user.deactivate', 'document.delete'], remediation: 'Implement and document data deletion procedures. Test deletion workflow.' },
      { id: 'Art.20', title: 'Right to Data Portability', description: 'Data subjects can receive their data in a structured, machine-readable format.', evidenceActions: ['data_export', 'compliance.export'], remediation: 'Enable data export in CSV/JSON for all data subjects on request.' },
      { id: 'Art.25', title: 'Data Protection by Design', description: 'Privacy considerations are embedded into system design.', evidenceActions: ['role', 'permission', 'custom.role', 'settings'], remediation: 'Apply data minimization. Use least-privilege roles and custom permissions.' },
      { id: 'Art.30', title: 'Records of Processing Activities', description: 'Maintain records of all processing activities.', evidenceActions: ['connector.install', 'connector.sync', 'data_export', 'enterprise.webhook'], remediation: 'Use compliance export to generate Art.30 records regularly.' },
      { id: 'Art.32', title: 'Security of Processing', description: 'Implement appropriate technical security measures.', evidenceActions: ['auth.password', 'webhook.secret.rotate', 'api.key', 'sso'], remediation: 'Rotate API keys and webhook secrets regularly. Enable SSO and strong passwords.' },
      { id: 'Art.33', title: 'Breach Notification', description: 'Personal data breaches are reported within 72 hours.', evidenceActions: ['webhook.secret.rotate', 'api.key.revoke', 'compliance.export'], remediation: 'Document breach response procedure. Assign DPO or privacy contact.' },
      { id: 'Art.37', title: 'Data Protection Officer', description: 'Appoint a DPO where required.', evidenceActions: ['settings', 'role', 'permission'], remediation: 'Designate a DPO or privacy officer. Document their contact in org settings.' },
    ],
  },
  pci: {
    title: 'PCI DSS v4.0 — Payment Card Industry Data Security Standard',
    controls: [
      { id: 'Req.7', title: 'Restrict Access to System Components', description: 'Access to system components is limited to only those individuals whose job requires such access.', evidenceActions: ['role', 'permission', 'custom.role', 'auth.login'], remediation: 'Implement least-privilege. Review and document all role assignments.' },
      { id: 'Req.8.2', title: 'User Identification & Authentication', description: 'All users are assigned a unique ID before granting access.', evidenceActions: ['auth.register', 'auth.login', 'invite'], remediation: 'Ensure unique user accounts. Disable shared accounts immediately.' },
      { id: 'Req.8.3', title: 'Strong Authentication', description: 'Strong authentication is used for all access.', evidenceActions: ['sso', 'auth.password.change', 'auth.login'], remediation: 'Enforce MFA or SSO. Require complex passwords and regular rotation.' },
      { id: 'Req.8.6', title: 'System/Application Account Management', description: 'System and application accounts are managed and monitored.', evidenceActions: ['api.key', 'webhook.secret', 'connector.install'], remediation: 'Rotate API keys at least annually. Log all API key usage.' },
      { id: 'Req.10.2', title: 'Audit Log Implementation', description: 'Audit logs are implemented to support detection of anomalies.', evidenceActions: ['auth.login', 'auth.logout', 'data_export', 'connector', 'api.key'], remediation: 'Ensure all authentication and data access events are logged. Review daily.' },
      { id: 'Req.10.3', title: 'Audit Log Protection', description: 'Audit logs are protected from destruction and unauthorized modifications.', evidenceActions: ['compliance.export', 'data_export'], remediation: 'Export and archive audit logs to immutable storage monthly.' },
      { id: 'Req.10.4', title: 'Audit Log Review', description: 'Audit logs are reviewed to identify anomalies or suspicious activity.', evidenceActions: ['compliance.export', 'data_export', 'auth.login'], remediation: 'Schedule weekly audit log reviews. Use compliance export for evidence.' },
      { id: 'Req.10.5', title: 'Audit Log Retention', description: 'Audit log history is retained for at least 12 months.', evidenceActions: ['compliance.export', 'data_export'], remediation: 'Export and retain audit logs for at least 12 months. Document retention policy.' },
      { id: 'Req.12.3', title: 'Risk Assessment', description: 'Risk assessment is performed at least once per year.', evidenceActions: ['compliance.export', 'connector.sync', 'enterprise.webhook'], remediation: 'Document annual risk assessment covering all connected systems.' },
      { id: 'Req.12.10', title: 'Incident Response Plan', description: 'An incident response plan exists and is tested annually.', evidenceActions: ['webhook.secret.rotate', 'api.key.revoke', 'compliance.export'], remediation: 'Document and test incident response plan. Review key rotation procedures.' },
    ],
  },
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (!['GET', 'POST'].includes(context.request.method)) {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let template: Template;
  let format: 'json' | 'html' = 'json';
  let periodDays = 90;

  if (context.request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try { body = (await context.request.json()) as Record<string, unknown>; } catch { /* ignore */ }
    template = (body.template as Template) ?? 'soc2';
    format = (body.format as 'json' | 'html') ?? 'json';
    periodDays = typeof body.periodDays === 'number' ? body.periodDays : 90;
  } else {
    const url = new URL(context.request.url);
    template = (url.searchParams.get('template') as Template) ?? 'soc2';
    format = (url.searchParams.get('format') as 'json' | 'html') ?? 'json';
    const pd = parseInt(url.searchParams.get('periodDays') ?? '90', 10);
    periodDays = isNaN(pd) ? 90 : pd;
  }

  if (!TEMPLATE_DEFS[template]) {
    return json({ statusCode: 400, message: 'Invalid template. Use: soc2, hipaa, gdpr, pci' }, 400);
  }

  const def = TEMPLATE_DEFS[template];
  const supabase = getAdminClient(context.env);

  // Fetch org name
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', auth.organizationId)
    .maybeSingle();
  const orgName = (orgData?.name as string) ?? 'Unknown Organization';

  // Fetch audit logs for the period
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('action, created_at')
    .eq('organization_id', auth.organizationId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000);

  const rows = (logs ?? []) as Array<{ action: string; created_at: string }>;

  // Evaluate each control
  const controls: Control[] = def.controls.map((ctrl) => {
    const matching = rows.filter((r) =>
      ctrl.evidenceActions.some((pat) => r.action.toLowerCase().includes(pat.toLowerCase())),
    );
    const count = matching.length;
    const lastAt = matching.length > 0 ? new Date(matching[0].created_at).toISOString() : null;

    let status: ControlStatus;
    if (count === 0) status = 'missing';
    else if (count < 3) status = 'partial';
    else status = 'pass';

    return {
      ...ctrl,
      evidenceCount: count,
      status,
      lastEvidenceAt: lastAt,
    };
  });

  const passCount = controls.filter((c) => c.status === 'pass').length;
  const partialCount = controls.filter((c) => c.status === 'partial').length;
  const missingCount = controls.filter((c) => c.status === 'missing').length;
  const overallScore = Math.round(((passCount + partialCount * 0.5) / controls.length) * 100);

  const generatedAt = new Date().toISOString();
  const report: ComplianceReport = {
    template,
    templateTitle: def.title,
    organizationId: auth.organizationId,
    organizationName: orgName,
    generatedAt,
    periodDays,
    overallScore,
    passCount,
    partialCount,
    missingCount,
    controls,
    summary: buildSummary(template, overallScore, passCount, partialCount, missingCount, controls),
  };

  // Audit log the report generation
  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'compliance.report',
    resource: 'compliance',
    metadata: { template, format, overallScore, passCount, partialCount, missingCount },
  });

  if (format === 'html') {
    const html = buildHtml(report);
    const filename = `compliance_report_${template}_${generatedAt.split('T')[0]}.html`;
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return json(report);
};

function buildSummary(
  template: Template,
  score: number,
  pass: number,
  partial: number,
  missing: number,
  controls: Control[],
): string {
  const missingControls = controls.filter((c) => c.status === 'missing').map((c) => c.id).join(', ');
  const readiness = score >= 80 ? 'Good' : score >= 50 ? 'Needs improvement' : 'Significant gaps';
  return `${template.toUpperCase()} compliance readiness: ${readiness} (${score}/100). ${pass} controls satisfied, ${partial} partial, ${missing} missing.${missingControls ? ` Missing: ${missingControls}.` : ''}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#6ee7b7';
  if (score >= 50) return '#fbbf24';
  return '#f87171';
}

function statusBadge(status: ControlStatus): string {
  const styles: Record<ControlStatus, string> = {
    pass: 'background:#064e3b;color:#6ee7b7;border:1px solid #065f46',
    partial: 'background:#451a03;color:#fbbf24;border:1px solid #78350f',
    missing: 'background:#450a0a;color:#f87171;border:1px solid #7f1d1d',
  };
  const labels: Record<ControlStatus, string> = { pass: 'PASS', partial: 'PARTIAL', missing: 'MISSING' };
  return `<span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;${styles[status]}">${labels[status]}</span>`;
}

function buildHtml(r: ComplianceReport): string {
  const color = scoreColor(r.overallScore);
  const controlRows = r.controls.map((c) => `
    <tr style="border-bottom:1px solid #1e293b">
      <td style="padding:10px 12px;font-weight:700;color:#f1f5f9;white-space:nowrap">${c.id}</td>
      <td style="padding:10px 12px;color:#f1f5f9">${c.title}</td>
      <td style="padding:10px 12px;text-align:center">${statusBadge(c.status)}</td>
      <td style="padding:10px 12px;text-align:center;color:#94a3b8">${c.evidenceCount}</td>
      <td style="padding:10px 12px;color:#94a3b8;font-size:12px">${c.lastEvidenceAt ? new Date(c.lastEvidenceAt).toLocaleDateString() : '—'}</td>
      <td style="padding:10px 12px;color:#94a3b8;font-size:12px">${c.status !== 'pass' ? c.remediation : '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${r.templateTitle} — ${r.organizationName}</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 32px; }
    .header { border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 24px; }
    .score-box { display: inline-block; padding: 12px 24px; border-radius: 12px; border: 2px solid ${color}33; background: ${color}11; text-align: center; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; }
    th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; background: #0f172a; }
    .footer { margin-top: 24px; font-size: 12px; color: #475569; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6f2d8d;margin:0 0 6px">Ellines EIP — Compliance Report</p>
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800">${r.templateTitle}</h1>
    <p style="color:#94a3b8;margin:0">${r.organizationName} &nbsp;·&nbsp; Generated ${new Date(r.generatedAt).toLocaleString()} &nbsp;·&nbsp; Period: last ${r.periodDays} days</p>
    <div class="score-box">
      <div style="font-size:36px;font-weight:900;color:${color}">${r.overallScore}</div>
      <div style="font-size:12px;color:#94a3b8">Readiness Score</div>
    </div>
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
      ${[['PASS', r.passCount, '#6ee7b7'], ['PARTIAL', r.partialCount, '#fbbf24'], ['MISSING', r.missingCount, '#f87171']].map(([l, v, c]) => `<span style="font-size:13px;font-weight:700;color:${c}">${v} ${l}</span>`).join(' &nbsp;·&nbsp; ')}
    </div>
    <p style="margin:12px 0 0;font-size:13px;color:#94a3b8">${r.summary}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Control</th><th>Description</th><th>Status</th><th>Evidence</th><th>Last Seen</th><th>Remediation</th>
      </tr>
    </thead>
    <tbody>${controlRows}</tbody>
  </table>

  <div class="footer">
    <p>Generated by Ellines EIP · ${r.organizationName} · ${new Date(r.generatedAt).toLocaleDateString()}</p>
    <p>This report is based on audit log evidence from the last ${r.periodDays} days. It is a readiness assessment, not a formal audit opinion.</p>
  </div>
</body>
</html>`;
}
