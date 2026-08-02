# Service Level Objectives (SLO) & Service Level Indicators (SLI)

**Document:** Ellines EIP Tier 1 Observability Infrastructure  
**Created:** 2026-08-01  
**Status:** Foundation reference for production reliability  

---

## Overview

Service Level Objectives (SLOs) define our commitment to reliability. Service Level Indicators (SLIs) are the measurements we use to track that commitment. Error budgets quantify how much failure is acceptable in a given period.

**Key Principle:** Every service has an error budget. When budget is exceeded, all non-critical deployments are frozen until the issue is resolved and reliability improves.

---

## SLO Definitions

### 1. API Availability (99.5%)

**Service:** Ellines EIP Identity API  
**SLI:** `(successful_requests / total_requests) * 100`  
**SLO Target:** ≥ 99.5%  
**Error Budget (Monthly):** 3.6 hours of downtime per month  
**Alert Threshold:** < 99.0% in rolling 1-hour window  

**Definition:**
- Successful: HTTP 2xx or 3xx response
- Failed: HTTP 4xx (client error), 5xx (server error)
- Measured: Rolling 1-hour, daily, monthly windows

**Example:**
- 1 million requests/month
- 99.5% SLO = 995,000 successful requests
- Acceptable failures = 5,000 requests
- Time equivalent = ~3.6 hours of complete outage

---

### 2. Permission Checks (99.9%)

**Service:** RBAC / Permission evaluation  
**SLI:** `(successful_checks / total_checks) * 100`  
**SLO Target:** ≥ 99.9%  
**Error Budget (Monthly):** 8.6 seconds of failures per month  
**Alert Threshold:** < 99.5% in rolling 30-minute window  

**Definition:**
- Successful: Permission evaluated correctly (allowed or denied)
- Failed: Permission check error, timeout, or exception
- Measured: Every permission evaluation on protected endpoints

**Critical Path:** All data access goes through permission checks. High reliability required.

---

### 3. Connector Sync (95%)

**Service:** Database/API connectors to external Systems of Record  
**SLI:** `(successful_syncs / total_syncs) * 100`  
**SLO Target:** ≥ 95%  
**Error Budget (Monthly):** 1.8 hours of failed syncs per month  
**Alert Threshold:** < 90% in rolling 6-hour window  

**Definition:**
- Successful: Data synced from SoR without errors
- Failed: Connection error, data parse error, timeout (>30s)
- Measured: Per connector, per sync cycle

**Note:** Syncs may be slow (ERP systems) or occasionally fail due to external system maintenance. 95% reflects production reality.

---

### 4. Rule Execution (99.0%)

**Service:** Workflow rule engine / autonomous decision engine  
**SLI:** `(successful_executions / total_executions) * 100`  
**SLO Target:** ≥ 99.0%  
**Error Budget (Monthly):** 43.2 minutes of failures per month  
**Alert Threshold:** < 98.5% in rolling 1-hour window  

**Definition:**
- Successful: Rule evaluated and action executed or decision made
- Failed: Rule evaluation error, action failed, or exception
- Measured: Every business rule execution

---

### 5. Dashboard Performance (p95 < 500ms)

**Service:** Real-time KPI dashboard refresh  
**SLI:** `(requests_under_500ms / total_requests) * 100`  
**SLO Target:** ≥ 98% of requests under 500ms  
**Error Budget:** 2 requests per 100 can exceed 500ms  
**Alert Threshold:** p95 > 1000ms in rolling 5-minute window  

**Definition:**
- Measured: Dashboard data refresh endpoint latency
- Includes: Database query + aggregation + response serialization
- P50 (median): < 200ms
- P95 (95th percentile): < 500ms
- P99 (99th percentile): < 1000ms

---

## Error Budget Tracking

### Monthly Error Budget Calculation

```
Error Budget = (1 - SLO_Percentage) × Total_Requests_Per_Month

Example (API Availability):
- SLO: 99.5%
- Total Requests/Month: 1,000,000
- Error Budget: (1 - 0.995) × 1,000,000 = 5,000 failing requests
- Time Equivalent: ~3.6 hours of 100% failure
```

### Budget Spent Percentage

```
Budget_Spent % = (Failed_Requests / Acceptable_Failures) × 100

- 0-50% Spent: Green (healthy)
- 51-80% Spent: Yellow (caution, plan fixes)
- 81-100% Spent: Red (critical, freeze non-essential deploys)
- >100% Spent: Breach (emergency response)
```

