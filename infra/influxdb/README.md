# Ellines EIP 2.0 — InfluxDB Time-Series Metrics Setup

## Overview

InfluxDB stores time-series health and performance metrics for the EIP platform, supporting:
- System health monitoring (Requirement 17.3)
- Self-healing detection (Requirement 4.1, 4.6)
- Performance tracking (Requirement 21.6)
- Predictive analytics (Requirement 11.1)

## Architecture

- **InfluxDB 2.x**: Time-series database with built-in visualization and alerting
- **PostgreSQL (Prisma)**: Metadata about metrics (SystemHealthMetric model)
- **Dual Storage Pattern**:
  - InfluxDB = high-frequency time-series data
  - PostgreSQL = metric configuration, alert thresholds, metadata

## Metric Categories

### 1. Performance Metrics (Requirement 21.6)
- API response times (p50, p95, p99)
- Throughput (requests per second)
- Database query latency
- Cache hit/miss rates
- Background job duration

### 2. Health Metrics (Requirement 4.1, 4.6)
- Service availability
- Error rates (by service, endpoint, error type)
- Memory usage
- CPU utilization
- Disk I/O
- Network latency

### 3. Business Metrics
- Active users
- Data sync operations
- Connector health scores
- AI query volume
- Approval workflow throughput

### 4. Security Metrics (Requirement 15.1)
- Authentication attempts (success/failure)
- Rate limit violations
- Anomalous access patterns
- Data export volumes

## Setup Instructions

### 1. Start InfluxDB Container

```bash
# From project root
npm run docker:up

# Or directly:
docker compose -f infra/docker/docker-compose.yml up -d influxdb
```

### 2. Verify InfluxDB is Running

```bash
# Check container status
docker ps | grep influxdb

# Check logs
docker logs eip-influxdb

# InfluxDB UI: http://localhost:8086
# Username: eip_admin
# Password: eip_influx_password
```

### 3. Access InfluxDB UI

1. Open http://localhost:8086
2. Login with credentials from `.env`
3. Default org: `ellines_eip`
4. Default bucket: `platform_metrics`
5. Retention: 90 days

### 4. Create Additional Buckets (Optional)

```bash
# Create bucket for different retention periods
docker exec eip-influxdb influx bucket create \
  --name platform_metrics_longterm \
  --org ellines_eip \
  --retention 365d \
  --token eip_influxdb_admin_token_dev_only
```

## Configuration

Environment variables (in `.env`):

```bash
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=eip_influxdb_admin_token_dev_only
INFLUXDB_ORG=ellines_eip
INFLUXDB_BUCKET=platform_metrics
```

## Data Schema

### Measurement Structure

InfluxDB uses a tag-value-timestamp structure:

```
measurement,tag1=value1,tag2=value2 field1=value1,field2=value2 timestamp
```

### Standard Measurements

#### 1. `api_request`
Tracks API request metrics.

**Tags:**
- `service`: identity, integration-hub, ellinea-ai, workflow, notification
- `endpoint`: /api/v1/auth/login, /api/v1/connectors, etc.
- `method`: GET, POST, PUT, DELETE
- `status`: 200, 201, 400, 401, 500, etc.
- `organizationId`: Organization making the request

**Fields:**
- `duration_ms`: Response time in milliseconds (float)
- `request_size`: Request body size in bytes (integer)
- `response_size`: Response body size in bytes (integer)

**Example:**
```
api_request,service=identity,endpoint=/api/v1/auth/login,method=POST,status=200,organizationId=org_123 duration_ms=45.2,request_size=256,response_size=1024 1640000000000000000
```

#### 2. `system_health`
Tracks service health metrics.

**Tags:**
- `service`: identity, integration-hub, neo4j, postgres, redis
- `component`: api, database, cache, background-job
- `host`: hostname or container name

**Fields:**
- `cpu_percent`: CPU utilization percentage (float)
- `memory_mb`: Memory usage in MB (float)
- `memory_percent`: Memory utilization percentage (float)
- `disk_percent`: Disk utilization percentage (float)
- `uptime_seconds`: Service uptime (integer)

**Example:**
```
system_health,service=identity,component=api,host=eip-identity cpu_percent=15.3,memory_mb=512.8,memory_percent=25.6,uptime_seconds=86400 1640000000000000000
```

#### 3. `connector_sync`
Tracks connector synchronization operations.

**Tags:**
- `organizationId`: Organization ID
- `connectorId`: Connector installation ID
- `connectorType`: erp, crm, hrms, database, etc.
- `status`: success, failure, partial

**Fields:**
- `duration_ms`: Sync duration in milliseconds (float)
- `records_synced`: Number of records synced (integer)
- `records_failed`: Number of failed records (integer)
- `data_quality_score`: Quality score 0.0-1.0 (float)

