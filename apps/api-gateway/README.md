# API Gateway

Central entry point for all Ellines EIP client requests.

## Responsibilities

- Route requests to backend services
- JWT authentication middleware
- Rate limiting and request logging
- API versioning (`/api/v1/...`)

## Port

`3000` (default)

## Routes (planned)

| Route | Service |
|-------|---------|
| `/api/v1/auth/*` | identity |
| `/api/v1/orgs/*` | identity |
| `/api/v1/connectors/*` | integration-hub |
| `/api/v1/dashboard/*` | integration-hub |
| `/api/v1/ai/*` | ellinea-ai |
| `/api/v1/workflows/*` | workflow |
| `/api/v1/notifications/*` | notification |

## Status

🔲 Not yet implemented — Phase 1
