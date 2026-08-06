import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../../shared/auth';

/**
 * Switch Primary Database
 * POST /api/v1/orgs/me/database-config/switch-primary
 *
 * Set a database configuration as primary
 * Admin action: tracked in audit_logs and database_switch_logs
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ statusCode: 405, message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
  }

  const { configId, reason } = body;

  if (!configId) {
    return json({ statusCode: 400, message: 'configId is required' }, 400);
  }

  const supabase = getAdminClient(context.env);

  // Verify config exists and belongs to this organization
  const { data: config, error: configErr } = await supabase
    .from('database_configurations')
    .select('*')
    .eq('id', configId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (configErr || !config) {
    return json({ statusCode: 404, message: 'Database configuration not found' }, 404);
  }

  // Get current primary config
  const { data: previousPrimary } = await supabase
    .from('database_configurations')
    .select('id')
    .eq('organization_id', auth.organizationId)
    .eq('is_primary', true)
    .maybeSingle();

  // Transaction: update all to is_primary=false, then set target to true
  try {
    // Remove primary from all
    await supabase
      .from('database_configurations')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('organization_id', auth.organizationId);

    // Set new primary
    await supabase
      .from('database_configurations')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', configId);

    // Log the switch
    await supabase.from('database_switch_logs').insert({
      organization_id: auth.organizationId,
      config_id: configId,
      previous_config_id: previousPrimary?.id || null,
      switched_by: auth.sub,
      reason: reason || null,
      created_at: new Date().toISOString(),
    });

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'database_config.switched',
      resource: 'database_configuration',
      metadata: {
        configId,
        configName: config.name,
        configType: config.type,
        previousConfigId: previousPrimary?.id,
        reason,
      },
    });

    return json({
      success: true,
      message: `Switched to ${config.name} (${config.type})`,
      configId,
      previousConfigId: previousPrimary?.id,
    });
  } catch (err) {
    return json(
      {
        statusCode: 500,
        message: err instanceof Error ? err.message : 'Failed to switch database',
      },
      500,
    );
  }
};
