# Implementation Plan: Ellines EIP 2.0

## Overview

EIP 2.0 builds on the verified P0–P3 foundation (Identity, Auth, Platform Control Plane, God Mode
Safeguards) to deliver three capability pillars: **Superior AI** (multi-model orchestration,
knowledge graph, federated learning), **Autonomous Self-Healing** (detect → remediate → learn),
and **Futuristic Dashboards** (role-adaptive, real-time). A fourth cross-cutting pillar,
**Universal Operations**, covers multi-format document generation, resilient connections,
email intelligence, fleet tracking, and cross-system search.

Build order follows dependency depth: data-layer first, then intelligence services, then API
surface, then UI. Each group ends with a checkpoint. Tenant isolation (`organization_id` filter)
and credential encryption are enforced at every persistence boundary.

Task 1.1 (data layer infrastructure — Neo4j, InfluxDB, Redis, ten Prisma v2.0 models) was
completed on 2026-08-08 and is recorded in `TASK_1.1_COMPLETION_SUMMARY.md`. Tasks below start
from 1.2.

---

## Tasks

- [ ] 1. Data layer foundation (services)
  - [ ] 1.2 Create shared database-client services for Neo4j, InfluxDB, and Redis
    - Create `services/identity/src/database/neo4j.service.ts` — NestJS injectable wrapping
      `neo4j-driver`; exposes `runQuery(cypher, params, db?)`, `runTransaction(fn)`, and a
      graceful `onModuleDestroy` close. Mandatory `organization_id` property filter on every
      tenant read/write (tenant isolation).
    - Create `services/identity/src/database/influxdb.service.ts` — wraps `@influxdata/influxdb-client`;
      exposes `writePoint(measurement, tags, fields)` and `queryRows(fluxQuery)`. Add `org_id` tag to
      every write for isolation.
    - Create `services/identity/src/database/redis.service.ts` — wraps `ioredis`; exposes
      `get`, `set`, `del`, `setex`, `lpush`, `lrange`, `publish`, `subscribe`. Key-namespace
      pattern: `eip:{orgId}:{domain}:{key}`.
    - Register all three services in `services/identity/src/database/database.module.ts` and
      export them for consumption by feature modules.
    - _Requirements: 21.3, 21.4_

  - [ ]* 1.3 Write integration tests for database services
    - Test Neo4j round-trip: create node → query node → verify `organization_id` filter blocks
      cross-tenant reads.
    - Test InfluxDB write and immediate query.
    - Test Redis set/get/expire and pub/sub.
    - _Requirements: 21.3_

- [ ] 2. Model Orchestrator — Ellinea AI core
  - [ ] 2.1 Create AI model registry service and schema
    - Add `AiModelRegistry` and `ModelDecisionLog` Prisma models to
      `services/identity/prisma/schema.prisma` if not already present (verify against Task 1.1
      schema; add only missing columns/indexes).
    - Implement `services/identity/src/ellinea/model-registry.service.ts`:
      `registerModel(dto)`, `getModels(capability)`, `recordDecision(log)`,
      `getMetrics(modelId, window)`. All queries scoped to `platform` (no org filter — global
      registry).
    - _Requirements: 1.1, 1.4, 1.8_

  - [ ] 2.2 Implement query classifier and model router
    - Create `services/identity/src/ellinea/query-classifier.service.ts` — classifies a query
      string into `QueryType` (`language | forecast | anomaly | vision | reasoning`) using
      keyword heuristics + pattern matching; returns `ModelCapability[]`.
    - Create `services/identity/src/ellinea/model-router.service.ts` — given
      `ModelCapability[]`, selects primary, secondary, and fallback models from the registry
      weighted by accuracy × (1 / latency); returns `ModelRouting`.
    - Deterministic: same query classification + same performance metrics → same routing
      (Property 1).
    - _Requirements: 1.2, 1.5, 1.7_

  - [ ]* 2.3 Write property test for model routing consistency
    - **Property 1: Model routing consistency**
    - **Validates: Requirements 1.2**
    - Test: for any `QueryType`, fix performance metrics and assert `modelRouter.select()` always
      returns the same primary model id.

  - [ ] 2.4 Implement ensemble result combiner
    - Create `services/identity/src/ellinea/ensemble-combiner.service.ts`.
    - Implements weighted voting: each model result is weighted by its registry accuracy score;
      final confidence = weighted average.
    - Combined confidence must be within `[min(individual), max(individual)]` (Property 2).
    - Conflict resolution: when top-2 models disagree by > 20% confidence, apply meta-learning
      (majority vote by count); log the conflict.
    - Returns `UnifiedResult` with `explanation`, `sources[]`, and `modelDecisions[]`.
    - _Requirements: 1.3, 1.7_

  - [ ]* 2.5 Write property test for ensemble confidence bounds
    - **Property 2: Ensemble result confidence**
    - **Validates: Requirements 1.3**
    - Generate random arrays of model confidence floats; assert combined score is always between
      min and max of the inputs.

  - [ ] 2.6 Wire model orchestrator endpoint into Pages Functions
    - Extend `apps/web/functions/api/v1/ellinea/ask.ts` to call the model orchestrator service
      (via internal API call to identity if needed, or extract logic into a shared module).
    - Gate on `ellinea:ask` permission (already exists); enforce rate limit (already exists).
    - Return `UnifiedResult` shape; include `modelDecisions` array in response for audit.
    - _Requirements: 1.2, 1.6, 1.8_

  - [ ] 2.7 Checkpoint — builds and model orchestrator tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Knowledge Graph Engine
  - [ ] 3.1 Implement entity extraction service
    - Create `services/identity/src/knowledge-graph/entity-extractor.service.ts`.
    - For each connected `ConnectorInstallation` data window (from `EnterpriseSnapshot`/`UEM`),
      extract entities of type `Person | Product | Location | Event | Document` using
      structured field mapping + NLP keyword detection.
    - Write extracted entities to Neo4j using `Neo4jService`; include `organization_id` property
      on every node (tenant isolation).
    - Upsert into `KnowledgeGraphEntity` PostgreSQL metadata table: `neo4jNodeId`, `sourceSystem`,
      `confidence`, `syncStatus`.
    - _Requirements: 17.1_

  - [ ] 3.2 Implement relationship discovery service
    - Create `services/identity/src/knowledge-graph/relationship-discoverer.service.ts`.
    - Infer relationships from co-occurrence in the same record, explicit FK fields in SoR data,
      and temporal proximity (events within same time window as entity activity).
    - Write `Relationship` nodes to Neo4j with `confidence`, `evidence[]`, `isInferred` flag.
    - Persist metadata to `KnowledgeGraphRelationship` Prisma model.
    - Multi-hop path validity enforced: every relationship in a traversal path must have
      `confidence >= 0.4` (Property 3).
    - _Requirements: 17.2_

  - [ ]* 3.3 Write property test for multi-hop path validity
    - **Property 3: Multi-hop path validity**
    - **Validates: Requirements 2.2**
    - Build a small in-memory graph with deliberately low-confidence edges; assert that
      `reasoningEngine.traversePath()` never returns a path containing a sub-threshold edge.

  - [ ] 3.4 Implement entity resolution (deduplication)
    - Create `services/identity/src/knowledge-graph/entity-resolver.service.ts`.
    - Similarity algorithm: Levenshtein for names + exact match on `sourceEntityId`; threshold
      configurable, default 0.85.
    - On match: merge lower-confidence node into higher-confidence node; update all relationships
      to point to the surviving node; mark merged node `syncStatus = 'merged'`.
    - Persist conflict to `KnowledgeGraphEntity` `mergedIntoId` field.
    - _Requirements: 17.4_

  - [ ] 3.5 Implement graph query and subgraph visualisation endpoint
    - Create NestJS controller `KnowledgeGraphController` at
      `services/identity/src/knowledge-graph/` with routes:
      - `GET /knowledge-graph/entities` — list entities for org with optional type filter.
      - `POST /knowledge-graph/query` — accepts `GraphQuery` (startNode, maxDepth, filters);
        returns `GraphResult` (nodes + edges).
      - `GET /knowledge-graph/subgraph?entityId=&depth=` — returns `GraphVisualization` JSON for
        the UI graph renderer.
    - Every query adds `WHERE n.organization_id = $orgId` (tenant isolation).
    - Real-time update: `updateGraph(updates[])` called by connector sync job after each data
      window ingest.
    - _Requirements: 17.3, 17.6, 17.7, 17.8_

  - [ ] 3.6 Checkpoint — knowledge graph round-trip verified against local DB
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Advanced Reasoning Engine
  - [ ] 4.1 Implement multi-hop reasoning service
    - Create `services/identity/src/ellinea/reasoning-engine.service.ts`.
    - `multiHopReasoning(question, maxHops=3)` — traverses knowledge graph up to `maxHops`
      levels, accumulating `ReasoningStep[]` at each hop.
    - `buildEvidenceChain(conclusion)` — every conclusion must have ≥ 1 evidence item per
      reasoning step (Property 4).
    - `identifyCausalLinks(events[])` — temporal analysis: if event B consistently follows
      event A within a configurable window, emit `CausalChain` with `confidence`.
    - Returns `ReasoningResult` with `knowledgeGaps[]` when traversal is blocked.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.8_

  - [ ]* 4.2 Write property test for evidence chain completeness
    - **Property 4: Evidence chain completeness**
    - **Validates: Requirements 2.6**
    - For a set of multi-step reasoning results, assert that no conclusion exists without at
      least one evidence item per step in its chain.

  - [ ] 4.3 Implement pattern detection across systems
    - Extend `ReasoningEngine` with `detectPatterns(dataSources[])`.
    - Cross-system pattern: correlate data from ≥ 3 different `sourceSystem` values; flag patterns
      where a KPI drops in system A and a related entity in system B also degrades within the same
      time window.
    - Persist detected patterns to `EnterpriseSnapshot.insights` (JSON array) for surfacing on
      dashboards.
    - _Requirements: 2.4, 2.5_

  - [ ] 4.4 Implement hypothesis generation and testing
    - `generateHypotheses(observation)` — produce 2–5 candidate explanations ranked by
      `confidence`; each references `evidence[]` from graph + snapshot.
    - `testHypothesis(h)` — query historical `EnterpriseSnapshot` records to validate or refute;
      update `confidence` accordingly.
    - Expose via `POST /ellinea/reason` Pages Function (gated on `ellinea:ask`).
    - _Requirements: 2.5, 2.6, 2.7_

