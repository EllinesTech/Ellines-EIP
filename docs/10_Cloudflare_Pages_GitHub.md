# Cloudflare Pages ↔ GitHub ([EllinesTech](https://github.com/EllinesTech))

Live site: [eip.ellines.co.ke](https://eip.ellines.co.ke)  
Repo: [EllinesTech/Ellines-EIP](https://github.com/EllinesTech/Ellines-EIP)

## How deploy works (use this, not dual Git builds)

EIP deploys via **GitHub Actions** on every push to `main`:

[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)

```
push to main (EllinesTech/Ellines-EIP)
        ↓
npm ci → build:shared → build web (static export)
        ↓
wrangler pages deploy → project ellines-eip
        ↓
https://eip.ellines.co.ke
```

**Do not** also enable Cloudflare’s “Connect to Git” auto-builds for the same project — that races this workflow (see comment in the workflow file).

## Required GitHub Actions secrets

In [EllinesTech/Ellines-EIP](https://github.com/EllinesTech/Ellines-EIP) → **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Account API token with **Cloudflare Pages — Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `NEXT_PUBLIC_API_URL` | Optional. Leave empty for same-origin Pages Functions; set to Fly Identity URL to force Nest |

## Cloudflare Pages project

- Project name: `ellines-eip` (must match `wrangler.toml` / workflow)
- Custom domain: `eip.ellines.co.ke`
- Production branch for wrangler deploy flag: `main`

Pages **Functions** live under `apps/web/functions/` and deploy with the `out/` static export.

**Do not** put `[triggers] crons` in `apps/web/wrangler.toml` — that breaks `wrangler pages deploy` on free/account cron limits. Connector schedules use opportunistic `POST /api/v1/connectors/run-due` when IT opens Connectors.

**Cron cleanup:** Pages Edit tokens cannot clear Worker schedules (403). If a cron was ever created, remove it in Cloudflare Dashboard → Workers & Pages → `ellines-eip` → Settings → Triggers (requires a token with Workers Scripts Edit), or leave it inert after removing crons from `wrangler.toml`.

**Git integration:** `ellines-eip` must stay **Direct Upload / Wrangler only** (`Git Provider: No`). Do not connect Cloudflare Git builds for this project.

## Connect checklist (one-time)

1. Confirm the GitHub remote is `https://github.com/EllinesTech/Ellines-EIP.git`.
2. Add the secrets above on the repo.
3. In Cloudflare Dashboard → Pages → `ellines-eip`: prefer **Direct Upload / Wrangler** only (disable conflicting Git integration if present).
4. Merge or push to `main` → Actions run **Deploy Cloudflare Pages**.
5. Optional: `workflow_dispatch` on that workflow for a manual redeploy.

## Optional Pages env — live email / Web Push

Notification outbox (`POST /api/v1/notifications/deliver`) is **implemented**. Without these Cloudflare Pages **environment variables**, delivery stays `simulated` (safe for CI). Agents cannot invent these secrets.

Set on Cloudflare Dashboard → Workers & Pages → `ellines-eip` → Settings → Environment variables (Production), **or** via Wrangler/`scripts` — never commit values:

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` (or `ELLINEA_SMTP_API_KEY`) | Preferred HTTPS email via Resend |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Optional SMTP (also `ELLINEA_SMTP_*` aliases) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (`ELLINEA_VAPID_*` aliases ok) |

Generate VAPID: `npx web-push generate-vapid-keys`. Template: root `.env.example`.

## Identity (Fly) — separate from Pages

Identity Nest API deploys via [`.github/workflows/deploy-identity.yml`](../.github/workflows/deploy-identity.yml) when identity paths change. That workflow needs GitHub Actions secret **`FLY_API_TOKEN`** (human-only — see [08_Live_Identity_Setup.md](./08_Live_Identity_Setup.md)). Pages deploy does **not** use Fly.

Local/dev: `NEXT_PUBLIC_API_URL=http://localhost:3001`. Production Pages can use same-origin Functions or point at Fly.

## After landing connector / access changes

```bash
git push origin main   # or merge PR into main
# Watch: GitHub → Actions → Deploy Cloudflare Pages
```
