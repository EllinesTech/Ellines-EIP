# @ellines-eip/connectors-sdk

SDK for building Ellines EIP connector plugins.

## Connector Interface

```typescript
interface ConnectorPlugin {
  id: string;
  name: string;
  version: string;
  type: 'api' | 'database' | 'file' | 'email' | 'event';

  // Lifecycle
  configure(config: ConnectorConfig): Promise<void>;
  testConnection(): Promise<boolean>;
  sync(since?: Date): Promise<SyncResult>;
  disconnect(): Promise<void>;

  // Schema
  getSchema(): ConnectorSchema;
  mapToEnterpriseModel(records: unknown[]): EnterpriseObject[];
}
```

## Built-in Connectors (v1.0)

- `rest-api-connector`
- `postgresql-connector`
- `csv-file-connector`
- `email-imap-connector`

## Creating a Custom Connector

```typescript
import { ConnectorPlugin, defineConnector } from '@ellines-eip/connectors-sdk';

export default defineConnector({
  id: 'my-custom-connector',
  name: 'My Custom System',
  type: 'api',
  // ...
});
```

## Status

🔲 Not yet implemented — Phase 2