- [ ] 5. Self-Healing System
  - [ ] 5.1 Implement Self-Healing Detector
    - Create `services/identity/src/self-healing/detector.service.ts`.
    - Subscribe to application-level error events from NestJS global exception filter (extend
      `services/identity/src/common/` exception filter to emit events).
    - Monitor: API error rate (from `ModelPerformanceLog`), connector sync failure counts (from
      `ConnectorInstallation.lastSyncStatus`), and DB health probe results.
    - `detectErrorPattern(logs[])` — sliding 5-minute window; group by error code; emit
      `ErrorCluster` when same error appears ≥ 3 times.
    - `classifyError(error)` → `ErrorClassification` with severity + `isRootCause` (root if it
      precedes ≥ 2 symptom errors within the window).
    - `createIncident(cluster)` — persist to `RemediationExecution` with `status = 'open'`.
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.8_

  - [ ] 5.2 Implement Self-Healing Remediator
    - Create `services/identity/src/self-healing/remediator.service.ts`.
    - `lookupStrategy(errorPattern)` — query `RemediationPlaybook` table; fallback to
      `manual_review` if no entry.
    - `remediate(incident)` — only execute auto-remediation when `incident.confidence >= 0.85`
      (Property 6); otherwise set status to `awaiting_human`.
    - Stage execution: attempt Stage 1 (lightweight: cache clear, rate-limit bump); if unhealthy
      after 60 s, Stage 2 (pool reset); if still unhealthy, Stage 3 (service restart via
      health-check endpoint). After 3 failures, escalate.
    - `executeAction(action)` maps `RemediationAction.type` to concrete operations:
      - `cache_clear` → call `RedisService.del(pattern)`.
      - `pool_reset` → call Prisma `$disconnect()` + `$connect()`.
      - `rollback` → revert the last `FeatureFlag` or `RemediationPlaybook` change.
    - `verifySuccess(incident, 300_000)` — poll incident error rate for 5 minutes after action;
      record `beforeSnapshot` / `afterSnapshot` in `RemediationExecution`.
    - `escalate(incident, attempts[])` — write an `AuditLog` row and set `status = 'escalated'`.
    - Idempotency enforced: applying the same action twice to the same system state produces the
      same outcome (Property 5).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 5.3 Write property test for confidence threshold enforcement
    - **Property 6: Confidence threshold enforcement**
    - **Validates: Requirements 5.2**
    - Generate incidents with varied confidence scores; assert that `remediator.remediate()` only
      calls `executeAction` when confidence ≥ 0.85.

  - [ ]* 5.4 Write property test for remediation idempotency
    - **Property 5: Remediation idempotency**
    - **Validates: Requirements 5.3**
    - For each `RemediationAction` type, apply it twice to a captured state snapshot and assert
      the resulting state is identical after both applications.

  - [ ] 5.5 Implement Self-Healing Learner
    - Create `services/identity/src/self-healing/learner.service.ts`.
    - `recordOutcome(result)` — append to `RemediationExecution`; update
      `RemediationPlaybook.historicalSuccessRate` using rolling average.
    - `analyzeSuccesses(timeRange)` — query executions where `outcome = 'success'`; extract
      common action sequences; create new `RemediationPlaybook` entries marked
      `requiresApproval = true` (pending Platform Super Admin review per Req 6.8).
    - `learnFromManualFix(incident, fix)` — called by `POST /api/v1/platform/self-healing/learn`
      (admin-only); generates a new `NewStrategy`; persists with `requiresApproval = true`.
    - `adjustThresholds(strategy)` — raise/lower `RemediationPlaybook.confidenceThreshold` based
      on 7-day success rate (raise by 0.02 if success > 90%, lower by 0.02 if success < 60%).
    - `recommendImprovements()` — group recurring `ErrorCluster` patterns; return
      `Recommendation[]` for surfacing on the Super Admin AI panel.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8_

  - [ ] 5.6 Checkpoint — self-healing pipeline verified end-to-end against local DB
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Predictive Analytics Engine
  - [ ] 6.1 Implement forecasting service
    - Create `services/identity/src/analytics/predictive-analytics.service.ts`.
    - `forecast(metric, horizon=30)` — read time-series data from InfluxDB (via
      `InfluxDbService`); apply exponential smoothing (ETS) for a 30-day forward projection;
      compute 80% and 95% confidence intervals.
    - Confidence interval bounds must be in `[0, 100]` for percentage metrics and `[0, ∞)` for
      absolute metrics (Property 9); clamp after calculation.
    - `generateScenarios(context)` — produce best-case, worst-case, most-likely projections;
      probabilities must sum to exactly 1.0 (Property 10).
    - `detectWarnings(domain)` — threshold-based early warning: flag when forecast crosses a
      predefined alert threshold within the horizon window.
    - `trackAccuracy(forecastId)` — compare previous forecasts against actuals; write accuracy
      deltas to InfluxDB `forecast_accuracy` measurement.
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [ ]* 6.2 Write property test for forecast confidence bounds
    - **Property 9: Forecast confidence bounds**
    - **Validates: Requirements 11.1**
    - For any generated `ForecastPoint`, assert confidence interval lower and upper bounds are
      within 0–100% inclusive (for percentage metrics).

  - [ ]* 6.3 Write property test for scenario probability sum
    - **Property 10: Scenario probability sum**
    - **Validates: Requirements 11.7**
    - Assert that for any `Scenario[]` returned by `generateScenarios`, the sum of
      `scenario.probability` equals exactly 1.0 (within floating-point epsilon).

  - [ ] 6.4 Implement leading indicator identification
    - `identifyLeadingIndicators(targetMetric)` — cross-correlate all available InfluxDB
      measurements against `targetMetric` with lags of 1–14 days; return `Indicator[]` sorted
      by correlation strength.
    - Persist top-5 indicators per metric to `SystemHealthMetric.alertThresholds` JSON field
      for alert rules.
    - _Requirements: 11.2_

  - [ ] 6.5 Expose predictive analytics API and integrate with dashboard service
    - Add `GET /api/v1/orgs/:slug/analytics/forecast?metric=&horizon=` Pages Function; gated on
      `owner` or `admin` role; includes org isolation filter.
    - Add `GET /api/v1/orgs/:slug/analytics/scenarios` Pages Function.
    - Update `services/identity/src/dashboards/dashboard.service.ts` to call
      `PredictiveAnalyticsService.forecast()` when a dashboard widget has
      `type = 'forecast'`.
    - _Requirements: 11.1, 7.5, 9.4_

