import { getAdminClient, json, options, type Env } from '../../../../../shared/auth';
import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * GET /api/v1/auth/sso/saml2/authorize
 * Initiates SAML2 authorization flow.
 * Generates SAML AuthnRequest and redirects to IdP.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
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

    // Get SAML2 provider config
    const { data: provider, error } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('id', providerId)
      .eq('type', 'saml2')
      .maybeSingle();

    if (error || !provider) {
      return json({ statusCode: 404, message: 'SAML2 provider not found' }, 404);
    }

    if (!provider.is_active) {
      return json({ statusCode: 403, message: 'Provider is disabled' }, 403);
    }

    // Generate SAML AuthnRequest (use crypto.randomUUID — no Node Buffer in Workers)
    const id = `_${crypto.randomUUID().replace(/-/g, '')}`;
    const instant = new Date().toISOString();
    const acsUrl =
      provider.acs_url ||
      `${process.env.BASE_URL || 'http://localhost:3100'}/api/v1/auth/sso/saml2/acs`;

    const authnRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" 
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${id}"
  Version="2.0"
  IssueInstant="${instant}"
  Destination="${provider.idp_sso_url}"
  AssertionConsumerServiceURL="${acsUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${provider.entity_id || `${process.env.BASE_URL || 'http://localhost:3100'}/saml`}</saml:Issuer>
</samlp:AuthnRequest>`;

    // Encode to base64 using Web Crypto (no Buffer in Workers)
    const encoded = btoa(
      String.fromCharCode(...new TextEncoder().encode(authnRequest))
    );

    // Return HTML form for auto-submit (POST binding)
    const html = `
<!DOCTYPE html>
<html>
<head><title>SAML Redirect</title></head>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${provider.idp_sso_url}">
    <input type="hidden" name="SAMLRequest" value="${encoded}">
    <noscript>
      <p>JavaScript is disabled. Click the button below to continue:</p>
      <input type="submit" value="Continue">
    </noscript>
  </form>
</body>
</html>
    `;

    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('SAML2 authorize error:', err);
    return json({ statusCode: 500, message: 'Authorization failed' }, 500);
  }
};
