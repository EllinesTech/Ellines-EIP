import {
  auditRow,
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

  // ── GET: list all connector installations for this org ────────────────────
  if (context.request.method === 'GET') {
    const { data, error } = await supabase
      .from('connector_installations')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) return json({ statusCode: 500, message: error.message }, 500);
    return json((data || []).map((r) => toInstallationDto(r as Record<string, unknown>)));
  }

  // ── POST: install a new connector for this org ────────────────────────────
  if (context.request.method === 'POST') {
    let body: {
      catalogId?: string;
      displayName?: string;
      config?: Record<string, unknown>;
      packId?: string;
      templateId?: string;
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

    // ── Entitlement check: max_connectors (server-side, pre-insert) ──────────
    // Read the org's current tier and count existing installations atomically
    // before inserting, so the limit is enforced even under concurrent requests.
    const { data: tierRow } = await supabase
      .from('organization_tiers')
      .select('custom_limits, rate_limit_tiers(max_connectors)')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (tierRow) {
      // custom_limits.max_connectors overrides the tier default when set
      const customMax = (tierRow.custom_limits as Record<string, unknown> | null)?.max_connectors;
      const tierMax = ((tierRow.rate_limit_tiers as unknown) as Record<string, unknown> | null)?.max_connectors;
      const maxConnectors =
        typeof customMax === 'number' ? customMax :
        typeof tierMax === 'number' ? tierMax :
        null;

      if (maxConnectors !== null) {
        const { count, error: countError } = await supabase
          .from('connector_installations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId);

        if (countError) {
          return json({ statusCode: 500, message: 'Failed to check connector limit' }, 500);
        }

        if ((count ?? 0) >= maxConnectors) {
          return json(
            {
              statusCode: 422,
              message: `Connector limit reached. This organization's plan allows a maximum of ${maxConnectors} connector${maxConnectors === 1 ? '' : 's'}. Upgrade the package or remove an existing connector before adding another.`,
            },
            422,
          );
        }
      }
    }
    // ── End entitlement check ─────────────────────────────────────────────────

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
      // Installed connectors start as 'draft' — Super Admin must explicitly
      // activate them (PATCH …/activate) before the client org can use them.
      status: 'draft',
      pack_id: body.packId || null,
      template_id: body.templateId || null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('connector_installations')
      .insert(row)
      .select('*')
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId: auth.sub,
        action: 'platform.connector.install',
        resource: 'connector_installation',
        metadata: { id: row.id, catalogId, targetOrg: orgId },
        ip: auth.ip,
      }),
    );

    return json(toInstallationDto(data as Record<string, unknown>), 201);
  }

  return json({ message: 'Method not allowed' }, 405);
};
