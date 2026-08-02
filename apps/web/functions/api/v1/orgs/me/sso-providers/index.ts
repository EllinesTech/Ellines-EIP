import { getAdminClient, json, requireAuth, options, auditRow, getClientIp, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/orgs/me/sso-providers
 * List all SSO providers for the org (Owner/Admin only)
 */
async function handleGet(context: { env: Env; request: Request }) {
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  const { data: user } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', auth.sub)
    .single();

  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return json({ statusCode: 403, message: 'Forbidden' }, 403);
  }

  const { data: providers, error } = await supabase
    .from('sso_providers')
    .select('id, type, name, is_active, enforced, created_at, updated_at')
    .eq('organization_id', user.organization_id)
    .order('created_at', { ascending: false });

  if (error) return json({ statusCode: 500, message: error.message }, 500);

  return json({ statusCode: 200, data: providers });
}

/**
 * POST /api/v1/orgs/me/sso-providers
 * Create a new SSO provider (Owner only)
 */
async function handlePost(context: { env: Env; request: Request }) {
  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const supabase = getAdminClient(context.env);

  const { data: user } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', auth.sub)
    .single();

  if (!user || user.role !== 'owner') {
    return json({ statusCode: 403, message: 'Only Owner can create SSO providers' }, 403);
  }

  try {
    const body = await context.request.json() as {
      type: string;
      name: string;
      clientId?: string;
      clientSecret?: string;
      discoveryUrl?: string;
      authzUrl?: string;
      tokenUrl?: string;
      userinfoUrl?: string;
      idpEntityId?: string;
      idpSsoUrl?: string;
      idpSloUrl?: string;
      idpCertificate?: string;
      entityId?: string;
      acsUrl?: string;
      attributeMap?: Record<string, string>;
      autoProvision?: boolean;
      defaultRole?: string;
      groupRoleMap?: Record<string, string>;
      enforced?: boolean;
    };

    if (!body.type || !body.name) {
      return json({ statusCode: 400, message: 'type and name required' }, 400);
    }
    if (body.type === 'oauth2' && (!body.clientId || !body.clientSecret)) {
      return json({ statusCode: 400, message: 'OAuth2 requires clientId and clientSecret' }, 400);
    }
    if (body.type === 'saml2' && (!body.idpEntityId || !body.idpSsoUrl)) {
      return json({ statusCode: 400, message: 'SAML2 requires idpEntityId and idpSsoUrl' }, 400);
    }

    const { data: provider, error } = await supabase
      .from('sso_providers')
      .insert({
        organization_id: user.organization_id,
        type: body.type,
        name: body.name,
        client_id: body.clientId || null,
        client_secret: body.clientSecret || null,
        discovery_url: body.discoveryUrl || null,
        authz_url: body.authzUrl || null,
        token_url: body.tokenUrl || null,
        userinfo_url: body.userinfoUrl || null,
        idp_entity_id: body.idpEntityId || null,
        idp_sso_url: body.idpSsoUrl || null,
        idp_slo_url: body.idpSloUrl || null,
        idp_certificate: body.idpCertificate || null,
        entity_id: body.entityId || null,
        acs_url: body.acsUrl || null,
        attribute_map: body.attributeMap || null,
        auto_provision: body.autoProvision !== false,
        default_role: body.defaultRole || 'member',
        group_role_map: body.groupRoleMap || null,
        is_active: true,
        enforced: body.enforced || false,
        created_by: auth.sub,
      })
      .select()
      .single();

    if (error) return json({ statusCode: 500, message: error.message }, 500);

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: user.organization_id,
        userId: auth.sub,
        action: 'sso.provider.created',
        resource: provider.id,
        ip,
        metadata: { type: body.type, name: body.name },
      }),
    );

    return json({ statusCode: 201, data: provider });
  } catch (err) {
    console.error('Error creating SSO provider:', err);
    return json({ statusCode: 500, message: 'Failed to create provider' }, 500);
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'POST') return handlePost(context);
  return json({ message: 'Method not allowed' }, 405);
};
