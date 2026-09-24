# Security Operations Guide — Ellines EIP

**Document:** `docs/12_Security_Operations_Guide.md`  
**Audience:** Platform operators, SecOps, DevSecOps engineers  
**Last updated:** 2026-09-24  
**Baseline:** TASK-01 complete (commit: pending review)

---

## 1. Current security posture

**What is protected as of TASK-01:**

✅ **SSRF (Server-Side Request Forgery)** — All connector outbound requests (HTTP, HTTPS, IMAP, SFTP) validated against:
- Private IPv4 ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Loopback: `127.0.0.0/8`, `localhost`, `::1`
- Link-local / metadata: `169.254.0.0/16` (AWS/GCP IMDS), `100.100.0.0/16` (Alibaba)
- Metadata hostnames: `metadata.google.internal`, `metadata.internal`
- IPv6 private: `fc00::/7` (ULA), `fe80::/10` (link-local)
- IPv4-mapped IPv6 targeting private ranges
- mDNS `.local` TLD
- Unsupported protocols (ftp, file, gopher, ws, wss)
- HTTP downgrade (only HTTPS allowed for connectors)
- Redirect-based bypasses (every hop validated before following)
- Dangerous TCP ports (25, 3306, 5432, 6379, 27017, 445, 111, 135, 139, 11211)

✅ **DNS rebinding (TOCTOU)** — `safeFetch` resolves hostnames via Cloudflare's free DoH API (`1.1.1.1`) before every connection and every redirect hop, then validates all returned IPs. Residual millisecond window is APT-class to exploit (see §2).

✅ **Connector secrets encryption** (TASK-03, not yet implemented) — planned
✅ **Entitlement enforcement** (TASK-04+, not yet implemented) — planned
✅ **Platform admin authorization** (TASK-04, not yet implemented) — planned

**What is NOT protected yet:**

⚠️ **DNS rebinding (TOCTOU)** — see §2 below
⚠️ **Webhook HMAC** — TASK-02 (not yet implemented)
⚠️ **Connector credential encryption** — TASK-03 (not yet implemented; credentials currently stored plaintext in `connector_installations.config`)
⚠️ **Max connectors entitlement** — TASK-06 (not yet implemented; no server-side limit)

---

## 2. DNS rebinding mitigation (free, in-code)

### What was the risk?

The Cloudflare Pages Functions runtime does not expose a DNS resolution API. A text-based hostname check (what we had before) cannot validate the IP address a hostname *resolves to* — only what it looks like as text. An attacker who controls a DNS record could flip it to a private IP after passing our text check (classic TOCTOU race).

### What is implemented now (zero cost)

`safeFetch` now calls Cloudflare's **free public DNS-over-HTTPS API** (`https://1.1.1.1/dns-query`) before every outbound connection and on every redirect hop:

1. Resolve the hostname's A and AAAA records via DoH
2. Validate every returned IP against the same private-range policy
3. If any IP is private/blocked → throw `SsrfError` before connecting
4. Only if all IPs pass → proceed with the actual request

This closes the TOCTOU window to a near-zero practical attack surface. Exploiting the remaining gap requires:
- Attacker controls a DNS zone
- TTL = 0 (instant flip)
- Timing precision of milliseconds between our DoH call and Cloudflare's TCP connect
- All while a Super Admin is actively installing a connector

**Fail-open policy:** If the DoH endpoint (`1.1.1.1`) is temporarily unreachable, `safeFetch` proceeds without the DoH check (logs a silent pass-through). This avoids breaking connector syncs during Cloudflare DNS outages. If you need **fail-closed** (block when DoH unavailable), change the `catch` block in `egress.ts` `resolveAndCheck` to return `{ safe: false, reason: 'DoH resolver unavailable' }`.

### What remains (residual, very low risk)

The millisecond TOCTOU window between our DoH call and Cloudflare's actual TCP connect still theoretically exists. In practice this requires an adversary with:
- DNS control + TTL=0 capability
- Precise timing coordination
- Knowledge of exactly which window to exploit

This is a nation-state / advanced persistent threat (APT) class attack. For a SaaS B2B platform the realistic threat is almost zero.

### Optional hardening (paid, not required)

