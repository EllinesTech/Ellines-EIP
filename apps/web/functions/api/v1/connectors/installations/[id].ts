import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requirePermissionAsync,
  type Env,
} from '../../../../shared/auth';
import {
  mergeConfig,
  toInstallationDto,
  type InstallConfig,
} from '../../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // All methods require connector:read at minimum; mutations require connector:update/delete
  if (context.request.method === 'DELETE') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'connector:delete',
    );
    if (permErr) return permErr;
  } else if (context.request.method === 'PATCH') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'connector:update',
    );
    if (permErr) return permErr;
  } else {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'connector:read',
    );
    if (permErr) return permErr;
  }

  const id = context.params.id as string;
  const supabase = getAdminClient(context.env);

  const { data: existing } = await supabase
    .from('connector_installations')
    .select('*')
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();
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
    const config = body.config
      ? mergeConfig(existing.config as InstallConfig, body.config)
      : (existing.config as InstallConfig);
    const { data, error } = await supabase
      .from('connector_installations')
      .update({
        display_name: body.displayName?.trim() || existing.display_name,
        config,
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
