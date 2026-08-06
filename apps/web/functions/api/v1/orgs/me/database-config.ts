import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../../shared/auth';

/**
 * Database Configuration API
 * GET  → List all database configurations for organization
 * POST → Add new database configuration
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    // List all database configurations for this org
    const { data: configs, error } = await supabase
      .from('database_configurations')
      .select('*')
      .eq('organization_id', auth.organizationId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return json({ statusCode: 500, message: error.message }, 500);
    }

    // Hide encrypted passwords in response
    const safeConfigs = (configs || []).map((c) => ({
      ...c,
      passwordEncrypted: c.passwordEncrypted ? '••••••••' : null,
      supabaseKeyEncrypted: c.supabaseKeyEncrypted ? '••••••••' : null,
    }));

    return json(safeConfigs);
  }

  if (context.request.method === 'POST') {
    // Add new database configuration
    let body: any;
    try {
      body = await context.request.json();
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const { name, type, host, port, username, password, databaseName, supabaseUrl, supabaseKey, sslMode } = body;

    // Validation
    if (!name || !type) {
      return json({ statusCode: 400, message: 'name and type are required' }, 400);
    }

    if (!['local', 'supabase', 'custom_postgres'].includes(type)) {
      return json(
        { statusCode: 400, message: 'type must be: local | supabase | custom_postgres' },
        400,
      );
    }

    // Check if config with same name already exists
    const { data: existing } = await supabase
      .from('database_configurations')
      .select('id')
      .eq('organization_id', auth.organizationId)
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      return json(
        { statusCode: 409, message: `Database config "${name}" already exists for this organization` },
        409,
      );
    }

    // Create config
    const { data: newConfig, error: insertErr } = await supabase
      .from('database_configurations')
      .insert({
        id: crypto.randomUUID(),
        organization_id: auth.organizationId,
        name,
        type,
        host: host || (type === 'local' ? 'localhost' : null),
        port: port || 5432,
        username,
        password_encrypted: password ? btoa(password) : null, // TODO: proper encryption
        database_name: databaseName,
        supabase_url: supabaseUrl || null,
        supabase_key_encrypted: supabaseKey ? btoa(supabaseKey) : null, // TODO: proper encryption
        ssl_mode: sslMode || 'require',
        is_primary: false,
        is_active: true,
        test_status: 'untested',
        created_by: auth.sub,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertErr) {
      return json({ statusCode: 500, message: insertErr.message }, 500);
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'database_config.created',
      resource: 'database_configuration',
      metadata: { configId: newConfig.id, type, name },
    });

    return json(newConfig, 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};
