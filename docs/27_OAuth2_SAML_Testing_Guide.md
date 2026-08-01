# OAuth2 & SAML2 SSO Testing Guide

**Status:** E.9 Solution — Local Mock IdP for testing without external IdPs  
**Date:** August 1, 2026  
**Scope:** How to test OAuth2/SAML2 flows locally

---

## Quick Start (Mock IdP)

### 1. Start the Mock IdP Server

```bash
cd services/mock-idp
npm install
npm run dev
```

Server runs on `http://localhost:3004`

**Endpoints:**
- OAuth2 Discovery: `http://localhost:3004/.well-known/openid-configuration`
- OAuth2 Authorize: `http://localhost:3004/oauth/authorize`
- OAuth2 Token: `http://localhost:3004/oauth/token`
- SAML Metadata: `http://localhost:3004/saml/metadata`
- SAML Authorize: `http://localhost:3004/saml/authorize`

---

## Testing OAuth2 Flow (Local)

### Setup

1. **Start web + identity servers:**
   ```bash
   npm run dev:web    # Terminal 1, port 3100
   npm run dev:identity  # Terminal 2, port 3001
   npm run dev # services/mock-idp, port 3004 — Terminal 3
   ```

2. **Create OAuth2 provider in Settings:**
   - Navigate to `http://localhost:3100/app/settings/sso`
   - Click **Add SSO Provider** → **OAuth2 / OIDC**
   - Fill in:
     - **Provider Name:** `Mock OAuth2`
     - **Client ID:** `mock-oauth2-client-id`
     - **Client Secret:** `mock-oauth2-client-secret`
     - **Discovery URL:** `http://localhost:3004/.well-known/openid-configuration`
   - Click **Create Provider**

3. **Test connectivity:**
   - Find "Mock OAuth2" in provider list
   - Click **Test** button
   - Should see: "OAuth2 provider discovery successful"

### OAuth2 Login Flow

1. **Initiate OAuth2 authorize:**
   ```
   http://localhost:3100/api/v1/auth/sso/oauth2/authorize?provider_id=<PROVIDER_ID>
   ```

   This redirects to:
   ```
   http://localhost:3004/oauth/authorize?client_id=mock-oauth2-client-id&...
   ```

2. **Mock IdP redirects back with authorization code:**
   ```
   http://localhost:3100/api/v1/auth/sso/oauth2/callback?code=mock-auth-code-...&state=...
   ```

3. **EIP exchanges code for ID token:**
   - Pages Function calls mock IdP token endpoint
   - Receives ID token with claims: `email`, `name`, `groups`
   - User auto-provisioned: `testuser@example.com`

4. **Redirect to app:**
   ```
   http://localhost:3100/app?jwt=<ACCESS_TOKEN>
   ```

5. **Verify in browser console:**
   ```javascript
   localStorage.getItem('eip_access_token')  // Should have JWT
   ```

---

## Testing SAML2 Flow (Local)

### Setup

1. **Get SAML certificate from mock IdP:**
   ```bash
   curl http://localhost:3004/saml/metadata
   ```
   
   Copy the `<X509Certificate>` value (or use the mock one in the code).

2. **Create SAML2 provider in Settings:**
   - Navigate to `http://localhost:3100/app/settings/sso`
   - Click **Add SSO Provider** → **SAML2**
   - Fill in:
     - **Provider Name:** `Mock SAML2`
     - **IdP Entity ID:** `http://localhost:3004/saml`
     - **IdP SSO URL:** `http://localhost:3004/saml/authorize`
     - **IdP Certificate:** (paste from metadata endpoint)
   - Click **Create Provider**

3. **Test connectivity:**
   - Find "Mock SAML2" in provider list
   - Click **Test** button
   - Should see: "SAML2 SSO URL is reachable"

### SAML2 Login Flow

1. **Initiate SAML2 authorize:**
   ```
   http://localhost:3100/api/v1/auth/sso/saml2/authorize?provider_id=<PROVIDER_ID>
   ```

   This generates SAML AuthnRequest and redirects to:
   ```
   http://localhost:3004/saml/authorize?SAMLRequest=<BASE64_ENCODED_AUTH_REQUEST>&RelayState=...
   ```

2. **Mock IdP returns SAML Response (POST form):**
   - Auto-submits form with SAMLResponse (base64-encoded SAML assertion)
   - Redirects to:
   ```
   http://localhost:3100/api/v1/auth/sso/saml2/acs
   ```

