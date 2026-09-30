# Ellines EIP — Real-World Execution Roadmap

**Status:** ACTIVE — execution roadmap  
**Purpose:** Replace long sequential planning with one merged execution track that combines the remaining platform work with the new real-world connector/business-system strategy.  
**Rule:** Build, test, prove, then generalize. Do not create another planning cycle before the current acceptance gate is met.

## 1. Starting Point

The repository already contains the EIP foundation, Super Admin control plane, client organization/user foundations, RBAC, audit, health, packages/entitlements, connector foundations, REST/OpenAPI/GraphQL/webhooks, database/file/email/SFTP integrations, mapping infrastructure, workflows/approvals, notifications, Ellinea, and the unified navigation architecture.

The next objective is **not** to redesign EIP or write more specifications.

The next objective is to prove that EIP works against a real business system.

### First proof

`REAL BUSINESS SYSTEM/API → EIP CONNECTOR → AUTH → DISCOVERY → MAPPING → SYNC → MONITORING → AUDIT → RECOVERY`

The first real connector experiment is the highest-priority product task after the current CI blocker.

---

# 2. Execution Principles

1. **Web-first.** Business systems are browser/PWA applications, not EXE-first products.
2. **Online + Offline + Hybrid from the architecture level.** Offline is not a later patch.
3. **Connector-first proof.** Use a real Ellines system/API before building a large generic connector marketplace.
4. **One reusable business kernel.** Build the first tiny business system so its architecture can become the template for school, hospital, retail, hotel, etc.
5. **EIP remains the control/intelligence layer.** Business systems own operational workflows; EIP connects, governs, observes, and reasons across them.
6. **No fake completeness.** A feature is complete only when UI, API, persistence, authorization, tests, and failure states work.
7. **Security is mandatory at every connector boundary.**
8. **Freshness must be visible.** Never present stale source data as live data.
9. **Tenant isolation is non-negotiable.**
10. **Fast slices.** Each task should produce a testable artifact rather than a large unfinished subsystem.

---

# 3. TODAY — Critical Execution Order

## T0 — Restore a green baseline

### T0.1 Fix current web test regression
- Restore the expected `admin → connector:install` authorization behavior.
- Confirm the permission grammar remains consistent with the server-side authorization model.
- Run the failing web test and the complete web suite.
- Investigate the Jest worker/open-handle teardown warning.
- Run shared, identity, web, build and contract gates.
- Confirm the deployment SHA matches the verified main commit.

**Acceptance**
- All required CI suites green.
- No known authorization regression.
- No unexplained test-worker failure.
- Main is a trustworthy starting point.

---

# 4. P1 — REAL CONNECTOR EXPERIMENT

This is the first major product milestone.

## P1.1 Select one real Ellines endpoint

Use an existing Ellines website/system with a reachable HTTP API or endpoint that can expose real business data.

Required test object:
- one organization/business
- one or more real records
- stable identifier
- timestamps
- at least 4–6 fields
- authenticated access where practical

Do not manufacture a fake connector if a real endpoint can be used.

## P1.2 Connector connection contract

Build a minimal generic connection contract:

```
name
baseUrl
authType
credentials/reference
headers
timeout
tenant
environment
```

Secrets must never appear in logs, UI telemetry, audit payloads, or error messages.

## P1.3 Test Connection

The connector must report:
- reachable/unreachable
- authentication success/failure
- HTTP status
- response latency
- detected API/schema information
- safe error message
- correlation ID

## P1.4 Discovery

For the first connector, support:
- endpoint/resource discovery
- HTTP method
- response schema
- fields
- pagination where applicable
- identifiers
- timestamps
- available filters

If OpenAPI exists, consume the OpenAPI description. Otherwise support explicit endpoint configuration.

## P1.5 Mapping

Create the first Universal Mapping contract:

```
source field → EIP canonical field
```

Support:
- rename
- type conversion
- trim
- normalize
- default value
- date/time normalization
- basic string composition/splitting

## P1.6 Sync

Implement:
- initial pull
- incremental pull where source supports it
- cursor/timestamp strategy
- idempotency
- record count
- success/failure count
- last successful sync
- last attempted sync
- source timestamp
- EIP retrieval timestamp

## P1.7 Failure and recovery

Implement the minimum reliable path:
- timeout
- retry with bounded backoff
- failed-record/error capture
- replay
- no duplicate writes
- clear failed/succeeded/queued state

