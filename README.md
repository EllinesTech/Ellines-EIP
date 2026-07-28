# Ellines EIP

**Ellines EIP (Enterprise Intelligence Platform)**

*Where Enterprise Systems Think Together.*

Powered by **Ellinea AI** · Developed by **Ellines Tech**

**Live:** [eip.ellines.co.ke](https://eip.ellines.co.ke) · Preview: [ellines-eip.pages.dev](https://ellines-eip.pages.dev)

---

## What Is This?

Ellines EIP is an AI-native enterprise intelligence platform that sits **above** existing business systems (ERP, CRM, hospital systems, etc.) and transforms fragmented data into unified intelligence, automation, and executive decision support.

> Ellines EIP does not replace enterprise systems. It connects them, understands them, learns from them, and transforms them into one intelligent enterprise.

## Quick Links

| Document | Description |
|----------|-------------|
| [EIP in 60 Seconds](./docs/01_EIP_in_60_seconds.md) | One-page product overview |
| [MVP Scope v1.0](./docs/02_MVP_Scope_v1.0.md) | Feature list and build order |
| [Master Blueprint](./docs/03_Master_Blueprint.md) | Product vision and architecture |
| [Enterprise Lexicon](./docs/04_Enterprise_Lexicon.md) | Official terminology |

## Repository Structure

```
ellines-eip/
├── apps/
│   ├── web/                 # Executive dashboard (Next.js)
│   └── api-gateway/         # Central API gateway
├── services/
│   ├── identity/            # Auth, orgs, RBAC
│   ├── integration-hub/     # Connectors and data sync
│   ├── ellinea-ai/          # AI engine and chat
│   ├── workflow/            # Workflows and approvals
│   └── notification/        # Alerts and messaging
├── packages/
│   ├── shared/              # Shared types and utilities
│   ├── ui/                  # Design system components
│   ├── connectors-sdk/      # Connector plugin SDK
│   └── config/              # Shared ESLint, TS, env configs
├── infra/
│   ├── docker/              # Docker Compose for local dev
│   └── k8s/                 # Kubernetes manifests (prod)
├── docs/                    # Product documentation
└── assets/brand/            # Logo and brand assets
```

## Architecture

```
Experience Layer     →  apps/web, apps/api-gateway
Intelligence Layer   →  services/ellinea-ai
Business Layer       →  services/workflow, services/notification
Integration Layer    →  services/integration-hub
Data Layer           →  PostgreSQL, Redis
Infrastructure       →  infra/docker, infra/k8s
```

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project (PostgreSQL) — see `.env.example`

### Local Development

```bash
# Install dependencies
npm install

# Start Identity + Web together
npm run dev
```

- **Web:** http://localhost:3100  
- **Identity API:** http://localhost:3001/api/v1/health  

```bash
# Or run separately
npm run dev:identity
npm run dev:web
```

Copy `.env.example` to `.env` and set your Supabase pooler URLs before running Identity.

## MVP v1.0 Build Order

1. **Identity Core** — auth, orgs, RBAC
2. **Integration Hub** — REST, PostgreSQL, CSV, Email connectors
3. **Executive Dashboard** — KPIs, health score, timeline
4. **Ellinea AI** — NL Q&A, daily brief, recommendations
5. **Workflows** — approvals, events, scheduled reports

See [docs/02_MVP_Scope_v1.0.md](./docs/02_MVP_Scope_v1.0.md) for full scope.

## Hosting

| Item | Value |
|------|-------|
| GitHub | [EllinesTech/Ellines-EIP](https://github.com/EllinesTech/Ellines-EIP) |
| Cloudflare Pages | `ellines-eip` |
| Custom domain | `eip.ellines.co.ke` |
| Deploy | Push to `main` → `.github/workflows/deploy-pages.yml` |

DNS (Cloudflare → `ellines.co.ke` → Records):

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `eip` | `ellines-eip.pages.dev` | Proxied |

## Brand

| Element | Value |
|---------|-------|
| Product | Ellines EIP (Enterprise Intelligence Platform) |
| Tagline | Where Enterprise Systems Think Together |
| AI Engine | Ellinea AI |
| Primary Color | `#6F2D8D` |
| Typography | Exo 2 |

Brand assets: [`assets/brand/`](./assets/brand/)

## License

Proprietary · © Ellines Tech. All Rights Reserved.