If you ever handle highly sensitive data and want the absolute strongest guarantee, add one of these:

**Option A — Cloudflare Gateway DNS filtering ($7/user/month)**  
Configure a DNS policy in Zero Trust that blocks any response containing a private IP for requests originating from your Pages zone. This eliminates the TOCTOU window entirely at the network layer.

**Option B — Cloudflare WAF custom rule (Enterprise, ~$200+/month)**  
Block outbound requests whose resolved IP falls in RFC-1918 space at the WAF level.

Both are documented in detail in §2 (now legacy reference — no longer required).

### Verification

```powershell
npm test --workspace packages/shared -- --testPathPattern="egress"
# Expected: 116/116 passed
# Includes: DoH-mocked tests covering public IP (allow), private IP (block),
#           metadata IP (block), DoH timeout (fail-open), per-hop redirect validation
```

---

## 3. Operational checklist (monthly)

Run these checks every month or after any connector-related code change:

### 3.1 Egress policy regression test

```powershell
cd b:\Ellines_EIP
npm test --workspace packages/shared -- --testPathPattern="egress"
```

**Expected:** `110/110 passed` (or higher if new tests added).  
**If failing:** Stop. Investigate the failure before any deployment. A failing egress test means a security regression.

---

### 3.2 Audit connector installations for plaintext credentials (pre-TASK-03)

Once TASK-03 (credential encryption) lands, this check becomes obsolete. Until then:

```sql
-- Run against ellines_eip_local (local) and Supabase (prod)
SELECT 
  id, 
  display_name, 
  catalog_id,
  config->>'apiKey' as api_key_present,
  config->>'bearerToken' as bearer_token_present,
  config->>'connectionString' as conn_string_present
FROM connector_installations
WHERE 
  (config->>'apiKey' IS NOT NULL AND config->>'apiKey' != '***')
  OR (config->>'bearerToken' IS NOT NULL AND config->>'bearerToken' != '***')
  OR (config->>'connectionString' IS NOT NULL)
LIMIT 10;
```

**Expected:** Zero rows (or all credentials already encrypted after TASK-03).  
**If plaintext found:** Rotate the affected credentials immediately, then run the encryption migration (TASK-03 will provide this).

---

### 3.3 Review platform admin emails

```powershell
# Check .env (local) and Cloudflare Pages env vars (prod)
echo $env:PLATFORM_ADMIN_EMAILS
```

**Expected:** Comma-separated list of Ellines operator emails only. No client emails, no external addresses.

**If unexpected email found:** Remove it immediately. An unauthorized platform admin can install connectors into any client org and bypass all entitlement limits.

---

### 3.4 Check for stale/orphaned connector installations

```sql
SELECT 
  ci.id, 
  ci.display_name, 
  ci.organization_id, 
  o.name as org_name,
  ci.status,
  ci.last_synced_at
FROM connector_installations ci
LEFT JOIN organizations o ON ci.organization_id = o.id
WHERE ci.last_synced_at < NOW() - INTERVAL '90 days'
  OR o.id IS NULL  -- orphaned (org deleted)
ORDER BY ci.last_synced_at ASC NULLS FIRST
LIMIT 20;
```

**Action:** For orphaned rows (org deleted): delete the connector installation.  
**Action:** For 90+ days stale: contact the org admin to confirm it is still needed. If not, delete.

---

## 4. Incident response: suspected SSRF attempt

**Symptoms:**
- `SsrfError` entries in application logs (keyword: `SSRF policy violation`)
- Audit log `action = 'connector.proxy.fetch'` with `metadata.target` pointing at a blocked host
- Failed connector sync with `status = 'error'` and `last_message` containing `"egress policy"`

**Triage steps:**

1. **Identify the org and user:**
   ```sql
   SELECT 
     al.organization_id, 
     al.user_id, 
     u.email, 
     al.metadata->>'target' as blocked_target,
     al.created_at
   FROM audit_logs al
   JOIN users u ON al.user_id = u.id
   WHERE al.action = 'connector.proxy.fetch'
     AND al.metadata->>'target' ~ '(10\.|192\.168\.|127\.|169\.254\.|localhost)'
   ORDER BY al.created_at DESC
   LIMIT 10;
   ```

