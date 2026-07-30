# AGENTS.md — Ellines EIP

Instructions for Cursor Cloud Agents and Automations working on this repo.

## Product

**Ellines EIP** — Enterprise Intelligence Platform.  
Tagline: *Where Enterprise Systems Think Together.*  
AI engine: **Ellinea AI**. Parent: **Ellines Tech**.

EIP sits **above** existing systems (ERP, CRM, etc.). It connects and observes; it does **not** replace Systems of Record.

## Source of truth

| Doc | Use |
|-----|-----|
| `docs/02_MVP_Scope_v1.0.md` | What to build in v1.0 |
| `docs/03_Master_Blueprint.md` | Product vision / architecture |
| `docs/05_Build_Queue.md` | **Ordered worklist + current status** — pick from here |
| `docs/04_Enterprise_Lexicon.md` | Terminology |
| `README.md` | Setup, hosting, scripts |

## Current maturity (summary)

- **Live:** static web on Cloudflare Pages (`eip.ellines.co.ke`).
- **Working:** Identity service (NestJS + Prisma/Supabase), Next.js app (auth, shell, Command Center placeholders).
- **Not built yet:** API gateway, integration-hub, ellinea-ai, workflow, notification services; real connectors; live KPIs; Ellinea chat.

Full checklist: `docs/05_Build_Queue.md`.

## How to work

1. Read `docs/05_Build_Queue.md` and pick the first item marked `next` (or continue `in_progress`).
2. Create branch `agent/<id>-short-slug` from latest `main`.
3. Implement only that item (or a clearly scoped slice). Prefer small, mergeable PRs.
4. Match existing patterns: NestJS identity, Next.js App Router, CSS modules, Exo 2 + brand colors (`#6F2D8D`, `#0F172A`, `#2563EB`).
5. Do not invent purple-glow SaaS aesthetics; follow brand in `assets/brand/` and existing app CSS.
6. Update `docs/05_Build_Queue.md` status in the same PR.
7. Open a PR to `main`. **Never merge. Never push to `main`. Never force-push.**
8. Do not commit secrets (`.env`, tokens). Use `.env.example` as the template.

## Commands

```bash
npm install
npm run build:shared
npm run build -w @ellines-eip/web
npm run lint --workspaces --if-present
# Identity (needs DATABASE_URL / DIRECT_URL from .env):
npm run db:generate
npm run dev:identity
npm run dev:web
```

Web: http://localhost:3100 · Identity: http://localhost:3001/api/v1/health

## Deploy

Push/merge to `main` triggers `.github/workflows/deploy-pages.yml` → Cloudflare Pages.  
Agents only open PRs; humans (or protected merge rules) merge.

## Out of scope for agents unless the queue says so

Mobile, marketplace, digital twin, autonomous agents, multi-company consolidation (see MVP out-of-scope → v1.1+).

## Cursor Cloud specific instructions

Startup layer: `npm install`, `npm run db:generate` (Prisma client), and `npm run build:shared` are handled by the VM update script — do not repeat them. The notes below cover things the update script cannot do.

- **Local database (not Supabase):** In Cloud there are no Supabase secrets, so a local PostgreSQL 16 (apt) stands in for it, using the same creds as `infra/docker/docker-compose.yml` (`eip` / `eip_dev_password` / `ellines_eip`). Root `.env` (gitignored) points `DATABASE_URL`/`DIRECT_URL` at `localhost:5432`. If real Supabase creds are provided, put them in `.env` instead.
- **Start Postgres before the identity service** (it is not auto-started on a fresh pod): `sudo pg_ctlcluster 16 main start`. The `identity` service calls `$connect()` on boot and will crash after 5 retries if the DB is down. If `.env` or the `eip` role/DB are missing (fresh snapshot), recreate: role `eip` with password `eip_dev_password`, database `ellines_eip`, then `npm run db:push` to sync the schema.
- **Schema changes:** `npm run db:push` (Prisma `db push`) syncs the local DB; there are no migration files.
- **Web dev server runs the full Next.js server** (`next dev`, port 3100). `output: 'export'` only applies when `NODE_ENV=production` (Pages deploy), so `next dev` supports API-backed auth. Auth is client-side (JWT in `localStorage`); the web app calls the identity API at `NEXT_PUBLIC_API_URL` (`http://localhost:3001`).
- **Lint is not configured.** `npm run lint` → `next lint` in `apps/web` prompts interactively (no ESLint config, and `next lint` is deprecated). It is effectively a no-op / blocks in CI-style runs. `identity` and `shared` have no lint script. Don't treat lint as a gate until ESLint is actually wired up.
- **Hello-world check:** with both servers up, register an org at `http://localhost:3100/register/` (creates org + owner, redirects to `/app` Command Center), or hit the API directly: `POST http://localhost:3001/api/v1/auth/register`. Health: `http://localhost:3001/api/v1/health`.
