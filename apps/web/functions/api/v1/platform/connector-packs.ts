import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../shared/auth';
import { redactConfig, toPackDto, type InstallConfig } from '../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('connector_packs')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map((r) => toPackDto(r as Record<string, unknown>)));
  }

  if (context.request.method === 'POST') {
    let body: {
      slug?: string;
      name?: string;
      description?: string;
      catalogId?: string;
      templateConfig?: InstallConfig;
      fromInstallationId?: string;
      published?: boolean;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const slug = (body.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
    if (!slug || !body.name?.trim()) {
      return json({ statusCode: 400, message: 'slug and name are required' }, 400);
    }

    let catalogId = body.catalogId || '';
    let templateConfig: InstallConfig = body.templateConfig || {};

    if (body.fromInstallationId) {
      const { data: inst } = await supabase
        .from('connector_installations')
        .select('*')
        .eq('id', body.fromInstallationId)
        .eq('organization_id', auth.organizationId)
        .maybeSingle();
      if (!inst) return json({ statusCode: 404, message: 'Installation not found' }, 404);
      catalogId = inst.catalog_id as string;
      const cfg = redactConfig((inst.config || {}) as Record<string, unknown>);
      delete cfg.apiKey;
      delete cfg.bearerToken;
      delete cfg.basicPass;
      delete cfg.connectionString;
      delete cfg.openApiDocument;
      templateConfig = cfg as InstallConfig;
    }

    if (!catalogId) {
      return json({ statusCode: 400, message: 'catalogId is required' }, 400);
    }

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      slug,
      name: body.name.trim(),
      description: (body.description || '').trim(),
      catalog_id: catalogId,
      template_config: templateConfig,
      published: body.published !== false,
      created_by_email: auth.email,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('connector_packs')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      return json(
        { statusCode: 400, message: error.message.includes('duplicate') ? 'Pack slug already exists' : error.message },
        400,
      );
    }
    return json(toPackDto(data as Record<string, unknown>));
  }

  return json({ message: 'Method not allowed' }, 405);
};
