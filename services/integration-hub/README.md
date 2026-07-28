# Integration Hub

Universal Connector Framework — connects Ellines EIP to external business systems.

## Responsibilities

- Connector plugin management
- Data sync scheduling
- Universal Enterprise Model normalization
- Connector health monitoring
- Sync history and error reporting

## Port

`3002` (default)

## v1.0 Connectors

| Connector | Type | Status |
|-----------|------|--------|
| REST API | Pull | 🔲 Planned |
| PostgreSQL | Read-only sync | 🔲 Planned |
| CSV/File | Scheduled import | 🔲 Planned |
| Email (IMAP) | Ingestion | 🔲 Planned |

## Core Entities

- `Connector` — configured integration instance
- `ConnectorType` — plugin definition
- `SyncJob` — scheduled or manual sync run
- `SyncRecord` — individual synced record
- `ConnectorError` — sync failure log

## Principles

- **Read-only by default** — never modify source systems without explicit authorization
- **Non-intrusive** — source systems continue operating unchanged
- **Audited** — every sync logged in Audit Center

## Status

🔲 Not yet implemented — Phase 2 (Priority P0)
