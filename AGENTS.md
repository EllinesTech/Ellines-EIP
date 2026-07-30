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
| `docs/06_Automation_Prompt.md` | Paste into Cursor Automations |
| `README.md` | Setup, hosting, scripts |

**GitHub `main` is the single product codebase.** Local machines and Cloud Agents stay in sync via Git. Humans: `git pull origin main` after agent landings. Live web updates when `main` deploys to Cloudflare Pages.

## Current maturity (summary)

- **Live web:** Cloudflare Pages → [eip.ellines.co.ke](https://eip.ellines.co.ke) (static UI + same-origin `/api/v1` auth Functions)
- **Identity (Nest / Fly):** optional full microservice — see `docs/08_Live_Identity_Setup.md`
- **Working:** Identity schema + auth (Pages Functions + Nest), Next.js app (auth, shell, Command Center placeholders)
- **Not built yet:** API gateway, integration-hub, ellinea-ai, workflow, notification; real connectors; live KPIs; Ellinea chat

Full checklist: `docs/05_Build_Queue.md`.

## How to work (sync pipeline)

Same loop as a human in this repo: **build → land on `main` → deploy**.

1. Read `docs/05_Build_Queue.md` and pick the first item marked `next` (or continue `in_progress`).
2. Create branch `agent/<id>-short-slug` from latest `main`.
3. Implement only that item (or one clearly scoped slice).
4. Match existing patterns: NestJS identity, Next.js App Router, CSS modules, Exo 2 + brand colors (`#6F2D8D`, `#0F172A`, `#2563EB`).
5. Do not invent purple-glow SaaS aesthetics; follow brand in `assets/brand/` and existing app CSS.
6. Update `docs/05_Build_Queue.md` in the same change set.
7. **Before landing:** run the required builds (see Guardrails). Fix breakages you introduced.
8. Open a PR to `main`, then **merge it** (or push the verified commits to `main` if merge tools are unavailable). Prefer PR + merge so history stays reviewable.
9. Do **not** force-push. Do **not** commit secrets (`.env`, tokens). Use `.env.example` as the template.
10. Cloudflare Pages deploys automatically on push to `main`. Identity API deploys via its Fly workflow when identity paths change (or manual `fly deploy`).

### Guardrails

| Rule | Detail |
|------|--------|
| Build before land | Always: `npm run build:shared` and `npm run build -w @ellines-eip/web`. If you changed `services/identity` or its Prisma schema: also `npm run build -w @ellines-eip/identity`. |
| No force-push | Never `git push --force` to `main` or shared branches. |
| One item per run | Do not invent work outside the queue item. |
| Secrets | Never commit `.env`. Demo credentials live only in docs meant for humans (rotate if leaked). |
| Pause | Humans can disable the Cursor Automation anytime. |

### Local sync (humans)

```bash
git pull origin main
npm install   # if package-lock.json changed
```

## Commands

```bash
npm install
npm run build:shared
npm run build -w @ellines-eip/web
npm run build -w @ellines-eip/identity
# Identity (needs DATABASE_URL / DIRECT_URL from .env):
npm run db:generate
npm run db:push
npm run seed:demo
npm run dev:identity
npm run dev:web
```

Web: http://localhost:3100 · Identity: http://localhost:3001/api/v1/health

## Deploy

| Surface | Trigger |
|---------|---------|
| Web (Pages) | Push to `main` → `.github/workflows/deploy-pages.yml` |
| Identity (Fly) | Push to `main` touching identity/deploy paths → `.github/workflows/deploy-identity.yml` |

## Demo login (live)

See [docs/07_Demo_Login.md](./docs/07_Demo_Login.md).

## Out of scope for agents unless the queue says so

Mobile, marketplace, digital twin, autonomous agents, multi-company consolidation (see MVP out-of-scope → v1.1+).

## Cursor Cloud specific instructions

Startup layer: `npm install`, `npm run db:generate` (Prisma client), and `npm run build:shared` are handled by the VM update script — do not repeat them. The notes below cover things the update script cannot do.

- **Local database (not Supabase):** In Cloud there are no Supabase secrets, so a local PostgreSQL 16 (apt) stands in for it, using the same creds as `infra/docker/docker-compose.yml` (`eip` / `eip_dev_password` / `ellines_eip`). Root `.env` (gitignored) points `DATABASE_URL`/`DIRECT_URL` at `localhost:5432`. If real Supabase creds are provided, put them in `.env` instead.
- **Start Postgres before the identity service** (it is not auto-started on a fresh pod): `sudo pg_ctlcluster 16 main start`. The `identity` service calls `$connect()` on boot and will crash after 5 retries if the DB is down. If `.env` or the `eip` role/DB are missing (fresh snapshot), recreate: role `eip` with password `eip_dev_password`, database `ellines_eip`, then `npm run db:push` to sync the schema.
- **Schema changes:** `npm run db:push` (Prisma `db push`) syncs the local DB; there are no migration files.
- **Web dev server runs the full Next.js server** (`next dev`, port 3100). `output: 'export'` only applies when `NODE_ENV=production` (Pages deploy), so `next dev` supports API-backed auth. Auth is client-side (JWT in `localStorage`); the web app calls the identity API at `NEXT_PUBLIC_API_URL` (`http://localhost:3001` locally; production uses the Fly URL baked at build time).
- **Lint is not configured.** `npm run lint` → `next lint` in `apps/web` prompts interactively (no ESLint config, and `next lint` is deprecated). It is effectively a no-op / blocks in CI-style runs. `identity` and `shared` have no lint script. Don't treat lint as a gate until ESLint is actually wired up.
- **Hello-world check:** with both servers up, register an org at `http://localhost:3100/register/` (creates org + owner, redirects to `/app` Command Center), or hit the API directly: `POST http://localhost:3001/api/v1/auth/register`. Health: `http://localhost:3001/api/v1/health`.
- **Land on main:** After builds pass, merge your PR to `main` so Pages (and Identity, when applicable) deploy. Do not leave work only on a long-lived feature branch.