2. **Determine intent:**
   - **Accidental:** User misconfigured a connector (entered an internal IP thinking it would work).  
     → No action needed beyond user education ("Connectors must target public HTTPS endpoints").
   - **Malicious:** Repeated attempts, varied IPs, or targeting known-sensitive endpoints (127.0.0.1:6379, metadata.google.internal).  
     → Escalate to security incident response.

3. **Containment (if malicious):**
   - Suspend the user: `UPDATE users SET is_active = false WHERE id = '<user_id>'`
   - Suspend the org: `UPDATE organizations SET settings = jsonb_set(settings, '{platformStatus}', '"suspended"') WHERE id = '<org_id>'`
   - Delete all connector installations for that org: `DELETE FROM connector_installations WHERE organization_id = '<org_id>'`
   - Notify your incident response team

4. **Forensics:**
   - Pull full audit trail: `SELECT * FROM audit_logs WHERE organization_id = '<org_id>' AND created_at > '<incident_window_start>' ORDER BY created_at`
   - Check if any connector sync succeeded before the block (`status = 'synced'`, `last_synced_at` recent)
   - If a sync succeeded against a private IP (pre-TASK-01 deployment), assume data exfiltration and treat as a breach

---

## 5. Deployment safety (Cloudflare Pages)

### 5.1 Before every production deploy

```powershell
# Run locally
npm run build:shared
npm run build -w @ellines-eip/web
npm test --workspace packages/shared -- --testPathPattern="egress"
git diff --check  # no trailing whitespace
```

All must pass clean.

### 5.2 Pages environment variables (secrets)

**Never commit:**
- `DATABASE_URL` / `DIRECT_URL` (Supabase credentials)
- `JWT_SECRET`
- `ENCRYPTION_KEY` (TASK-03, once implemented)
- `SMTP_*` / `VAPID_*` (notification secrets)
- `PLATFORM_ADMIN_EMAILS`

**How to set in Pages:**

1. Go to **Cloudflare Pages** → your deployment → **Settings** → **Environment variables**
2. Set **Production** variables (these are live)
3. Never set secrets in **Preview** unless you have a separate non-prod Supabase instance

**Rotation schedule:**
- `JWT_SECRET`: every 90 days (triggers logout for all users — do during maintenance window)
- `ENCRYPTION_KEY`: only on known compromise (requires re-encryption migration)
- `DATABASE_URL`: only on Supabase password rotation

---

## 6. What to do when TASK-03 (credential encryption) lands

**Immediate actions after TASK-03 merge:**

1. **Generate and set `ENCRYPTION_KEY` in Cloudflare Pages env vars (Production)**
   ```powershell
   # Generate a 32-byte base64 key locally
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Copy the output → Pages env var `ENCRYPTION_KEY` → Deploy.

2. **Run the encryption migration (local first, then prod):**
   ```powershell
   # Local (ellines_eip_local)
   curl -X POST http://localhost:3000/api/v1/platform/security/migrate-encryption \
     -H "Authorization: Bearer <your-platform-admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"dryRun": true}'
   ```
   Review the counts. If safe:
   ```powershell
   curl -X POST http://localhost:3000/api/v1/platform/security/migrate-encryption \
     -H "Authorization: Bearer <your-platform-admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"confirm": true}'
   ```

3. **Repeat for production (Supabase):**
   ```powershell
   curl -X POST https://eip.ellines.co.ke/api/v1/platform/security/migrate-encryption \
     -H "Authorization: Bearer <prod-platform-admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"confirm": true}'
   ```

4. **Verify:**
   ```sql
   SELECT config FROM connector_installations LIMIT 5;
   ```
   Every credential field should be `{"encrypted": true, "data": "...", "keyId": "default"}`, not plaintext.

5. **Update this guide:** Remove §3.2 (plaintext audit check).

---

## 7. Contact

**Security incidents:** File a GitHub Issue with label `security` in the private Ellines EIP repo, or email `security@ellines.co.ke`.  
**Questions on this guide:** Tag @platform-team in the #eip-security Slack channel.

---

**End of Security Operations Guide**
