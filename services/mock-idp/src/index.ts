import express from 'express';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const JWT_SECRET = 'mock-idp-secret-for-testing-only';
const OAUTH2_CLIENT_ID = 'mock-oauth2-client-id';
const OAUTH2_CLIENT_SECRET = 'mock-oauth2-client-secret';

// In-memory session store for OAuth2 authorization codes
const authorizationCodes = new Map<string, { email: string; name: string; groups: string[]; expiresAt: number }>();
const samlAuthnRequests = new Map<string, { createdAt: number; id: string }>();

/**
 * OAuth2 / OIDC Endpoints
 */

// OIDC Discovery Endpoint
app.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: 'http://localhost:3004',
    authorization_endpoint: 'http://localhost:3004/oauth/authorize',
    token_endpoint: 'http://localhost:3004/oauth/token',
    userinfo_endpoint: 'http://localhost:3004/oauth/userinfo',
    jwks_uri: 'http://localhost:3004/.well-known/jwks.json',
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_alg_values_supported: ['HS256'],
  });
});

// OAuth2 Authorization Endpoint
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, scope, state, nonce } = req.query;

  // Validate client_id
  if (client_id !== OAUTH2_CLIENT_ID) {
    return res.status(400).send('Invalid client_id');
  }

  // Generate authorization code
  const code = `mock-auth-code-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  // Store with user data (in real IdP, user would authenticate here)
  authorizationCodes.set(code, {
    email: 'testuser@example.com',
    name: 'Test User',
    groups: ['admin-group', 'finance-group'],
    expiresAt: Date.now() + 600000, // 10 min expiry
  });

  // Redirect back with code + state
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', state as string);

  res.redirect(redirectUrl.toString());
});

// OAuth2 Token Endpoint
app.post('/oauth/token', (req, res) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

  // Validate credentials
  if (client_id !== OAUTH2_CLIENT_ID || client_secret !== OAUTH2_CLIENT_SECRET) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  // Validate code
  const userData = authorizationCodes.get(code);
  if (!userData || userData.expiresAt < Date.now()) {
    authorizationCodes.delete(code);
    return res.status(400).json({ error: 'invalid_code' });
  }

  // Generate ID token
  const idToken = jwt.sign(
    {
      iss: 'http://localhost:3004',
      sub: 'test-user-id',
      aud: client_id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: userData.email,
      name: userData.name,
      groups: userData.groups,
    },
    JWT_SECRET,
    { algorithm: 'HS256' }
  );

  authorizationCodes.delete(code);

  res.json({
    access_token: `mock-access-token-${Date.now()}`,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

// OAuth2 UserInfo Endpoint
app.get('/oauth/userinfo', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'missing_authorization_header' });
  }

  res.json({
    sub: 'test-user-id',
    email: 'testuser@example.com',
    name: 'Test User',
    groups: ['admin-group', 'finance-group'],
  });
});

/**
 * SAML2 Endpoints
 */

// SAML2 Metadata Endpoint
app.get('/saml/metadata', (req, res) => {
  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:3004/saml">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3004/saml/authorize"/>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3004/saml/logout"/>
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIDXTCCAkWgAwIBAgIJAJC1/iNAZwqDMA0GCSqGSIb3DQEBBQUAMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOstBUFsHYXmLJ7P6/7pQzV0ARGH/6YpR8KMy0xQwjZv/nxMp5I6+5V4uiT5u8jzHzXYkEa7AKvOKFXvXYHcXPkwFxiAm9HGRaLV7wxp4E1R5c5PF0Qu4IqL1ZPg0lMu3BM/6bslEVz0oV1NFWYD6VUGqQLVjM8DPD/1GG7/0M4/6IvQNrXBdLbSLH+JHkSH/k6Ni3KxMfZ5LwFa1/6bN0PW5bfLK0Xc1/Q/CiCQZ/VZV7xgaEQHZqPJpQYNk5VHdXn7LD6O+Hkqz2IwT7AEQ6HvLdYU+0d0gC9F5cqEI+hD7cVmSEWQw==</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
  </IDPSSODescriptor>
</EntityDescriptor>`;

  res.type('application/xml').send(metadata);
});

// SAML2 Authorize Endpoint
app.get('/saml/authorize', (req, res) => {
  const samlRequest = req.query.SAMLRequest as string;
  const relayState = req.query.RelayState as string;

  // Store the AuthnRequest ID for later validation (in real IdP, parse + validate)
  const authnRequestId = `authn-req-${Date.now()}`;
  samlAuthnRequests.set(authnRequestId, {
    createdAt: Date.now(),
    id: authnRequestId,
  });

  // Redirect to ACS with SAML Response
  const html = `
<!DOCTYPE html>
<html>
<head><title>SAML Redirect</title></head>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${req.query.acs || 'http://localhost:3100/api/v1/auth/sso/saml2/acs'}">
    <input type="hidden" name="SAMLResponse" value="${getSamlResponse(relayState || '')}">
    <input type="hidden" name="RelayState" value="${relayState || ''}">
    <noscript>
      <p>JavaScript is disabled. Click the button below to continue:</p>
      <input type="submit" value="Continue">
    </noscript>
  </form>
</body>
</html>
  `;

  res.type('text/html').send(html);
});

// SAML2 Assertion Consumer Service (ACS)
app.post('/saml/acs', (req, res) => {
  const { SAMLResponse } = req.body;

  // In real IdP, validate signature; for mock, just decode
  console.log('Received SAML Response:', SAMLResponse);

  res.json({ success: true, message: 'SAML Response received' });
});

/**
 * Helper Functions
 */

function getSamlResponse(relayState: string): string {
  const samlAssertion = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6" Version="2.0"
  IssueInstant="${new Date().toISOString()}"
  Destination="http://localhost:3100/api/v1/auth/sso/saml2/acs">
  <saml:Issuer>http://localhost:3004/saml</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion ID="_d71a3a8e9fcc45c1d4b0e8f3c7a1b5e9" Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="urn:oasis:names:tc:SAML:2.0:assertion urn:oasis:names:tc:SAML:2.0:schemas:assertion">
    <saml:Issuer>http://localhost:3004/saml</saml:Issuer>
    <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">testuser@example.com</saml:NameID>
    <saml:AuthnStatement AuthnInstant="${new Date().toISOString()}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue>testuser@example.com</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue>Test User</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/claims/Group" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue>admin-group</saml:AttributeValue>
        <saml:AttributeValue>finance-group</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

  return Buffer.from(samlAssertion).toString('base64');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Mock IdP running on http://localhost:${PORT}`);
  console.log(`  OAuth2 Discovery: http://localhost:${PORT}/.well-known/openid-configuration`);
  console.log(`  SAML Metadata: http://localhost:${PORT}/saml/metadata`);
  console.log(`  Test OAuth2: Visit http://localhost:${PORT}/oauth/authorize?client_id=${OAUTH2_CLIENT_ID}&redirect_uri=http://localhost:3100/api/v1/auth/sso/oauth2/callback&scope=openid+profile+email&state=test`);
});
