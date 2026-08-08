# Ellines EIP — Connector Enhancements 2026

**Date:** 2026-08-08  
**Status:** Implemented  
**Modern Integration Patterns**

---

## Overview

This document covers the modern connector enhancements added to Ellines EIP to support 2026 enterprise integration patterns. These enhancements align with industry best practices for API integration, security, and real-time data synchronization.

---

## New Connectors

### 1. GraphQL Connector

**Path:** `POST /api/v1/connectors/graphql`

**Purpose:** Connect to modern GraphQL APIs with support for queries, mutations, and subscription polling.

**Features:**
- Standard GraphQL queries and mutations
- Variable support
- Fragment support
- Schema introspection
- Operation naming
- Automatic UEM normalization
- Bearer/API Key/Basic auth support

**Usage:**
```typescript
{
  "endpoint": "https://api.example.com/graphql",
  "query": "query GetEnterpriseData { health { score alerts decisions } }",
  "variables": { "limit": 100 },
  "authType": "bearer",
  "bearerToken": "your-token-here",
  "normalizeUEM": true
}
```

**Benefits:**
- **Flexible data fetching** — Request exactly the data needed
- **Reduced over-fetching** — No unnecessary data transfer
- **Strong typing** — GraphQL schema provides type safety
- **Real-time capable** — Subscription support via polling

**Industry adoption (2026):**
- Growing at enterprise scale (89% REST, but GraphQL adoption accelerating)
- Preferred for flexible client-driven data needs
- Common in modern SaaS platforms (Shopify, GitHub, Hasura, AWS AppSync)

---

### 2. Webhook Receiver (Inbound)

**Path:** `POST /api/v1/webhooks/inbound?org=<org-slug>`

**Purpose:** Receive real-time push notifications from external systems with enterprise-grade security.

**Security Features:**
- **HMAC-SHA256 signature verification** (industry standard)
- **Replay attack prevention** (webhook ID tracking)
- **Timestamp validation** (5-minute window, 1-minute clock skew tolerance)
- **Constant-time signature comparison** (prevents timing attacks)
- **Request size limits** (1MB max)

**Required Headers (from sender):**
```
X-Webhook-Signature: sha256=<HMAC-SHA256(body, secret)>
X-Webhook-Timestamp: <unix-timestamp>
X-Webhook-ID: <unique-id>
X-Source-System: SystemName (optional)
```

**Configuration:**
1. Owner/IT Admin sets webhook secret in Settings → Webhooks
2. External system configures webhook URL: `https://eip.ellines.co.ke/api/v1/webhooks/inbound?org=your-org`
3. External system signs each request with HMAC-SHA256 using shared secret
4. EIP validates signature, checks for replays, updates enterprise snapshot

**Example (external system sending webhook):**
```javascript
const crypto = require('crypto');

const body = JSON.stringify({
  healthScore: 85,
  openAlerts: 3,
  briefHighlight: "Real-time update from CRM system"
});

const timestamp = Math.floor(Date.now() / 1000);
const webhookId = crypto.randomUUID();
const secret = 'your-shared-secret';

// Compute HMAC-SHA256 signature
const hmac = crypto.createHmac('sha256', secret);
hmac.update(body);
const signature = `sha256=${hmac.digest('hex')}`;

await fetch('https://eip.ellines.co.ke/api/v1/webhooks/inbound?org=acme', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
    'X-Webhook-Timestamp': String(timestamp),
    'X-Webhook-ID': webhookId,
    'X-Source-System': 'Acme CRM'
  },
  body
});
```

**Benefits:**
- **Real-time updates** — No polling required
- **Reduced API calls** — Push model more efficient than pull
- **Event-driven** — React to changes immediately
- **Secure** — HMAC prevents forgery and tampering
- **Audit trail** — Full logging of all webhook deliveries

**Industry adoption (2026):**
- **Webhooks are the standard for event-driven integration** (Stripe, Twilio, Shopify, GitHub all use them)
- **HMAC-SHA256 is the dominant authentication method** (65% of webhooks use HMAC)
- Essential for real-time systems and microservices architectures

---

## Enhanced Connector Features

### Universal Connector Proxy

**Enhancements:**
- Private IP detection and messaging
- Size-limited responses (512 KB)
- Better error messages for network failures
- Support for all HTTP methods (GET, POST, PUT, PATCH, DELETE)

### Installed Connector Sync

**Enhancements:**
- GraphQL catalog ID support
- Per-connector timeout (4 seconds per route to avoid Worker CPU limit)
- Better error handling with installation status updates
- Fire-and-forget email notifications on sync success

---

## Security Best Practices Implemented

### 1. Webhook Signature Verification

- **HMAC-SHA256** over raw request body
- **Constant-time comparison** prevents timing attacks
- **Timestamp validation** prevents replay attacks
- **Unique webhook IDs** prevent duplicate processing

### 2. Authentication Support

All connectors support:
- **API Key** (custom header)
- **Bearer Token** (Authorization: Bearer)
- **Basic Auth** (username/password)
- **Custom Headers**

### 3. Rate Limiting (Future)

