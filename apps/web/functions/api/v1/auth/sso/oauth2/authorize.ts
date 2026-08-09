import { getAdminClient, json, options, signAccessToken, auditRow, getClientIp, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

// Use Web Crypto API (available in all Cloudflare Workers/Pages)
const uuidv4 = () => crypto.randomUUID();

/**
 * GET /api/v1/auth/sso/oauth2/authorize
 * Initiates OAuth2 authorization flow.
 * User clicks "Sign in with Azure AD" → redirects to IdP.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const url = new URL(context.request.url);
  const providerId = url.searchParams.get('provider_id');
  
  if (!providerId) {
    return json({ statusCode: 400, message: 'provider_id required' }, 400);
  }

  try {
    const supabase = getAdminClient(context.env);

    // Get provider config
    const { data: provider, error } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('id', providerId)
      .maybeSingle();

    if (error || !provider || provider.type !== 'oauth2') {
      return json({ statusCode: 404, message: 'OAuth2 provider not found' }, 404);
    }

    if (!provider.is_active) {
      return json({ statusCode: 403, message: 'Provider is disabled' }, 403);
    }

    // Generate state + nonce
    const state = uuidv4();
    const nonce = uuidv4();

    // Store in KV (or session) for validation on callback
    // For now, we'll trust the state in the URL (in production, use KV)
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: provider.client_id || '',
      redirect_uri: `${context.env.BASE_URL || 'http://localhost:3100'}/api/v1/auth/sso/oauth2/callback`,
      scope: 'openid profile email',
      state,
      nonce,
    });

    const authzUrl = provider.authz_url || provider.discovery_url;
    const redirectUrl = `${authzUrl}?${params.toString()}`;

    return new Response(null, {
      status: 302,
      headers: {
        'location': redirectUrl,
      },
    });
  } catch (err) {
    console.error('OAuth2 authorize error:', err);
    return json({ statusCode: 500, message: 'Authorization failed' }, 500);
  }
};