## P1.8 Connector observability

Connector detail must show:

- status
- health
- last successful sync
- last attempt
- data freshness
- records processed
- failures
- retries
- latency
- authentication state
- schema version/hash
- recent events
- audit history

## P1.9 Acceptance test

The real connector is accepted only when:

1. EIP authenticates.
2. EIP discovers or is configured against the real resource.
3. EIP maps real source fields.
4. EIP imports real records.
5. Re-running sync does not duplicate records.
6. A forced failure is visible.
7. Retry/replay works.
8. Freshness is displayed correctly.
9. Audit records exist.
10. Tenant authorization is enforced.
11. Secrets are absent from logs.
12. The connector can be disabled/re-enabled safely.

**Milestone:** EIP has successfully integrated with a real Ellines system.

---

# 5. P2 — CONNECTOR ENGINE 2.0

After the real experiment works, generalize only what the experiment proves is reusable.

## P2.1 Connector lifecycle

```
Discover
→ Install
→ Configure
→ Authenticate
→ Test
→ Discover schema
→ Map
→ Validate
→ Activate
→ Sync
→ Monitor
→ Recover
→ Disable
→ Remove
```

## P2.2 Authentication adapters

Initial:
- API key
- Bearer token
- Basic auth
- OAuth2

Next:
- OIDC
- mTLS
- custom headers
- signed requests

## P2.3 Connector types

Priority:
1. REST
2. OpenAPI
3. Webhook
4. PostgreSQL
5. MySQL
6. SQL Server
7. SFTP
8. IMAP/email
9. GraphQL

Later:
- SOAP
- custom connector SDK

## P2.4 Reliability

- exponential backoff
- retry policy
- circuit breaker
- dead-letter records
- replay
- idempotency keys
- rate-limit handling
- connection timeout policy
- health scoring
- credential expiry detection

## P2.5 Schema intelligence

- schema snapshot
- schema hash
- drift detection
- field additions/removals
- type changes
- mapping impact analysis
- warning before activation

## P2.6 Data lineage

Every important EIP value should be traceable to:

```
Business
→ Connector
→ Source system
→ Resource
→ Source record
→ Retrieved timestamp
→ Transformation
→ EIP record
```

---

# 6. P3 — FIRST TINY BUSINESS SYSTEM

## Product choice

Build a **small School Management System** as the first real-world reference implementation.

It is deliberately small. It is not intended to become a full enterprise school ERP during this milestone.

## Core modules

### Identity
- school
- administrators
- teachers
- staff
- parents
- students
- roles

### Academic
- classes
- subjects
- teachers
- student enrollment
- results

### Operations
- attendance
- fees
- notices
- basic reports

### Integration
- EIP connector endpoint
- outbound events
- inbound synchronization endpoint
- external IDs
- sync status
- last synchronized timestamp

## Required business-system API

The school system must expose a clean API for:

- schools
- students
- guardians
- teachers
- classes
- attendance
- fees
- results

Minimum API capabilities:
- list
- get
- create/update where needed
- filtering
- pagination
- stable IDs
- updatedAt
- tenant/school ID

---

# 7. P4 — OFFLINE / ONLINE / HYBRID BUSINESS KERNEL

The business system must work in three modes.

## Online

Browser/PWA → server → database.

## Offline

Browser/PWA retains permitted operational data locally.

Required:
- local queue
- local identifiers
- local timestamps
- pending operation state
- conflict metadata

## Hybrid

```
User action
→ local transaction
→ queued operation
→ connection restored
→ sync engine
→ idempotency check
→ server
→ acknowledgement
→ local reconciliation
```

### Conflict policy

Initial strategies:
- server authoritative for protected records
- last-write-wins only where safe
- explicit conflict for financial/critical records
- user resolution screen where required

### Offline acceptance

- user can continue permitted work without internet
- queued actions are visible
- reconnect automatically attempts synchronization
- duplicate records are prevented
- failed operations remain recoverable
- financial/critical operations never falsely appear completed

---

# 8. P5 — CLIENT ORGANIZATION EXPERIENCE

Combine existing client administration with the new real-world model.

Each client gets:

- Overview
- People & Access
- Services & Entitlements
- Connectors
- Operations
- Reports
- Health
- Usage
- Activity
- Audit
- Configuration

The exact navigation is capability/role driven.

## Business lifecycle

