import { getAdminClient, json, requireAuth, options, auditRow, getClientIp, type Env } from '../../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * POST /api/v1/orgs/me/sso-providers/{id}/test
 * Test SSO provider connectivity
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = requireAuth(context.request);
  if (!auth) {
    return json({ statusCode: 401, message: 'Unauthorized' }, 401);
  }

  const { id } = context.params;

  const supabase = getAdminClient(context.env);

  try {
    // Get user org
    const { data: user } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', auth.sub)
      .single();

    if (!user) {
      return json({ statusCode: 401, message: 'User not found' }, 401);
    }

    // Get provider
    const { data: provider, error: fetchError } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !provider) {
      return json({ statusCode: 404, message: 'Provider not found' }, 404);
    }

    let testResult: { ok: boolean; message: string; details?: unknown } = {
      ok: false,
      message: 'Test failed',
    };

    if (provider.type === 'oauth2') {
      // Test OAuth2 discovery endpoint
      if (provider.discovery_url) {
        try {
          const discoveryRes = await fetch(provider.discovery_url);
          if (discoveryRes.ok) {
            const discoveryData = await discoveryRes.json();
            testResult = {
              ok: true,
              message: 'OAuth2 provider discovery successful',
              details: {
                issuer: discoveryData.issuer,
                endpoints: {
                  authz: discoveryData.authorization_endpoint ? '✓' : '✗',
                  token: discoveryData.token_endpoint ? '✓' : '✗',
                  userinfo: discoveryData.userinfo_endpoint ? '✓' : '✗',
                },
              },
            };
          } else {
            testResult = {
              ok: false,
              message: `Discovery endpoint returned ${discoveryRes.status}`,
            };
          }
        } catch (discoveryErr) {
          testResult = {
            ok: false,
            message: `Discovery endpoint unreachable: ${(discoveryErr as Error).message}`,
          };
        }
      }
    }

    if (provider.type === 'saml2') {
      // Test SAML2 SSO URL
      if (provider.idp_sso_url) {
        try {
          const ssoRes = await fetch(provider.idp_sso_url, { method: 'HEAD' });
          if (ssoRes.ok || ssoRes.status === 405) {
            // 405 OK for SAML (HEAD not supported)
            testResult = {
              ok: true,
              message: 'SAML2 SSO URL is reachable',
            };
          } else {
            testResult = {
              ok: false,
              message: `SAML2 SSO URL returned ${ssoRes.status}`,
            };
          }
        } catch (ssoErr) {
          testResult = {
            ok: false,
            message: `SAML2 SSO URL unreachable: ${(ssoErr as Error).message}`,
          };
        }
      }
    }

    // Audit log
    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: user.organization_id,
        userId: auth.sub,
        action: 'sso.provider.tested',
        resource: id,
        ip,
        metadata: { result: testResult.ok },
      }),
    );

    const statusCode = testResult.ok ? 200 : 400;
    return json(
      {
        statusCode,
        ...testResult,
      },
      statusCode,
    );
  } catch (err) {
    console.error('Error testing SSO provider:', err);
    return json({ statusCode: 500, message: 'Test failed' }, 500);
  }
};