- [ ] 7. Alert Correlation Engine
  - [ ] 7.1 Implement alert correlation service
    - Create `services/identity/src/alerts/alert-correlation.service.ts`.
    - `correlateAlerts(alerts[])` — group alerts arriving within a 5-minute window by shared
      component, user, or connector; produce `AlertCluster[]`. All alerts in a cluster must fall
      within the configured time window (Property 7).
    - `identifyRootCause(cluster)` — the first alert in temporal order that precedes at least
      two others is the root cause; each cluster must have exactly one root cause (Property 8).
    - `suppressDuplicates(alerts[])` — deduplicate by `(source, errorCode, resourceId)` within
      the window; return only unique alerts.
    - `detectStorm(alerts, timeWindow=60_000)` — if count > 10 in window, create a summary
      incident with `action = 'create_incident'`.
    - `calculateUrgency(alert)` — score = `(businessImpact × 40) + (affectedUsers × 40) +
      (dependencyDepth × 20)`; clamp to 0–100.
    - Persist `AlertCluster` to `AuditLog` with `action = 'alert.cluster.created'`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7_

  - [ ]* 7.2 Write property test for alert cluster time window
    - **Property 7: Alert cluster consistency**
    - **Validates: Requirements 12.1**
    - Generate alerts with varying timestamps; assert no cluster contains an alert whose
      timestamp falls outside the configured 5-minute window from the cluster's first alert.

  - [ ]* 7.3 Write property test for root cause uniqueness
    - **Property 8: Root cause uniqueness**
    - **Validates: Requirements 12.2**
    - For any `AlertCluster` with ≥ 2 alerts, assert `cluster.rootCause !== null` and that
      exactly one alert in `cluster.alerts` is marked as root cause.

  - [ ] 7.4 Wire alert correlation into self-healing detector and dashboard
    - Call `AlertCorrelationService.correlateAlerts()` from `SelfHealingDetector` after grouping
      errors, so that alert-driven incidents use correlated root causes.
    - Surface `AlertCluster[]` in the `GET /api/v1/orgs/:slug/alerts` Pages Function response
      (add `clusters` field to existing alerts endpoint or create new route).
    - _Requirements: 12.6, 12.8_

  - [ ] 7.5 Checkpoint — alert correlation and predictive analytics pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Federated Learning Coordinator
  - [ ] 8.1 Implement federated learning coordinator service
    - Create `services/identity/src/ellinea/federated-learning.service.ts`.
    - `startTrainingRound(config)` — create `FederatedLearningRound` row; fan out to
      participating orgs (those with `optInFederated = true` in org settings).
    - `collectUpdates(roundId)` — aggregate `FederatedLearningParticipant` rows submitted within
      the round window.
    - `applyPrivacy(updates[])` — add Gaussian noise calibrated to `privacyBudget` (epsilon);
      strip org-identifying metadata; return `PrivateUpdate[]`.
    - `detectPoisoning(updates[])` — compute cosine similarity of each gradient vector against
      the current global gradient; exclude updates whose similarity is below the 10th percentile.
    - `aggregateUpdates(updates[])` — federated averaging (FedAvg): weighted sum by
      `datasetSize`; persist new global model version to `AiModelRegistry`.
    - `generateReport(roundId)` — return `TransparencyReport` with participant count,
      `patternsLearned[]`, `privacyBudgetUsed`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 8.2 Add federated learning admin API
    - `GET /api/v1/platform/federated-learning/rounds` — Super Admin only; list rounds.
    - `POST /api/v1/platform/federated-learning/rounds` — start new round.
    - `GET /api/v1/platform/federated-learning/rounds/:id/report` — transparency report.
    - `PATCH /api/v1/orgs/:slug/settings/federated` — org opt-in/out; restricted to `owner` role.
    - Safeguard: org opt-out immediately removes that org from the current open round if one
      exists.
    - _Requirements: 3.4, 3.5, 3.8_

