/**
 * GET   /api/v1/platform/orgs/:id/integration-requests
 *   → List all integration requests for a client org (Super Admin).
 *
 * PATCH /api/v1/platform/orgs/:id/integration-requests/:reqId
 *   → Approve or reject a request. Body: { status, reviewNote }
 *   → status must be 'approved' | 'rejected'
 *
 * Platform Super Admin only.
 */
import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  auditRow,
  getClientIp,
  type Env,
} from '../../../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  // reqId is the second path segment when reviewing a specific request
  // URL shape: /platform/orgs/:id/integration-requests/:reqId
  const urlParts = new URL(context.request.url).pathname.split('/');
  const reqId = urlParts[urlParts.length - 1] !== 'integration-requests'
    ? urlParts[urlParts.length - 1]
    : null;

  const supabase = getAdminClient(context.env);

  // ── GET: list requests for the org ──────────────────────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('integration_requests')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map(toDto));
  }

  // ── PATCH: review (approve / reject) a specific request ─────────────────
  if (context.request.method === 'PATCH') {
    if (!reqId) {
      return json({ statusCode: 400, message: 'Request ID is required in the URL path' }, 400);
    }

    let body: { status?: string; reviewNote?: string } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const status = (body.status || '').trim();
    if (status !== 'approved' && status !== 'rejected') {
      return json(
        { statusCode: 400, message: 'status must be "approved" or "rejected"' },
        400,
      );
    }

    const { data: existing } = await supabase
      .from('integration_requests')
      .select('id, organization_id, system_name')
      .eq('id', reqId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!existing) {
      return json({ statusCode: 404, message: 'Integration request not found' }, 404);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('integration_requests')
      .update({
        status,
        reviewed_by_id: auth.sub,
        reviewed_at: now,
        review_note: (body.reviewNote || '').trim() || null,
        updated_at: now,
      })
      .eq('id', reqId)
      .select('*')
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: `platform.integration_request.${status}`,
        resource: 'integration_request',
        metadata: {
          requestId: reqId,
          systemName: existing.system_name,
          status,
          reviewNote: body.reviewNote || null,
          reviewedBy: auth.email,
        },
        ip: getClientIp(context.request),
      }),
    );

    return json(toDto(data as Record<string, unknown>));
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
