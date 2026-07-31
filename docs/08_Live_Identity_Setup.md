# One-time live Identity setup (Fly)

Code and CI for Identity are in the repo. Completing **optional** Nest Identity on Fly needs a Fly account token once.

## Pages vs Identity (read this first)

| Deploy | Workflow | Needs `FLY_API_TOKEN`? |
|--------|----------|------------------------|
| **Live web** ([eip.ellines.co.ke](https://eip.ellines.co.ke)) | [Deploy Cloudflare Pages](../.github/workflows/deploy-pages.yml) | **No** — Pages uses Cloudflare credentials only |
| **Identity API on Fly** | [Deploy Identity (Fly)](../.github/workflows/deploy-identity.yml) | **Yes** — this is the only workflow that reads `FLY_API_TOKEN` |

If Actions shows **Deploy Cloudflare Pages** succeeding and **Deploy Identity (Fly)** failing with missing token, the site can still work via same-origin Pages Functions. Add the secret only when you want Fly Identity deploys to succeed.

## 1. Create a Fly token (human — once)

1. Sign up / log in at https://fly.io  
2. Create a personal access / deploy token: https://fly.io/user/personal_access_tokens  
3. Copy the token (starts like `fly_…`). **Do not commit it** to the repo or paste it into chat/PRs.

### Local first deploy (optional)

On this machine (PowerShell):

```powershell
$env:FLY_API_TOKEN = 'fly_...'   # paste token — never commit
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
powershell -File scripts/setup-fly-identity.ps1
```

That creates `ellines-eip-identity`, sets `DATABASE_URL` / `DIRECT_URL` / `JWT_SECRET` from your local `.env`, and deploys.

## 2. Confirm API (after Fly app exists)

```text
https://ellines-eip-identity.fly.dev/api/v1/health
```

Demo user is already seedable / seeded against the same Supabase DB:

```bash
npm run seed:demo
```

## 3. GitHub secret for CI (required for Identity workflow)

Agents and CI **cannot** create this secret for you. A human must:

1. Open the GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name (exact): `FLY_API_TOKEN`
4. Value: the Fly token from step 1
5. Save

| Secret | Value |
|--------|--------|
| `FLY_API_TOKEN` | **Required only for** [Deploy Identity (Fly)](../.github/workflows/deploy-identity.yml). Without it the job fails in a few seconds at the “Require FLY_API_TOKEN” step. |
| `NEXT_PUBLIC_API_URL` | `https://ellines-eip-identity.fly.dev` (optional; live web uses same-origin Pages Functions unless overridden) |

After adding `FLY_API_TOKEN`, re-run: **Actions** → **Deploy Identity (Fly)** → **Run workflow**, or push a change under `services/identity/**` (or `packages/shared/**` / `packages/connectors-sdk/**`).

The Identity workflow path filters **exclude** `package-lock.json` and other services (`api-gateway`, `ellinea-ai`, `integration-hub`) so unrelated monorepo work does not spam failed Fly deploys.

## 4. Log in live

https://eip.ellines.co.ke/login  

- Email: `demo@ellines.co.ke`  
- Password: `EllinesDemo2026!`  

Details: [07_Demo_Login.md](./07_Demo_Login.md)
