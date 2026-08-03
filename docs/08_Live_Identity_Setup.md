# Live Identity setup (Pages Functions)

Identity auth runs inside Cloudflare Pages Functions — no separate Fly deployment needed.

## Pages vs Identity (current)

| Deploy | Workflow | Notes |
|--------|----------|-------|
| **Live web + Identity** | [Deploy Cloudflare Pages](../.github/workflows/deploy-pages.yml) | Single deploy for frontend + auth API |

The `deploy-pages.yml` workflow builds the Next.js app, verifies Pages Functions, and deploys everything to Cloudflare Pages. Auth endpoints (`/api/v1/auth/*`, `/api/v1/orgs/*`, etc.) are served from `apps/web/functions/`.

## 1. Required secrets

Human must add these in GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Required? | Value |
|--------|-----------|-------|
| `DATABASE_URL` | Yes (for CI builds that run Prisma) | `postgresql://...` |
| `DIRECT_URL` | Yes (for CI builds that run Prisma) | `postgresql://...` |
| `NEXT_PUBLIC_API_URL` | No | Leave unset for same-origin Pages Functions, or set explicit Identity URL |

## 2. Local development

```bash
# Start Postgres (if not running)
sudo pg_ctlcluster 16 main start

# Start identity dev server
npm run dev:identity

# In another terminal, start web dev server
npm run dev:web
```

Health check: `http://localhost:3001/api/v1/health`

## 3. Log in live

https://eip.ellines.co.ke/login

- Email: `demo@ellines.co.ke`
- Password: `EllinesDemo2026!`

Details: [07_Demo_Login.md](./07_Demo_Login.md)