**Example:**
```
connector_sync,organizationId=org_123,connectorId=conn_456,connectorType=erp,status=success duration_ms=5432.1,records_synced=1250,records_failed=3,data_quality_score=0.98 1640000000000000000
```

#### 4. `self_healing_event`
Tracks self-healing system actions.

**Tags:**
- `organizationId`: Organization ID (or platform-wide)
- `error_category`: database, network, memory, authentication, integration
- `severity`: critical, high, medium, low
- `action_type`: restart, cache_clear, pool_reset, rate_limit, rollback
- `outcome`: success, failure, partial_success, escalated

**Fields:**
- `detection_latency_ms`: Time to detect issue (float)
- `remediation_latency_ms`: Time to fix issue (float)
- `confidence_score`: Confidence in diagnosis 0.0-1.0 (float)
- `attempts`: Number of remediation attempts (integer)

**Example:**
```
self_healing_event,organizationId=org_123,error_category=database,severity=high,action_type=pool_reset,outcome=success detection_latency_ms=125.3,remediation_latency_ms=2340.5,confidence_score=0.92,attempts=1 1640000000000000000
```

#### 5. `ai_model_performance`
Tracks AI model usage and performance.

**Tags:**
- `model_id`: gpt-4, claude-3-opus, etc.
- `model_type`: language, time_series, anomaly, vision, reasoning
- `query_type`: text, forecast, anomaly_detection, image
- `organizationId`: Organization ID

**Fields:**
- `latency_ms`: Model response time (float)
- `confidence`: Model confidence 0.0-1.0 (float)
- `cost_usd`: Cost per query (float)
- `tokens_input`: Input tokens (integer)
- `tokens_output`: Output tokens (integer)
- `success`: 1 for success, 0 for failure (integer)

**Example:**
```
ai_model_performance,model_id=gpt-4,model_type=language,query_type=text,organizationId=org_123 latency_ms=1250.5,confidence=0.89,cost_usd=0.015,tokens_input=1500,tokens_output=500,success=1 1640000000000000000
```

#### 6. `knowledge_graph_operation`
Tracks knowledge graph operations.

**Tags:**
- `organizationId`: Organization ID
- `operation_type`: entity_create, entity_update, relationship_create, query
- `entity_type`: person, product, location, event, document

**Fields:**
- `duration_ms`: Operation duration (float)
- `entities_affected`: Number of entities (integer)
- `relationships_affected`: Number of relationships (integer)
- `confidence`: Average confidence score (float)

**Example:**
```
knowledge_graph_operation,organizationId=org_123,operation_type=entity_create,entity_type=person duration_ms=45.2,entities_affected=25,relationships_affected=47,confidence=0.93 1640000000000000000
```

## Usage Examples

### Writing Data (via HTTP API)

```bash
curl -X POST "http://localhost:8086/api/v2/write?org=ellines_eip&bucket=platform_metrics" \
  -H "Authorization: Token eip_influxdb_admin_token_dev_only" \
  -H "Content-Type: text/plain" \
  --data-binary "api_request,service=identity,endpoint=/health,method=GET,status=200 duration_ms=5.2 $(date +%s%N)"
```

### Querying Data (Flux)

```flux
// Get average API response time over last hour
from(bucket: "platform_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "api_request")
  |> filter(fn: (r) => r._field == "duration_ms")
  |> mean()
  |> yield(name: "avg_response_time")
```

```flux
// Get error rate by service
from(bucket: "platform_metrics")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "api_request")
  |> filter(fn: (r) => r.status >= "400")
  |> group(columns: ["service"])
  |> count()
  |> yield(name: "error_count_by_service")
```

```flux
// Detect performance degradation (p95 latency > 200ms)
from(bucket: "platform_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "api_request")
  |> filter(fn: (r) => r._field == "duration_ms")
  |> quantile(q: 0.95)
  |> filter(fn: (r) => r._value > 200.0)
  |> yield(name: "degraded_endpoints")
```

### Querying from Node.js

```typescript
import { InfluxDB, Point } from '@influxdata/influxdb-client';

const influx = new InfluxDB({
  url: process.env.INFLUXDB_URL,
  token: process.env.INFLUXDB_TOKEN,
});

// Write data
const writeApi = influx.getWriteApi(
  process.env.INFLUXDB_ORG,
  process.env.INFLUXDB_BUCKET,
  'ms'
);

const point = new Point('api_request')
  .tag('service', 'identity')
  .tag('endpoint', '/api/v1/auth/login')
  .tag('method', 'POST')
  .tag('status', '200')
  .floatField('duration_ms', 45.2)
  .intField('request_size', 256)
  .intField('response_size', 1024);

writeApi.writePoint(point);
await writeApi.close();

// Query data
const queryApi = influx.getQueryApi(process.env.INFLUXDB_ORG);

const query = `
  from(bucket: "platform_metrics")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "api_request")
    |> filter(fn: (r) => r._field == "duration_ms")
    |> mean()
