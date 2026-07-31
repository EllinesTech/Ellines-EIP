import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  type Env,
} from '../../../shared/auth';
import { toInstallationDto, type InstallConfig } from '../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;
  const denied = requireOrgAdmin(auth.role);
  if (denied) return denied;

  const supabase = getAdminClient(context.env);

  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('connector_installations')
      .select('*')
      .eq('organization_id', auth.organizationId)
      .order('updated_at', { ascending: false });
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map((r) => toInstallationDto(r as Record<string, unknown>)));
  }

  if (context.request.method === 'POST') {
    let body: {
      catalogId?: string;
      displayName?: string;
      config?: InstallConfig;
      packId?: string;
    } = {};
    try {
      body = (await context.request.json()) as typeof body;
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON body' }, 400);
    }

    const catalogId = (body.catalogId || '').trim();
    const allowed = [
      'rest-api',
      'openapi',
      'csv-file',
      'postgres',
      'demo-json',
      'email-imap',
      'sftp',
    ];
    if (!allowed.includes(catalogId)) {
      return json({ statusCode: 400, message: 'Unsupported catalogId' }, 400);
    }

    let config: InstallConfig = body.config || {};
    let displayName = (body.displayName || '').trim() || catalogId;
    let packId: string | null = body.packId || null;

    if (packId) {
      const { data: pack } = await supabase
        .from('connector_packs')
        .select('*')
        .eq('id', packId)
        .eq('published', true)
        .maybeSingle();
      if (!pack) return json({ statusCode: 404, message: 'Connector pack not found' }, 404);
      config = {
        ...((pack.template_config || {}) as InstallConfig),
        ...config,
      };
      displayName = displayName || (pack.name as string);
    }

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      organization_id: auth.organizationId,
      catalog_id: catalogId,
      display_name: displayName,
      config,
      status: 'draft',
      pack_id: packId,
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
      organization_id: auth.organizationId,
      user_id: auth.sub,
      action: 'connector.install.create',
      resource: 'connector_installation',
      metadata: { id: row.id, catalogId },
    });

    return json(toInstallationDto(data as Record<string, unknown>));
  }

  return json({ message: 'Method not allowed' }, 405);
};
