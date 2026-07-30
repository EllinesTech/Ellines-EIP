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
