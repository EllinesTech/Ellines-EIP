# @ellines-eip/connectors-sdk

SDK for Ellines EIP connector plugins. **API is only one path** — file, database, email, and events are first-class.

## Available helpers

- `createDemoJsonConnector` — demo seed
- `createRestApiConnector` — HTTPS JSON URL
- `createCsvFileConnector` / `parseCsvToEnterprisePayload` — CSV/file export (no API)
- `parseOpenApiDocument` / `syncOpenApiRoutes` — OpenAPI → capabilities → sync
- `createPostgresConnector` / `assertReadOnlySql` / `rowsToEnterprisePayload` — read-only PostgreSQL
- `createSqlServerConnector` — read-only SQL Server (T-SQL)
- `createMysqlConnector` — read-only MySQL
- `buildAuthHeaders` — API key / Bearer / Basic
- `normalizeEnterprisePayload` — map varied JSON into the Universal Enterprise Model
- `CONNECTOR_CATALOG` — product catalog (live + planned)

## Philosophy

IT installs a connection without the vendor writing an EIP plugin:

1. OpenAPI / Swagger upload (capabilities listed automatically)
2. REST URL + auth
3. CSV / Excel / file export
4. Read-only PostgreSQL / SQL Server / MySQL (reporting replica)
5. Email / IMAP, SFTP, webhooks

Ellinea reads the normalized enterprise snapshot after sync — never each system’s proprietary UI.
