import {
  getAdminClient,
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  requirePermissionAsync,
  getClientIp,
  auditRow,
  type Env,
} from '../../../shared/auth';
import {
  toInstallationDto,
  encryptConnectorConfig,
  type InstallConfig,
} from '../../../shared/connectors';
import { getOrgEntitlement } from '../../../shared/entitlements';

/**
 * GET  /api/v1/connectors/installations
 *   → returns connector installations for the authenticated org (connector:read).
 *     Platform admins see installations for a target org when ?orgId=<uuid> is supplied.
 *
 * POST /api/v1/connectors/installations
 *   → PLATFORM ADMIN ONLY. Installs a connector for a target client org.
 *     Requires `targetOrgId` in the request body.
 *     Enforces max_connectors entitlement server-side.
 *     Encrypts all credential fields before writing to the database.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);
  const isPlatformAdmin = platformAdminFromEnv(context.env, auth.email);

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (context.request.method === 'GET') {
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

    // Platform admin may read any org's installations via ?orgId=
    const url = new URL(context.request.url);
    const targetOrgId = isPlatformAdmin
      ? (url.searchParams.get('orgId') || auth.organizationId)
      : auth.organizationId;

    const { data, error } = await supabase
      .from('connector_installations')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('updated_at', { ascending: false });
    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map((r) => toInstallationDto(r as Record<string, unknown>)));
  }

  // ── POST (install) ───────────────────────────────────────────────────────────
  if (context.request.method === 'POST') {
    // Gate 1: must be platform admin
    if (!isPlatformAdmin) {
      return json(
        {
          statusCode: 403,
          message:
            'Connector installation is a platform admin operation. ' +
            'Client organizations cannot install connectors directly.',
        },
        403,
      );
    }

    let body: {
      targetOrgId?: string;
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

    // Gate 2: targetOrgId is required — the operator must explicitly name the client org
    const targetOrgId = (body.targetOrgId || '').trim();
    if (!targetOrgId) {
      return json(
        {
          statusCode: 400,
          message:
            'targetOrgId is required. Specify the client organization to install the connector for.',
        },
        400,
      );
    }

    // Verify target org exists
    const { data: targetOrg } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', targetOrgId)
      .maybeSingle();
    if (!targetOrg) {
      return json({ statusCode: 404, message: 'Target organization not found' }, 404);
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
    if (!catalogId || !allowed.includes(catalogId)) {
      return json({ statusCode: 400, message: 'Unsupported or missing catalogId' }, 400);
    }

    // Gate 3: enforce max_connectors entitlement server-side
    const entitlement = await getOrgEntitlement(supabase, targetOrgId);
    if (entitlement.maxConnectors !== null) {
      const { count, error: countErr } = await supabase
        .from('connector_installations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', targetOrgId)
        .neq('status', 'deleted');
      if (countErr) return json({ statusCode: 500, message: countErr.message }, 500);
      const current = count ?? 0;
      if (current >= entitlement.maxConnectors) {
        return json(
          {
            statusCode: 422,
            message: `Connector limit reached. This organization's package allows ${entitlement.maxConnectors} connector(s) and ${current} are already installed.`,
            limit: entitlement.maxConnectors,
            current,
          },
          422,
        );
      }
    }

    let config: InstallConfig = body.config || {};
    let displayName = (body.displayName || '').trim() || catalogId;
    const packId: string | null = body.packId || null;

    if (packId) {
      const { data: pack } = await supabase
        .from('connector_packs')
        .select('*')
        .eq('id', packId)
        .eq('published', true)
        .maybeSingle();
      if (!pack) return json({ statusCode: 404, message: 'Connector pack not found' }, 404);

      // One installation per (org, pack) pair
      const { data: existing } = await supabase
        .from('connector_installations')
        .select('id')
        .eq('organization_id', targetOrgId)
        .eq('pack_id', packId)
        .maybeSingle();
      if (existing) {
        return json(
          {
            statusCode: 409,
            message: 'This connector pack is already installed in the target organization',
          },
          409,
        );
      }

      config = {
        ...((pack.template_config || {}) as InstallConfig),
        ...config,
      };
      displayName = displayName || (pack.name as string);
    }

    // Gate 4: encrypt all credential fields before writing
    const encryptedConfig = await encryptConnectorConfig(config, targetOrgId, context.env);

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      organization_id: targetOrgId,
      catalog_id: catalogId,
      display_name: displayName,
      config: encryptedConfig,
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
        organizationId: targetOrgId,
        userId: auth.sub,
        action: 'platform.connector.install',
        resource: 'connector_installation',
        metadata: {
          id: row.id,
          catalogId,
          targetOrgId,
          targetOrgName: targetOrg.name,
          installedBy: auth.email,
        },
        ip,
      }),
    );

    return json(toInstallationDto(data as Record<string, unknown>), 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};
