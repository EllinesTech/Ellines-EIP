# Demo login — Ellines EIP

Use this account to open the live Command Center.

| Field | Value |
|-------|-------|
| **Live site** | https://eip.ellines.co.ke/login |
| **Email** | `demo@ellines.co.ke` |
| **Password** | `EllinesDemo2026!` |
| **Organization** | Ellines Demo Org |

**Auth API (live):** same-origin Cloudflare Pages Functions at `/api/v1/*` on eip.ellines.co.ke  
**Health:** https://eip.ellines.co.ke/api/v1/health  

Full Nest Identity on Fly remains available for later microservice hosting — see [08_Live_Identity_Setup.md](./08_Live_Identity_Setup.md).

## Seed / reset the demo user

Against the Supabase (or local) database used by production auth:

```bash
npm run db:push
npm run seed:demo
```

Override defaults with env if needed: `DEMO_EMAIL`, `DEMO_PASSWORD`, `DEMO_ORG_NAME`, `DEMO_ORG_SLUG`, `DEMO_FULL_NAME`.

## Pages secrets (one-time)

Cloudflare Pages project `ellines-eip` needs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

```powershell
powershell -File scripts/set-pages-auth-secrets.ps1
```

## Security

This is a **shared pilot** account. Change `DEMO_PASSWORD` and re-seed before any external launch.
