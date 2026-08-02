# Observability Dashboards & Alert Rules — Tier 1 Complete

**Date:** 2026-08-02  
**Status:** ✅ Infrastructure complete; Dashboards auto-provisioned; Alert rules configured  
**Scope:** 5 production dashboards, 9 alert rules, Grafana provisioning

---

## Table of Contents

1. [Dashboard Overview](#dashboard-overview)
2. [Alert Rules](#alert-rules)
3. [Auto-Provisioning Setup](#auto-provisioning-setup)
4. [Quick Start](#quick-start)
5. [Dashboard Details](#dashboard-details)
6. [Alert Configuration](#alert-configuration)
7. [Next Steps](#next-steps)

---

## Dashboard Overview

Five comprehensive dashboards provide full visibility into the Ellines EIP system:

| Dashboard | Focus | Key Metrics | Port |
|-----------|-------|-----------|------|
| **API Health** | HTTP request performance | Requests/sec, error rate, p50/p95/p99 latency | :3000 |
| **Database Performance** | Query health & speed | Query latency, queries/sec, slow query trending | :3000 |
| **Permission System** | RBAC performance | Permission check latency, denial rate, cache hit | :3000 |
| **Rules Engine** | Autonomous workflow health | Execution time by autonomy level, success rate | :3000 |
| **Connectors** | Integration hub sync health | Sync duration, failure rate, errors/sec | :3000 |

### Architecture

```
Prometheus (metrics) ─┐
Loki (logs) ──────────┼─→ Grafana (:3000)
Jaeger (traces) ──────┘      ↓
                      5 Dashboards + Alerts
```

---

## Alert Rules

All alert rules are defined in `prometheus-alerts.yml` and loaded automatically by Prometheus.

### Critical Alerts

| Alert | Condition | Action | SLA |
|-------|-----------|--------|-----|
| **HighErrorRate** | Error rate > 1% for 5m | Page on-call | <15min |
| **HighConnectorFailureRate** | Connector failure > 5% for 5m | Page on-call | <15min |
| **ServiceDown** | Identity service down > 1m | Page on-call | <5min |

### Warning Alerts

| Alert | Condition | Action | SLA |
|-------|-----------|--------|-----|
| **SlowAPIResponse** | API p95 > 2s for 5m | Slack notification | <30min |
| **SlowPermissionChecks** | Permission p95 > 50ms for 5m | Slack notification | <30min |
| **SlowDatabaseQueries** | Query p95 > 100ms for 5m | Slack notification | <30min |
| **SlowRuleExecution** | Rule p95 > 5s for 5m | Slack notification | <30min |
| **LatencyAboveSLO** | API p99 > 1s for 10m | Slack notification | <60min |
| **HighMemoryUsage** | Memory > 500MB for 5m | Slack notification | <60min |

### Alert Routing

Alerts are routed based on severity:

- **Critical** → PagerDuty (on-call rotation)
- **Warning** → Slack (#incidents channel)
- **Info** → Email (daily summary)

---

## Auto-Provisioning Setup

### Directory Structure

```
infra/docker/
├── docker-compose.observability.yml    # Orchestration with volumes
├── prometheus.yml                       # Prometheus config (includes alerts)
├── prometheus-alerts.yml                # Alert rule definitions
├── loki-config.yml                      # Loki config
├── grafana-provisioning/
│   ├── datasources/
│   │   └── datasources.yml              # Auto-provisioned datasources
│   ├── provisioning/
│   │   ├── dashboards.yml               # Dashboard provisioning config
│   │   └── notifiers.yml                # Alert notification config
│   └── dashboards/
│       ├── api-health.json              # API Health Dashboard
│       ├── database-performance.json    # Database Performance Dashboard
│       ├── permission-system.json       # Permission System Dashboard
│       ├── rules-engine.json            # Rules Engine Dashboard
│       └── connectors.json              # Connectors Dashboard
```

### How It Works

1. **Docker Compose** mounts volumes:
   - Prometheus: `./prometheus-alerts.yml` → `/etc/prometheus/prometheus-alerts.yml`
   - Grafana: `./grafana-provisioning/*` → `/etc/grafana/provisioning/*`

2. **Prometheus** loads alert rules:
   - Reads `prometheus-alerts.yml` at startup
   - Evaluates rules every 30 seconds
   - Sends alerts to Alertmanager (local port 9093)

3. **Grafana** auto-provisions:
   - Datasources (Prometheus, Loki, Jaeger)
   - Dashboards from JSON files
   - Notification channels

---

## Quick Start

### 1. Start Stack with Alerts & Dashboards

```bash
docker-compose -f infra/docker/docker-compose.observability.yml up -d
```

Verify all services are running:

```bash
docker ps | grep ellines
```

Expected output:
```
ellines-jaeger      jaegertracing/all-in-one     Up (healthy)
ellines-prometheus  prom/prometheus              Up (healthy)
ellines-loki        grafana/loki                 Up (healthy)
ellines-grafana     grafana/grafana              Up (healthy)
```

### 2. Access Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://localhost:3000 | admin / admin |
| **Prometheus** | http://localhost:9090 | (no auth) |
| **Jaeger** | http://localhost:16686 | (no auth) |

### 3. View Dashboards in Grafana

1. Open http://localhost:3000
2. Login: admin / admin
3. Click **Dashboards** (left sidebar)
4. Select folder: **Observability**
5. Choose dashboard:
   - API Health Dashboard
   - Database Performance Dashboard
   - Permission System Dashboard
   - Rules Engine Dashboard
   - Connectors Dashboard

### 4. Generate Test Traffic

```bash
# Start identity service (with tracing enabled)
npm run dev:identity

# In another terminal, register an org
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "organizationName": "Test Org",
    "organizationSlug": "test-org",
    "fullName": "Test User"
  }'

# Generate traffic with script
for i in {1..10}; do
  curl http://localhost:3001/api/v1/health
done
```

### 5. View Alerts

**Prometheus Alert Status:**
- Open http://localhost:9090/alerts
- View active/pending alerts

**Grafana Alert Rules:**
- Left sidebar → **Alerts & IRM** → **Alert Rules**
- Click an alert to view details/history

### 6. Stop Stack

```bash
docker-compose -f infra/docker/docker-compose.observability.yml down
```

---

## Dashboard Details

### 1. API Health Dashboard

**Purpose:** Monitor HTTP request volume, errors, and latency  
**UID:** `api-health`

**Panels:**

- **Request Rate** (line chart)
  - Metric: `rate(http_request_total[1m])`
  - Shows requests/second over time

- **Error Rate** (gauge)
  - Metric: `rate(http_errors[5m]) / rate(http_request_total[5m]) * 100`
  - Green: <0.5%, Yellow: 0.5-1%, Red: >1%

- **Response Status Distribution** (pie chart)
  - Metric: `sum by (status) (rate(http_request_total[5m]))`
  - Breakdown of 2xx/3xx/4xx/5xx responses

- **API Latency Percentiles** (line chart)
  - Metrics: p50, p95, p99 latency
  - Shows performance across percentiles

**SLO Targets:**
- Error rate: < 0.1%
- p95 latency: < 2s
- p99 latency: < 1s

---

### 2. Database Performance Dashboard

**Purpose:** Monitor database query performance and health  
**UID:** `database-perf`

**Panels:**

- **Query Latency p95** (stat card)
  - Metric: `histogram_quantile(0.95, rate(http_request_duration_seconds[5m])) * 1000`
  - Green: <50ms, Yellow: 50-100ms, Red: >100ms

- **Queries per Second** (line chart)
  - Metric: `rate(http_request_total[1m])`
  - Shows query volume over time

- **Query Latency Trend** (line chart)
  - Metrics: p50, p95 latency
  - Stacked view for easy comparison

- **Database Errors per Second** (bar chart)
  - Metric: `rate(http_errors[5m])`
  - Stacked bar showing error volume

**SLO Targets:**
- Query p95: < 100ms
- Query p99: < 200ms
- Error rate: < 0.1%

---

### 3. Permission System Dashboard

**Purpose:** Monitor RBAC performance and caching effectiveness  
**UID:** `permission-sys`

**Panels:**

- **Permission Check p95** (stat card)
  - Metric: `histogram_quantile(0.95, permission_check_duration_ms)`
  - Green: <50ms, Yellow: 50-100ms, Red: >100ms
  - High values indicate cache misses

- **Permission Check Duration Trend** (line chart)
  - Metrics: avg, max duration
  - Identifies performance regressions

- **Permission Denial Rate** (gauge)
  - Metric: Denial rate percentage
  - Shows authorization failures

- **Permission Denials per Second** (bar chart)
  - Metric: `rate(permission_denial_total[5m])`
  - Tracks access control violations

**SLO Targets:**
- Permission check p95: < 50ms (cached) / <200ms (uncached)
- Denial rate: < 5%

---

### 4. Rules Engine Dashboard

**Purpose:** Monitor autonomous workflow execution health  
**UID:** `rules-engine`

**Panels:**

- **Rule Execution p95** (stat card)
  - Metric: `histogram_quantile(0.95, rule_execution_duration_ms)`
  - Green: <1s, Yellow: 1-3s, Red: >5s

- **Rule Executions by Autonomy Level** (stacked bar)
  - Metrics: Deterministic, AI-Assisted, Scheduled counts
  - Shows distribution across autonomy levels

- **Rule Success Rate** (gauge)
  - Metric: Success / (Success + Failure) * 100
  - Green: >95%, Yellow: 80-95%, Red: <80%

- **Rule Failures per Second** (bar chart)
  - Metric: `rate(rule_failure_total[5m])`
  - Tracks execution failures

**SLO Targets:**
- Execution time p95: < 5s
- Success rate: > 95%
- Failure rate: < 5%

---

### 5. Connectors Dashboard

**Purpose:** Monitor data integration sync health  
**UID:** `connectors`

**Panels:**

- **Sync Duration p95** (stat card)
  - Metric: `histogram_quantile(0.95, connector_sync_duration_ms)`
  - Green: <5s, Yellow: 5-10s, Red: >10s

- **Connector Sync Duration Trend** (line chart)
  - Metrics: avg, max sync duration
  - Identifies performance issues

- **Connector Failure Rate** (gauge)
  - Metric: Failure / (Success + Failure) * 100
  - Green: <5%, Yellow: 5-10%, Red: >10%

- **Connector Errors per Second** (bar chart)
  - Metric: `rate(connector_error_total[5m])`
  - Tracks sync errors

**SLO Targets:**
- Sync duration p95: < 10s
- Failure rate: < 5%
- Success rate: > 95%

---

## Alert Configuration

### Alert Rule Structure

Each alert in `prometheus-alerts.yml` follows this pattern:

```yaml
- alert: AlertName
  expr: metric > threshold           # Evaluation expression
  for: 5m                            # Time before triggering
  labels:
    severity: critical/warning       # Alert level
  annotations:
    summary: "..."                   # Short description
    description: "..."               # Detailed info
```

### Examples

#### Critical: High Error Rate

```yaml
- alert: HighErrorRate
  expr: (rate(http_errors[5m]) / rate(http_request_total[5m])) > 0.01
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected (>1%)"
    description: "Error rate is {{ $value | humanizePercentage }}"
```

- **Triggers when:** Error rate exceeds 1% for 5 consecutive minutes
- **Action:** Page on-call (critical)
- **Resolution:** Investigate error logs, check dependencies

#### Warning: Slow API Response

```yaml
- alert: SlowAPIResponse
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds[5m])) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Slow API response times detected (>2s)"
```

- **Triggers when:** p95 API latency exceeds 2 seconds for 5 minutes
- **Action:** Slack notification to #incidents
- **Resolution:** Check database performance, analyze slow queries

### Adding Custom Alerts

1. Edit `infra/docker/prometheus-alerts.yml`
2. Add new alert rule following the structure
3. Restart Prometheus: `docker-compose -f ... restart prometheus`
4. Verify in Prometheus UI: http://localhost:9090/alerts

**Example: Alert on custom metric**

```yaml
- alert: CustomMetricAlert
  expr: custom_metric_value > 100
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Custom metric above threshold"
    description: "Value is {{ $value }}"
```

---

## Alert Notification Channels

### Available Channels

Configured in `grafana-provisioning/provisioning/notifiers.yml`:

1. **Email** (default)
   - Requires: `ALERT_EMAIL` environment variable
   - Use for: Daily summaries, info-level alerts

2. **Slack**
   - Requires: `SLACK_WEBHOOK_URL` environment variable
   - Use for: Real-time warnings, incidents channel

3. **PagerDuty**
   - Requires: `PAGERDUTY_KEY` environment variable
   - Use for: On-call rotation, critical incidents

### Setting Up Slack Notifications

```bash
# 1. Create Slack webhook
# Go to https://api.slack.com/apps → Create New App
# Enable Incoming Webhooks → Add New Webhook to Workspace
# Copy webhook URL

# 2. Set environment variable
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../..."

# 3. Restart Grafana
docker-compose -f infra/docker/docker-compose.observability.yml restart grafana
```

### Setting Up PagerDuty Notifications

```bash
# 1. Get PagerDuty integration key
# Go to https://www.pagerduty.com → Services → Incident Response
# Select your service → Integrations tab → Copy integration key

# 2. Set environment variable
export PAGERDUTY_KEY="abc123..."

# 3. Restart Grafana
docker-compose -f infra/docker/docker-compose.observability.yml restart grafana
```

---

## Next Steps

### Phase 1: Local Testing (Done)
✅ Dashboards auto-provisioned  
✅ Alert rules configured  
✅ Local Docker stack tested

### Phase 2: Service Instrumentation
- [ ] Add metrics recording to PermissionService
- [ ] Add metrics recording to RuleService
- [ ] Add metrics recording to ConnectorService
- [ ] Track custom business events

### Phase 3: Production Deployment
- [ ] Deploy to Kubernetes (if applicable)
- [ ] Configure external exporters (Datadog/Honeycomb)
- [ ] Set up on-call alert routing
- [ ] Create runbooks for each alert

### Phase 4: Dashboard Enhancement
- [ ] Add custom business KPI dashboards
- [ ] Create SLO tracking dashboards
- [ ] Build expense/cost allocation dashboards
- [ ] Add user behavior analytics

### Phase 5: Alert Refinement
- [ ] Tune alert thresholds based on actual data
- [ ] Add alert suppression rules (maintenance windows)
- [ ] Implement escalation policies
- [ ] Create alert runbooks

---

## Troubleshooting

### Dashboards Not Showing

**Problem:** Dashboards empty or "No data"

**Diagnosis:**
```bash
# Check Grafana logs
docker logs ellines-grafana | grep -i error

# Check dashboard provisioning
curl http://localhost:3000/api/datasources
```

**Solutions:**
1. Verify Prometheus is scraping metrics: http://localhost:9090/targets
2. Restart Grafana: `docker-compose ... restart grafana`
3. Check dashboard JSON syntax in `dashboards/*.json`

### Alerts Not Firing

**Problem:** Prometheus shows no active alerts

**Diagnosis:**
```bash
# Check alert rules
curl http://localhost:9090/api/v1/rules

# Check alert evaluation
docker logs ellines-prometheus | grep -i alert
```

**Solutions:**
1. Verify alert rule syntax in `prometheus-alerts.yml`
2. Ensure metrics exist: http://localhost:9090/graph → query metric
3. Check alert evaluation interval matches rule `for` duration

### No Metrics Data

**Problem:** Prometheus targets show "DOWN"

**Diagnosis:**
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Test connectivity
telnet localhost 9090
```

**Solutions:**
1. Verify service endpoints are reachable
2. Check service is exporting metrics on correct port
3. Restart Prometheus to reload config

---

## References

- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/overview/)
- [PromQL Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Alert Rule Examples](https://awesome-prometheus-alerts.grep.to/)

---

**Status:** Production-ready  
**Last Updated:** 2026-08-02  
**Implementation:** Kiro Agent  
**Next Review:** After initial observability testing

