import { getAdminClient, json, signAccessToken, auditRow, getClientIp, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * POST /api/v1/auth/sso/saml2/acs
 * SAML2 Assertion Consumer Service (callback).
 * IdP POSTs SAML Response here after user authenticates.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  try {
    const body = await context.request.formData();
    const samlResponse = body.get('SAMLResponse') as string;
    const relayState = body.get('RelayState') as string;

    if (!samlResponse) {
      return json({ statusCode: 400, message: 'Missing SAMLResponse' }, 400);
    }

    const supabase = getAdminClient(context.env);

    // Get active SAML2 providers
    const { data: providers } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('type', 'saml2')
      .eq('is_active', true);

    if (!providers || providers.length === 0) {
      return json({ statusCode: 404, message: 'No SAML2 providers configured' }, 404);
    }

    const provider = providers[0];  // Simplified—in production, use RelayState to select

    // Decode SAML Response
    const xml = Buffer.from(samlResponse, 'base64').toString('utf-8');

    // Parse NameID
    const nameIdMatch = xml.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const nameId = nameIdMatch?.[1] || '';

    // Parse attributes
    const attributes: Record<string, string[]> = {};
    const attrRegex =
      /<saml:Attribute Name="([^"]+)"[^>]*>[\s\S]*?<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/g;

    let match;
    while ((match = attrRegex.exec(xml)) !== null) {
      const [, name, value] = match;
      if (!attributes[name]) attributes[name] = [];
      attributes[name].push(value);
    }

    // Map attributes using provider config
    const attrMap = (provider.attribute_map as Record<string, string>) || {};
    const email = getAttribute(attributes, attrMap['email'] || 'email') || '';
    const name = getAttribute(attributes, attrMap['name'] || 'name') || '';
    const groupsAttr = attrMap['groups'] || 'groups';
    const groups = attributes[groupsAttr] || [];

    if (!email) {
      return json({ statusCode: 400, message: 'Email attribute missing from SAML Response' }, 400);
    }

    // Find or create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, organization_id, role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (userError) {
      return json({ statusCode: 500, message: userError.message }, 500);
    }

    let userId = user?.id;
    let orgId = user?.organization_id;
    let userRole = user?.role;

    if (!user) {
      if (!provider.auto_provision) {
        return json(
          { statusCode: 403, message: 'User not found and auto-provisioning disabled' },
          403,
        );
      }

      // Auto-create user
      orgId = provider.organization_id;
      userRole = provider.default_role || 'member';

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email,
          full_name: name || email,
          password_hash: '(saml2)',
          organization_id: orgId,
          role: userRole,
          is_active: true,
        })
        .select('id')
        .single();

      if (createError) {
        return json({ statusCode: 500, message: createError.message }, 500);
      }

      userId = newUser.id;
    }

    // Link to SSO provider
    await supabase.from('sso_provider_users').upsert(
      {
        sso_provider_id: provider.id,
        user_id: userId,
        external_id: nameId,
        external_email: email,
        attributes: { groups },
        linked_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      },
      { onConflict: 'sso_provider_id, external_id' },
    );

    // Map groups to role
    if (provider.group_role_map && typeof provider.group_role_map === 'object') {
      const groupMap = provider.group_role_map as Record<string, string>;
      const mappedRole = Object.entries(groupMap).find(([group]) =>
        groups.includes(group),
      )?.[1];

      if (mappedRole) {
        userRole = mappedRole;
        await supabase
          .from('users')
          .update({ role: mappedRole })
          .eq('id', userId);
      }
    }

    // Issue JWT
    const accessToken = await signAccessToken(context.env, {
      sub: userId,
      email,
      organizationId: orgId!,
      role: userRole || 'member',
    });

    // Audit log
    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: orgId,
        userId,
        action: 'auth.sso.login',
        resource: 'saml2',
        ip,
      }),
    );

    // Redirect to app with JWT
    const redirectUrl = new URL(
      `${process.env.BASE_URL || 'http://localhost:3100'}/app`,
    );
    redirectUrl.searchParams.set('jwt', accessToken.accessToken);

    return new Response(null, {
      status: 302,
      headers: {
        'location': redirectUrl.toString(),
      },
    });
  } catch (err) {
    console.error('SAML2 ACS error:', err);
    return json({ statusCode: 500, message: 'ACS processing failed' }, 500);
  }
};

function getAttribute(attributes: Record<string, string[]>, name: string): string | undefined {
  return attributes[name]?.[0];
}