---

## SLI Measurement & Implementation

### API Availability

**Metrics to track:**
- `http_request_total` (Prometheus counter)
- `http_request_duration_seconds` (Prometheus histogram)
- Breakdown by: endpoint, method, status code

**Calculation Query (Prometheus):**
```promql
rate(http_requests_total{status=~"2.."}[1h])
/ on(job) group_left()
rate(http_requests_total[1h])
* 100
```

**Alert Rule:**
```yaml
alert: APIAvailabilityBreach
expr: (rate(http_requests_total{status=~"2.."}[1h]) / rate(http_requests_total[1h])) < 0.99
for: 5m
```

---

### Permission Check Reliability

**Metrics to track:**
- `permission_check_duration_ms` (Prometheus histogram)
- `permission_denial_total` (Prometheus counter)
- `permission_check_errors` (derived from logs)

**Breakdown by:**
- Permission type (read, write, delete, approve, etc.)
- Role (Owner, IT, Manager, Member)
- Service (identity, connectors, workflows)

---

### Connector Sync Reliability

**Metrics to track:**
- `connector_sync_duration_ms` (Prometheus histogram)
- `connector_error_total` (Prometheus counter)
- `connector_sync_status` (enum: success, timeout, parse_error, connection_error)

**Breakdown by:**
- Connector type (PostgreSQL, MySQL, SQL Server, REST, Salesforce, etc.)
- Organization
- Sync schedule (hourly, daily, weekly)

---

### Rule Execution Reliability

**Metrics to track:**
- `rule_execution_duration_ms` (Prometheus histogram)
- `rule_failure_total` (Prometheus counter)
- `rule_execution_status` (enum: success, failed, deferred)

**Breakdown by:**
- Autonomy level (1=Deterministic, 2=AI-Assisted, 3=Scheduled)
- Rule type (approval, automation, report)
- Organization

---

### Dashboard Performance

**Metrics to track:**
- `dashboard_refresh_duration_ms` (Prometheus histogram)
- `dashboard_request_total` (Prometheus counter)

**Percentiles to monitor:**
- P50 (median): < 200ms
- P95 (95th percentile): < 500ms
- P99 (99th percentile): < 1000ms

---

## SLO Compliance & Incident Response

### Status Indicators

| Budget Spent | Status | Action |
|-------------|--------|--------|
| 0-50% | 🟢 Healthy | Continue normal operations |
| 51-80% | 🟡 Caution | Start investigating root causes, plan fixes |
| 81-100% | 🔴 Critical | Freeze non-critical deployments, emergency fixes only |
| > 100% | 🔴🔴 Breach | War room, executive notification, full incident response |

### Incident Response SOP

**Trigger:** SLI drops below (SLO - 1%) for 5+ consecutive minutes

**1. Immediate Response (0-5 min)**
- Page on-call engineer via PagerDuty
- Create incident in #incidents Slack channel
- Start war room (Zoom)
- Note: Incident includes affected service, current SLI, time started

**2. Investigation (5-15 min)**
- Check Jaeger traces for errors
- Review Prometheus dashboards (latency, error rate)
- Search Kibana for logs related to error pattern
- Check recent deployments (could be root cause)
- Contact SoR teams if connector sync failing

**3. Mitigation (15-30 min)**
- If recent deploy: rollback or hotfix
- If database issue: failover or query optimization
- If external SoR unavailable: graceful degradation
- If cache issue: clear caches or increase TTL
- Target: restore SLI above 99% of SLO within 15 min

**4. Resolution (30 min - 2 hours)**
- Full root cause analysis
- Implement permanent fix
- Deploy fix with verification
- Confirm SLI stable at > 99% of SLO for 30 min

**5. Post-Incident (within 24 hours)**
- Document incident in postmortem (template: `docs/44_Incident_Postmortem_Template.md`)
- Identify systemic issues (could this have been prevented?)
- Prioritize follow-up fixes in the build queue
- Share findings in team sync / engineering meeting

---

## Error Budget Policies

### Deployment Freeze

**Trigger:** Error budget spent ≥ 90% with ≥ 10 days remaining in month

**Duration:** Until SLI improves to < 50% budget spent

**Exceptions:**
- Critical security patches (on-call approval)
- Fixes that directly improve the failing SLI
- Infrastructure changes required for recovery

