---
inclusion: always
---

# Ellines EIP — Dev Workflow

## Database Strategy: Hybrid (Local + Supabase)

| Environment | Database | Purpose |
|-------------|----------|---------|
| **Local dev** | `ellines_eip_local` (PostgreSQL 18, localhost:5432) | Build, test, experiment offline |
| **Production / live demo** | Supabase (EU West 2) | Live site at eip.ellines.co.ke |

Both databases have **identical schema** (Prisma managed) and **identical demo seed data**.

### The workflow

```
1. Code locally  →  identity service points to ellines_eip_local
2. Test locally  →  login as demo@ellines.co.ke / EllinesDemo2026!
3. Build passes  →  npm run build:shared && npm run build -w @ellines-eip/web
4. Push to main  →  GitHub Actions deploys to Cloudflare Pages (uses Supabase)
5. Live site     →  Cloudflare Pages Functions read Supabase
```

### Switching between databases

**To work offline (local):**
```bash
# In .env, replace DATABASE_URL and DIRECT_URL with:
DATABASE_URL=postgresql://postgres:80802424@localhost:5432/ellines_eip_local
DIRECT_URL=postgresql://postgres:80802424@localhost:5432/ellines_eip_local
```

**To push back to Supabase (production):**
```bash
# In .env, restore:
DATABASE_URL=postgresql://postgres.difrqfciratkwwvjlngp:Mwasblac808024242022@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30
DIRECT_URL=postgresql://postgres.difrqfciratkwwvjlngp:Mwasblac808024242022@aws-1-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30
```

> **Never commit .env.** The `.env` file is gitignored. Cloudflare Pages reads secrets from GitHub Secrets.

### Keeping local in sync with Supabase schema

When Prisma schema changes are made and pushed to main:
```bash
# Switch .env to local, then:
npm run db:push
# Switch .env back to Supabase
```

### Re-seeding local DB

```bash
# Switch .env to local, then:
npm run seed:demo
npx dotenv -e .env -- npx ts-node --transpile-only services/identity/prisma/seed-rate-limits.ts
# Switch .env back to Supabase
```

## Demo Account (both databases)

| Field | Value |
|-------|-------|
| Email | demo@ellines.co.ke |
| Password | EllinesDemo2026! |
| Role | Owner |
| Org | Ellines Demo Org (ellines-demo) |

## Account Strategy

| Account type | Who | What |
|-------------|-----|------|
| **Demo account** | Prospects / testing | Pre-seeded data, can be reset anytime |
| **Real/production account** | Paying clients | Fresh org, clean slate, their own data |

When a client signs up for real:
1. They register at eip.ellines.co.ke → creates a fresh org on Supabase
2. Demo orgs can be suspended/cleaned via Platform Admin (`/app/platform`)
3. No demo data bleeds into their account

## Local PostgreSQL Details

- Service: `postgresql-x64-18` (Windows service, auto-starts)
- Host: `localhost:5432`
- Database: `ellines_eip_local`
- User: `postgres` / password: (project password)
- Tables: 39 (full Prisma schema)
- Seed data: 1 demo org, 1 demo user, 16 connector templates, 4 agent templates, 3 workflow rules, 4 rate limit tiers

## What NOT to do

- Do not commit `.env` (contains database passwords)
- Do not run `npm run db:push` while `.env` points to Supabase unless you intend a schema change on production
- Do not delete `ellines_eip_local` — it is the only local EIP database (`ellines_eip` was deleted 2026-08-08, it was empty)
- Do not force-push to `main`