```
Create
→ Configure
→ Onboard
→ Connect
→ Activate
→ Monitor
→ Suspend
→ Restore
→ Archive
```

---

# 9. P6 — SUPER ADMIN COMMAND CENTER

Evolve the current Super Admin surface rather than creating another dashboard.

## Command Center

Show:
- organizations
- active users
- active connectors
- failed integrations
- stale sources
- security events
- incidents
- platform health
- API traffic
- queue health
- AI usage
- storage
- version/deployment state

## Needs Attention

Centralize:
- failed connectors
- expired credentials
- schema drift
- failed jobs
- security events
- quota warnings
- stale data
- incidents

Every item must have:
- severity
- business
- source
- evidence
- timestamp
- owner/status
- recommended next action

---

# 10. P7 — ENTERPRISE OPERATIONS

## Incident Center

States:
- Active
- Investigating
- Mitigated
- Resolved

Include:
- affected business
- affected connector/system
- timeline
- evidence
- actions
- resolution
- audit

## Jobs and queues

- running
- queued
- failed
- retrying
- dead-letter
- replay

## Platform health

Monitor:
- web/API
- database
- authentication
- connector runtime
- queues
- storage
- notifications
- AI
- external dependencies

---

# 11. P8 — GOVERNANCE AND SECURITY

Complete and consolidate:

- RBAC
- tenant isolation
- MFA
- session/device management
- session revocation
- step-up authentication
- privileged-operation confirmation
- reason capture
- dual approval
- service accounts
- connector secret lifecycle
- audit
- retention
- security events
- break-glass controls

Rule:

```
Capability ≠ Authorization
```

A connector may technically support writing while the current user is still denied from performing the write.

---

# 12. P9 — ELLINEA INTELLIGENCE

After reliable data integration exists, make Ellinea useful against real data.

## Modes

- Ask
- Explain
- Investigate
- Compare
- Summarize
- Monitor
- Alert
- Recommend
- Act

## Evidence requirement

AI answers should expose:
- source
- retrieved time
- affected business
- records/evidence
- confidence/limitations

## Investigation

Example:

```
Why did school fee collections fall?
→ inspect fee records
→ compare periods
→ inspect attendance/enrollment
→ inspect failed payments
→ identify evidence
→ produce explanation
```

No unsupported conclusions.

---

# 13. P10 — UNIVERSAL SEARCH + COMMAND PALETTE

Add `Ctrl+K` global search for authorized:

- businesses
- users
- connectors
- records
- reports
- workflows
- incidents
- audit events
- settings

Then support natural-language operational queries through Ellinea.

---

# 14. P11 — DEVELOPER CENTER

Build after the connector engine is proven.

- API catalog
- API explorer
- API keys
- service accounts
- webhooks
- events
- schemas
- connector SDK
- sandbox
- API logs
- rate limits
- usage
- response inspection
- secret redaction
- API drift detection

---

# 15. P12 — BUSINESS CUSTOMIZATION

Businesses can configure:

- dashboard widgets
- KPIs
- alerts
- reports
- navigation visibility
- terminology
- currency
- timezone
- business calendar
- branches
- departments

Configuration should replace custom forks wherever possible.

---

# 16. P13 — ADVANCED PLATFORM FEATURES

Add after the core real-world loop is stable.

### Attention Engine
One platform-wide source of operational/security/business attention.

### Digital Twin
Live relationship graph:

```
EIP
├── Business
├── Connector
├── ERP/CRM
├── Users
├── Workflows
├── Events
└── Intelligence
```

### Enterprise Knowledge Graph
Connect:
- people
- businesses
- departments
- documents
- systems
- customers
- suppliers
- transactions
- assets
- policies
- events
- workflows

### AI Watchers
Examples:
- Watch fee collections.
- Watch inventory.
- Watch connector failures.
- Watch unusual activity.

### Workflow engine

```
Event
→ Condition
→ Policy
→ Approval
→ Action
→ Verification
→ Audit
```

---

# 17. P14 — PRIVATE / EDGE CONNECTOR

For businesses whose systems cannot be publicly exposed:

```
Private ERP
    ↓
EIP Connector Agent
    ↓
Outbound secure connection
    ↓
EIP
```

Targets:
- Windows
- Linux
- Docker

Prefer outbound-only communication where practical.

The agent must not become a security bypass.

---

# 18. P15 — CONNECTOR MARKETPLACE

