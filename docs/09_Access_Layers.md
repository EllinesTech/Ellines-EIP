# Ellines EIP — Access Layers

**Product:** Ellines EIP v1.0 Foundation  
**Related:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md), [04_Enterprise_Lexicon.md](./04_Enterprise_Lexicon.md)

Ellines EIP has **three access layers** on one product — not three separate apps for CEO / HR / Manager.

---

## Layers

| Layer | Route | Who | Job |
|-------|-------|-----|-----|
| **Work Console** | `/app` | Business users | Decide and act — KPIs, alerts, Ellinea — grounded in connected System B data |
| **Org Admin / IT** | `/app/admin`, `/app/connectors` | Owner + invited IT | People, authority, connectors to prime systems |
| **Platform Super Admin** | `/app/platform` | Ellines operators | Tenants, feature flags, connector packs |

```
Platform Super Admin (Ellines)
        │  create / suspend orgs, flags, connector packs
        ▼
Owner (business) — role `owner`
        │  owns the org; grants IT; full Work Console
        ▼
IT Admin — role `admin` (invited by Owner)
        │  connectors, sync, invite work users (not Owner/IT)
        ▼
Work Console (executive / manager / member / viewer)
        │  role-scoped intelligence from connected systems
        ▼
Connected enterprise data (System B capabilities → EIP)
```

---

## Owner vs IT (authority)

| | **Owner (`owner`)** | **IT Admin (`admin`)** |
|---|---|---|
| Job | Business control of the organization | Technical operation of EIP + connectors |
| Invite | Anyone, including IT and other Owners | Work roles only: executive, manager, member, viewer |
| Manage | All accounts | Work users only — **cannot** change Owner or IT accounts |
| Connectors | Full access (override) | Day-to-day install / test / sync |
| Source of trust | Yes — grants authority to IT | Delegated by Owner |

IT often knows more about databases and APIs than the Owner. **Knowledge ≠ authority.** Who is IT, and what systems may connect for the org, stays with the Owner.

---

## Org roles → default home

| Role | Layer | Default home focus |
|------|-------|--------------------|
| `owner` | Org Admin + Work Console | People & authority + full enterprise view |
| `admin` | IT Admin + Connectors (+ Work Console) | Users (work roles), connectors, sync health |
| `executive` | Work Console | Enterprise health, Daily Brief, org-wide alerts |
| `manager` | Work Console | Branch / department KPIs and local alerts |
| `member` | Work Console | “What needs me” — tasks, alerts, Ellinea |
| `viewer` | Work Console | Read-only KPIs and briefs |

CEO, HR, Finance, etc. are **personas** (widget packs / scopes) inside the Work Console — not separate products.

---

## Platform Super Admin

- **Not** an org RBAC role. Customer IT cannot grant it.
- Granted when the user’s email is listed in `PLATFORM_ADMIN_EMAILS` (Pages / Identity env).
- Console: tenant list, connector packs, feature-flag placeholders, platform health stubs.

---

## Guards (client + API)

- `/app/*` — authenticated session required.
- `/app/admin/*`, `/app/connectors/*` — `owner` or `admin` only (`ORG_ADMIN_ROLES`).
- `/app/platform/*` — platform admin email allowlist only.
- Assign Owner / IT Admin — **Owner only**.
- Mutations (invite, role change, deactivate) — same rules on Nest Identity and Cloudflare Pages Functions.

---

## Build order (why)

1. **Owner / IT Admin** first — without invite/role assignment, every other dashboard is theater.
2. **Connectors** — EIP mirrors what System B can do for Owner, IT, and employees.
3. **Work Console** — role-adaptive modules from live snapshots.
4. **Super Admin** — operate tenants and publish packs after customers can stand themselves up.
