import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { platformStaffHas } from '../../../shared/platform-staff';

/**
 * POST /api/v1/connectors/integration-requests  — submit a new request
 * GET  /api/v1/connectors/integration-requests  — list requests (org-scoped; platform admin sees all with ?orgId=)
 *
 * Requirements: 12.6, 12.5
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const isPlatformAdmin = await platformStaffHas(context.env, auth.email, 'platform.connectors.manage');

  // ── GET ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const url = new URL(context.request.url);
    const queryOrgId = url.searchParams.get('orgId');

    // Platform admin can see any org; regular users see their own org only
    const orgId = (isPlatformAdmin && queryOrgId) ? queryOrgId : auth.organizationId;

    const { data, error } = await supabase
      .from('integration_requests')
      .select('id, organization_id, requested_by_id, system_name, purpose, catalog_id, status, requested_connector_type, business_justification, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json({ requests: data ?? [] });
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    const requestedSystemName = typeof body.requestedSystemName === 'string' ? body.requestedSystemName.trim() : '';
    const requestedConnectorType = typeof body.requestedConnectorType === 'string' ? body.requestedConnectorType.trim() : '';
    const businessJustification = typeof body.businessJustification === 'string' ? body.businessJustification.trim() : '';

    // Required field validation (Req 12.6)
    if (!requestedSystemName) return json({ statusCode: 422, message: 'requestedSystemName is required' }, 422);
    if (!requestedConnectorType) return json({ statusCode: 422, message: 'requestedConnectorType is required' }, 422);

    const { data, error } = await supabase
      .from('integration_requests')
      .insert({
        organization_id: auth.organizationId,
        requested_by_id: auth.sub,
        system_name: requestedSystemName,
        purpose: businessJustification || null,
        requested_connector_type: requestedConnectorType,
        business_justification: businessJustification,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json({ request: data }, 201);
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
