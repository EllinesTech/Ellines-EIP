# OAuth2 & SAML2 SSO — Enterprise Deployment Guide

**Status:** E.10 — Deployment Runbook  
**Date:** August 1, 2026  
**Scope:** Step-by-step setup for real production IdPs (Azure AD, Okta, ADFS)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Azure AD / Microsoft Entra Setup](#azure-ad-setup)
3. [Okta Setup](#okta-setup)
4. [ADFS On-Premise Setup](#adfs-setup)
5. [Google OAuth2 Setup](#google-oauth2-setup)
6. [EIP Configuration](#eip-configuration)
7. [Testing & Validation](#testing-validation)
8. [Troubleshooting](#troubleshooting)
9. [Security Checklist](#security-checklist)

---

## Quick Start

### What You Need

- **EIP production URL** (e.g., `https://eip.ellines.co.ke`)
- **IdP credentials** (admin access to Azure AD, Okta, ADFS, etc.)
- **EIP Owner account** (to configure SSO)

### Flow Overview

```
User clicks "Sign in with [IdP]"
         ↓
    EIP redirects to IdP
         ↓
    IdP login/MFA (user authenticates)
         ↓
    IdP redirects back to EIP with authorization
         ↓
    EIP creates/updates user
         ↓
    User logged into EIP dashboard
```

---

## Azure AD Setup

### A1. Create App Registration

**Portal:** https://portal.azure.com

1. Navigate to **Azure Active Directory** → **App Registrations**
2. Click **+ New Registration**
3. Fill in:
   - **Name:** `Ellines EIP` (or your org name)
   - **Supported account types:** `Accounts in this organizational directory only` (single tenant)
   - **Redirect URI:** 
     - **Platform:** Web
     - **URI:** `https://eip.ellines.co.ke/api/v1/auth/sso/oauth2/callback`
4. Click **Register**

### A2. Collect Credentials

In the app overview page, note:

```
Application (client) ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Directory (tenant) ID:   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### A3. Create Client Secret

1. Go to **Certificates & Secrets**
2. Click **+ New client secret**
3. Set expiration: `24 months` (or your preference)
4. Click **Add**
5. **Copy the secret value immediately** (you won't see it again)

```
Client Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxx_xxxxxxx
```

### A4. Configure API Permissions

1. Go to **API Permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Click **Delegated permissions**
5. Search for and select:
   - `User.Read` (read user profile)
   - `openid` (OpenID Connect)
   - `profile` (read user profile)
   - `email` (read email)
6. Click **Add permissions**
7. Click **Grant admin consent for [Tenant]** (blue button at top)

### A5. Get OpenID Configuration

The OpenID Discovery URL for Azure AD is:

```
https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
```

Replace `{TENANT_ID}` with your Directory (tenant) ID from step A2.

**Example:**
```
https://login.microsoftonline.com/12345678-1234-1234-1234-123456789012/v2.0/.well-known/openid-configuration
```

### A6. Optional: Enable Groups Claim

To include user group memberships in the token:

1. Go to **Token configuration**
2. Click **+ Add groups claim**
3. Select:
   - **Which groups associated with the user should be returned in the claim?** → `Groups assigned to the application`
   - **ID** (checkbox)
   - **Access** (checkbox)
4. Click **Add**

**Note:** Groups are returned as object IDs (GUIDs), not group names. You'll need to map GUIDs → EIP roles in the next section.

### A7. EIP Configuration

In EIP Settings → SSO:

```
Provider Type:    OAuth2 / OIDC
Provider Name:    Azure AD
Client ID:        [from A2]
Client Secret:    [from A3]
Discovery URL:    https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration

Auto-provision:   Yes (auto-create users on first login)
Default Role:     member
```

**Optional: Group-to-Role Mapping**

If you enabled groups (A6), map Azure AD group GUIDs to EIP roles:

```json
{
  "00000000-0000-0000-0000-000000000001": "admin",
  "00000000-0000-0000-0000-000000000002": "manager",
  "00000000-0000-0000-0000-000000000003": "member"
}
```

To find group GUIDs:

```powershell
# In Azure AD PowerShell:
Get-AzureADGroup -Filter "DisplayName eq 'Finance Managers'"
# Look for ObjectId: 00000000-0000-0000-0000-000000000002
```

---

## Okta Setup

### O1. Create OIDC App

**Portal:** https://developer.okta.com (or your org's Okta admin portal)

1. Navigate to **Applications** → **Applications**
2. Click **Create App Integration**
3. Select:
   - **Sign in method:** `OIDC - OpenID Connect`
   - **Application type:** `Web`
4. Click **Next**
5. Fill in:
   - **App integration name:** `Ellines EIP`
   - **Grant type:** ✓ `Authorization Code` ✓ `Refresh Token`
   - **Sign-in redirect URIs:**
     ```
     https://eip.ellines.co.ke/api/v1/auth/sso/oauth2/callback
     ```
   - **Sign-out redirect URIs:**
     ```
     https://eip.ellines.co.ke/api/v1/auth/logout
     ```
   - **Controlled access:** `Public` (unless restricted)
6. Click **Save**

### O2. Collect Credentials

In the app details page, note:

```
Client ID:     xxxxxxxxxxxxxxxxxxxxxxxx
Client Secret: yyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

In the **General** tab, find:

```
Okta domain: dev-12345678.okta.com
```

### O3. EIP Configuration

In EIP Settings → SSO:

```
Provider Type:    OAuth2 / OIDC
Provider Name:    Okta
Client ID:        [from O2]
Client Secret:    [from O2]
Discovery URL:    https://dev-12345678.okta.com/.well-known/openid-configuration

Auto-provision:   Yes
Default Role:     member
```

### O4. Optional: Map Okta Groups

To include Okta groups in the token:

1. In the Okta app, go to **Okta API Scopes**
2. Click **Grant** on these scopes:
   - `groups`
   - `profile`
   - `email`
   - `openid`
3. In **Users** tab, ensure users are assigned to the app
4. Create a **Group** in Okta (Users → Groups) and assign users

In the app's **General** tab under **Okta API Scopes**, enable group claims.

**Group Mapping in EIP:**

```json
{
  "Admins": "admin",
  "Finance": "manager",
  "Everyone": "member"
}
```

---

## ADFS Setup

### AF1. Export Federation Metadata

**Windows Server with ADFS installed:**

1. Open **ADFS Management** console
2. Navigate to **Service** → **Endpoints**
3. Note the **Metadata URL** (usually):
   ```
   https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml
   ```
4. Fetch the metadata file:
   ```powershell
   $metadataUrl = "https://adfs.yourcompany.com/FederationMetadata/2007-06/FederationMetadata.xml"
   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
   $metadata = Invoke-WebRequest -Uri $metadataUrl
   $metadata.Content | Out-File -FilePath "C:\adfs_metadata.xml"
   ```

### AF2. Extract ADFS Information

From the XML metadata file, extract:

```xml
<!-- Entity ID -->
<EntityDescriptor entityID="http://adfs.yourcompany.com/adfs/services/trust">

<!-- Single Sign-On Service URL -->
<SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://adfs.yourcompany.com/adfs/ls/"/>

<!-- X509 Certificate -->
<X509Certificate>
  MIIDXxCC...
  ...
  ...XyZaB...
</X509Certificate>
```

**Note:** The certificate is base64-encoded. Copy the entire content **without** the XML tags.

### AF3. Create Relying Party Trust in ADFS

**On the ADFS server:**

1. Open **ADFS Management**
2. Right-click **Relying Party Trusts** → **Add Relying Party Trust**
3. Select **Enter data about the relying party manually**
4. Fill in:
   - **Display name:** `Ellines EIP`
   - **Endpoints:**
     - **SAML 2.0/WS-Federation Consumer Service URL (Assertion Consumer Service):**
       ```
       https://eip.ellines.co.ke/api/v1/auth/sso/saml2/acs
       ```
5. Create a **Claim Rule** to send attributes:
   - In **Claim Rules** tab, click **Add Rule**
   - **Claim rule template:** `Send LDAP Attributes as Claims`
   - **Attribute store:** `Active Directory`
   - Map:
     - `E-Mail-Addresses` → `Email`
     - `Display-Name` → `Name`
     - `tokengroups` → `Group`
   - Click **Finish**
6. Click **OK** (saves the trust)

### AF4. EIP Configuration

In EIP Settings → SSO → **Add SAML2 Provider**:

```
Provider Type:    SAML2
Provider Name:    Active Directory (ADFS)

IdP Entity ID:    http://adfs.yourcompany.com/adfs/services/trust
IdP SSO URL:      https://adfs.yourcompany.com/adfs/ls/
IdP Certificate:  [paste entire X509Certificate from AF2]

Attribute Map:
{
  "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  "groups": "http://schemas.xmlsoap.org/claims/Group"
}

Auto-provision:   Yes
Default Role:     member
```

### AF5. Optional: Group-to-Role Mapping

```json
{
  "CN=Administrators,CN=Builtin,DC=yourcompany,DC=com": "admin",
  "CN=Finance,OU=Groups,DC=yourcompany,DC=com": "manager",
  "CN=Employees,OU=Groups,DC=yourcompany,DC=com": "member"
}
```

---

## Google OAuth2 Setup

### G1. Create Project in Google Cloud Console

**Portal:** https://console.cloud.google.com

1. Create a **new project** (or use existing)
2. Navigate to **APIs & Services** → **Credentials**
3. Click **+ Create Credentials** → **OAuth client ID**
4. Select **Web application**
5. Fill in:
   - **Name:** `Ellines EIP`
   - **Authorized JavaScript origins:**
     ```
     https://eip.ellines.co.ke
     ```
   - **Authorized redirect URIs:**
     ```
     https://eip.ellines.co.ke/api/v1/auth/sso/oauth2/callback
     ```
6. Click **Create**

### G2. Collect Credentials

Note:

```
Client ID:     xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
Client Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### G3. Get Discovery URL

Google's OpenID Discovery URL:

```
https://accounts.google.com/.well-known/openid-configuration
```

### G4. EIP Configuration

In EIP Settings → SSO:

```
Provider Type:    OAuth2 / OIDC
Provider Name:    Google
Client ID:        [from G2]
Client Secret:    [from G2]
Discovery URL:    https://accounts.google.com/.well-known/openid-configuration

Auto-provision:   Yes
Default Role:     member
```

---

## EIP Configuration

### Step 1: Navigate to SSO Settings

1. Log in as **Organization Owner**
2. Go to **Settings** (bottom of side nav)
3. Click **Ellinea AI** or scroll to **Enterprise SSO**
4. Click **Add SSO Provider** (or **Configure SSO**)

### Step 2: Choose Provider Type

Select:
- **OAuth2 / OIDC** (Google, Azure AD, Okta, custom)
- **SAML2** (ADFS, Okta, Azure AD with SAML)

### Step 3: Fill in Credentials

Copy the credentials from your IdP setup (Azure, Okta, ADFS, etc.) and paste into EIP.

### Step 4: Test Connectivity

Click **Test** button. You should see:

```
✓ OAuth2 provider discovery successful
```

Or:

```
✓ SAML2 SSO URL is reachable
```

If you see an error, check:
- Client ID/Secret are correct (no extra spaces)
- URLs are exactly as IdP provides
- Network firewall allows outbound HTTPS

### Step 5: Enable Auto-Provisioning (Optional)

Toggle **Auto-provision users** to automatically create new user accounts on first login.

- **Default Role:** `member` (or your preference)
- **Group Mapping:** Leave empty for now (or add after first test)

### Step 6: Save Provider

Click **Create Provider** (or **Save**).

### Step 7: Test Login

1. **Logout** of EIP
2. Go to **Login** page
3. You should see a button: **"Sign in with [Provider Name]"**
4. Click it
5. Log in with your IdP credentials
6. You should be redirected to EIP dashboard

---

## Testing & Validation

### T1. Verify User Auto-Provisioning

After first SSO login:

1. Check **Settings** → **Members**
2. You should see the user who just logged in
3. Verify their email matches the IdP email

### T2. Verify Group Mapping

If you configured group mapping:

1. Log in with a user in a mapped group
2. Check **Settings** → **Members**
3. Verify the user's role matches the mapped role

### T3. Test MFA (If Configured in IdP)

If your IdP has MFA enabled:

1. Log out of EIP
2. Click SSO provider button
3. You should see MFA challenge
4. Complete MFA and verify you log in

### T4: Check Audit Trail

SSO logins are logged in **Settings** → **Audit Log**:

```
Action: auth.sso.login
Details: 
{
  "provider": "Azure AD",
  "email": "user@company.com",
  "ip_address": "192.168.1.1",
  "created_at": "2026-08-01T10:23:45Z"
}
```

### T5: Test Logout

1. Click user avatar (top right)
2. Click **Logout**
3. You should be logged out of both EIP and IdP (if SAML SLO is configured)

---

## Troubleshooting

### Error: "OAuth2 provider discovery failed"

**Cause:** Discovery URL is unreachable or incorrect.

**Fix:**
1. Double-check the discovery URL (copy from IdP, no typos)
2. Test in browser: `https://.../.well-known/openid-configuration`
3. If it's a corporate network, check proxy / firewall rules

### Error: "Invalid client ID or secret"

**Cause:** Client credentials are wrong.

**Fix:**
1. Re-copy from IdP console (avoid spaces)
2. If using an old secret, create a new one in IdP
3. Test with `curl`:
   ```bash
   curl -X POST https://login.microsoftonline.com/.../token \
     -d client_id=YOUR_CLIENT_ID \
     -d client_secret=YOUR_SECRET \
     -d grant_type=client_credentials
   ```

### Error: "Redirect URI mismatch"

**Cause:** Callback URL doesn't match IdP config.

**Fix:**
1. In IdP, verify redirect URI matches exactly:
   ```
   https://eip.ellines.co.ke/api/v1/auth/sso/oauth2/callback
   ```
2. No trailing slashes, exact protocol (https), exact domain
3. If EIP runs on a different domain, update IdP config

### Error: "User not found and auto-provisioning disabled"

**Cause:** User trying to log in is not in EIP database, and auto-provisioning is off.

**Fix:**
- Either enable **Auto-provision** in EIP settings
- Or manually create the user in **Settings** → **Members** first

### Error: "SAML2 signature validation failed"

**Cause:** Certificate doesn't match IdP certificate, or IdP not signing assertions.

**Fix:**
1. Fetch fresh certificate from IdP metadata
2. Verify certificate is pasted without `-----BEGIN CERTIFICATE-----` tags
3. In ADFS, verify the **Token Signing** certificate is being used
4. Check ADFS Relying Party Trust settings

### SAML Login Loops (Infinite Redirect)

**Cause:** SAML assertion parsing error or state validation failure.

**Fix:**
1. Check EIP server logs for SAML parsing errors
2. Verify NameID is being extracted correctly
3. Try with a different user from IdP
4. Disable and re-enable SAML provider in EIP

### Users Not Getting Correct Role

**Cause:** Group mapping not configured or groups not in token.

**Fix:**
1. Verify group claims are enabled in IdP
2. Check the actual group names/IDs returned by IdP
3. In EIP, use the exact group names/GUIDs in the mapping
4. Re-test after updating group mapping

### "No users can sign in anymore"

**Cause:** SSO provider set to `enforced: true`, but it's not working.

**Fix:**
1. As platform admin, go to **Platform** settings
2. Temporarily disable the provider
3. Log in with email/password
4. Go to **Settings** → **SSO** and fix the provider
5. Re-enable if needed

---

## Security Checklist

- [ ] **Use HTTPS only** (never HTTP for callbacks)
- [ ] **Validate all redirects** (state parameter, nonce)
- [ ] **Validate IdP signature** (SAML or OIDC)
- [ ] **Encrypt client secrets** (not in code, use env vars)
- [ ] **Audit SSO logins** (check audit log for suspicious patterns)
- [ ] **Expire tokens** (JWT lifetime = max 1 hour)
- [ ] **Rotate secrets regularly** (yearly or on compromise)
- [ ] **Test with MFA** (if available in IdP)
- [ ] **Test Single Logout** (SAML SLO, OIDC RP-Initiated Logout)
- [ ] **Monitor failed logins** (lock after N failures)

---

## Support & Next Steps

### If You Get Stuck

1. **Check the Testing Guide:** [27_OAuth2_SAML_Testing_Guide.md](./27_OAuth2_SAML_Testing_Guide.md)
2. **Check API docs:** [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md)
3. **Review code:** `services/identity/src/sso/`
4. **Check EIP logs:** `Settings` → `Audit Log` (filter by `auth.sso.*`)

### What's Next

After SSO is deployed:

1. **Optional:** Enable SSO enforcement (force all users to use IdP)
2. **Recommended:** Set up Single Logout (SAML SLO)
3. **Future:** Custom SAML attribute mapping UI (coming in v1.2)
4. **Future:** SSO for multiple organizations (coming in v1.2)

---

**Status:** E.10 Complete — Ready for Enterprise Deployment  
**Testing:** Ready for real IdP testing (E.9 blocked on external IdPs)  
**Version:** Ellines EIP v1.0 + Track E SSO Feature  

