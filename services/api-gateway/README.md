# EIP API Gateway (Phase 1.3)

Edge routing stub for non-Pages deployments (Fly / Docker / K8s).

## Run

```bash
npm install
npm run build -w @ellines-eip/api-gateway
IDENTITY_URL=http://localhost:3001 ELLINEA_URL=http://localhost:3002 npm run start -w @ellines-eip/api-gateway
```

- Health: `GET http://localhost:3000/api/v1/health`
- Routes: `GET http://localhost:3000/api/v1/gateway/routes`
- Proxies `/api/v1/auth/*`, `/orgs/*`, `/enterprise/*` → Identity  
- Proxies `/api/v1/ellinea/*` → Ellinea service  

## Live web note

[eip.ellines.co.ke](https://eip.ellines.co.ke) uses **Cloudflare Pages Functions** as the same-origin `/api/v1` edge. This gateway is for microservice topologies where a single Nest port fronts Identity + Ellinea.
