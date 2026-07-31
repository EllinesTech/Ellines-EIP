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

## Connect checklist (one-time)

1. Confirm the GitHub remote is `https://github.com/EllinesTech/Ellines-EIP.git`.
2. Add the secrets above on the repo.
3. In Cloudflare Dashboard → Pages → `ellines-eip`: prefer **Direct Upload / Wrangler** only (disable conflicting Git integration if present).
4. Merge or push to `main` → Actions run **Deploy Cloudflare Pages**.
5. Optional: `workflow_dispatch` on that workflow for a manual redeploy.

## Identity (Fly) — separate from Pages

Identity Nest API deploys via [`.github/workflows/deploy-identity.yml`](../.github/workflows/deploy-identity.yml) when identity paths change. Local/dev: `NEXT_PUBLIC_API_URL=http://localhost:3001`. Production Pages can use same-origin Functions or point at Fly.

## After landing connector / access changes

```bash
git push origin main   # or merge PR into main
# Watch: GitHub → Actions → Deploy Cloudflare Pages
```
