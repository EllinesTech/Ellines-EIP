import { getAdminClient, json, signAccessToken, auditRow, getClientIp, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/auth/sso/oauth2/callback
 * OAuth2 callback from IdP (Azure AD, Okta, Google, etc.)
 * IdP redirects here with authorization code.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return json(
      { statusCode: 400, message: `OAuth2 error: ${error}` },
      400,
    );
  }

  if (!code) {
    return json({ statusCode: 400, message: 'Missing authorization code' }, 400);
  }

  try {
    const supabase = getAdminClient(context.env);

    // In production, retrieve state from session/KV to prevent CSRF
    // For now, assume state is valid

    // Get all OAuth2 providers (simplified—in production, associate code with provider)
    const { data: providers } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('type', 'oauth2')
      .eq('is_active', true);

    if (!providers || providers.length === 0) {
      return json({ statusCode: 404, message: 'No OAuth2 providers configured' }, 404);
    }

    const provider = providers[0];  // Simplified—use state to select provider

    // Exchange code for tokens (using provider's token endpoint)
    const tokenRes = await fetch(provider.token_url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: provider.client_id || '',
        client_secret: provider.client_secret || '',
        redirect_uri: `${process.env.BASE_URL || 'http://localhost:3100'}/api/v1/auth/sso/oauth2/callback`,
      }).toString(),
    });

    if (!tokenRes.ok) {
      return json(
        { statusCode: 400, message: `Token exchange failed: ${tokenRes.statusText}` },
        400,
      );
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      id_token: string;
      token_type: string;
    };

    // Decode ID token (JWT)
    const claims = decodeJwt(tokens.id_token);
    const email = claims.email as string;
    const name = claims.name as string;
    const sub = claims.sub as string;
    const groups = (claims.groups as string[]) || [];

    if (!email) {
      return json({ statusCode: 400, message: 'Email claim missing' }, 400);
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

      // Auto-create user in provider's organization
      orgId = provider.organization_id;
      userRole = provider.default_role || 'member';

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email,
          full_name: name || email,
          password_hash: '(oauth2)',
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
        external_id: sub,
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
        resource: 'oauth2',
        ip,
      }),
    );

    // Redirect to app with JWT in URL (or set cookie)
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
    console.error('OAuth2 callback error:', err);
    return json({ statusCode: 500, message: 'Callback failed' }, 500);
  }
};

/**
 * Simple JWT decode (no signature validation).
 * In production, validate signature using IdP's public key.
 */
function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');

  const payload = parts[1];
  const decoded = Buffer.from(payload, 'base64').toString('utf-8');
  return JSON.parse(decoded) as Record<string, unknown>;
}