- [ ] 9. Autonomous Workflow Agent Framework
  - [ ] 9.1 Extend autonomous agent service with confidence-gated execution
    - `services/identity/src/agents/agents.service.ts` already exists with a basic condition
      evaluator and confidence scorer. Extend it:
    - Add `executeWithGuardrail(agent, context)` — only invoke agent action autonomously when
      `score.score >= 0.90` (Property 13); otherwise enqueue an `ApprovalRequest`.
    - Add `coordinateAgents(orgId, resourceId)` — query `EllineaAgent[]` for the org; detect
      conflicting actions on the same `resourceId` within a 60-second window (Property 14);
      return `ConflictResult` if a conflict exists; block the newer agent's execution.
    - All autonomous actions must produce a decision log entry in `ModelDecisionLog`.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [ ]* 9.2 Write property test for agent confidence threshold
    - **Property 13: Confidence threshold enforcement (agents)**
    - **Validates: Requirements 14.3, 14.4**
    - Generate agent contexts with varying confidence scores; assert that `executeWithGuardrail`
      only calls `executeAction` when score ≥ 0.90.

  - [ ]* 9.3 Write property test for agent coordination
    - **Property 14: Agent coordination**
    - **Validates: Requirements 14.6**
    - Create two agents that both target the same `resourceId`; assert that `coordinateAgents`
      returns a conflict and the second agent is blocked from executing.

  - [ ] 9.4 Implement agent policy configuration endpoint
    - `PATCH /api/v1/orgs/:slug/agents/:id/policy` — `owner` role only; accepts
      `{ allowedActions[], decisionThreshold, escalationRuleId }`.
    - Validate `decisionThreshold` is between 0 and 1.
    - _Requirements: 14.8_

  - [ ] 9.5 Checkpoint — agent framework tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Advanced Security Anomaly Detection
  - [ ] 10.1 Implement behaviour baseline service
    - Create `services/identity/src/security/behaviour-baseline.service.ts`.
    - On each authenticated request (NestJS middleware), record `(userId, orgId, endpoint,
      ip, timestamp)` to `SystemHealthMetric` in InfluxDB measurement `user_behaviour`.
    - `buildBaseline(userId, windowDays=14)` — compute: typical request hours, typical IPs,
      typical endpoints from InfluxDB.
    - Store baseline as a Redis hash `eip:{orgId}:behaviour:{userId}` with 24-hour TTL; refresh
      nightly via a scheduled NestJS `Cron` job.
    - _Requirements: 15.1, 15.7_

  - [ ] 10.2 Implement anomaly detection rules
    - Create `services/identity/src/security/anomaly-detector.service.ts`.
    - `detectImpossibleTravel(sessions)` — consecutive sessions from geographically distant IPs
      within under 2 hours; use IP-to-country approximation via IP range table.
    - `detectConcurrentSessions(orgId, userId)` — query `Session` table for active sessions > 1
      for same user; flag if from different IPs.
    - `detectLargeExport(orgId, userId, threshold=10_000)` — count rows exported in the last
      hour from `AuditLog` rows where `action LIKE 'export.%'`; flag if over threshold.
    - `detectPrivilegeEscalation(orgId, userId)` — check `RoleAuditLog` for permission grants
      performed by the user themselves (not by an admin).
    - On high-confidence detection: call `Self-Healing Remediator` with
      `type = 'rate_limit'` (soft block) or create an `AuditLog` security incident.
    - Write all anomalies to InfluxDB `security_events` measurement with `org_id` tag.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ] 10.3 Implement security policy configuration endpoint
    - `PATCH /api/v1/orgs/:slug/security-policy` — `admin` role; accepts
      `{ anomalySensitivity, autoRemediationActions[], notificationRuleId }`.
    - Validate `anomalySensitivity` in range `['low', 'medium', 'high']`.
    - _Requirements: 15.8_

- [ ] 11. Context-Aware Personalisation Engine
  - Context profile + preference-learner services already exist in
    `services/identity/src/personalization/`. Tasks below extend them for v2.0 requirements.

  - [ ] 11.1 Extend user context profiler with federated role-similarity learning
    - Open `services/identity/src/personalization/user-context-profiler.service.ts`.
    - Add `buildProfile(userId, orgId)` method if absent; ensure it reads `UserContextProfile`
      and `InteractionLog` with mandatory `organization_id` filter.
    - Add `applyCrossRoleLearning(roleType)` — aggregate interaction patterns from users with
      the same `UserRole` within the org (not cross-org); update `preferenceWeights` in
      `UserContextProfile`.
    - _Requirements: 19.1, 19.2, 19.8_

  - [ ] 11.2 Implement context-aware shortcut suggestion endpoint
    - `GET /api/v1/orgs/:slug/me/shortcuts` — calls
      `ContextAwareShortcutSuggester.suggest(userId, context)` and returns top-5 shortcuts.
    - `POST /api/v1/orgs/:slug/me/preferences` — accepts explicit user preference overrides; these
      must take precedence over learned behaviour per Req 19.7.
    - _Requirements: 19.3, 19.4, 19.5, 19.6, 19.7_

- [ ] 12. Advanced Data Quality Service
  - Data quality Prisma models (`DataQualityScore`, `DataQualityIssue`, `QuarantinedData`,
    `CleansingRule`) were added in Task 1.1. Tasks below implement the service logic.

  - [ ] 12.1 Implement data quality assessment service
    - Create `services/identity/src/data-quality/data-quality.service.ts`.
    - `assessQuality(orgId, connectorId)` — compute five dimension scores (completeness,
      accuracy, consistency, timeliness, validity) over the latest `EnterpriseSnapshot` data.
    - `computeScore(dimensions)` — weighted average; persist to `DataQualityScore`; score must
      be within `[0, 100]` (Property 15).
    - `detectIssues(orgId)` — scan for: null rate > 10% (completeness), duplicate rows, format
      pattern mismatch, referential integrity gaps. Persist to `DataQualityIssue`.
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ]* 12.2 Write property test for data quality score bounds
    - **Property 15: Data quality score bounds**
    - **Validates: Requirements 18.2**
    - Generate random dimension score inputs; assert `computeScore()` always returns a value in
      `[0, 100]`.

  - [ ] 12.3 Implement quarantine and auto-remediation
    - `quarantine(orgId, recordId, reason)` — write to `QuarantinedData`; set
      `propagationBlocked = true`; quarantined data must never appear in downstream queries or
      API responses (Property 16).
    - `attemptCleansing(issue)` — apply matching `CleansingRule` (regex replace, trim, default
      fill); if cleansing succeeds, remove from `DataQualityIssue`; otherwise notify IT Admin.
    - `notifyAdmin(orgId, issue)` — create an `ApprovalRequest` of type `data_quality_review`
      for the IT Admin.
    - _Requirements: 18.4, 18.5, 18.6_

  - [ ]* 12.4 Write property test for quarantine isolation
    - **Property 16: Quarantine isolation**
    - **Validates: Requirements 18.5**
    - Insert quarantined records; call all read endpoints scoped to that org; assert no
      quarantined record appears in any response.

  - [ ] 12.5 Surface data quality on IT Admin dashboard
    - Add `GET /api/v1/orgs/:slug/data-quality/summary` Pages Function returning the latest
      `DataQualityScore` per connector + issue count.
    - _Requirements: 18.7, 18.8_

  - [ ] 12.6 Checkpoint — data quality service and quarantine tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Universal Operations — Document Generation
  - [ ] 13.1 Implement document generation service backend
    - Create `services/identity/src/documents/document-generation.service.ts`.
    - `generateExcel(config, orgId)` — use `exceljs`; build worksheets from `DataSourceQuery`;
      apply org branding (logo, colours from `Organization.settings`); return `Buffer`.
    - `generatePDF(config, orgId)` — use `pdfkit`; layout page with header/footer, embedded SVG
      charts (pass chart data as SVG string), corporate font.
    - `generateWord(config, orgId)` — use `docx` (official npm package); insert tables and
      images; apply styles from template.
    - `generatePowerPoint(config, orgId)` — use `pptxgenjs`; slide template + charts +
      speaker notes.
    - `applyBranding(doc, orgId)` — look up org `settings.branding` JSON; inject logo, primary
      colour, font; fallback to EIP defaults.
    - Tenant isolation: `DataSourceQuery` must include `organization_id` in every DB call.
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6_

  - [ ] 13.2 Implement document delivery service
    - `deliverDocument(doc, delivery)` — routes to:
      - `email`: call `sendOutboundEmail` from `apps/web/functions/shared/mail.ts` with
        attachment.
      - `download`: store in `Document` Prisma model, return a signed download URL (JWT with
        1-hour expiry + `organization_id` in payload).
      - `webhook`: POST to the configured `ApprovalRequest` callback URL with HMAC signature.
    - Store all generated documents in `Document` model with `orgId`, `generatedBy`, `format`,
      `expiresAt`.
    - _Requirements: 27.7, 27.8_

  - [ ] 13.3 Expose document generation API
    - `POST /api/v1/orgs/:slug/documents/generate` — accepts `{ format, config, delivery }`;
      gated on `owner` or `admin` role; enqueues async job.
    - `GET /api/v1/orgs/:slug/documents` — lists generated documents for the org.
    - `GET /api/v1/orgs/:slug/documents/:id/download` — validates JWT; streams document.
    - All three must include `organization_id` filter.
    - _Requirements: 26.1, 26.2, 27.7, 27.8_

  - [ ] 13.4 Integrate document generation with Ellinea Ask
    - In `ask.ts`, detect when the user requests a document (keywords: "generate", "report",
      "Excel", "PDF", "download") and route to `DocumentGenerationService` via internal API.
    - Return a `download_url` in the Ellinea response alongside the narrative explanation.
    - _Requirements: 26.2, 26.3_

