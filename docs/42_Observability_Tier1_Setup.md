# Tier 1 Observability Infrastructure Setup

**Status:** Production-ready  
**Last Updated:** 2026-08-02  
**Scope:** Distributed tracing, metrics collection, structured logging for Ellines EIP Identity Service  
**Technologies:** OpenTelemetry, Jaeger, Prometheus, Loki, Grafana

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start (Local Development)](#quick-start-local-development)
3. [Components](#components)
4. [Distributed Tracing](#distributed-tracing)
5. [Metrics Collection](#metrics-collection)
6. [Structured Logging](#structured-logging)
7. [Dashboards & Visualization](#dashboards--visualization)
8. [Querying Data](#querying-data)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)

---

## Architecture Overview

Ellines EIP Tier 1 Observability implements the **OpenTelemetry standard** with three pillars:

```
┌─────────────────────────────────────────────────────────┐
│                  Ellines EIP Services                   │
│          (Identity, Integration Hub, Ellinea AI)        │
└────────────────┬────────────────┬────────────────────────┘
                 │                │
        ┌────────▼────┐   ┌───────▼────────┐
        │   Tracing   │   │   Metrics      │
        │ (Jaeger)    │   │ (Prometheus)   │
        └──────┬──────┘   └───────┬────────┘
               │                  │
        ┌──────▼──────────────────▼──────┐
        │     Grafana Dashboards         │
        │  (Visualization + Alerting)    │
        └─────────────────────────────────┘
        
┌──────────────────────────────────────┐
│   Logs (Winston + Loki)              │
│  (Structured JSON → Loki Aggregation)│
└──────────────────────────────────────┘
```

### Key Components

| Component | Purpose | Port | UI |
|-----------|---------|------|-----|
| **Jaeger** | Distributed tracing backend | 6831, 14268, 4318 | :16686 |
| **Prometheus** | Metrics scraping & storage | 9090 | :9090 |
| **Loki** | Log aggregation | 3100 | (via Grafana) |
| **Grafana** | Dashboards & alerting | 3000 | :3000 |

---

## Quick Start (Local Development)

### 1. Start Observability Stack

```bash
# From workspace root
docker-compose -f infra/docker/docker-compose.observability.yml up -d
```

Verify services are running:

```bash
# Check all containers
docker ps | grep ellines

# Expected output:
# ellines-jaeger      jaegertracing/all-in-one:latest       Up (healthy)
# ellines-prometheus  prom/prometheus:latest                Up (healthy)
# ellines-loki        grafana/loki:latest                   Up (healthy)
# ellines-grafana     grafana/grafana:latest                Up (healthy)
```

### 2. Access Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| **Jaeger Tracing** | http://localhost:16686 | No auth |
| **Prometheus** | http://localhost:9090 | No auth |
| **Grafana** | http://localhost:3000 | admin / admin |

### 3. Start Identity Service

```bash
# Terminal 1: Start database (if not running)
npm run docker:up

# Terminal 2: Start identity service
npm run dev:identity
```

### 4. Generate Traces

Make requests to the API:

```bash
# Register an org
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "organizationName": "Test Org",
    "organizationSlug": "test-org",
    "fullName": "Test User"
  }'

# Check health
curl http://localhost:3001/api/v1/health
```

### 5. View Traces in Jaeger

1. Open http://localhost:16686
2. Service: Select `ellines-eip-identity`
3. Operation: Select `POST /api/v1/auth/register`
4. Find Traces
5. Click a trace to view the span tree

### 6. Stop Stack

```bash
docker-compose -f infra/docker/docker-compose.observability.yml down
```

---

## Components

### Distributed Tracing (Jaeger)

**File:** `services/identity/src/tracing/tracing.ts`

Traces capture the **complete request lifecycle** across services:

- HTTP request ingress
- Database queries
- External API calls
- Permission checks
- Business logic execution
- Response egress

Each trace contains **spans** (individual operations) with:
- **Name:** Operation identifier (e.g., `POST /api/v1/auth/register`)
- **Duration:** How long it took
- **Tags:** Context metadata (user_id, org_id, trace_id)
- **Status:** OK, ERROR, or ERROR + exception
- **Timestamps:** Absolute timing

**Auto-instrumented operations:**

```
OpenTelemetry Auto-Instrumentations:
├── HTTP (incoming requests)
├── Express (route handlers)
├── PostgreSQL (database queries)
├── Redis (caching)
├── Prisma (ORM queries)
└── DNS (network lookups)
```

### Metrics (Prometheus)

**File:** `services/identity/src/metrics/metrics-collector.ts`

Collects **quantitative measurements** for performance monitoring:

```typescript
// HTTP Metrics
http_request_duration_seconds   // Histogram (p50, p95, p99)
http_request_total               // Counter
http_errors                       // Counter

// Business Logic Metrics
permission_check_duration_ms     // Histogram
permission_denial_total          // Counter
rule_execution_duration_ms       // Histogram
rule_failure_total               // Counter
connector_sync_duration_ms       // Histogram
connector_error_total            // Counter
dashboard_refresh_duration_ms    // Histogram
```

**Prometheus PromQL query examples:**

```promql
# Average request latency (last 5 minutes)
avg(http_request_duration_seconds)

# 95th percentile latency
histogram_quantile(0.95, http_request_duration_seconds)

# Error rate (%)
rate(http_errors[5m]) * 100

# Permission check performance
avg(permission_check_duration_ms)

# Rule execution success rate (%)
(rate(rule_execution_duration_ms[5m]) / rate(rule_execution_duration_ms[5m]) + rate(rule_failure_total[5m])) * 100
```

### Structured Logging (Winston + Loki)

**File:** `services/identity/src/logging/logger.ts`

All logs are **structured JSON** with correlation IDs:

```json
{
  "timestamp": "2026-08-02T18:12:46.412Z",
  "level": "info",
  "service": "identity",
  "trace_id": "abc123def456",
  "user_id": "user_12345",
  "org_id": "org_67890",
  "operation": "evaluatePermission",
  "message": "Permission granted",
  "metadata": {
    "role": "owner",
    "permission": "connector.create",
    "duration_ms": 1.2
  }
}
```

**Winston Transports:**

- **Console** (always, for local `stdout`)
- **Elasticsearch** (if `ELASTICSEARCH_URL` set)
- **Loki** (via Promtail agent in production)

**Log levels:**

| Level | When | Example |
|-------|------|---------|
| `ERROR` | Service error, user impact | Auth failure, DB connection lost |
| `WARN` | Degraded performance, eventual consistency | Slow query (>100ms), cache miss |
| `INFO` | Normal operations | User login, API request |
| `DEBUG` | Detailed execution flow | DB query text, permission evaluation details |

---

## Distributed Tracing

### How to Use Jaeger UI

1. **Select Service:** `ellines-eip-identity`
2. **Select Operation:** E.g., `POST /api/v1/auth/register`
3. **Set Time Range:** Last hour, day, week
4. **Filter Tags:** `trace_id=abc123` or `user_id=user_12345`
5. **Find Traces**
6. **Inspect a trace:**
   - **Timeline view:** Span chronology
   - **Span details:** Tags, logs, exception
   - **Service map:** Which services were called

### Example: Trace a Permission Check

```
GET /api/v1/orgs/me/connectors
├── ✓ HTTP request (125ms total)
│   ├── ✓ Authenticate (5ms)
│   ├── ✓ PermissionService.evaluate (8ms)
│   │   ├── ✓ Load role from DB (2ms)
│   │   ├── ✓ Evaluate permissions (4ms)
│   │   └── ✓ Update permission cache (2ms)
│   ├── ✓ Query connectors (45ms)
│   │   ├── ✓ Prisma.connector.findMany (40ms)
│   │   └── ✓ Serialize response (5ms)
│   └── ✓ Serialize response (67ms)
└── Tags: user_id=user_123, org_id=org_456, trace_id=trace_abc
```

### Adding Custom Spans

Wrap business logic in spans:

```typescript
import { TracingContext } from '../tracing/tracing-context';

// Async operation
async evaluateRule(ruleId: string, context: any) {
  return TracingContext.wrapAsync(
    `evaluateRule:${ruleId}`,
    async () => {
      // Business logic
      const result = await this.executeRule(ruleId, context);
      return result;
    },
    { rule_id: ruleId, autonomy_level: rule.autonomyLevel }
  );
}

// Sync operation
checkPermission(userId: string, permission: string) {
  return TracingContext.wrapSync(
    `checkPermission`,
    () => {
      // Business logic
      return this.rbac.can(userId, permission);
    },
    { user_id: userId, permission }
  );
}
```

---

## Metrics Collection

### Metrics Hierarchy

```
Global Metrics
├── HTTP Layer (all requests/responses)
├── Service Layer (business logic)
│   ├── Permission checks
│   ├── Rule execution
│   ├── Connector sync
│   └── Dashboard refresh
└── Infrastructure (DB, cache, external APIs)
```

### Key Metrics to Monitor

| Metric | Threshold | Alert |
|--------|-----------|-------|
| **HTTP Error Rate** | > 1% | Critical (page on-call) |
| **API p95 Latency** | > 2s | Warning |
| **Permission Check p95** | > 50ms | Warning (cache not working) |
| **DB Query p95** | > 100ms | Warning |
| **Rule Execution Time** | > 5s | Warning |
| **Connector Sync Failure Rate** | > 5% | Critical |

### Recording Metrics in Code

```typescript
import { MetricsCollector } from '../metrics/metrics-collector';

@Injectable()
export class RuleService {
  constructor(private metrics: MetricsCollector) {}

  async executeRule(ruleId: string) {
    const start = Date.now();
    try {
      const result = await this.engine.execute(ruleId);
      this.metrics.recordRuleExecutionDuration(Date.now() - start, {
        rule_id: ruleId,
        status: 'success'
      });
      return result;
    } catch (error) {
      this.metrics.recordRuleFailure({ rule_id: ruleId });
      throw error;
    }
  }
}
```

---

## Structured Logging

### Log Correlation

Every log entry includes `trace_id` for correlation:

```
User makes request
  → trace_id: `trace-abc123def456`
  → Express middleware creates span with trace_id
  → All logs within request include `trace_id: trace-abc123def456`
  → Logs can be queried by trace_id to find all related operations
```

### Logging Best Practices

#### ✅ DO

- Include context (user_id, org_id, operation)
- Use structured fields (metadata object)
- Log at appropriate level (ERROR vs WARN)
- Include duration for performance-critical operations

```typescript
logger.info({
  trace_id,
  org_id,
  operation: 'connectorSync',
  duration_ms: 1250,
  metadata: { connector_id: 'conn_123', records_synced: 5000 }
});
```

#### ❌ DON'T

- Log PII (passwords, tokens, credit cards)
- Use string interpolation (breaks parsing)
- Log at ERROR level for expected failures
- Omit trace_id or operation name

```typescript
// Bad
logger.error(`User ${password} failed login`);

// Good
logger.warn({
  trace_id,
  operation: 'login',
  error: 'invalid_credentials'
});
```

### Querying Logs in Loki

Access Loki queries via Grafana → Explore → select Loki datasource.

```logql
# All errors in identity service
{service="identity", level="error"}

# Logs for a specific user
{service="identity"} | json | user_id="user_12345"

# Slow permission checks (> 50ms)
{service="identity", operation="evaluatePermission"} | json | duration_ms > 50

# Failed connectors
{service="identity"} | json | operation="connectorSync" | error != ""

# Trace correlation (find all logs for a trace)
{service="identity"} | json | trace_id="trace-abc123def456"
```

---

## Dashboards & Visualization

### Default Grafana Dashboards

Provisioning files: `infra/docker/grafana-provisioning/dashboards/`

#### Dashboard 1: API Health

Monitors HTTP request volume, error rates, and latency percentiles.

**Key Panels:**

- Requests/sec (line graph)
- Error rate % (gauge)
- Latency p50, p95, p99 (stat cards)
- Top failing endpoints (table)

**Alert Rules:**

- Error rate > 1% → Page on-call
- p95 latency > 2s → Warning

#### Dashboard 2: Database Performance

Monitors Prisma query latency and connection pool health.

**Key Panels:**

- Query duration p95 (gauge)
- Queries/sec (line graph)
- Slow queries (top 10, table)
- Connection pool utilization (gauge)

**Alert Rule:**

- Query p95 > 100ms → Warning

#### Dashboard 3: Permission System

Monitors RBAC evaluation performance and denial rates.

**Key Panels:**

- Permission check duration p95 (gauge)
- Denial rate (%) (gauge)
- Cache hit rate (%) (gauge)
- Checks/sec (line graph)

**Alert Rule:**

- Permission check p95 > 50ms (cache not working) → Warning

#### Dashboard 4: Rules Engine

Monitors business rule execution performance.

**Key Panels:**

- Rule execution duration p95 (gauge)
- Success rate (%) (gauge)
- Autonomy level breakdown (pie chart)
- Executions/sec by level (stacked bar)

**Alert Rule:**

- Execution time > 5s → Warning

#### Dashboard 5: Connectors

Monitors connector sync health and error rates.

**Key Panels:**

- Sync duration p95 (gauge)
- Success rate (%) (gauge)
- Error distribution (pie chart)
- Sync schedule (timeline)

**Alert Rule:**

- Failure rate > 5% → Page on-call

### Creating Custom Dashboards

1. Open Grafana: http://localhost:3000
2. Click **Create** → **Dashboard**
3. Click **Add Panel**
4. Select **Data Source:** Prometheus or Loki
5. Write query (PromQL or LogQL)
6. Configure visualization
7. Save dashboard

**Example: Create "High Error Rate Alert"**

1. New Panel
2. Data Source: Prometheus
3. Query: `rate(http_errors[5m]) * 100`
4. Visualization: Stat
5. Alert Rule:
   - Condition: `> 1`
   - For: `5m`
   - Send notification to: (configure notification channel)
6. Save

---

## Querying Data

### Jaeger Query Examples

**Find traces by user:**

1. Service: `ellines-eip-identity`
2. Operation: (any)
3. Tags: `user_id=user_12345`
4. Find Traces

**Find slow endpoints:**

1. Service: `ellines-eip-identity`
2. Min Duration: `1s`
3. Find Traces

**Find errors:**

1. Service: `ellines-eip-identity`
2. Tags: `error=true`
3. Find Traces

### Prometheus PromQL Examples

```promql
# Request rate (requests/sec)
rate(http_request_total[1m])

# Error rate (%)
rate(http_errors[5m]) / rate(http_request_total[5m]) * 100

# 95th percentile latency (ms)
histogram_quantile(0.95, rate(http_request_duration_seconds[5m])) * 1000

# Permission check average (ms)
avg(permission_check_duration_ms)

# Rule execution success rate (%)
(
  rate(rule_execution_duration_ms[5m])
  /
  (rate(rule_execution_duration_ms[5m]) + rate(rule_failure_total[5m]))
) * 100
```

### Loki LogQL Examples

```logql
# Count errors per service
{level="error"} | count_over_time([5m])

# Error rate by operation
{level="error"} | json | operation | count_over_time([5m])

# Slow permission checks
{operation="evaluatePermission"} | json | duration_ms > 50

# Failed rule executions
{operation="executeRule"} | json | error!=""

# User activity
{user_id="user_12345"}
```

---

## Troubleshooting

### Jaeger: No Traces Appearing

**Problem:** Started service but no traces in Jaeger UI.

**Diagnosis:**

```bash
# Check identity service logs for tracing init
docker logs $(docker ps -q -f "name=identity")

# Expected: "✓ OpenTelemetry Tracing initialized"
```

**Solutions:**

1. **Jaeger unreachable:** Update `JAEGER_HOST` / `JAEGER_PORT` in `.env`
2. **Service not initialized:** Verify `initializeTracing()` in `main.ts` runs FIRST
3. **Firewall:** Ensure port 6831 (UDP) is accessible: `telnet localhost 6831`

### Prometheus: Metrics Not Scraping

**Problem:** Prometheus shows "No data" for metrics.

**Diagnosis:**

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

**Solutions:**

1. **Service not exporting:** Verify `http://localhost:9090/metrics` accessible
2. **Scrape config wrong:** Edit `prometheus.yml`, reload (POST to `-/reload`)
3. **Firewall:** Ensure port 9090 accessible

### Loki: Logs Not Appearing

**Problem:** No logs in Grafana Loki queries.

**Diagnosis:**

```bash
# Check Loki is receiving logs (if using Promtail)
docker logs $(docker ps -q -f "name=loki")
```

**Solutions:**

1. **Winston not sending to Loki:** Requires Promtail agent (not configured by default)
2. **Temporary:** Logs appear in Grafana → Explore → Loki → `{service="identity"}`
3. **Production:** Deploy Promtail DaemonSet in Kubernetes

### Out of Memory

**Problem:** Docker containers using too much memory.

**Solutions:**

```bash
# Reduce retention periods (prometheus.yml)
--storage.tsdb.retention.time=1d  # was 7d

# Reduce Loki retention
table_manager.retention_period: 24h  # was 0s (unlimited)

# Restart containers
docker-compose -f infra/docker/docker-compose.observability.yml restart
```

---

## Production Deployment

### Recommended Architecture

```
Production Environment
├── Identity Service (Kubernetes)
│   ├── Auto-instrumentation enabled
│   ├── Prometheus metrics: `/metrics`
│   └── Jaeger UDP: :6831
│
├── OpenTelemetry Collector
│   ├── Receives: Jaeger traces (UDP/gRPC)
│   ├── Receives: Prometheus metrics (pull)
│   └── Exports: Datadog / Honeycomb
│
├── Observability Backend
│   ├── Datadog (recommended)
│   ├── OR Honeycomb
│   ├── OR self-hosted (Jaeger + Prometheus)
│   └── Loki for logs (production-grade)
│
└── Dashboards & Alerts
    ├── Datadog
    └── PagerDuty (on-call)
```

### Environment Variables

```bash
# Production .env

# Tracing
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com/v1/input/${DD_API_KEY}
OTEL_SERVICE_NAME=ellines-eip-identity
JAEGER_HOST=opentelemetry-collector
JAEGER_PORT=6831

# Metrics (Prometheus)
PROMETHEUS_PORT=9090

# Logging
ELASTICSEARCH_URL=https://prod-logs.company.com
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ellines-identity
spec:
  template:
    spec:
      containers:
      - name: identity
        image: ellines/identity:latest
        env:
        - name: JAEGER_HOST
          value: opentelemetry-collector.observability
        - name: JAEGER_PORT
          value: "6831"
        - name: PROMETHEUS_PORT
          value: "9090"
        ports:
        - containerPort: 3001  # API
        - containerPort: 9090  # Prometheus metrics
```

### Alerts & On-Call

Set up alert routing in Grafana or Datadog:

| Alert | Severity | Route | Runbook |
|-------|----------|-------|---------|
| Error rate > 1% | Critical | PagerDuty On-Call | docs/runbooks/high_error_rate.md |
| API p95 > 5s | Warning | Slack #incidents | docs/runbooks/slow_api.md |
| Connector failure > 10% | Critical | PagerDuty On-Call | docs/runbooks/connector_failure.md |

---

## Performance Targets

### SLOs (Service Level Objectives)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API availability | 99.9% | < 99.5% |
| API p99 latency | < 1s | > 2s |
| Permission check p95 | < 50ms | > 100ms |
| Error rate | < 0.1% | > 1% |

### Capacity Planning

| Component | Max Load | Scaling |
|-----------|----------|---------|
| **Jaeger** | 100K spans/sec | Horizontal (collector) |
| **Prometheus** | 1M series | Increase storage |
| **Loki** | 1GB logs/day | Horizontal (distributors) |

---

## Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger UI Guide](https://www.jaegertracing.io/docs/getting-started/)
- [Prometheus Querying](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [Loki Query Language](https://grafana.com/docs/loki/latest/query/)

---

**Next Steps:**

1. ✅ Start local observability stack
2. ✅ Make API requests to generate traces
3. ✅ View traces in Jaeger UI
4. ✅ Query metrics in Prometheus
5. ✅ Create custom dashboards in Grafana
6. 🔄 Set up alerts for production
7. 🔄 Integrate with on-call system (PagerDuty)
