# One-time live Identity setup (Fly)

Code and CI for Identity are in the repo. Completing live login needs a Fly account token once.

## 1. Create a Fly token

1. Sign up / log in at https://fly.io  
2. Create a deploy token: https://fly.io/user/personal_access_tokens  
3. On this machine (PowerShell):

```powershell
$env:FLY_API_TOKEN = 'fly_...'   # paste token
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
powershell -File scripts/setup-fly-identity.ps1
```

That creates `ellines-eip-identity`, sets `DATABASE_URL` / `DIRECT_URL` / `JWT_SECRET` from your local `.env`, and deploys.

## 2. Confirm API

```text
https://ellines-eip-identity.fly.dev/api/v1/health
```

Demo user is already seedable / seeded against the same Supabase DB:

```bash
npm run seed:demo
```

## 3. GitHub secrets (CI)

In the repo → Settings → Secrets → Actions:

| Secret | Value |
|--------|--------|
| `FLY_API_TOKEN` | **Required** for [Deploy Identity (Fly)](../.github/workflows/deploy-identity.yml). Same Fly deploy token as above. Without it the workflow fails immediately (`no access token available` / empty `FLY_API_TOKEN`). |
| `NEXT_PUBLIC_API_URL` | `https://ellines-eip-identity.fly.dev` (optional; live web uses same-origin Pages Functions unless overridden) |

After adding `FLY_API_TOKEN`, re-run the workflow (`Actions` → Deploy Identity → `Run workflow`) or push a change under `services/identity/**`.

## 4. Log in live

https://eip.ellines.co.ke/login  

- Email: `demo@ellines.co.ke`  
- Password: `EllinesDemo2026!`  

Details: [07_Demo_Login.md](./07_Demo_Login.md)