`;

const rows = await queryApi.collectRows(query);
console.log('Average response time:', rows[0]._value);
```

## Dashboards & Visualization

### Create Dashboard in InfluxDB UI

1. Navigate to **Dashboards** in InfluxDB UI
2. Click **Create Dashboard**
3. Add cells with Flux queries
4. Configure visualization type (graph, gauge, table)

### Common Dashboard Cells

**API Performance**
- Line graph: Response time (p50, p95, p99) over time
- Single stat: Current average response time
- Gauge: Error rate percentage

**System Health**
- Line graph: CPU & memory usage per service
- Status panel: Service availability
- Heatmap: Request distribution

**Self-Healing Activity**
- Bar chart: Remediations by category
- Single stat: Success rate
- Timeline: Recent incidents

## Alerting

### Create Alert Rules

1. Navigate to **Alerts** in InfluxDB UI
2. Click **Create Check**
3. Write Flux query to detect condition
4. Set threshold and notification channel

### Example Alert: High API Latency

```flux
from(bucket: "platform_metrics")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "api_request")
  |> filter(fn: (r) => r._field == "duration_ms")
  |> quantile(q: 0.95)
  |> map(fn: (r) => ({
      r with
      _level: if r._value > 200.0 then "crit" else "ok"
    }))
```

### Example Alert: Error Rate Spike

```flux
from(bucket: "platform_metrics")
  |> range(start: -10m)
  |> filter(fn: (r) => r._measurement == "api_request")
  |> map(fn: (r) => ({
      r with
      is_error: if r.status >= "400" then 1 else 0
    }))
  |> aggregateWindow(every: 1m, fn: sum)
  |> map(fn: (r) => ({
      r with
      _level: if r._value > 10 then "warn" else "ok"
    }))
```

## Data Retention & Downsampling

### Configure Retention Policies

```bash
# Short-term high-resolution data (7 days)
influx bucket create \
  --name platform_metrics_raw \
  --org ellines_eip \
  --retention 168h

# Medium-term aggregated data (90 days) - default
# Already created: platform_metrics

# Long-term downsampled data (365 days)
influx bucket create \
  --name platform_metrics_longterm \
  --org ellines_eip \
  --retention 8760h
```

### Create Downsampling Task

```flux
// Downsample hourly averages to long-term bucket
option task = {
  name: "downsample-hourly",
  every: 1h,
}

from(bucket: "platform_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "api_request")
  |> aggregateWindow(every: 1h, fn: mean)
  |> to(bucket: "platform_metrics_longterm", org: "ellines_eip")
```

## Monitoring Best Practices

1. **Use appropriate retention periods**
   - Raw metrics: 7-14 days
   - Aggregated metrics: 90 days
   - Downsampled metrics: 1 year+

2. **Tag cardinality**
   - Keep tags low-cardinality (< 10k unique values)
   - Use fields for high-cardinality data
   - Don't use UUIDs as tags

3. **Batch writes**
   - Buffer multiple points before writing
   - Use write API batch size of 100-1000 points
   - Handle backpressure

4. **Query optimization**
   - Always specify time range
   - Filter early in pipeline
   - Use appropriate aggregation windows
   - Limit result cardinality

## Backup & Recovery

### Backup

```bash
# Backup bucket data
docker exec eip-influxdb influx backup /tmp/backup
docker cp eip-influxdb:/tmp/backup ./backups/influxdb-$(date +%Y%m%d)
```

### Restore

```bash
# Restore from backup
docker cp ./backups/influxdb-20240101 eip-influxdb:/tmp/restore
docker exec eip-influxdb influx restore /tmp/restore
```

## Troubleshooting

### Cannot Connect

1. Check container: `docker ps | grep influxdb`
2. Check logs: `docker logs eip-influxdb`
3. Test connection: `curl http://localhost:8086/health`

### Slow Queries

1. Check query time in UI
2. Optimize filters and ranges
3. Consider downsampling
4. Check disk I/O: `docker stats eip-influxdb`

### High Memory Usage

1. Check retention policies
2. Reduce cardinality
3. Increase container memory in docker-compose.yml

## Resources

- [InfluxDB Documentation](https://docs.influxdata.com/influxdb/v2.7/)
- [Flux Query Language](https://docs.influxdata.com/flux/v0.x/)
- [InfluxDB Node.js Client](https://github.com/influxdata/influxdb-client-js)
- [Best Practices](https://docs.influxdata.com/influxdb/v2.7/write-data/best-practices/)
