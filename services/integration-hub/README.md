# Integration Hub service (stub)

Optional Nest microservice for connector orchestration. Live EIP still syncs via Cloudflare Pages Functions (`/api/v1/connectors/*`, `/api/v1/enterprise/ingest`).

## Run

```bash
npm run build -w @ellines-eip/connectors-sdk
npm run build -w @ellines-eip/integration-hub
npm run start -w @ellines-eip/integration-hub
```

- `GET /api/v1/health`
- `GET /api/v1/hub/capabilities`
- `POST /api/v1/hub/normalize` — body = raw System B JSON → UEM payload
