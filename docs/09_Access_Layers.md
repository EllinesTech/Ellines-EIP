# Ellines EIP — Access Layers

**Product:** Ellines EIP v1.0 Foundation  
**Related:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md), [04_Enterprise_Lexicon.md](./04_Enterprise_Lexicon.md)

Ellines EIP has **three access layers** on one product — not three separate apps for CEO / HR / Manager.

---

## Layers

| Layer | Route | Who | Job |
|-------|-------|-----|-----|
| **Work Console** | `/app` | Business users | Decide and act — KPIs, alerts, Ellinea |
| **Org IT Admin** | `/app/admin` | Customer IT (`owner` / `admin`) | Users, roles, org structure, connectors |
| **Platform Super Admin** | `/app/platform` | Ellines operators | Tenants, feature flags, support |

```
Platform Super Admin (Ellines)
        │  create / suspend orgs, flags
        ▼
Org IT Admin (customer owner/admin)
        │  invite users, assign roles, connectors
        ▼
Work Console (executive / manager / member / viewer)
        │  role-scoped intelligence
        ▼
Connected enterprise data
```

---

## Org roles → default home

| Role | Layer | Default home focus |
|------|-------|--------------------|
| `owner` | Org IT + Work Console | Admin rights + full enterprise view |
| `admin` | Org IT (+ Work Console) | Users, roles, connectors |
| `executive` | Work Console | Enterprise health, Daily Brief, org-wide alerts |
| `manager` | Work Console | Branch / department KPIs and local alerts |
| `member` | Work Console | “What needs me” — tasks, alerts, Ellinea |
| `viewer` | Work Console | Read-only KPIs and briefs |

CEO, HR, Finance, etc. are **personas** (widget packs / scopes) inside the Work Console — not separate products.

---

## Platform Super Admin

- **Not** an org RBAC role. Customer IT cannot grant it.
- Granted when the user’s email is listed in `PLATFORM_ADMIN_EMAILS` (Pages / Identity env).
- Console: tenant list, feature-flag placeholders, platform health stubs.

---

## Guards (client + API)

- `/app/*` — authenticated session required.
- `/app/admin/*` — `owner` or `admin` only (`ORG_ADMIN_ROLES`).
- `/app/platform/*` — platform admin email allowlist only.
- Mutations (invite, role change, deactivate) — same rules on Nest Identity and Cloudflare Pages Functions.

---

## Build order (why)

1. **Org IT Admin** first — without invite/role assignment, every other dashboard is theater.
2. **Work Console** next — one shell, role-adaptive modules (mock KPIs OK until connectors).
3. **Super Admin** last — operate tenants after customers can stand themselves up.
