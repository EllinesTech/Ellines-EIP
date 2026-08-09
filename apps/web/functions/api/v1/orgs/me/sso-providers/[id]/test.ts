import { getAdminClient, json, requireAuth, options, auditRow, getClientIp, type Env } from '../../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * POST /api/v1/orgs/me/sso-providers/{id}/test
 * Test SSO provider connectivity
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  const providerId = Array.isArray(id) ? id[0] : id;
  const supabase = getAdminClient(context.env);

  try {
    const { data: user } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', auth.sub)
      .single();

    if (!user) return json({ statusCode: 401, message: 'User not found' }, 401);

    const { data: provider, error: fetchError } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('id', providerId)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !provider) return json({ statusCode: 404, message: 'Provider not found' }, 404);

    let testResult: { ok: boolean; message: string; details?: unknown } = {
      ok: false,
      message: 'No connectivity test available for this provider type',
    };

    if (provider.type === 'oauth2' && provider.discovery_url) {
      try {
        const res = await fetch(provider.discovery_url);
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>;
          testResult = {
            ok: true,
            message: 'OAuth2 discovery successful',
            details: {
              issuer: data.issuer,
              endpoints: {
                authz: data.authorization_endpoint ? '✓' : '✗',
                token: data.token_endpoint ? '✓' : '✗',
                userinfo: data.userinfo_endpoint ? '✓' : '✗',
              },
            },
          };
        } else {
          testResult = { ok: false, message: `Discovery returned ${res.status}` };
        }
      } catch (err) {
        testResult = { ok: false, message: `Discovery unreachable: ${(err as Error).message}` };
      }
    }

    if (provider.type === 'saml2' && provider.idp_sso_url) {
      try {
        const res = await fetch(provider.idp_sso_url, { method: 'HEAD' });
        testResult = res.ok || res.status === 405
          ? { ok: true, message: 'SAML2 SSO URL reachable' }
          : { ok: false, message: `SAML2 SSO URL returned ${res.status}` };
      } catch (err) {
        testResult = { ok: false, message: `SAML2 SSO URL unreachable: ${(err as Error).message}` };
      }
    }

    const ip = getClientIp(context.request);
    await supabase.from('audit_logs').insert(
      auditRow({
        organizationId: user.organization_id,
        userId: auth.sub,
        action: 'sso.provider.tested',
        resource: providerId,
        ip,
        metadata: { result: testResult.ok },
      }),
    );

    const statusCode = testResult.ok ? 200 : 400;
    return json({ statusCode, ...testResult }, statusCode);
  } catch (err) {
    console.error('Error testing SSO provider:', err);
    return json({ statusCode: 500, message: 'Test failed' }, 500);
  }
};
