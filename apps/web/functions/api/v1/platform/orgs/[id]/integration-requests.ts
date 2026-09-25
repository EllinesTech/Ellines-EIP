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
    // Note: IntegrationRequest Prisma model has no @map on fields, so Supabase
    // columns are camelCase: organizationId, requestedById, systemName, etc.
    const { data, error } = await supabase
      .from('integration_requests')
      .select('*')
      .eq('organizationId', orgId)
      .order('createdAt', { ascending: false });

    if (error) {
      // Table or column doesn't exist yet — return empty rather than 500
      if (
        error.code === '42P01' ||
        error.code === '42703' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('does not exist')
      ) return json([]);
      return json({ statusCode: 500, message: error.message }, 500);
    }
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
      .select('id, organizationId, systemName')
      .eq('id', reqId)
      .eq('organizationId', orgId)
      .maybeSingle();

    if (!existing) {
      return json({ statusCode: 404, message: 'Integration request not found' }, 404);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('integration_requests')
      .update({
        status,
        reviewedById: auth.sub,
        reviewedAt: now,
        reviewNote: (body.reviewNote || '').trim() || null,
        updatedAt: now,
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
          systemName: existing.systemName as string,
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
  // Columns are camelCase in DB (IntegrationRequest model has no @map on fields)
  const orgId = (row.organizationId ?? row.organization_id) as string;
  const reqById = (row.requestedById ?? row.requested_by_id) as string;
  const sysName = (row.systemName ?? row.system_name) as string;
  const revById = (row.reviewedById ?? row.reviewed_by_id) as string | null | undefined;
  const revAt = (row.reviewedAt ?? row.reviewed_at) as string | null | undefined;
  const revNote = (row.reviewNote ?? row.review_note) as string | null | undefined;
  const createdAt = (row.createdAt ?? row.created_at) as string;
  const updatedAt = (row.updatedAt ?? row.updated_at) as string;
  return {
    id: row.id as string,
    organizationId: orgId,
    requestedById: reqById,
    systemName: sysName,
    purpose: (row.purpose as string) || null,
    catalogId: (row.catalogId ?? row.catalog_id) as string | null || null,
    status: row.status as string,
    reviewedById: revById || null,
    reviewedAt: revAt ? new Date(revAt).toISOString() : null,
    reviewNote: revNote || null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  };
}