**Reasoning:** Prevent cascading failures. Reduce blast radius. Focus on reliability.

### Monthly Budget Review

**Schedule:** Last Friday of every month (14:00 UTC)

**Participants:** Engineering lead, on-call rotation, product owner

**Agenda:**
1. Review SLI performance vs SLO for all services
2. Identify services with low budgets (< 20% remaining)
3. Discuss root causes of high error rates
4. Plan improvements for next month
5. Update build queue with reliability work

**Output:** Minutes + action items (assigned, due date)

---

## SLO Targets Rationale

### API Availability (99.5%) — Why not 99.9%?

- **Modern SaaS average:** 99.9% (4.4 hours downtime/month)
- **Our target:** 99.5% (3.6 hours downtime/month)
- **Rationale:** 
  - Early-stage product (not yet multi-region, single cloud provider)
  - Acceptable for enterprise B2B (not 24/7 e-commerce critical)
  - Encourages sustainable on-call (not pager-driven to exhaustion)
  - Still > 99% for uptime-sensitive customers
  - Upgrade to 99.9% once multi-region active/active deployed

### Permission Checks (99.9%) — Why stricter than API?

- **Why:** Every request goes through permission evaluation
- **Rationale:** Single point of failure for all data access
- **Risk:** Permission check failure = data leak + audit failure
- **Recovery:** Usually fast (in-memory, no I/O)

### Connector Sync (95%) — Why lower?

- **Why:** Connectors depend on external Systems of Record
- **Rationale:** 
  - ERP/CRM systems have their own reliability (not ours to control)
  - Network connectivity is variable
  - Sync can be slow (query entire enterprise database)
  - Partial failures are acceptable (sync tomorrow)
- **Acceptable:** If an org's HR system is down, our sync fails — that's OK

### Rule Execution (99.0%) — Between API and Sync

- **Why:** Mix of internal (rule engine) and external (action execution)
- **Rationale:** 
  - Rule evaluation is reliable (in-memory)
  - Action execution may fail (webhook, email, database)
  - Failures should be rare but acceptable
  - Retry logic reduces error rate

### Dashboard Refresh (p95 < 500ms) — Latency vs availability

- **Why:** Not a yes/no (available/unavailable), but a performance SLI
- **Rationale:**
  - Slow dashboard = poor UX, users give up
  - 500ms is perceptible threshold
  - p95 = 95% of refreshes should be snappy
  - Allows for occasional slow queries

---

## Dashboard & Alerts

### Grafana Dashboard: SLO Overview

- **Panels:**
  1. SLI for each service (gauge: green/yellow/red vs SLO)
  2. Error budget spent % (trend line: green/yellow/red zones)
  3. Time remaining in month (progress bar)
  4. Burn-down chart: budget used vs days elapsed
  5. Alert list: recent SLO breaches

### Alert Rules (Prometheus)

**API Availability:**
```yaml
- alert: APIAvailabilityBreach
  expr: (rate(http_requests_total{status=~"2.."}[1h]) / on(job) group_left() rate(http_requests_total[1h])) < 0.99
  for: 5m
  annotations:
    summary: "API availability below 99% threshold"
    runbook: "docs/45_Incident_Runbook_API_Availability.md"
```

**Permission Check Latency:**
```yaml
- alert: PermissionCheckLatency
  expr: histogram_quantile(0.95, permission_check_duration_ms) > 50
  for: 5m
  annotations:
    summary: "Permission check p95 latency exceeds 50ms"
    runbook: "docs/45_Incident_Runbook_Permission_Checks.md"
```

**Connector Sync Failure:**
```yaml
- alert: ConnectorSyncFailure
  expr: rate(connector_error_total[6h]) > 0.05
  for: 30m
  annotations:
    summary: "Connector sync failure rate > 5% in 6 hours"
    runbook: "docs/45_Incident_Runbook_Connectors.md"
```

---

## References

- [CNCF SLO Guidance](https://sre.google/sre-book/service-level-objectives/)
- [Google Cloud SLI/SLO Best Practices](https://cloud.google.com/architecture/defining-SLOs)
- Prometheus documentation: `docs/40_Observability_Setup.md`
- Incident response: `docs/43_SLO_Incident_Response.md`

---

**Status:** ✅ Complete. Reference docs for SLO/SLI implementation.
