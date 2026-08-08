/**
 * Bulk data export endpoint (B.3.1)
 * GET /api/v1/orgs/me/export?type=uem|timeline|approvals|all&format=csv|json
 *
 * Exports organization data in CSV or JSON format for backup and analysis.
 */

import { getAdminClient, requireAuth, type Env } from '../../../../shared/auth';
import { isOrgAdminRole } from '@ellines-eip/shared';

interface EnvWithIdentity extends Env {
  IDENTITY_API_URL?: string;
}

interface ExportType {
  type: 'uem' | 'timeline' | 'approvals' | 'all';
  format: 'csv' | 'json';
}

export const onRequest: PagesFunction<EnvWithIdentity> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || 'uem') as ExportType['type'];
  const format = (url.searchParams.get('format') || 'csv') as ExportType['format'];

  // Auth check
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;

  // Only org admins can export data
  if (!isOrgAdminRole(auth.role)) {
    return new Response(JSON.stringify({ message: 'Only org admins can export data.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch data based on type
    let data: any;
    switch (type) {
      case 'uem':
        data = await exportUEM(auth.organizationId, env);
        break;
      case 'timeline':
        data = await exportTimeline(auth.organizationId, env);
        break;
      case 'approvals':
        data = await exportApprovals(auth.organizationId, env);
        break;
      case 'all':
        data = await exportAll(auth.organizationId, env);
        break;
      default:
        return new Response(JSON.stringify({ message: 'Invalid export type' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    // Format data
    let content: string;
    let contentType: string;
    let filename: string;

    if (format === 'csv') {
      content = formatAsCSV(data, type);
      contentType = 'text/csv';
      filename = `ellines_${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      content = JSON.stringify(data, null, 2);
      contentType = 'application/json';
      filename = `ellines_${type}_export_${new Date().toISOString().split('T')[0]}.json`;
    }

    // Log audit trail
    await logAudit(env, auth.organizationId, auth.sub, 'data_export', {
      type,
      format,
      recordCount: Array.isArray(data) ? data.length : Object.keys(data).length,
    });

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[export] Error:', err);
    return new Response(JSON.stringify({ message: err.message || 'Export failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * Export UEM objects (people, branches, departments, assets)
 */
async function exportUEM(orgId: string, env: EnvWithIdentity) {
  const snapshot = await getOrgSnapshot(orgId, env);
  return {
    people: snapshot.people || [],
    branches: snapshot.branches || [],
    departments: snapshot.departments || [],
    assets: snapshot.assets || [],
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Export timeline events
 */
async function exportTimeline(orgId: string, env: EnvWithIdentity) {
  const snapshot = await getOrgSnapshot(orgId, env);
  return {
    timeline: snapshot.timeline || [],
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Export approval workflows
 */
async function exportApprovals(orgId: string, env: EnvWithIdentity) {
  // Fetch approvals from org settings
  const supabase = getAdminClient(env);
  const { data } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();

  const approvals = data?.settings?.approvals || [];
  return {
    approvals: approvals || [],
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Export all data types combined
 */
async function exportAll(orgId: string, env: EnvWithIdentity) {
  const [uem, timeline, approvals] = await Promise.all([
    exportUEM(orgId, env),
    exportTimeline(orgId, env),
    exportApprovals(orgId, env),
  ]);

  return {
    ...uem,
    timeline: timeline.timeline,
    approvals: approvals.approvals,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Format data as CSV
 */
function formatAsCSV(data: any, type: string): string {
  if (type === 'all') {
    // For 'all', combine multiple CSV sections
    let csv = '';
    csv += '# UEM OBJECTS - PEOPLE\n';
    csv += arrayToCSV(data.people || []);
    csv += '\n\n# UEM OBJECTS - BRANCHES\n';
    csv += arrayToCSV(data.branches || []);
    csv += '\n\n# UEM OBJECTS - DEPARTMENTS\n';
    csv += arrayToCSV(data.departments || []);
    csv += '\n\n# UEM OBJECTS - ASSETS\n';
    csv += arrayToCSV(data.assets || []);
    csv += '\n\n# TIMELINE EVENTS\n';
    csv += arrayToCSV(data.timeline || []);
    csv += '\n\n# APPROVALS\n';
    csv += arrayToCSV(data.approvals || []);
    return csv;
  } else if (type === 'uem') {
    let csv = '';
    csv += '# PEOPLE\n';
    csv += arrayToCSV(data.people || []);
    csv += '\n\n# BRANCHES\n';
    csv += arrayToCSV(data.branches || []);
    csv += '\n\n# DEPARTMENTS\n';
    csv += arrayToCSV(data.departments || []);
    csv += '\n\n# ASSETS\n';
    csv += arrayToCSV(data.assets || []);
    return csv;
  } else if (type === 'timeline') {
    return arrayToCSV(data.timeline || []);
  } else if (type === 'approvals') {
    return arrayToCSV(data.approvals || []);
  }
  return '';
}

/**
 * Convert array of objects to CSV
 */
function arrayToCSV(arr: any[]): string {
  if (!arr || arr.length === 0) {
    return 'No data\n';
  }

  // Get all unique keys from all objects
  const allKeys = new Set<string>();
  arr.forEach(obj => {
    Object.keys(obj).forEach(key => allKeys.add(key));
  });
  const headers = Array.from(allKeys);

  // Build CSV
  let csv = headers.map(h => escapeCSV(h)).join(',') + '\n';
  arr.forEach(obj => {
    const row = headers.map(h => {
      const val = obj[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return escapeCSV(JSON.stringify(val));
      return escapeCSV(String(val));
    });
    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Escape CSV field
 */
function escapeCSV(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/**
 * Get organization snapshot from settings
 */
async function getOrgSnapshot(orgId: string, env: EnvWithIdentity) {
  try {
    const supabase = getAdminClient(env);
    const { data } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();

    return data?.settings?.enterpriseSnapshot || {};
  } catch (err: any) {
    console.error('[exportUEM] Failed to fetch snapshot:', err);
    return {};
  }
}

/**
 * Log audit trail
 */
async function logAudit(env: EnvWithIdentity, orgId: string, userId: string, action: string, meta: any) {
  try {
    const supabase = getAdminClient(env);
    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: userId,
      action,
      resource_type: 'export',
      resource_id: `export-${Date.now()}`,
      metadata: meta,
    });
  } catch (err: any) {
    console.error('[logAudit] Failed:', err);
  }
}
