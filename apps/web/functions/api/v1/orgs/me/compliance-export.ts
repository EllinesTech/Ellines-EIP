/**
 * Compliance audit export (D.2.1)
 * GET /api/v1/orgs/me/compliance-export
 *
 * Query params:
 *   ?template=soc2|hipaa|gdpr|pci|all   (default: all)
 *   ?format=csv|json                     (default: csv)
 *   ?from=ISO date                       (default: 90 days ago)
 *   ?to=ISO date                         (default: now)
 *
 * Owner/IT only. Exports audit logs with compliance-specific framing.
 */

import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

type Template = 'soc2' | 'hipaa' | 'gdpr' | 'pci' | 'all';
type Format = 'csv' | 'json';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const template = (url.searchParams.get('template') ?? 'all') as Template;
  const format = (url.searchParams.get('format') ?? 'csv') as Format;

  // Date range — default 90 days
  const toDate = url.searchParams.get('to')
    ? new Date(url.searchParams.get('to')!)
    : new Date();
  const fromDate = url.searchParams.get('from')
    ? new Date(url.searchParams.get('from')!)
    : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return json({ statusCode: 400, message: 'Invalid date range' }, 400);
  }

  const supabase = getAdminClient(context.env);

  // Fetch org profile
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name, slug, created_at')
    .eq('id', auth.organizationId)
    .maybeSingle();

  const orgName = (orgData?.name as string) ?? 'Unknown Organization';

  // Fetch audit logs in range
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, action, resource, metadata, created_at')
    .eq('organization_id', auth.organizationId)
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  // Resolve actor emails
  const rows = logs ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const actors: Record<string, { email: string; fullName: string }> = {};

  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', userIds);
    for (const u of users ?? []) {
      actors[u.id as string] = {
        email: u.email as string,
        fullName: (u.full_name as string) ?? '',
      };
    }
  }

  // Enrich rows
  const enriched = rows.map((r) => {
    const actor = r.user_id ? actors[r.user_id as string] : null;
    return {
      id: r.id as string,
      timestamp: new Date(r.created_at as string).toISOString(),
      actorUserId: (r.user_id as string) ?? '',
      actorEmail: actor?.email ?? 'system',
      actorName: actor?.fullName ?? 'System',
      action: r.action as string,
      resource: r.resource as string,
      metadata: r.metadata ?? {},
      complianceCategory: categorize(r.action as string, template),
    };
  });

  // Filter by template if not 'all'
  const filtered =
    template === 'all'
      ? enriched
      : enriched.filter((r) => r.complianceCategory.includes(template));

  // Build output
  const exportedAt = new Date().toISOString();
  const meta = {
    organization: orgName,
    organizationId: auth.organizationId,
    template,
    format,
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    exportedAt,
    exportedBy: auth.sub,
    totalRecords: filtered.length,
  };

  // Audit log the export itself
  await supabase.from('audit_logs').insert({
    organization_id: auth.organizationId,
    user_id: auth.sub,
    action: 'compliance.export',
    resource: 'audit_logs',
    metadata: { template, format, recordCount: filtered.length, fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
  });

  if (format === 'json') {
    const body = JSON.stringify({ meta, records: filtered }, null, 2);
    const filename = `compliance_${template}_${exportedAt.split('T')[0]}.json`;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // CSV output
  const csv = buildCSV(meta, filtered, template);
  const filename = `compliance_${template}_${exportedAt.split('T')[0]}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};

/** Map action strings to compliance categories */
function categorize(action: string, template: Template): string[] {
  const cats: string[] = [];

  // SOC 2: access control, authentication, change management
  if (/auth\.|login|logout|register|password|invite|sso|role|permission|api.key/.test(action)) cats.push('soc2');
  // HIPAA: access, audit, data handling
  if (/auth\.|data\.|export|sync|connector|snapshot|enterprise/.test(action)) cats.push('hipaa');
  // GDPR: data access, export, deletion
  if (/export|delete|data\.|gdpr|profile|user\.update/.test(action)) cats.push('gdpr');
  // PCI: authentication, data access, system events
  if (/auth\.|password|api\.key|webhook|connector|export/.test(action)) cats.push('pci');

  return cats.length ? cats : ['general'];
}

type EnrichedRow = {
  id: string; timestamp: string; actorUserId: string;
  actorEmail: string; actorName: string; action: string;
  resource: string; metadata: unknown; complianceCategory: string[];
};

function esc(v: string): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCSV(
  meta: Record<string, unknown>,
  records: EnrichedRow[],
  template: Template,
): string {
  const header = templateHeader(template);
  let out = header + '\n\n';

  // Meta section
  out += '# EXPORT METADATA\n';
  out += 'Field,Value\n';
  for (const [k, v] of Object.entries(meta)) {
    out += `${esc(k)},${esc(String(v))}\n`;
  }
  out += '\n# AUDIT RECORDS\n';

  const cols = ['timestamp', 'actorEmail', 'actorName', 'actorUserId', 'action', 'resource', 'complianceCategory', 'id'];
  out += cols.map(esc).join(',') + '\n';

  for (const r of records) {
    out +=
      cols
        .map((c) => {
          const val = r[c as keyof EnrichedRow];
          if (Array.isArray(val)) return esc(val.join('; '));
          return esc(String(val ?? ''));
        })
        .join(',') + '\n';
  }

  return out;
}

function templateHeader(template: Template): string {
  const titles: Record<Template, string> = {
    soc2: '# SOC 2 Type II — Access & Change Management Audit Log\n# Controls: CC6.1 CC6.2 CC6.3 CC7.2 CC8.1',
    hipaa: '# HIPAA Security Rule — Access & Audit Controls Export\n# Controls: 164.312(b) 164.312(d) 164.312(e)',
    gdpr: '# GDPR Article 30 — Records of Processing Activities\n# Controls: Art.30 Art.32 Art.33',
    pci: '# PCI DSS — Audit Log Export\n# Controls: Requirement 10.2 10.3 10.4',
    all: '# Ellines EIP — Comprehensive Compliance Audit Export\n# Frameworks: SOC2 HIPAA GDPR PCI-DSS',
  };
  return titles[template] ?? titles.all;
}
