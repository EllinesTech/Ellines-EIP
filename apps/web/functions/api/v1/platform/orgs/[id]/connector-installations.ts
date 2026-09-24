import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../../../shared/auth';
import { toInstallationDto, encryptConnectorConfig, type InstallConfig } from '../../../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const orgId = context.params.id as string;
  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('connector_installations')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map((r) => toInstallationDto(r as Record<string, unknown>)));
  }

  if (context.request.method === 'POST') {
    let body: {
      catalogId?: string;
      displayName?: string;
      config?: Record<string, unknown>;
      packId?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const catalogId = (body.catalogId || '').trim();
    if (!catalogId) {
      return json({ statusCode: 400, message: 'catalogId is required' }, 400);
    }

    const now = new Date().toISOString();
    const encryptedConfig = await encryptConnectorConfig(
      (body.config || {}) as InstallConfig,
      orgId,
      context.env,
    );
    const row = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      catalog_id: catalogId,
      display_name: (body.displayName || catalogId).trim(),
      config: encryptedConfig,
      status: 'draft',
      pack_id: body.packId || null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('connector_installations')
      .insert(row)
      .select('*')
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: auth.sub,
      action: 'platform.connector.install',
      resource: 'connector_installation',
      metadata: { id: row.id, catalogId, targetOrg: orgId },
    });

    return json(toInstallationDto(data as Record<string, unknown>));
  }

  return json({ message: 'Method not allowed' }, 405);
};