Planned connector-level rate limits:
- Per-installation quotas
- Exponential backoff on failures
- Circuit breaker pattern

---

## Integration Patterns Comparison

| Pattern | Use Case | Pros | Cons | EIP Support |
|---------|----------|------|------|-------------|
| **REST** | General-purpose CRUD | Simple, widely adopted | Over-fetching, versioning | ✅ Built-in |
| **GraphQL** | Flexible client-driven queries | Precise data fetching, strong typing | Learning curve, server complexity | ✅ New (2026-08-08) |
| **Webhooks** | Real-time event notifications | Instant updates, efficient | Requires public endpoint, security setup | ✅ New (2026-08-08) |
| **gRPC** | High-performance microservices | Fast binary protocol, streaming | Binary, requires Protobuf | ⏳ Planned |
| **OpenAPI** | API discovery and documentation | Self-documenting, tooling support | REST-based | ✅ Built-in |
| **WebSocket** | Bidirectional real-time | True push, low latency | Connection management, scaling | ⏳ Planned |
| **SOAP** | Legacy enterprise systems | Strict contracts, WS-* standards | Verbose XML, dated | ⏳ If needed |

---

## Migration Guide (for existing connectors)

### Adding GraphQL to existing REST integration

**Before (REST):**
```json
{
  "catalogId": "rest-api",
  "config": {
    "endpoint": "https://api.example.com/enterprise/health",
    "authType": "bearer",
    "bearerToken": "token"
  }
}
```

**After (GraphQL):**
```json
{
  "catalogId": "graphql",
  "config": {
    "endpoint": "https://api.example.com/graphql",
    "query": "query { health { score alerts decisions } }",
    "authType": "bearer",
    "bearerToken": "token"
  }
}
```

### Switching from polling to webhooks

**Before (polling every 5 minutes):**
```json
{
  "catalogId": "rest-api",
  "syncIntervalMinutes": 5
}
```

**After (real-time webhooks):**
1. Set webhook secret in Settings → Webhooks
2. Configure external system to send webhooks to:
   `https://eip.ellines.co.ke/api/v1/webhooks/inbound?org=your-org`
3. Remove polling connector or keep as fallback

**Benefits:**
- Instant updates (vs 5-minute delay)
- Reduced API calls (push vs pull)
- Lower server load

---

## Testing

### Test GraphQL Connector

```bash
curl -X POST https://eip.ellines.co.ke/api/v1/connectors/graphql \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://countries.trevorblades.com/graphql",
    "query": "query { countries { name code } }"
  }'
```

### Test Webhook Receiver

```bash
# 1. Set webhook secret in Settings (e.g., "test-secret-123")

# 2. Send test webhook
TIMESTAMP=$(date +%s)
WEBHOOK_ID=$(uuidgen)
BODY='{"healthScore":90,"briefHighlight":"Test webhook"}'

# Compute signature (requires openssl or similar)
SIGNATURE="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "test-secret-123" | cut -d' ' -f2)"

curl -X POST "https://eip.ellines.co.ke/api/v1/webhooks/inbound?org=your-org" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -H "X-Webhook-Timestamp: $TIMESTAMP" \
  -H "X-Webhook-ID: $WEBHOOK_ID" \
  -H "X-Source-System: Test" \
  -d "$BODY"
```

---

## Performance Considerations

### GraphQL
- **Query complexity limits** — Future enhancement to prevent expensive queries
- **Batching** — Client can batch multiple queries in one request
- **Caching** — GraphQL responses can be cached by query hash

### Webhooks
- **Async processing** — Webhook updates are fire-and-forget
- **Replay protection** — Webhook IDs stored in audit log (consider cleanup after 7 days)
- **Rate limiting** — Future enhancement to prevent webhook flooding

---

## References

### Standards & Best Practices
- [GraphQL Specification](https://spec.graphql.org/) — GraphQL Foundation
- [Webhook Security (HMAC)](https://webhooks.fyi/security/hmac) — Industry guide
- [OWASP API Security](https://owasp.org/www-project-api-security/) — Security best practices

### Industry Adoption (2026)
- **REST:** 89% enterprise usage (still dominant)
- **GraphQL:** Growing rapidly for flexible data needs
- **Webhooks:** Standard for event-driven integration
- **gRPC:** Dominant for internal microservices at high-scale companies

---

## Future Enhancements

| Feature | Priority | Notes |
|---------|----------|-------|
| **gRPC connector** | P1 | For high-performance microservices integration |
| **WebSocket connector** | P1 | True bidirectional real-time (beyond webhook push) |
| **Connector health dashboard** | P2 | Visual status board for all connectors |
| **Rate limiting per connector** | P2 | Prevent API quota exhaustion |
| **Circuit breaker pattern** | P2 | Auto-disable failing connectors |
| **GraphQL subscription via WebSocket** | P2 | True GraphQL subscriptions (beyond polling) |
| **Webhook retry logic** | P2 | Exponential backoff for failed deliveries |
| **SOAP connector** | P3 | If legacy enterprise systems require it |

---

*Last updated: 2026-08-08*
