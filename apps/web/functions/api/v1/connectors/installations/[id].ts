import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';
import {
  mergeConfig,
  toInstallationDto,
  encryptConnectorConfig,
  type InstallConfig,
} from '../../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const supabase = getAdminClient(context.env);

  // Mutations (PATCH, DELETE) are platform-admin only — connector installs belong to EIP, not client IT.
  // GET/read is allowed for org members with connector:read permission.
  if (context.request.method === 'DELETE' || context.request.method === 'PATCH') {
    if (!platformAdminFromEnv(context.env, auth.email)) {
      return json({ statusCode: 403, message: 'Connector modifications require platform admin access' }, 403);
    }
  } else {
    // GET — require connector:read
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
  }

  // For GET: scope to caller's org. For PATCH/DELETE: platform admin may act on any org's installation.
  const orgFilter = platformAdminFromEnv(context.env, auth.email)
    ? supabase.from('connector_installations').select('*').eq('id', id)
    : supabase.from('connector_installations').select('*').eq('id', id).eq('organization_id', auth.organizationId);

  const { data: existing } = await orgFilter.maybeSingle();
  if (!existing) return json({ statusCode: 404, message: 'Installation not found' }, 404);

  if (context.request.method === 'DELETE') {
    const { error } = await supabase.from('connector_installations').delete().eq('id', id);
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json({ ok: true });
  }

  if (context.request.method === 'PATCH') {
    let body: { displayName?: string; config?: InstallConfig } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }
    // Merge the patch with existing config (preserves '***' sentinel values = keep existing secret)
    const mergedConfig = body.config
      ? mergeConfig(existing.config as InstallConfig, body.config)
      : (existing.config as InstallConfig);
    // Encrypt any newly-submitted credential fields
    const encryptedConfig = await encryptConnectorConfig(
      mergedConfig,
      existing.organization_id as string,
      context.env,
    );
    const { data, error } = await supabase
      .from('connector_installations')
      .update({
        display_name: body.displayName?.trim() || existing.display_name,
        config: encryptedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json(toInstallationDto(data as Record<string, unknown>));
  }

  // GET
  return json(toInstallationDto(existing as Record<string, unknown>));
};
