# @ellines-eip/connectors-sdk

SDK for Ellines EIP connector plugins. **API is only one path** — file, database, email, and events are first-class.

## Available helpers

- `createDemoJsonConnector` — demo seed
- `createRestApiConnector` — HTTPS JSON URL
- `createCsvFileConnector` / `parseCsvToEnterprisePayload` — CSV/file export (no API)
- `normalizeEnterprisePayload` — map varied JSON into the Universal Enterprise Model
- `CONNECTOR_CATALOG` — product catalog (live + planned)

## Philosophy

If a vendor will not give an API, EIP still connects via:

1. CSV / Excel / file export  
2. Read-only database (Postgres / SQL Server — roadmap)  
3. Email / IMAP reports  
4. SFTP folder drops  
5. Webhooks when the system can push  

Ellinea never talks to each system’s proprietary UI — it reads the normalized enterprise snapshot after sync.
