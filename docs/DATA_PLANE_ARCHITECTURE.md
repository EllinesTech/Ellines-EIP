# Data Plane — Architecture Decision (2026-09-30)

**Status:** Pages Functions is authoritative for the client/dashboard/connector surface.
This document records the decision, the evidence, and the one open gap.

## The finding

EIP currently has two API planes:

| Plane | Implementation | Route files | Runtime |
|---|---|---|---|
| **Pages Functions** | `apps/web/functions/api/v1/**` (Cloudflare Workers) | **200** | Cloudflare Pages (production) |
| **NestJS/Prisma** | `services/identity/src/**` (Express controllers) | **22** controllers | `localhost:3001` |

In **production** both are deployed (Pages Functions natively; identity reachable via
`IDENTITY_API_URL` proxies), so most client routes work.

In **local development** (`next dev`, port 3100) there are **zero** Next.js Route
Handlers (`apps/web/src/app/api/**/route.ts` count = 0). `apps/web/next.config.ts`
therefore rewrites *all* `/api/v1/*` to `http://localhost:3001`. The comment in that
config assumes Next.js Route Handlers shadow the Pages Functions routes — they do not
exist, so every Pages-Functions-only route is proxied to NestJS, which does not serve it.

### Reproduced evidence (this branch, live local stack)

```
/api/v1/auth/me                 -> 200   (NestJS serves it)
/api/v1/connectors              -> 200   (NestJS serves it)
/api/v1/connectors/installations-> 200   (NestJS serves it)
/api/v1/enterprise/summary      -> 200   (NestJS serves it)
/api/v1/orgs/me                 -> 200   (NestJS serves it)

/api/v1/dashboards              -> 404   (Pages-Functions-only route)
/api/v1/connectors/health       -> 404   (Pages-Functions-only route)
/api/v1/connectors/attention    -> 404   (Pages-Functions-only route)
```

## Decision

**Pages Functions is authoritative** for the client dashboard, connector and
client-org surface. This is already the production topology and matches the
platform's Cloudflare Pages deployment target, so it is retained rather than
migrated.

Security invariants were made **plane-independent** as part of this work, so the two
planes cannot drift on the properties that matter:

- **Credential encryption at rest** — implemented in *both* planes
  (Pages: `shared/encryption.ts`; Nest: `EncryptionService`), with identical
  `SECRET_KEYS` and idempotent, org-bound AES-256-GCM.
- **Secret redaction** — `redactConfig` in both planes; DTOs never return secrets.
- **Capability authorization** — one shared module
  (`packages/shared/src/capabilities.ts`) used by both.
- **Record-vs-system semantics** — `recordCount` / `connectedSystems` separation
  enforced in both normalizers.
- **Tenant isolation** — every query scoped by the JWT `organizationId`.
- **Audit** — dashboard/connector mutations write `audit_logs` in both planes.

## Running the Pages Functions plane locally

The Functions plane is fail-closed by design: `shared/encryption.ts` **throws** when
`EIP_ENCRYPTION_MASTER_KEY` is missing or shorter than 32 UTF-8 bytes. Without it,
connector installation fails with `EIP_ENCRYPTION_MASTER_KEY is required` and, before
this was surfaced, no obvious cause.

Wrangler reads local Functions secrets from `apps/web/.dev.vars`. Generate it with:

```bash
npm run setup:local-secrets
```

This creates `apps/web/.dev.vars` (gitignored) containing a freshly generated
32-byte master key plus `IDENTITY_API_URL` and any identity/Supabase values carried
over from the repo-root `.env`. The generated key is for local development only —
rotating it makes locally-stored connector credentials undecryptable, which is the
expected and safe outcome. Pass `--force` to regenerate.

`POST /api/v1/connectors/installations` now catches the encryption failure and returns
a safe 500 (`"Connector credentials could not be encrypted. No data was saved."`) rather
than throwing an opaque unhandled error — still fail-closed, but actionable. The error
body names the env var and never the secret. See
`apps/web/functions/__tests__/connector-install-encryption.spec.ts` (6 tests).

## Open gap (NOT resolved here)

**Local development does not faithfully reproduce the Pages Functions plane.**
Dashboard, connector-health and attention endpoints 404 under `next dev` because no
Next.js Route Handlers exist to shadow the rewrite.

This is a **developer-experience / local-parity gap, not a production defect** — the
production deployment serves these routes correctly. It is recorded as a known
limitation rather than papered over, because the honest fixes are either:

1. adding Next.js Route Handler shims for the ~200 Pages Functions routes, or
2. running `wrangler pages dev` locally instead of `next dev`,

and both are architectural changes that deserve their own review rather than being
smuggled into a security-hardening branch.

## What this means for verification

API-level verification of the Pages-Functions-only routes is covered by the jest
suites that invoke the handlers directly (`apps/web/functions/__tests__/**`), not by
the `next dev` server. The real-world connector proof
(`npm run verify:haven-connector`) exercises the engine over real HTTP independently
of either plane.