Only after the connector engine is proven.

Categories:
- ERP
- CRM
- HR
- Accounting
- POS
- Payments
- Healthcare
- Logistics
- Databases
- Communication
- Custom APIs

Each connector records:
- capabilities
- auth methods
- objects
- version
- security requirements
- publisher
- certification tests
- health
- last tested

---

# 19. UI / DESIGN STANDARD

EIP should feel like a serious enterprise operating platform.

Use:
- glass surfaces
- restrained transparency
- subtle blur
- fine borders
- strong typography
- compact data tables
- generous spacing
- clear status indicators
- restrained animation
- responsive layouts
- accessible contrast

Avoid:
- excessive RGB/glowing gaming aesthetics
- decorative dashboards with no action
- giant KPI cards that hide operational detail
- duplicated navigation
- fake live data

Every dashboard should answer:

**What is happening?**

**Why does it matter?**

**What should I do?**

**What evidence proves it?**

---

# 20. Definition of Done

A feature is not complete because its page exists.

It is complete only when:

- UI exists
- API exists where required
- database/persistence exists where required
- authorization is enforced server-side
- tenant isolation is tested
- loading state works
- empty state works
- error state works
- audit exists for sensitive actions
- secrets are protected
- tests exist
- production build passes
- relevant integration test passes
- documentation/status is truthful

---

# 21. TODAY'S TASK BOARD

## BLOCKER
- [ ] T0.1 Fix web authorization regression
- [ ] T0.2 Restore green CI
- [ ] T0.3 Verify main deployment SHA

## CONNECTOR EXPERIMENT
- [ ] P1.1 Select real Ellines API/endpoint
- [ ] P1.2 Define connector contract
- [ ] P1.3 Implement Test Connection
- [ ] P1.4 Implement discovery
- [ ] P1.5 Implement mapping
- [ ] P1.6 Implement first sync
- [ ] P1.7 Implement failure/retry/replay
- [ ] P1.8 Implement connector observability
- [ ] P1.9 Run real end-to-end experiment
- [ ] P1.10 Record evidence and gaps

## BUSINESS SYSTEM
- [ ] P3.1 Create web/PWA school-system shell
- [ ] P3.2 Implement school/tenant identity
- [ ] P3.3 Implement students
- [ ] P3.4 Implement teachers/classes
- [ ] P3.5 Implement attendance
- [ ] P3.6 Implement fees
- [ ] P3.7 Implement results
- [ ] P3.8 Implement API
- [ ] P3.9 Implement EIP integration endpoints

## OFFLINE/HYBRID
- [ ] P4.1 Local data store
- [ ] P4.2 Offline operation queue
- [ ] P4.3 Sync engine
- [ ] P4.4 Idempotency
- [ ] P4.5 Conflict handling
- [ ] P4.6 Reconnect/reconciliation UI

## PLATFORM
- [ ] P6.1 Super Admin Command Center refinement
- [ ] P6.2 Needs Attention engine
- [ ] P7.1 Incident Center
- [ ] P7.2 Jobs/queues
- [ ] P8.1 Security/governance completion
- [ ] P9.1 Evidence-linked Ellinea
- [ ] P10.1 Universal Search
- [ ] P11.1 Developer Center

---

# 22. Working Rule for Kiro + Development

Kiro should take one task at a time from this board.

For each task:

```
Inspect current implementation
→ implement smallest complete slice
→ test
→ build
→ review
→ mark task complete
→ move to next task
```

Do not create parallel speculative implementations.

When a real connector experiment exposes a missing EIP capability, add the smallest necessary capability to EIP, test it, then continue the experiment.

---

# 23. First Milestone

## REAL-WORLD PROOF v0.1

The first major milestone is:

> A real Ellines business system communicates with EIP through a real connector, real records synchronize without duplication, failures are visible and recoverable, tenant/security boundaries hold, and the business system can operate online, offline, and hybrid through a web/PWA architecture.

Everything else should support reaching this milestone.

**Priority order:**

```
GREEN MAIN
   ↓
REAL CONNECTOR
   ↓
CONNECTOR ENGINE
   ↓
TINY BUSINESS SYSTEM
   ↓
OFFLINE/HYBRID
   ↓
SUPER ADMIN OPERATIONS
   ↓
ELLINEA INTELLIGENCE
   ↓
GENERALIZE TO MANY BUSINESSES
```
