# OAuth2 & SAML2 SSO Deployment Guide

**Status:** E.10 — Production deployment for enterprise SSO  
**Date:** August 1, 2026  
**Audience:** IT Admins, Org Owners  

---

## Overview

This guide covers deploying OAuth2/OIDC and SAML2 single sign-on to production. After setup, users authenticate via their organization's identity provider (Azure AD, Okta, ADFS, etc.) instead of email/password.

**Benefits:**
- ✅ Users don't manage passwords in EIP
- ✅ IT manages identity centrally
- ✅ Auto-provisioning on first login
- ✅ Group membership → EIP role mapping
- ✅ Audit all logins

---

## Architecture

```
┌─────────────────┐
│   EIP Portal    │
│  (eip.co.ke)    │
└────────┬────────┘
         │
    [Login Page]
         │
    [SSO Provider]
    (OAuth2/SAML2)
         │
    ┌────▼────┐
    │   IdP   │
    │ (Azure  │
    │  AD /   │
    │  Okta)  │
    └────┬────┘
         │
   [User authenticates]
   [Credentials stay on IdP]
         │
    ┌────▼────────────┐
    │ Redirect back   │
    │ with token/code │
    └────┬────────────┘
         │
    [JWT issued]
    [User logged in]
```

**Key:** User credentials **never** touch EIP. Identity stays on IdP.

---

## Part 1: Azure AD / Microsoft Entra

### Prerequisites

- Azure subscription (free tier OK for testing)
- Access to Azure Portal: `https://portal.azure.com`
- EIP instance running (e.g., `https://eip.yourcompany.com`)

### Step 1: Create App Registration

1. **Go to Azure Portal:**
   ```
   https://portal.azure.com → Azure Active Directory → App registrations
   ```

2. **Click "New registration":**
   - Name: `Ellines EIP`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: 
     ```
     Web: https://eip.yourcompany.com/api/v1/auth/sso/oauth2/callback
     ```

3. **Copy credentials:**
   - **Tenant ID** (from Overview)
   - **Client ID** (from Overview)
   - **Client Secret** (Certificates & secrets → New client secret → copy `Value`)

### Step 2: Configure API Permissions

1. **In app registration → API permissions:**
   - Click "Add a permission"
   - Microsoft Graph → Delegated permissions
   - Search: `openid`, `profile`, `email`
   - Select all three → Add permissions

2. **Grant admin consent:**
   - Click "Grant admin consent for [Org]"

### Step 3: Configure EIP Provider

1. **In EIP Settings** (`/app/settings/sso`):
   - Click **Add SSO Provider** → **OAuth2 / OIDC**
   - Fill in:
     ```
     Provider Name: Azure AD
     Client ID: <paste from Azure>
     Client Secret: <paste from Azure>
     Discovery URL: 
       https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
     ```
   - Replace `{TENANT_ID}` with your Tenant ID from Step 1
   - Click **Create Provider**

2. **Test connectivity:**
   - Click **Test** button
   - Should see: "OAuth2 provider discovery successful"

### Step 4: Test Login

1. **Navigate to login page:**
   ```
   https://eip.yourcompany.com/login?org=your-org-slug
   ```

2. **Click "Enterprise SSO" tab → "Sign in with Azure AD"**

3. **You're redirected to Azure login**

4. **After authentication:**
   - Redirected back to EIP
   - User account auto-created
   - Email, name auto-populated
   - Logged into `/app`

### Step 5: (Optional) Map Azure AD Groups to EIP Roles

1. **Add group claim to token:**
   - App registration → Token configuration
   - Click "Add groups claim"
   - Select: "Security groups", "Group ID"
   - Click "Add"

2. **In EIP Settings → Provider:**
   - Edit Azure AD provider
   - Set group role map:
     ```json
     {
       "Finance-Team": "manager",
       "Executive-Group": "executive",
       "IT-Admin": "admin"
     }
     ```
   - Save

3. **On next login:**
   - User's Azure AD groups extracted
   - EIP role mapped from group membership
   - E.g., if user in "Finance-Team" → role = "manager"

---

## Part 2: Okta

### Prerequisites