- [ ] 14. Universal Operations — Email Intelligence
  - [ ] 14.1 Implement email intelligence service
    - Create `services/identity/src/email/email-intelligence.service.ts`.
    - `connectAccount(credentials, orgId)` — support `gmail` OAuth2 and `app_password`;
      store encrypted `accessToken` / `appPassword` using `encrypt()` from
      `packages/shared/src/encryption.ts`; persist to `ConnectorInstallation` with
      `connectorType = 'email'`.
    - `summarizeUnread(accountId, orgId, filters?)` — fetch IMAP/Gmail API unread messages;
      classify by urgency using keyword detection (`urgent`, `asap`, `overdue`, etc.); return
      `EmailSummary` with `urgent[]`, `actionRequired[]`, `information[]` lists.
    - `categorizeEmails(emails[])` — rule-based + heuristic classification into
      `customerInquiry | vendorCommunication | internalUpdate | spam | newsletter | other`.
    - `extractActions(email)` — scan body for task verbs (request, approve, confirm, send);
      return `ActionItem[]`; optionally call `ApprovalRequest` creation API.
    - `draftResponse(email, context)` — prompt Ellinea AI (via model orchestrator) with org DNA
      + email thread; return draft text for human review.
    - `trackThread(threadId)` — aggregate message chain; extract `keyPoints[]`,
      `decisionsMade[]`, `pendingActions[]`.
    - Integrate with Knowledge Graph: link sender/recipient Person entities to the thread.
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8, 26.4_

  - [ ] 14.2 Expose email intelligence API
    - `POST /api/v1/orgs/:slug/email/connect` — connect email account.
    - `GET /api/v1/orgs/:slug/email/summary` — summarise unread.
    - `GET /api/v1/orgs/:slug/email/threads/:threadId` — thread summary.
    - `POST /api/v1/orgs/:slug/email/actions` — extract actions from an email.
    - All gated on `owner` or `admin` role; `organization_id` filter mandatory.
    - _Requirements: 32.1, 32.2, 32.4_

  - [ ] 14.3 Checkpoint — document and email services compile and unit tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Universal Operations — Resilient Connection Manager
  - [ ] 15.1 Implement resilient connection manager service
    - Create `services/identity/src/connectors/resilient-connection.service.ts`.
    - `establishConnection(systemId, orgId)` — check existing `ResilientConnection` for org;
      if none, try `primaryMethod` (REST API test via `proxy.ts` SSRF-safe egress); record
      success/failure in `ResilientConnection.healthStatus`.
    - `attemptAlternative(connection)` — iterate `backupMethods[]` in priority order; try
      `file_sync` (poll a configured FTP/SFTP path), then `message_queue` (connect to
      RabbitMQ/Kafka address), then `webhook` (register a webhook and wait for push).
    - `failover(connection)` — promote the first healthy backup method to `currentMethod`;
      update `ResilientConnection.currentMethod` in Postgres.
    - `monitorHealth(connection)` — emit to InfluxDB `connector_health` every 60 seconds.
    - All alternative connection URLs must pass SSRF policy (block `10.x`, `172.16-31.x`,
      `192.168.x`, `localhost`, `169.254.x`, non-HTTPS) before attempting.
    - _Requirements: 28.1, 28.2, 28.5, 28.6, 28.8_

  - [ ] 15.2 Implement connector code generator
    - Create `services/identity/src/connectors/connector-code-generator.service.ts`.
    - `generateConnectorCode(systemId, orgId)` — analyse `SystemConnection.connectionMethod`
      config; produce a TypeScript connector stub conforming to the EIP SDK interface.
    - Output stored in `GeneratedConnector.sourceCode`; `requiresApproval = true` always.
    - `POST /api/v1/platform/orgs/:id/connectors/generate` — Super Admin only; triggers
      generation; returns `GeneratedConnector` id.
    - `POST /api/v1/platform/orgs/:id/connectors/approve/:generatedId` — Super Admin approves;
      publishes generated code to `ConnectorInstallation`.
    - _Requirements: 28.1, 28.3, 28.6, 28.7_

