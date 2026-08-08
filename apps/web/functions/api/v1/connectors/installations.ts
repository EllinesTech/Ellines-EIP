import {
  getAdminClient,
  json,
  options,
  requireAuth,
  requireOrgAdmin,
  requirePermissionAsync,
  getClientIp,
  auditRow,
  type Env,
} from '../../../shared/auth';
import { toInstallationDto, type InstallConfig } from '../../../shared/connectors';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  // GET: connector:read   POST: connector:install
  if (context.request.method === 'GET') {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'connector:read',
    );
    if (permErr) return permErr;
  } else {
    const permErr = await requirePermissionAsync(
      context.env,
      auth.sub,
      auth.organizationId,
      auth.role,
      'connector:install',
    );
    if (permErr) return permErr;
  }

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
      'graphql',
      'openapi',
      'csv-file',
      'postgres',
      'sqlserver',
      'mysql',
      'demo-json',
      'email-imap',
      'sftp',
      'webhook-inbound',
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

      // Check uniqueness: one installation per (org, pack) pair
      const { data: existing } = await supabase
        .from('connector_installations')
        .select('id')
        .eq('organization_id', auth.organizationId)
        .eq('pack_id', packId)
        .maybeSingle();
      if (existing) {
        return json(
          { statusCode: 409, message: 'This connector pack is already installed in your organization' },
          409,
        );
      }

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

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: auth.organizationId,
        userId: auth.sub,
        action: 'connector.install.create',
        resource: 'connector_installation',
        metadata: { id: row.id, catalogId },
        ip,
      })
    );

    return json(toInstallationDto(data as Record<string, unknown>));
  }

  return json({ message: 'Method not allowed' }, 405);
};