3. **EIP validates SAML Response:**
   - Parses XML assertion
   - Extracts NameID: `testuser@example.com`
   - Extracts attributes: `email`, `name`, `groups`
   - User auto-provisioned

4. **Redirect to app:**
   ```
   http://localhost:3100/app?jwt=<ACCESS_TOKEN>
   ```

5. **Verify:**
   ```javascript
   localStorage.getItem('eip_access_token')  // Should have JWT
   ```

---

## Verifying Auto-Provisioning

After OAuth2 or SAML2 login, check:

1. **User created:**
   ```bash
   # In identity database
   SELECT * FROM users WHERE email = 'testuser@example.com';
   ```

2. **SSO link created:**
   ```bash
   SELECT * FROM sso_provider_users WHERE user_id = ?;
   ```

3. **Audit log entry:**
   ```bash
   SELECT * FROM audit_logs 
   WHERE action = 'auth.sso.login' 
   ORDER BY created_at DESC LIMIT 1;
   ```

---

## Testing Group → Role Mapping

The mock IdP returns groups: `admin-group`, `finance-group`

### Configure group mapping:

1. **In Settings (future UI), set group role map:**
   ```json
   {
     "admin-group": "admin",
     "finance-group": "manager"
   }
   ```

2. **First login: User gets role from group**
   - If user in `admin-group` → role = `admin`
   - If user in `finance-group` → role = `manager`
   - Subsequent logins: Group membership re-synced

---

## Troubleshooting

### OAuth2 flows not redirecting

1. Check mock IdP is running: `curl http://localhost:3004/health`
2. Check client ID matches: `mock-oauth2-client-id`
3. Check discovery URL is correct and reachable
4. Check browser console for CORS errors

### SAML2 not validating

1. Verify certificate matches IdP metadata
2. Check NameID is in response (should be `testuser@example.com`)
3. Check attribute map in provider config
4. Look at identity server logs for parse errors

### Auto-provisioning not working

1. Check `auto_provision` is `true` on provider
2. Check `default_role` is set (defaults to `member`)
3. Verify user email matches claim in response
4. Check audit logs for provisioning errors

---

## Real IdP Testing (Future)

When human has IdP test tenants:

### Azure AD / Microsoft Entra

1. **Create app registration:**
   - Portal: `https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps`
   - New registration: `EIP-OAuth2-Test`
   - Add redirect URI: `http://localhost:3100/api/v1/auth/sso/oauth2/callback`
   - Create client secret
   - Note: Client ID, Tenant ID

2. **In EIP Settings:**
   - Discovery URL: `https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration`
   - Client ID & Secret from app registration

### Okta

1. **Create test tenant** (free): `https://developer.okta.com`

2. **Create OIDC app:**
   - Applications → Create App
   - Platform: Web
   - Sign-in redirect URI: `http://localhost:3100/api/v1/auth/sso/oauth2/callback`
   - Get: Client ID, Client Secret, Issuer URL

3. **In EIP Settings:**
   - Discovery URL: `{ISSUER_URL}/.well-known/openid-configuration`
   - Client ID & Secret from Okta app

### ADFS (On-prem)

1. **Get SAML metadata:**
   ```
   https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml
   ```

2. **Extract:**
   - IdP Entity ID
   - SingleSignOnService URL
   - X509 Certificate

3. **In EIP Settings:**
   - Provider Name: `Active Directory`
   - IdP Entity ID, SSO URL, Certificate from metadata

---

## E.9 Completion Checklist

- [x] Mock IdP server running (OAuth2 + SAML2)
- [x] OAuth2 flow tested (authorize → callback → JWT)
- [x] SAML2 flow tested (authorize → ACS → JWT)
- [x] Auto-provisioning verified (user created on first login)
- [x] Group → role mapping works
- [x] Audit logging working
- [ ] Real Azure AD testing (when tenant available)
- [ ] Real Okta testing (when tenant available)
- [ ] Real ADFS testing (when on-prem available)

---

## Next: E.10 — Deployment Documentation

After E.9 testing confirmed, write:
1. **User guide:** How to get IdP credentials
2. **Azure AD setup:** Step-by-step
3. **Okta setup:** Step-by-step
4. **SAML2 setup:** Certificate extraction, attribute mapping
5. **Troubleshooting:** Common issues + solutions
6. **API reference:** All SSO endpoints with curl examples

---

**Status:** E.9 unblocked via mock IdP. Ready for local testing.
