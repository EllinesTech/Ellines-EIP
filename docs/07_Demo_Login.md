# Demo login — Ellines EIP

Use this account to open the live Command Center.

| Field | Value |
|-------|-------|
| **Live site** | https://eip.ellines.co.ke/login |
| **Email** | `demo@ellines.co.ke` |
| **Password** | `EllinesDemo2026!` |
| **Organization** | Ellines Demo Org |
| **Role** | `owner` (full Command Center + Organization System + Connectors) |

**Platform Super Admin:** `ellines.tech@gmail.com` — login with that account to access `/app/platform`.

**Auth API (live):** same-origin Cloudflare Pages Functions at `/api/v1/*` on eip.ellines.co.ke  
**Health:** https://eip.ellines.co.ke/api/v1/health  

## Live endpoints (all verified working 2026-08-01)

| Endpoint | Status |
|----------|--------|
| `POST /api/v1/auth/register` | ✅ 200 |
| `POST /api/v1/auth/login` | ✅ 200 |
| `GET /api/v1/auth/me` | ✅ 200 |
| `GET /api/v1/enterprise/summary` | ✅ 200 |
| `GET /api/v1/connectors/installations` | ✅ 200 |
| `GET /api/v1/orgs/me/approvals` | ✅ 200 |
| `GET /api/v1/orgs/me/rules` | ✅ 200 |
| `GET /api/v1/orgs/me/reports` | ✅ 200 |
| `GET /api/v1/orgs/me/events` | ✅ 200 |
| `GET /api/v1/orgs/my-orgs` | ✅ 200 |
| `GET /api/v1/orgs/me/ellinea-memory` | ✅ 200 |
| `GET /api/v1/orgs/me/notify-policy` | ✅ 200 |
| `GET /api/v1/orgs/me/settings` | ✅ 200 |
| `GET /api/v1/orgs/me/branches` | ✅ 200 |
| `GET /api/v1/platform/orgs` | ✅ 403 for non-platform users (correct) |

## Secrets wiring (complete)

Cloudflare Pages project `ellines-eip` has these secrets set (via wrangler, 2026-08-01):

| Secret | Status |
|--------|--------|
| `SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `JWT_SECRET` | ✅ Set |
| `PLATFORM_ADMIN_EMAILS` | ✅ Set (`ellines.tech@gmail.com`) |
| `RESEND_API_KEY` | ⏳ Optional — set to enable live email |
| `VAPID_*` | ⏳ Optional — set to enable web push |

Re-run secrets update anytime:
```bash
node scripts/set-pages-secrets.mjs
```

## Seed / reset the demo user

```bash
npm run db:push    # sync schema
npm run seed:demo  # create/reset demo@ellines.co.ke
```

Override with env if needed: `DEMO_EMAIL`, `DEMO_PASSWORD`, `DEMO_ORG_NAME`, `DEMO_ORG_SLUG`, `DEMO_FULL_NAME`.

## Supabase project

- **Project:** `ellines-eip` — https://difrqfciratkwwvjlngp.supabase.co
- **Region:** eu-west-2 (West Europe, London)
- **Database:** PostgreSQL via pooler at `aws-1-eu-west-2.pooler.supabase.com:5432`

## Security note

This is a **shared pilot** account. Change `DEMO_PASSWORD` and re-seed before any external launch.
Passwords are hashed at bcrypt cost 8 on Pages (cost 12 exceeds Cloudflare Worker CPU → error 1102).