- [ ] 16. Universal Operations — Fleet Tracking
  - The `/app/fleet` page and basic UEM asset listing already exist. Tasks below add
    GPS-level real-time tracking capabilities.

  - [ ] 16.1 Implement fleet tracking service
    - Create `services/identity/src/fleet/fleet-tracking.service.ts`.
    - `getRealTimeLocations(orgId, filters?)` — query `EnterpriseSnapshot` UEM objects where
      `kind = 'asset'` and `status` is live; enrich with last GPS fix if available (GPS data
      arrives via connector sync into `EnterpriseSnapshot`).
    - `getRouteHistory(orgId, assetId, timeRange)` — query InfluxDB `asset_location` measurement
      (written by GPS connector during sync); compute `totalDistance`, `movingTime`, `idleTime`,
      `stops[]`.
    - `createGeofence(orgId, definition)` — persist `GeofenceDefinition` to
      `Organization.settings.geofences` JSON array; validate polygon closure.
    - `monitorGeofences(orgId)` — on each location update, check all active geofences;
      emit `GeofenceViolation` event → create `AuditLog` and optionally an `ApprovalRequest`
      alert.
    - `calculateUtilization(orgId, assetId, period)` — aggregate InfluxDB route data; compute
      `utilizationRate`, `idlePercentage`, `fuelConsumption` if available.
    - `recommendOptimization(orgId)` — rank assets by `(demand - utilization)` delta;
      return `DeploymentRecommendation[]`.
    - Tenant isolation: all queries filter by `orgId`.
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8_

  - [ ] 16.2 Expose fleet tracking API
    - `GET /api/v1/orgs/:slug/fleet/locations` — real-time asset locations.
    - `GET /api/v1/orgs/:slug/fleet/:assetId/route-history?from=&to=` — route playback data.
    - `POST /api/v1/orgs/:slug/fleet/geofences` — create geofence.
    - `GET /api/v1/orgs/:slug/fleet/utilization?period=` — utilisation metrics.
    - Gated on `owner` or `admin` role.
    - _Requirements: 30.1, 30.3, 30.4, 30.5_

  - [ ] 16.3 Upgrade `/app/fleet` page with interactive map widget
    - Replace the current static asset list with an interactive Leaflet map using
      OpenStreetMap tiles (no API key required).
    - Plot asset markers from `GET /fleet/locations`; colour-code by status.
    - Add route history panel: select asset + date range → call `/fleet/:id/route-history` →
      draw polyline on map.
    - Add geofence overlay: draw polygon from saved geofences; highlight violations.
    - Respect existing command CSS module; no new CSS frameworks.
    - _Requirements: 30.2, 30.3, 30.4_

  - [ ] 16.4 Checkpoint — fleet tracking service and map page build cleanly
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Universal Operations — Cross-System Search Engine
  - The `/app/search` page already performs in-memory search across locally-loaded data.
    Tasks below upgrade it to the full `CrossSystemSearchEngine`.

  - [ ] 17.1 Implement cross-system search service
    - Create `services/identity/src/search/cross-system-search.service.ts`.
    - `search(query, orgId)` — fan out concurrently to:
      - PostgreSQL full-text search (`plainto_tsquery`) across `EnterpriseSnapshot`, `AuditLog`,
        `ApprovalRequest`, `User`.
      - Neo4j full-text index across entity names and descriptions.
      - InfluxDB tag search for time-series metric labels.
    - Merge and rank results: relevance = `(neo4j_score × 0.4) + (pg_rank × 0.4) +
      (recency_decay × 0.2)`. Monotonic ordering enforced: no lower-ranked item may appear
      above a higher-ranked item (Property 11).
    - `getSuggestions(partial, context)` — query Redis `eip:{orgId}:search:recent` + most-
      searched terms per role from InfluxDB `search_analytics`.
    - `refineResults(searchId, refinements)` — apply additional facet filters from `SearchFilter`
      to a cached result set in Redis (TTL 5 minutes).
    - All queries include `orgId` filter.
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7_

  - [ ]* 17.2 Write property test for search result relevance ordering
    - **Property 11: Search result relevance**
    - **Validates: Requirements 33.3**
    - Generate a `SearchResults` list with known relevance scores; assert that position i always
      has a relevance score ≥ position i+1.

  - [ ]* 17.3 Write property test for facet filter correctness
    - **Property 12: Facet filtering correctness**
    - **Validates: Requirements 33.5**
    - Apply a facet filter (e.g., `sourceSystem = 'crm'`) and assert every returned result
      matches the filter and no non-matching result is included.

  - [ ] 17.4 Expose search API and upgrade search page
    - `POST /api/v1/orgs/:slug/search` — accepts `SearchQuery`; gated on any authenticated
      role; `organization_id` filter mandatory.
    - `GET /api/v1/orgs/:slug/search/suggestions?q=` — partial suggestions.
    - Update `/app/search/page.tsx` to call the new API rather than performing in-memory search
      over locally-loaded API data.
    - Add source-system facet chips to filter results by system type.
    - Add one-click actions (open, approve, create workflow) on result cards.
    - _Requirements: 33.1, 33.4, 33.5, 33.8_

  - [ ] 17.5 Checkpoint — search service and upgraded search page pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Futuristic Dashboards — real-time infrastructure
  - The `DashboardService`, `DashboardWebSocketGateway`, `DashboardExportService`, and
    `DashboardSharingService` already exist. Tasks below upgrade them for v2.0 requirements.

  - [ ] 18.1 Implement 20-type widget library and drag-and-drop layout
    - Create `apps/web/src/components/dashboard/widget-types.ts` exporting the full
      `WidgetType` union from the design (20 types).
    - Implement each as a React component in
      `apps/web/src/components/dashboard/widgets/`:
      - Existing: `kpi_card`, `line_chart`, `bar_chart`, `pie_chart` (already in
        `apps/web/src/components/dashboard/charts.tsx`).
      - New: `heat_map`, `network_graph`, `sankey`, `gauge`, `sparkline` (reuse existing),
        `table`, `map`, `timeline`, `radar`, `waterfall`, `funnel`, `scatter`, `box_plot`,
        `treemap`, `ai_insight`, `alert_list`.
    - Add `react-grid-layout` (pin exact version) to `apps/web/package.json`; implement
      `DashboardGrid` component with drag-and-drop and responsive column breakpoints.
    - _Requirements: 20.1, 20.2, 20.3_

  - [ ] 18.2 Implement real-time WebSocket dashboard updates
    - Extend `services/identity/src/dashboards/dashboard-websocket.gateway.ts`:
      - On connector sync completion, call `DashboardService.invalidateWidgetCache(orgId)`.
      - Push `WidgetUpdate` events to subscribed clients via Socket.IO rooms named
        `dashboard:{dashboardId}`.
    - Update `apps/web/src/app/app/dashboards/[id]/page.tsx` to open a WebSocket connection;
      apply `WidgetUpdate` patches in-place without full re-render.
    - Target < 1 s end-to-end latency from sync event to browser widget update.
    - _Requirements: 7.8, 8.1, 20.2_

  - [ ] 18.3 Implement dashboard export, sharing, versioning, and scheduled snapshots
    - `DashboardExportService.exportAsPDF(dashboardId, orgId)` — render all widgets server-side
      using `pdfkit`; embed org branding; annotate with generation timestamp.
    - `DashboardSharingService.share(dashboardId, permissions, orgId)` — create a signed share
      link (JWT, 7-day expiry); store `SharePermission` in `Dashboard.settings`; enforce
      `organization_id` on all shared-link reads.
    - Add dashboard versioning: on each `PATCH /api/v1/dashboards/:id`, save previous
      `Dashboard.config` to a `DashboardVersion` JSON append in `Dashboard.settings.history`.
      Expose `POST /api/v1/dashboards/:id/rollback?versionIndex=`.
    - Add `POST /api/v1/dashboards/:id/schedule` — create a `ScheduledReport` to email a
      PDF snapshot on a cron schedule; uses existing `ScheduledReport` Prisma model.
    - _Requirements: 20.5, 20.6, 20.7, 20.8_

  - [ ] 18.4 Implement dark/light/high-contrast theme system
    - Introduce CSS custom-property theme tokens in `apps/web/src/app/globals.css`:
      `--theme-bg`, `--theme-surface`, `--theme-text`, `--theme-border`.
    - Apply `data-theme="dark|light|high-contrast"` on `<html>`; all existing `command.module.css`
      colours reference the tokens.
    - Persist theme choice to `UserContextProfile.preferences` via the personalisation service;
      load on page mount.
    - Smooth transition: `transition: background-color 0.2s, color 0.2s` on `:root`.
    - _Requirements: 7.7_

  - [ ] 18.5 Checkpoint — dashboard system builds, WebSocket smoke test passes
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Role-specific futuristic dashboard pages
  - [ ] 19.1 Build Platform Super Admin futuristic dashboard section
    - In `apps/web/src/app/app/platform/page.tsx`, add section `ai` (already in
      `PlatformSectionId`) to render a Super Admin Futuristic Dashboard.
    - Panels (all from real DB queries, no fake data):
      - Platform Health widget: total orgs, active users (from `platformMetrics`), error rate
        from InfluxDB `api_request`.
      - Federated Learning status: latest `FederatedLearningRound` stats.
      - Self-Healing activity: last 10 `RemediationExecution` records.
      - Predictive alerts: call `PredictiveAnalyticsService.detectWarnings('platform')`.
      - AI Copilot panel: existing `askEllineaApi` wired to platform grounding.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 19.2 Build Organisation IT Admin futuristic dashboard
    - Update the Command Center (`apps/web/src/app/app/page.tsx`) to render an IT Admin variant
      when `session.user.role === 'admin'`:
    - Add panels: connector health grid (from `listInstallations`), data quality summary (from
      `/data-quality/summary`), alert correlation clusters (from `/alerts`), one-click actions
      (restart connector, force sync, clear cache — existing endpoints).
    - Anomaly alert ticker: WebSocket-driven `alert_list` widget showing live security events.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ] 19.3 Build Owner futuristic dashboard
    - Add an Owner-role variant to the Command Center:
    - Executive KPI summary with sparklines and period-over-period change (from
      `EnterpriseSnapshot`).
    - Enterprise health radar (financial, operational, workforce, customer, risk) — derive each
      dimension score from relevant UEM objects via `DataQualityService`.
    - Predictive forecast panels: `ForecastPoint[]` from the analytics API (30-day horizon).
    - Pending approvals with AI impact analysis (link `ApprovalRequest` to Ellinea reasoning).
    - Natural language query bar → calls `askEllineaApi`.
    - Drill-down: clicking a KPI opens the full `EnterpriseSnapshot` detail for that object.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8_

  - [ ] 19.4 Build Owner customisable widget dashboard
    - Wire `DashboardGrid` component (from Task 18.1) into
      `apps/web/src/app/app/dashboards/[id]/page.tsx`.
    - Widget config panel: click widget → side-panel with data source selector, metric selector,
      filter inputs, style options.
    - Load/save layout via `PATCH /api/v1/dashboards/:id`.
    - Template picker: seed from pre-built templates (`executive_overview`, `ops_monitoring`,
      `financial_analysis`) defined in `DashboardService.getTemplates()`.
    - _Requirements: 9.6, 20.3, 20.4_

  - [ ] 19.5 Build Staff user futuristic dashboard
    - Add a `member`/`viewer` role variant to the Command Center:
    - Personalised task list from `ApprovalRequest` (items assigned to user) + `WorkflowRule`
      triggers for the user.
    - Team updates: last 5 `AuditLog` entries for the user's department.
    - Quick-access shortcuts from `ContextAwareShortcutSuggester`.
    - Simplified data entry via existing `EnterpriseSnapshot` ingest form.
    - Mobile-responsive layout: 1-column stack on viewports < 768 px.
    - Ellinea AI assistant (conditional on `ellinea:ask` permission).
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ] 19.6 Checkpoint — all four dashboard variants build and display real data
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Natural Language Query Interface Enhancement
  - [ ] 20.1 Extend Ellinea Ask with multi-turn conversation context
    - In `apps/web/functions/api/v1/ellinea/ask.ts`, add a `conversationId` parameter.
    - Store conversation history (last 10 turns) in Redis key
      `eip:{orgId}:conversation:{conversationId}` with TTL 30 minutes.
    - On each request, prepend prior turns to the system prompt context; after response, append
      Q+A pair to Redis history.
    - `disambiguate(query, context)` — if intent confidence < 0.6, return a clarifying question
      instead of attempting an answer.
    - _Requirements: 13.1, 13.2, 13.5, 13.8_

  - [ ] 20.2 Implement cross-system query generation
    - When Ellinea detects a data-retrieval intent (HR, CRM, ERP keywords), build the
      appropriate connector-scoped query against `EnterpriseSnapshot` for the relevant SoR.
    - Synthesize results from multiple snapshots into a narrative answer with
      `[snapshot:{connectorName}]` citations.
    - Expose related questions: `suggest(query, context)` → 3 follow-on questions appended to
      response.
    - _Requirements: 13.3, 13.4, 13.6, 13.7_

  - [ ] 20.3 Surface HR and business-operations capabilities in Ask
    - Detect HR intents (on duty, off duty, leave, attendance); query `EnterpriseSnapshot` UEM
      objects with `kind = 'person'`; return structured list with source citation.
    - Detect invoice/billing intents; query relevant connector snapshot; return formatted list.
    - Detect performance analysis intents; call `PredictiveAnalyticsService.forecast()` and
      summarise output.
    - _Requirements: 26.3, 26.4, 26.5, 26.6, 26.7, 26.8_

