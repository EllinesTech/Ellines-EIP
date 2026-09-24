/**
 * GET  /api/v1/orgs/me/integration-requests  — list own org's requests
 * POST /api/v1/orgs/me/integration-requests  — submit a new request
 *
 * Client IT admin/owner only. The Supabase `integration_requests` table is
 * the canonical store; requests are reviewed by a Platform Super Admin.
 */
import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // connector:read is the minimum permission required for both read and submit
  const permErr = await requirePermissionAsync(
    context.env,
    auth.sub,
    auth.organizationId,
    auth.role,
    'connector:read',
    undefined,
    auth.email,
  );
  if (permErr) return permErr;

  const supabase = getAdminClient(context.env);

  // ── GET: list requests for caller's org ─────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('integration_requests')
      .select('*')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map(toDto));
  }

  // ── POST: submit a new request ──────────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: { systemName?: string; purpose?: string; catalogId?: string } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const systemName = (body.systemName || '').trim();
    if (!systemName) {
      return json({ statusCode: 400, message: 'systemName is required' }, 400);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('integration_requests')
      .insert({
        id: crypto.randomUUID(),
        organization_id: auth.organizationId,
        requested_by_id: auth.sub,
        system_name: systemName,
        purpose: (body.purpose || '').trim() || null,
        catalog_id: (body.catalogId || '').trim() || null,
        status: 'pending',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    // Audit log
    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'connector.integration_request.create',
      resource: 'integration_request',
      metadata: { systemName, catalogId: body.catalogId || null },
    });

    return json(toDto(data as Record<string, unknown>), 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};

function toDto(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    requestedById: row.requested_by_id as string,
    systemName: row.system_name as string,
    purpose: (row.purpose as string) || null,
    catalogId: (row.catalog_id as string) || null,
    status: row.status as string,
    reviewedById: (row.reviewed_by_id as string) || null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string).toISOString() : null,
    reviewNote: (row.review_note as string) || null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
