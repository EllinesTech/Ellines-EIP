# @ellines-eip/connectors-sdk

SDK for building Ellines EIP connector plugins.

## Status

Thin v0.1: `defineConnector` + `createDemoJsonConnector` for the Integration Hub demo feed.

## Usage

```typescript
import { createDemoJsonConnector } from '@ellines-eip/connectors-sdk';

const connector = createDemoJsonConnector(seed);
const result = await connector.sync();
```