- [ ] 21. Consolidated Multi-Business and Collaborative Intelligence
  - [ ] 21.1 Implement consolidated multi-business reporting service
    - Create `services/identity/src/reports/consolidated-report.service.ts`.
    - `generateConsolidated(parentOrgId, reportType, period)` — collect `EnterpriseSnapshot`
      records from all child orgs (using `Organization.parentOrgId`); verify caller has access
      to the parent org (tenant isolation across group).
    - Financial consolidation: sum revenue/expense across child orgs; apply exchange rate
      conversion using a rate table in `Organization.settings.exchangeRates`.
    - Identify inter-company transactions: `EnterpriseSnapshot` objects that share a reference ID
      across two child org snapshots; exclude them from consolidated P&L.
    - `generateExecutiveSummary(consolidated)` — call Ellinea Ask with the consolidated data;
      return AI-generated narrative.
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6_

  - [ ] 21.2 Implement real-time collaborative intelligence session
    - Create `services/identity/src/ellinea/collaborative-session.service.ts`.
    - `createSession(orgId, participants[])` — store `CollaborativeSession` in Redis:
      `eip:{orgId}:collab:{sessionId}`; include participant roles.
    - `addContribution(sessionId, userId, content)` — append to session; emit Socket.IO event
      to all session members.
    - `synthesize(sessionId)` — call `ModelOrchestrator` with all contributions as context;
      return `UnifiedResult` with `agreements[]`, `disagreements[]`, `recommendation`.
    - `notifyAbsent(sessionId, stakeholders[])` — create `Notification` records for absent
      participants.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

  - [ ] 21.3 Implement capability bridge service
    - Create `services/identity/src/connectors/capability-bridge.service.ts`.
    - `detectGaps(orgId)` — analyse the last 30 days of Ellinea Ask queries (`ModelDecisionLog`)
      for failed or low-confidence responses; group by topic into `CapabilityGap[]`.
    - `provideBridge(gap)` — map gap type to bridging strategy:
      - `missing_feature` → delegate to document generation or analytics service.
      - `no_integration` → suggest generating a connector code stub.
      - `limited_analytics` → route to `PredictiveAnalyticsService`.
    - `aggregateData(sources[], aggregation)` — merge `EnterpriseSnapshot` data across
      `sources[]` using the specified aggregation (sum, average, max, concatenate).
    - `transformFormats(data, from, to)` — JSON↔CSV↔XML conversion using streaming transforms
      to avoid memory pressure.
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8_

  - [ ] 21.4 Checkpoint — consolidated reporting, collaborative sessions, and capability bridge
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Performance optimisation layer
  - [ ] 22.1 Implement distributed cache strategy for high-frequency reads
    - Add Redis caching with appropriate TTLs to:
      - `EnterpriseSnapshot` summary → `eip:{orgId}:snapshot:summary` TTL 60 s.
      - `DataQualityScore` per connector → TTL 300 s.
      - `AiModelRegistry` full list → TTL 600 s (invalidated on model update).
    - Implement cache warming on connector sync completion: write new snapshot to Redis
      immediately after `POST /connectors/run-due` completes.
    - Implement tag-based invalidation: `del` all keys matching `eip:{orgId}:*` when org
      settings change.
    - _Requirements: 21.3_

  - [ ] 22.2 Add database query optimisation for v2.0 models
    - Add missing composite indexes to `schema.prisma`:
      - `KnowledgeGraphEntity`: `(organizationId, type, syncStatus)`.
      - `RemediationExecution`: `(organizationId, outcome, createdAt)`.
      - `FederatedLearningParticipant`: `(roundId, orgId)`.
      - `DataQualityIssue`: `(organizationId, severity, resolvedAt)`.
    - Enable `pgcrypto` extension if not present (needed for `gen_random_uuid()` fallback).
    - Run `npm run db:push` (targeting local DB only); verify plan with `EXPLAIN ANALYZE`.
    - _Requirements: 21.4_

  - [ ] 22.3 Implement async job queue for long-running operations
    - Create `services/identity/src/jobs/job-queue.service.ts` using Bull (Redis-backed).
    - Register queues: `document-generation`, `federated-training`, `knowledge-graph-update`,
      `connector-sync`.
    - Move `DocumentGenerationService.generate*()` calls behind the `document-generation` queue;
      return a `jobId` immediately; client polls `GET /api/v1/orgs/:slug/jobs/:jobId`.
    - _Requirements: 21.5_

  - [ ] 22.4 Checkpoint — build passes, all v2.0 services compile without TypeScript errors
    - Run `npm run build:shared && npm run build -w @ellines-eip/identity &&
      npm run build -w @ellines-eip/web`.
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 23. Mobile-first experience
  - [ ] 23.1 Upgrade PWA manifest and service worker for offline support
    - Update `apps/web/public/manifest.json`: verify `display: "standalone"`, icons at 192 and
      512 px, `start_url = "/app"`.
    - Create `apps/web/public/sw.js` — cache-first strategy for `/app/*` shell assets; network-
      first for `/api/v1/*` with offline fallback to the last cached response.
    - Register service worker in `apps/web/src/app/layout.tsx` using `navigator.serviceWorker`.
    - Queue offline actions (form submits) in IndexedDB; replay on `online` event.
    - _Requirements: 24.1, 24.3, 24.4_

  - [ ] 23.2 Apply mobile-responsive layout to all dashboard pages
    - Add media query breakpoints to `command.module.css` for ≤ 480 px, ≤ 768 px.
    - On small viewports: sidebar rail collapses to a bottom navigation bar (5 icon tabs).
    - Widget grid collapses to single column; KPI cards stack vertically.
    - Touch targets ≥ 44 × 44 px on all interactive elements.
    - _Requirements: 24.2, 24.6_

  - [ ] 23.3 Implement delta sync and biometric auth stubs
    - Add `If-Modified-Since` / `ETag` headers to `EnterpriseSnapshot` and `DashboardService`
      responses so the mobile PWA only downloads changed data.
    - Add biometric auth placeholder: detect `PublicKeyCredential` support in browser; if
      available, show "Set up biometric login" option in Profile settings page; store credential
      id in `UserContextProfile`.
    - _Requirements: 24.5, 24.7_

