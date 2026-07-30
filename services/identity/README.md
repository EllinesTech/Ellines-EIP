# Identity Service

Authentication, organization management, and role-based access control for **Ellines EIP**.

## Port

- Local: `3001`
- Fly: `8080` (`https://ellines-eip-identity.fly.dev`)

## Run locally

```bash
# from repo root — needs DATABASE_URL / DIRECT_URL in .env
npm run db:generate
npm run db:push
npm run seed:demo
npm run dev:identity
```

Health: http://localhost:3001/api/v1/health

## Deploy (Fly.io)

```bash
# one-time
fly apps create ellines-eip-identity -o <org>
fly secrets set DATABASE_URL="..." DIRECT_URL="..." JWT_SECRET="..." --app ellines-eip-identity

# from repo root
npm run deploy:identity
```

CI: `.github/workflows/deploy-identity.yml` (requires `FLY_API_TOKEN` secret).

## Demo login

See [docs/07_Demo_Login.md](../../docs/07_Demo_Login.md).