- Okta account (free developer sandbox: https://developer.okta.com)
- Access to Okta Admin Console
- EIP instance URL

### Step 1: Create OIDC Application

1. **Go to Okta Admin Console:**
   ```
   https://<your-okta-domain>.okta.com/admin/apps/browse
   ```

2. **Create App Integration:**
   - Click "Create App Integration"
   - Platform: **Web**
   - Sign-in method: **OIDC**
   - Application type: **Regular Web Application**
   - Click **Next**

3. **Configure app:**
   - App name: `Ellines EIP`
   - Sign-in redirect URIs:
     ```
     https://eip.yourcompany.com/api/v1/auth/sso/oauth2/callback
     ```
   - Sign-out redirect URIs: (optional)
     ```
     https://eip.yourcompany.com/login
     ```
   - Click **Save**

4. **Copy credentials:**
   - **Client ID** (from General tab)
   - **Client Secret** (from General tab → Client Credentials)
   - **Okta domain** (from bottom-left, e.g., `dev-12345.okta.com`)

### Step 2: Enable Group Claims (Optional)

1. **In Okta Admin → API → Authorization Servers:**
   - Click **default**
   - Claims tab → **Add Claim**
   - Name: `groups`
   - Include in token types: `ID Token`
   - Value type: **Groups**
   - Filter: (leave blank for all groups)
   - Click **Create**

### Step 3: Configure EIP Provider

1. **In EIP Settings** (`/app/settings/sso`):
   - Click **Add SSO Provider** → **OAuth2 / OIDC**
   - Fill in:
     ```
     Provider Name: Okta
     Client ID: <paste from Okta>
     Client Secret: <paste from Okta>
     Discovery URL:
       https://<your-okta-domain>/oauth2/v1/metadata/.well-known/openid-configuration
     ```
   - Replace `<your-okta-domain>` with your domain (e.g., `dev-12345.okta.com`)
   - Click **Create Provider**

2. **Test connectivity:**
   - Click **Test** button
   - Should see: "OAuth2 provider discovery successful"

### Step 4: Test Login

1. **Navigate to login page:**
   ```
   https://eip.yourcompany.com/login?org=your-org-slug
   ```

2. **Click "Enterprise SSO" tab → "Sign in with Okta"**

3. **You're redirected to Okta login**

4. **After authentication:**
   - Redirected back to EIP
   - User auto-created
   - Okta groups mapped to EIP roles (if configured)

### Step 5: (Optional) Map Okta Groups to EIP Roles

1. **In EIP Settings → Edit Okta provider:**
   - Set group role map:
     ```json
     {
       "Finance": "manager",
       "Executives": "executive",
       "IT": "admin"
     }
     ```

2. **Assign users to Okta groups:**
   - Okta Admin → Directory → Groups
   - Create/manage groups
   - Add users to groups

3. **On next login:**
   - User's Okta groups extracted
   - EIP role mapped from group

---

## Part 3: SAML2 (Active Directory / Azure AD SAML)

### Prerequisites

- Active Directory with ADFS or Azure AD SAML configured
- Access to SAML IdP metadata
- SAML certificate (public key)

### Step 1: Get SAML Metadata

**From Azure AD (SAML):**
1. Azure Portal → Enterprise applications → New application
2. Create your own application
3. Single sign-on → SAML
4. Download Federation Metadata XML

**From Okta SAML:**
1. Okta Admin → Applications
2. Create App → SAML 2.0
3. Configure Okta SAML provider
4. Download Metadata (Settings tab)

**From ADFS:**
```
https://your-adfs-server/FederationMetadata/2007-06/FederationMetadata.xml
```

### Step 2: Extract SAML Credentials

From the XML metadata, find:

```xml
<EntityDescriptor entityID="...">
  <IDPSSODescriptor ...>
    <SingleSignOnService Binding="..." Location="https://..."/>
    <KeyDescriptor use="signing">
      <KeyInfo>
        <X509Data>
          <X509Certificate>
            -----BEGIN CERTIFICATE-----
            BASE64_ENCODED_CERT_HERE
            -----END CERTIFICATE-----
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>
```

**Extract:**
- **IdP Entity ID:** `EntityDescriptor/@entityID`
- **IdP SSO URL:** `SingleSignOnService/@Location`
- **X509 Certificate:** The base64 string between BEGIN/END markers

### Step 3: Configure EIP Provider

1. **In EIP Settings** (`/app/settings/sso`):
   - Click **Add SSO Provider** → **SAML2**
   - Fill in:
     ```
     Provider Name: Active Directory
     IdP Entity ID: (from metadata)
     IdP SSO URL: (from metadata)
     IdP Certificate: (the base64 string, without BEGIN/END lines)
     ```
   - Click **Create Provider**

2. **Test connectivity:**
   - Click **Test** button
   - Should see: "SAML2 SSO URL is reachable"

### Step 4: Configure IdP (Return URL)

Tell your IdP where to send SAML responses:

**In Azure AD SAML settings:**
- Reply URL (Assertion Consumer Service URL):
  ```
  https://eip.yourcompany.com/api/v1/auth/sso/saml2/acs
  ```

**In Okta SAML settings:**
- Single sign-on URL:
  ```
  https://eip.yourcompany.com/api/v1/auth/sso/saml2/acs
  ```
- Audience URI:
  ```
  https://eip.yourcompany.com/saml
  ```

**In ADFS:**
- Add relying party trust pointing to EIP ACS URL

### Step 5: Map SAML Attributes to EIP Fields

In SAML responses, IdP sends attributes like:

```xml
<saml:Attribute Name="email">
  <saml:AttributeValue>user@company.com</saml:AttributeValue>
</saml:Attribute>
<saml:Attribute Name="name">
  <saml:AttributeValue>John Doe</saml:AttributeValue>
</saml:Attribute>
<saml:Attribute Name="groups">
  <saml:AttributeValue>Finance-Team</saml:AttributeValue>
  <saml:AttributeValue>IT-Admin</saml:AttributeValue>
</saml:Attribute>
```

**In EIP Settings → Edit SAML2 provider:**
- Set attribute map:
  ```json
  {
    "email": "urn:oid:0.9.2342.19200300.100.1.3",
    "name": "urn:oid:2.5.4.3",
    "groups": "http://schemas.xmlsoap.org/claims/Group"
  }
  ```

*Exact attribute names depend on your IdP. Check IdP metadata for exact URIs.*

### Step 6: Test SAML Login

1. **Navigate to login page:**
   ```
   https://eip.yourcompany.com/login?org=your-org-slug
   ```

2. **Click "Enterprise SSO" tab → "Sign in with [Your IdP]"**

3. **You're redirected to IdP SAML login**

4. **After authentication:**
   - IdP POSTs SAML Response to EIP ACS
   - User auto-created
   - Groups mapped to roles

---

## Troubleshooting

### OAuth2 Issues

**Problem:** "Invalid discovery URL"
- **Solution:** Check OIDC discovery endpoint exists:
  ```bash
  curl https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
  ```

**Problem:** "Invalid client ID / secret"
- **Solution:** Verify credentials match exactly (no extra spaces)
- **Solution:** Check secret hasn't expired (Azure/Okta rotate secrets)

**Problem:** "User not provisioned"
- **Solution:** Check `auto_provision` is enabled in provider settings
- **Solution:** Check email claim present in ID token
- **Solution:** Verify email format (must be valid email)

### SAML2 Issues

**Problem:** "SAML Response signature invalid"
- **Solution:** Check X509 certificate matches IdP metadata
- **Solution:** Ensure certificate is current (not expired)
- **Solution:** Verify certificate has signing use: `<KeyDescriptor use="signing">`

**Problem:** "NameID not found"
- **Solution:** Check SAML Response includes `<saml:NameID>` element
- **Solution:** Verify NameID format configured correctly in IdP

**Problem:** "Attributes not mapped"
- **Solution:** Check attribute names match exactly (including URIs)
- **Solution:** View SAML Response in browser dev tools to see actual attribute names
- **Solution:** Verify IdP sends requested attributes

### Auto-Provisioning Issues

**Problem:** "User not created on login"
- **Solution:** Check `auto_provision` enabled
- **Solution:** Check email claim present and valid
- **Solution:** Verify org has available seats (if limited)
- **Solution:** Check database for `sso_provider_users` link

**Problem:** "User created but role not mapped"
- **Solution:** Check group/role map configured correctly
- **Solution:** Verify user has group membership on IdP
- **Solution:** Check group names match exactly

---

## Security Best Practices

### Secrets Management

✅ **DO:**
- Store client secrets in environment variables (not code)
- Use AWS Secrets Manager / Azure Key Vault for production
- Rotate secrets every 90 days
- Use strong, random client secrets (32+ chars)

❌ **DON'T:**
- Hardcode secrets in config files
- Commit secrets to Git
- Reuse secrets across environments
- Share credentials in Slack/email

### Certificates

✅ **DO:**
- Store IdP certificates in secure vault
- Verify certificate fingerprint before configuring
- Set reminders for certificate expiration (before 30 days)
- Monitor for certificate updates from IdP

❌ **DON'T:**
- Use self-signed certificates in production
- Ignore certificate expiration warnings
- Use weak key sizes (< 2048-bit RSA)

### Access Control

✅ **DO:**
- Limit SSO provider management to Owner/Admin
- Require MFA on admin accounts
- Enable audit logging on all SSO logins
- Review audit logs regularly

❌ **DON'T:**
- Allow regular users to configure SSO
- Disable MFA on privileged accounts
- Ignore suspicious login patterns

---

## Enforcement & Conditional Access

### Enforce SSO (Disable Email/Password)

If you want **only** SSO authentication (no email/password):

1. **In EIP Settings → Edit SSO Provider:**
   - Toggle **Enforce SSO**
   - Users can't login via email/password
   - Only SSO available

2. **Backup access:**
   - Keep one backup user with email/password for recovery
   - Store credentials securely (password manager)

### Conditional Access (Future)

Future versions may support:
- Require MFA for specific groups
- Block login from untrusted networks
- Risk-based re-authentication
- Device compliance checks

---

## Monitoring & Audits

### View SSO Logins

1. **Audit Center:** `/app/audit`
   - Filter by action: `auth.sso.login`
   - See user, timestamp, IdP, IP address

2. **Linked Users:**
   - Settings → SSO Providers → Click provider → Linked Users
   - See all users linked to each IdP

### Export Audit Logs

```bash
# (Feature coming in v1.1.1)
GET /api/v1/orgs/me/audit-logs?action=auth.sso.login&format=csv
```

---

## Disaster Recovery

### If SSO Provider Goes Down

1. **Users can't login via SSO**
2. **Fallback:** Owner/Admin can login via email/password (if not enforced)
3. **Recovery:** Fix provider connectivity, users retry
4. **Backup:** Keep email/password authentication enabled

### If SAML Certificate Expires

1. **Check certificate expiration date before it expires**
2. **Contact IdP for new certificate**
3. **Update EIP Settings with new certificate**
4. **Users won't notice (transparent update)**

### If Client Secret Compromised

1. **Rotate secret immediately** (generate new on IdP)
2. **Update EIP Settings with new secret**
3. **Revoke old secret on IdP**
4. **Review audit logs for unauthorized access**

---

## Testing Checklist

- [ ] OAuth2 provider created in Settings
- [ ] OIDC discovery endpoint reachable
- [ ] Connectivity test passes
- [ ] First user login works (auto-provisioned)
- [ ] Email & name correct on user account
- [ ] Group mapping works (if configured)
- [ ] Role assigned correctly (from group)
- [ ] Audit log shows SSO login
- [ ] Second user login works
- [ ] Test user logout → login
- [ ] Test invalid credentials rejected
- [ ] Test multiple users from different groups
- [ ] Test role escalation via group (if configured)

---

## Deployment Checklist

**Before Going Live:**

- [ ] Provider configured in production EIP instance
- [ ] Test with real user (not admin)
- [ ] Confirm auto-provisioning works
- [ ] Verify group mappings correct
- [ ] Train IT team on SSO setup
- [ ] Communicate to users about new login method
- [ ] Prepare fallback (email/password still available)
- [ ] Monitor first week for issues

**After Going Live:**

- [ ] Monitor audit logs daily
- [ ] Watch for failed login attempts
- [ ] Check certificate expiration dates quarterly
- [ ] Rotate client secrets annually
- [ ] Review and update group mappings (user onboarding)

---

## Support Resources

- **Azure AD OIDC:** https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols
- **Okta OIDC:** https://developer.okta.com/docs/guides/implement-oauth/
- **SAML2 Spec:** https://en.wikipedia.org/wiki/SAML_2.0
- **ADFS:** https://learn.microsoft.com/en-us/windows-server/identity/ad-fs/operations/

---

**E.10 Complete.** Track E ready for production deployment.
