import {
  getAdminClient,
  json,
  options,
  requireAuth,
  type Env,
} from '../../../../shared/auth';
import { validateFieldMap, type FieldMapEntry } from '@ellines-eip/shared';
import { platformStaffHas } from '../../../../shared/platform-staff';

/**
 * GET    /api/v1/connectors/:id/field-map  — retrieve current field map
 * PUT    /api/v1/connectors/:id/field-map  — save a new field map (validates first)
 * POST   /api/v1/connectors/:id/field-map/validate — validate without saving
 *
 * Each save increments mappingVersion. Platform Admin only for mutations.
 * Requirements: 19.1–19.5, 24.1
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const connectorId = context.params['id'] as string;
  const supabase = getAdminClient(context.env);

  // Verify connector belongs to org (any user can GET for read purposes)
  const { data: connector, error: fetchErr } = await supabase
    .from('connector_installations')
    .select('id, organization_id, config, mapping_version')
    .eq('id', connectorId)
    .single();

  if (fetchErr || !connector) return json({ statusCode: 404, message: 'Connector not found' }, 404);

  // Org isolation — ensure this org has access
  if (connector.organization_id !== auth.organizationId && !await platformStaffHas(context.env, auth.email, 'platform.connectors.manage')) {
    return json({ statusCode: 403, message: 'Access denied' }, 403);
  }

  const config = (connector.config ?? {}) as Record<string, unknown>;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
    const fieldMap = Array.isArray(config['fieldMap']) ? config['fieldMap'] : [];
    return json({
      connectorId,
      fieldMap,
      mappingVersion: connector.mapping_version ?? 1,
    });
  }

  // ── PUT — save field map ──────────────────────────────────────────────────
  if (context.request.method === 'PUT') {
    if (!await platformStaffHas(context.env, auth.email, 'platform.connectors.manage')) {
      return json({ statusCode: 403, message: 'Field map changes require Platform Admin privileges' }, 403);
    }

    let body: Record<string, unknown> = {};
    try { body = await context.request.json() as Record<string, unknown>; }
    catch { return json({ statusCode: 400, message: 'Invalid JSON body' }, 400); }

    const fieldMap = Array.isArray(body.fieldMap) ? body.fieldMap as FieldMapEntry[] : [];

    // Validate — reject unknown UEM paths (Req 19.2)
    const warnings = validateFieldMap(fieldMap);
    const hardErrors = warnings.filter((w) => w.code === 'reserved_field');
    if (hardErrors.length > 0) {
      return json({ statusCode: 422, message: 'Field map contains reserved field targets', errors: hardErrors }, 422);
    }

    const newVersion = (Number(connector.mapping_version ?? 1)) + 1;
    const updatedConfig = { ...config, fieldMap };

    const { data: updated, error: updateErr } = await supabase
      .from('connector_installations')
      .update({ config: updatedConfig, mapping_version: newVersion, updated_at: new Date().toISOString() })
      .eq('id', connectorId)
      .select('id, mapping_version')
      .single();

    if (updateErr) return json({ statusCode: 500, message: updateErr.message }, 500);

    return json({ connectorId, mappingVersion: updated.mapping_version, warnings });
  }

  return json({ statusCode: 405, message: 'Method not allowed' }, 405);
};
