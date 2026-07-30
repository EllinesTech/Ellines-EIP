# Demo login — Ellines EIP

Use this account to open the live Command Center after Identity is deployed.

| Field | Value |
|-------|-------|
| **Live site** | https://eip.ellines.co.ke/login |
| **Email** | `demo@ellines.co.ke` |
| **Password** | `EllinesDemo2026!` |
| **Organization** | Ellines Demo Org |

Identity API (production): `https://ellines-eip-identity.fly.dev`  
Health: https://ellines-eip-identity.fly.dev/api/v1/health

## Seed / reset the demo user

Against the same database Identity uses (Supabase in production, local Postgres in Cloud/dev):

```bash
# Ensure schema exists
npm run db:push

# Upsert demo org + owner
npm run seed:demo
```

Override defaults with env if needed: `DEMO_EMAIL`, `DEMO_PASSWORD`, `DEMO_ORG_NAME`, `DEMO_ORG_SLUG`, `DEMO_FULL_NAME`.

## Wire-up checklist (one-time)

1. Create Fly app and set secrets (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`).
2. `npm run deploy:identity` (or push identity changes to `main`).
3. Set GitHub Actions secret `NEXT_PUBLIC_API_URL` = `https://ellines-eip-identity.fly.dev`
4. Push/redeploy web so the static build embeds that API URL.
5. Run `npm run seed:demo` with production DB URLs in `.env`.

## Security

This is a **shared pilot** account. Change `DEMO_PASSWORD` and re-seed before any external launch. Do not reuse this password for personal accounts.