- [ ] 24. Explainability and trust layer
  - [ ] 24.1 Add structured explanation output to all Ellinea responses
    - Ensure every `UnifiedResult` from the model orchestrator includes:
      - `explanation.steps[]` with `stepNumber`, `operation`, `justification`.
      - `explanation.dataSources[]` with source system name and record IDs.
      - `explanation.confidenceFactors[]` — list of uncertainty contributors.
      - `explanation.alternativeOptions[]` — at least one alternative with pros/cons.
      - `explanation.rejectedOptions[]` — options considered and ruled out.
    - Render explanation in the Ellinea Console UI (`/app/ellinea-console`) as a collapsible
      "How I reasoned" panel.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

  - [ ] 24.2 Implement user-challenge and re-evaluation flow
    - In `ask.ts`, accept an optional `challenge: { conclusionId, counterEvidence }` field.
    - When present, append `counterEvidence` to the context and re-invoke the model orchestrator;
      return a revised `UnifiedResult` with updated confidence.
    - Log the challenge and re-evaluation to `ModelDecisionLog` for audit.
    - _Requirements: 23.8_

  - [ ] 24.3 Implement continuous learning feedback loop
    - `POST /api/v1/orgs/:slug/ellinea/feedback` — accepts `{ queryId, rating: 'helpful' |
      'unhelpful' | 'incorrect', notes? }`.
    - Persist to `ModelPerformanceLog` with `userFeedback` field.
    - Nightly `Cron` job in `FederatedLearningCoordinator`: aggregate weekly feedback; trigger
      `retrainModel()` in `PredictiveAnalyticsService` if accuracy drops below threshold.
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.8_

  - [ ] 24.4 Implement A/B model testing infrastructure
    - Add `isExperiment: true` flag to `AiModelRegistry` entries.
    - `ModelRouter` selects the experiment model for 10% of requests (deterministic by
      `userId` hash mod 10); logs which variant was used.
    - `GET /api/v1/platform/models/ab-results` — Super Admin; returns variant comparison.
    - Platform Super Admin approves promotion via `PATCH /api/v1/platform/models/:id/promote`.
    - _Requirements: 25.5, 25.7, 25.8_

  - [ ] 24.5 Final checkpoint — full build + test suite green
    - Run `npm run build:shared && npm run build -w @ellines-eip/identity &&
      npm run build -w @ellines-eip/web && npm run verify:pages-functions`.
    - Run `npm run test -w @ellines-eip/shared && npm run test -w @ellines-eip/identity &&
      npm run test -w @ellines-eip/web`.
    - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked `*` are optional and may be skipped for a faster MVP delivery.
- Every task references specific requirements for full traceability.
- Tenant isolation (`organization_id` filter) is mandatory on every database query that reads or
  writes tenant data — it is a correctness invariant, not just a performance concern.
- Credential fields (`apiKey`, `accessToken`, `appPassword`, `sftpPassword`, etc.) must be
  encrypted using `encrypt()` from `packages/shared/src/encryption.ts` before any persistence.
- Never run `npm run db:push` while `.env` points to Supabase unless a deliberate production
  schema migration is intended and confirmed.
- Task 1.1 (data layer infrastructure) was completed 2026-08-08 and is not repeated here.
- Build guardrails per workspace rules: `npm run build:shared` and
  `npm run build -w @ellines-eip/web` must pass before any work is considered done.
- No fake or hardcoded values on production surfaces — every metric, count, and status derives
  from a real database query.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "3.2", "5.1"] },
    { "id": 4, "tasks": ["2.5", "2.6", "3.3", "3.4", "5.2", "6.1", "7.1"] },
    { "id": 5, "tasks": ["2.7", "3.5", "5.3", "5.4", "6.2", "6.3", "7.2", "7.3", "9.1", "10.1", "12.1", "15.1"] },
    { "id": 6, "tasks": ["3.6", "4.1", "5.5", "6.4", "7.4", "8.1", "9.2", "9.3", "10.2", "11.1", "12.2", "13.1", "15.2", "17.1"] },
    { "id": 7, "tasks": ["4.2", "4.3", "5.6", "6.5", "7.5", "8.2", "9.4", "9.5", "10.3", "11.2", "12.3", "13.2", "16.1", "17.2", "17.3"] },
    { "id": 8, "tasks": ["4.4", "12.4", "12.5", "13.3", "14.1", "16.2", "17.4", "18.1", "20.1"] },
    { "id": 9, "tasks": ["12.6", "13.4", "14.2", "14.3", "16.3", "17.5", "18.2", "19.1", "20.2", "21.1", "22.1"] },
    { "id": 10, "tasks": ["16.4", "18.3", "18.4", "19.2", "19.3", "20.3", "21.2", "21.3", "22.2", "24.1"] },
    { "id": 11, "tasks": ["18.5", "19.4", "19.5", "21.4", "22.3", "24.2", "24.3"] },
    { "id": 12, "tasks": ["19.6", "22.4", "23.1", "24.4"] },
    { "id": 13, "tasks": ["23.2", "23.3", "24.5"] }
  ]
}
```
