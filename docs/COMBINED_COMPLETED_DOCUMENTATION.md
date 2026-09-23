# Ellines EIP — Combined Completed Documentation

**Generation date:** 2026-09-22  
**Purpose:** Consolidate the requested finished/core Ellines EIP Markdown documentation into one traceable reference while preserving each source document's substantive content, hierarchy, tables, code blocks, and links.

## Reconciliation note

Historical completion, production-ready, and status claims in the bundled sources are preserved as source content but are **not current status evidence**. Current implementation and audit documentation was intentionally excluded; use the current `AGENTS.md` and `docs/05_Build_Queue.md` for present implementation state and work status.

## Canonical-source rule

`docs/00_EIP_MASTER_SPEC.md` is the highest-level product, architecture, security, and implementation specification in this bundle. Current `AGENTS.md` and `docs/05_Build_Queue.md` override historical status, maturity, completion, and work-order claims wherever they conflict. This combined file is a documentary consolidation and does not replace those canonical sources.

## Source manifest

1. `docs/00_EIP_MASTER_SPEC.md`
2. `docs/01_EIP_in_60_seconds.md`
3. `docs/02_MVP_Scope_v1.0.md`
4. `docs/03_Master_Blueprint.md`
5. `docs/04_Enterprise_Lexicon.md`
6. `docs/09_Access_Layers.md`
7. `docs/11_Ellinea_API_Contract.md`
8. `docs/30_RBAC_Setup_Guide.md`
9. `docs/31_RBAC_API_Reference.md`
10. `docs/32_RBAC_Permission_Matrix.md`
11. `docs/33_Complete_API_Reference.md`
12. `docs/34_Super_Admin_Dashboard_Spec.md`
13. `docs/35_API_Documentation_Guide.md`
14. `docs/API_QUICK_REFERENCE.md`
15. `docs/API_SUMMARY.md`
16. `packages/connectors-sdk/README.md`
17. `assets/brand/README.md`

---
## Source: docs/00_EIP_MASTER_SPEC.md

# ELLINES EIP — MASTER SPECIFICATION

## Enterprise Intelligence Platform

**Tagline:** Where Enterprise Systems Think Together.  
**Product:** Ellines EIP  
**AI Engine:** Ellinea AI  
**Owner:** Ellines Tech  
**Version:** 2.0 Master Specification  
**Status:** Canonical product, architecture, security, and implementation specification  
**Specification branch:** `eip/master-spec-completion`  
**Target implementation branch:** `eip-live-command-center-build`  
**Canonical integration branch:** `main`  
**Last updated:** 2026-09-21

---

# 1. Purpose

Ellines EIP is an intelligent enterprise command platform that sits above existing business systems and gives authorized users one secure place to understand, monitor, compare, report on, and eventually act across their businesses.

EIP is **not** intended to unnecessarily replace ERP, POS, CRM, HR, accounting, hospital, inventory, banking, logistics, or other operational systems. Connected source systems remain authoritative for their operational records.

EIP provides the intelligence layer between the user and those systems.

Core principle:

> **LIVE BY DEFAULT. STORE BY PURPOSE. ACT ONLY WHEN AUTHORIZED.**

EIP must retrieve the minimum information needed to answer a request, retain only information that has a defined purpose, clearly identify freshness, and preserve source-system traceability.

---

# 2. Product Vision

The user should experience EIP as a secure live connection to an entire enterprise.

The user should not need to know:

- which system contains the information;
- which database table contains it;
- which API supplies it;
- which connector retrieves it;
- how different systems name the same entity;
- how data is technically normalized.

The user should be able to ask:

- “How are all my businesses doing?”
- “Show me Business A.”
- “What happened today?”
- “Give me today's sales.”
- “Which supplier payments are pending?”
- “Show me all unprocessed cheques.”
- “Why are expenses higher this month?”
- “Compare these businesses.”
- “Generate the monthly report.”
- “Create an approval request.”
- “Send this report to the finance team.”

EIP turns these requests into controlled, auditable technical operations.

---

# 3. Non-Goals

EIP must not:

1. Become an uncontrolled copy of every connected database.
2. Assume every enterprise uses the same ERP schema.
3. Treat AI output as authorization.
4. Claim an action succeeded without source confirmation.
5. Hide uncertainty or stale data.
6. silently merge records that cannot be confidently matched.
7. expose data outside the user's effective scope.
8. require one specific ERP vendor.
9. make unsupported capabilities appear available.
10. use automation to bypass authentication or access controls.

---

# 4. Source-of-Truth Architecture

Each source system remains authoritative for operational data.

Examples of source-of-truth systems:

- ERP;
- POS;
- accounting;
- HR;
- CRM;
- hospital systems;
- inventory systems;
- banking platforms;
- e-commerce systems;
- custom enterprise applications.

EIP may persist:

- organizations;
- businesses;
- users;
- roles;
- permissions;
- connector definitions;
- encrypted credentials or references to external secret stores;
- capability metadata;
- mappings;
- audit records;
- workflows;
- approvals;
- schedules;
- generated reports;
- requested snapshots;
- derived metrics;
- health telemetry;
- notification state;
- AI configuration metadata.

EIP should not normally persist complete operational datasets unless a documented feature requires it.

---

# 5. Data Retention Model

Every retained dataset must have:

- owner;
- purpose;
- scope;
- retention classification;
- creation time;
- expiration policy;
- deletion mechanism;
- access policy.

Retention classes:

1. Ephemeral — seconds/minutes.
2. Short-lived cache — explicit TTL.
3. Operational metadata — retained for platform operation.
4. Audit — retained according to security/compliance policy.
5. Derived analytics — compact historical metrics.
6. Generated artifact — report/document requested by a user or workflow.
7. Explicit snapshot — deliberately saved historical state.

Default behavior is data minimization.

---

# 6. Operating Modes

## 6.1 Live Mode

Default mode.

Flow:

`Request → Intent → Scope → Authorization → Capability → Query Plan → Source → Normalize → Validate → Answer`

Used for current:

- balances;
- sales;
- inventory;
- payments;
- approvals;
- employee information;
- alerts;
- operational status.

## 6.2 Cached Mode

Used only where a cache is explicitly allowed.

The interface must display:

- cached;
- cache timestamp;
- expected freshness;
- source.

## 6.3 Historical Mode

Uses retained derived metrics or authorized historical records.

## 6.4 Snapshot Mode

Explicitly saved state.

Snapshots must never be represented as live.

## 6.5 Degraded Mode

If a source is unavailable, EIP may continue serving unaffected sources and clearly identify unavailable data.

---

# 7. Multi-Business Model

Hierarchy:

`Platform → Organization → User → Business → System → Capability → Resource`

A single organization may contain multiple businesses.

Views:

1. Business View.
2. Portfolio View.
3. Comparison View.
4. Executive Attention View.
5. System Health View.

Every request must resolve to an effective scope before data retrieval.

---

# 8. Tenant Isolation

Tenant isolation is mandatory at every layer.

Required dimensions:

- organization ID;
- business ID;
- user ID;
- role;
- resource scope;
- connector scope;
- cache scope;
- database scope;
- audit scope;
- report scope;
- workflow scope.

A request must never be able to obtain another tenant's data by manipulating:

- IDs;
- filters;
- URLs;
- prompts;
- connector parameters;
- API requests;
- database queries;
- cached keys;
- report identifiers.

---

# 9. Identity

Identity services must support:

- registration/invitation;
- authentication;
- password policy;
- MFA;
- session management;
- device/session listing;
- session revocation;
- password reset;
- account recovery;
- service identities;
- API identities;
- machine-to-machine authentication.

Authentication and authorization are separate concerns.

---

# 10. Authorization

Permission model:

`Module → Resource → Action → Scope`

Actions may include:

- view;
- create;
- edit;
- delete;
- approve;
- reject;
- execute;
- export;
- share;
- schedule;
- configure.

Scope may include:

- organization;
- business;
- branch;
- department;
- warehouse;
- resource;
- record.

Authorization must be evaluated server-side.

The client must never be trusted to enforce permissions.

---

# 11. Role-Based and Attribute-Based Access

EIP should support:

- RBAC;
- scoped roles;
- permission groups;
- resource-level permissions;
- attribute-based conditions where required;
- temporary permissions;
- delegated permissions;
- service permissions.

Examples:

`Finance → Cheques → View → Business A`

`Finance → Payments → Approve → Business B`

A user may have different permissions in different businesses.

---

# 12. SuperAdmin / GodMode

SuperAdmin is the **Ellines EIP platform control plane** and is separate from every business/customer dashboard.

The SuperAdmin control plane exists to operate **EIP itself**, manage the businesses onboarded to EIP, and provide controlled platform-level intervention.

### SuperAdmin primary responsibilities

- platform/system performance and availability;
- business onboarding and registration;
- business lifecycle: activate, suspend, disconnect, reconnect;
- tenant administration and troubleshooting;
- tenant users and access control;
- service packages, licensing, quotas, limits, and capability entitlements;
- global feature flags and platform configuration;
- global audit, security events, diagnostics, and incident investigation;
- platform AI/operator assistance;
- platform release/configuration controls;
- controlled business migration and recovery operations;
- platform-wide cost, usage, rate-limit, and capacity controls.

### Connector boundary

Customer connectors are **not a dependency of EIP itself**.

EIP must be able to start, authenticate, serve its platform UI/API, manage tenants, audit actions, and perform core platform operations without any customer connector being installed or available.

Connectors belong to the **business service layer**:

- a business may require one or more integrations;
- the business or authorized IT operator supplies its credentials/configuration;
- SuperAdmin may provide connector templates/service packs, inspect connector health for troubleshooting, disconnect/revoke a business integration, or publish reusable integration offerings;
- connector installations must never be treated as evidence that the EIP platform itself is healthy.

Therefore, SuperAdmin navigation must place integrations under **Business Services / Service Catalog**, not as the primary Platform Health or Command Center view.

### Privileged control rules

GodMode must **not** become an invisible bypass.

Every privileged operation must produce an immutable audit event.

Sensitive privileged actions should support:

- reason;
- ticket/reference;
- explicit confirmation;
- optional dual approval;
- session re-authentication;
- reversible action where technically possible;
- destructive-action safeguards.

The SuperAdmin dashboard must distinguish clearly between:

1. **EIP platform telemetry** — health, uptime, services, queues, API performance, security, infrastructure;
2. **business lifecycle telemetry** — onboarded businesses, access state, package, usage, account status;
3. **business integration telemetry** — customer connectors, sync status, integration failures;
4. **commercial controls** — packages, quotas, entitlements, licensing, usage;
5. **security/control telemetry** — privileged actions, audit events, suspicious activity, configuration changes.

The dashboard must never synthesize telemetry merely to populate a visual component.

---

# 13. Business Owner Administration

Business owners may be able to:

- create businesses;
- configure businesses;
- connect systems;
- invite users;
- define roles;
- assign permissions;
- configure dashboards;
- configure reports;
- configure alerts;
- configure workflows;
- manage notification preferences;
- review business audit events.

All actions remain within organization authority.

---

# 14. Universal Connector Fabric

The connector fabric is the central integration architecture.

Connector families:

### APIs

- REST;
- GraphQL;
- OpenAPI;
- webhooks;
- OAuth 2.0;
- OIDC;
- API keys;
- bearer tokens;
- signed requests.

### Databases

- PostgreSQL;
- MySQL/MariaDB;
- SQL Server;
- Oracle;
- other adapter-supported SQL engines.

### Enterprise protocols

- SOAP;
- SFTP;
- IMAP;
- SMTP;
- Kafka;
- RabbitMQ;
- MQTT;
- message queues.

### Files

- CSV;
- XLSX;
- JSON;
- XML;
- PDF.

### Legacy

- controlled browser automation;
- desktop automation;
- legacy adapters.

Legacy automation must not bypass access controls.

---

# 15. Connector Lifecycle

Every connector must support:

1. Install.
2. Configure.
3. Authenticate.
4. Validate.
5. Test.
6. Discover.
7. Describe.
8. Map.
9. Authorize.
10. Enable.
11. Monitor.
12. Reauthorize.
13. Rotate credentials.
14. Pause.
15. Disable.
16. Revoke.
17. Remove.

Connector health should expose:

- connected;
- degraded;
- authentication required;
- unavailable;
- disabled;
- revoked;
- error.

Secrets must never be displayed in plain text.

---

# 16. Connector Security

Connectors must have:

- isolated execution;
- minimum permissions;
- explicit capabilities;
- timeouts;
- rate limits;
- input validation;
- output validation;
- SSRF protection;
- command allowlists where relevant;
- secret isolation;
- audit;
- health monitoring.

Database connectors default to read-only.

Writes require explicit connector capability and policy authorization.

---

# 17. Capability Discovery

A connector may report capabilities such as:

- read;
- create;
- update;
- delete;
- approve;
- export;
- execute;
- subscribe;
- webhook;
- report;
- search.

Capability discovery describes technical availability.

It does **not** grant user permissions.

Final access is:

`Technical Capability ∩ User Permission ∩ Policy`

---

# 18. Universal Enterprise Model (UEM)

UEM provides common semantic entities across different systems.

Core entities:

- Organization;
- Business;
- Branch;
- Department;
- User;
- Employee;
- Customer;
- Supplier;
- Product;
- Inventory Item;
- Sale;
- Purchase;
- Invoice;
- Payment;
- Cheque;
- Expense;
- Account;
- Asset;
- Approval;
- Document;
- Report;
- Alert;
- Workflow.

Every normalized object should preserve:

- source system;
- source entity;
- source record ID;
- business ID;
- source timestamps;
- normalization version;
- mapping confidence;
- source URL/reference where appropriate.

EIP must never silently invent missing information.

---

# 19. Entity Resolution

EIP must distinguish:

- exact source identity;
- confidently matched identity;
- probable match;
- ambiguous match;
- unmatched record.

When ambiguity can materially affect the answer, EIP must ask for clarification or present the ambiguity.

Example:

Two systems may contain:

`John Mwangi`

and

`J. Mwangi`

EIP must not automatically assume they are the same person when the evidence is insufficient.

---

# 20. Universal Query Engine

Natural-language requests are translated into controlled execution plans.

Pipeline:

`User → Intent → Scope → Authorization → Capability → Query Plan → Source Selection → Retrieval → Normalization → Validation → Analysis → Answer`

The query planner must:

- minimize source access;
- avoid irrelevant systems;
- enforce result limits;
- apply time boundaries;
- apply tenant scope;
- track source provenance;
- handle partial failures;
- support cancellation/timeouts.

---

# 21. Query Planning

Each query plan should contain:

- request ID;
- user;
- organization;
- business scope;
- intent;
- required entities;
- required fields;
- source candidates;
- selected sources;
- filters;
- time range;
- permission decisions;
- expected output;
- timeout;
- risk classification.

Plans should be inspectable in diagnostics without exposing sensitive values unnecessarily.

---

# 22. Cross-System Intelligence

EIP may combine authorized information.

Example:

`POS Sales + ERP Inventory + Purchasing + Finance = Enterprise Insight`

The engine must preserve provenance for each important conclusion.

Answers should distinguish:

- observation;
- evidence;
- interpretation;
- recommendation;
- limitation.

---

# 23. Executive Dashboard

The executive command center should provide:

- revenue;
- expenses;
- profit;
- growth;
- receivables;
- payables;
- inventory position;
- pending payments;
- pending approvals;
- alerts;
- connector health;
- system health;
- recent material changes.

Every metric must display freshness.

Possible states:

- Live;
- Live as of;
- Cached;
- Historical;
- Snapshot;
- Source unavailable.

---

# 24. Attention Engine

EIP should surface actionable issues such as:

- overdue receivables;
- pending supplier payments;
- failed payments;
- inventory shortages;
- unusual expense movement;
- unusual sales movement;
- failed connectors;
- critical approvals;
- security events;
- workflow failures.

Attention items must include evidence and timestamps.

---

# 25. Business Navigation

Navigation is capability-driven.

Core business areas:

### Business

- Dashboard;
- Overview;
- Activity;
- Alerts;
- Approvals.

### ERP

- Sales;
- Purchases;
- Inventory;
- Products;
- Customers;
- Suppliers;
- Invoices;
- Receivables;
- Payables;
- Payments;
- Expenses;
- Assets;
- Finance;
- Tax;
- Branches;
- Warehouses;
- Documents.

### POS

- Sales;
- Transactions;
- Products;
- Customers;
- Refunds;
- Discounts;
- Cashier activity;
- Registers;
- Payment methods;
- End-of-day.

### HR

- Employees;
- Departments;
- Attendance;
- Leave;
- Payroll;
- Recruitment;
- Performance;
- Documents.

### CRM

- Customers;
- Leads;
- Opportunities;
- Activities;
- Communications;
- Pipelines;
- Follow-ups.

Unsupported modules must not appear as functional modules.

---

# 26. Payments and Cheques

Payments are a first-class domain.

Model:

`Payments → Supplier / Customer → Instrument → Status`

Payment types may include:

- cheque;
- bank transfer;
- cash;
- card;
- mobile money;
- other source-defined methods.

Cheque fields may include:

- cheque number;
- payer;
- payee;
- customer;
- supplier;
- amount;
- currency;
- issue date;
- due date;
- bank;
- status;
- approval state;
- processing state;
- failure/return reason;
- source system;
- source record ID.

Statuses:

- pending;
- awaiting approval;
- processing;
- completed;
- failed;
- returned;
- cancelled;
- archived.

---

# 27. Data Governance

Every data access must have:

- identity;
- organization;
- business;
- source;
- purpose;
- permission;
- timestamp;
- request ID.

Sensitive data must support:

- masking;
- field-level permissions;
- minimization;
- controlled exports;
- access logging.

Data governance policies must be configurable by organization where legally and technically appropriate.

---

# 28. Privacy and Data Minimization

Principle:

> Retrieve what is needed, process what is needed, retain what is needed, delete what is no longer needed.

EIP should support:

- retention schedules;
- deletion workflows;
- export controls;
- subject/data access workflows where applicable;
- field masking;
- consent/purpose metadata where applicable;
- privacy event auditing.

Privacy controls must not silently disable necessary security/audit records.

---

# 29. Audit System

Audit events are immutable security records.

An audit event should contain:

- event ID;
- timestamp;
- actor;
- actor type;
- organization;
- business;
- action;
- resource;
- resource ID;
- source system;
- request ID;
- outcome;
- reason where required;
- before/after metadata where safe;
- IP/device/session metadata according to policy.

Audit logs must be protected from ordinary users.

---

# 30. Observability

EIP must provide:

### Logs

Structured application and security logs.

### Metrics

- request latency;
- error rates;
- connector latency;
- connector failures;
- query volume;
- query success;
- report generation;
- workflow execution;
- action execution;
- cache hit rate;
- resource utilization.

### Traces

Distributed tracing using correlation IDs.

### Health

- API health;
- database health;
- queue health;
- connector health;
- AI health;
- storage health.

---

# 31. Reliability

EIP must assume failures will happen.

Required controls:

- timeouts;
- retries;
- exponential backoff;
- circuit breakers;
- idempotency;
- duplicate-action protection;
- partial-result handling;
- dead-letter queues;
- graceful degradation;
- health checks;
- recovery procedures.

Retries must never accidentally duplicate financial actions.

---

# 32. Transaction and Idempotency Safety

Every externally visible action must have a risk classification.

For actions that can create financial or operational side effects:

- require idempotency keys;
- persist execution state;
- verify source response;
- prevent duplicate execution;
- record source transaction ID;
- support safe retry.

Example:

A payment submission timeout must not automatically result in a second payment without determining whether the first submission succeeded.

---

# 33. Universal Action Engine

EIP eventually supports authorized actions:

- create;
- update;
- cancel;
- approve;
- reject;
- send;
- export;
- notify;
- schedule;
- trigger;
- generate.

Action flow:

`Identity → Permission → Policy → Validation → Confirmation → Execute → Source Result → Audit`

AI cannot skip this sequence.

---

# 34. Risk Classification

Actions should be classified:

### Low risk

- generate report;
- refresh dashboard;
- create internal note.

### Medium risk

- send notification;
- create workflow;
- update non-financial metadata.

### High risk

- approve payment;
- create financial transaction;
- delete operational data;
- release sensitive information.

High-risk actions may require:

- explicit confirmation;
- re-authentication;
- MFA;
- dual approval;
- source confirmation;
- enhanced audit.

---

# 35. Approval Engine

Unified approvals may include:

- supplier payments;
- purchases;
- refunds;
- expenses;
- HR requests;
- custom workflows.

Approval records must preserve source authority.

EIP may coordinate an approval but must not falsely represent itself as the source system of record.

---

# 36. Workflow Engine

Workflow model:

`Trigger → Conditions → Actions → Wait → Decision → Actions → Complete`

Every workflow must define:

- owner;
- organization;
- scope;
- trigger;
- conditions;
- actions;
- timeout;
- retries;
- failure path;
- escalation;
- audit;
- enabled state.

Workflows must be deterministic where financial or security consequences are involved.

---

# 37. Event Architecture

EIP should support events such as:

- sale.created;
- payment.created;
- payment.failed;
- cheque.pending;
- cheque.returned;
- invoice.overdue;
- inventory.low;
- connector.failed;
- approval.requested;
- approval.completed;
- workflow.failed.

Events require:

- unique ID;
- timestamp;
- source;
- scope;
- schema version;
- correlation ID;
- idempotency handling.

---

# 38. Notifications

Channels:

- in-app;
- email;
- SMS;
- push;
- WhatsApp where supported;
- webhook.

Notification engine must support:

- preferences;
- templates;
- priority;
- throttling;
- deduplication;
- escalation;
- delivery status;
- retries;
- audit.

---

# 39. Reporting Engine

Reports must support:

- on-demand;
- scheduled;
- daily;
- weekly;
- monthly;
- quarterly;
- annual;
- custom schedules;
- business reports;
- portfolio reports;
- comparison reports;
- custom reports.

Formats:

- PDF;
- XLSX;
- CSV;
- JSON where appropriate.

Report metadata:

- requester;
- scope;
- source systems;
- generation time;
- data timestamp;
- filters;
- definition version;
- retention classification.

---

# 40. Reporting Intelligence

Where data supports it, reports may contain:

- trends;
- variance;
- period comparison;
- business comparison;
- anomalies;
- contributors;
- explanations;
- recommendations;
- source references.

Generated reports must identify whether they represent:

- live data;
- generated snapshot;
- historical data.

---

# 41. Search

Search must support:

- global search;
- businesses;
- entities;
- transactions;
- documents;
- reports;
- alerts;
- workflows;
- natural-language search.

Filters:

- business;
- source;
- entity;
- date;
- status;
- amount;
- user;
- branch.

Search must obey the same authorization rules as direct retrieval.

---

# 42. Documents

Document support includes:

- invoices;
- receipts;
- payment documents;
- contracts;
- reports;
- exports;
- uploaded files;
- digitally represented cheques.

Capabilities:

- secure preview;
- metadata extraction;
- classification;
- OCR where required;
- controlled download;
- source reference;
- retention policy.

Documents must not become an uncontrolled data lake.

---

# 43. AI Assistant

Ellinea AI should be able to:

- understand business language;
- resolve business scope;
- resolve ambiguity;
- discover capabilities;
- plan queries;
- retrieve live information;
- summarize;
- compare;
- explain;
- generate reports;
- recommend;
- ask clarification;
- initiate authorized actions.

AI must never:

- invent source data;
- fabricate citations;
- claim success without confirmation;
- expose unauthorized information;
- turn assumptions into facts;
- bypass policy.

---

# 44. AI Evidence Model

Important AI responses should include:

1. Answer.
2. Evidence.
3. Source systems.
4. Data timestamp.
5. Interpretation.
6. Recommendation, if requested.
7. Limitations.

For sensitive operations, evidence requirements must increase with risk.

---

# 45. AI Guardrails

AI execution must use tools rather than unrestricted direct system access.

Architecture:

`LLM → Tool Policy → Authorization → Connector → Source`

The model receives only the tool results necessary for the task.

Tool calls must be:

- typed;
- validated;
- scoped;
- logged;
- rate-limited;
- cancellable.

Prompt injection from source data must not be allowed to redefine EIP policies.

---

# 46. AI Memory

EIP should distinguish:

- conversation context;
- user preferences;
- organization configuration;
- business facts;
- historical metrics;
- explicit saved knowledge.

AI memory must never become an unauthorized replica of enterprise databases.

Users should be able to inspect and manage persistent AI memory where supported.

---

# 47. AI Model Abstraction

EIP should not become permanently dependent on one model provider.

Support an abstraction layer for:

- hosted LLMs;
- local models;
- embedding models;
- speech-to-text;
- text-to-speech;
- vision/document models.

Model routing may consider:

- cost;
- latency;
- privacy;
- capability;
- availability;
- data sensitivity.

---

# 48. Connector Agent

For private networks:

`Private Network → EIP Connector Agent → Encrypted Outbound Channel → EIP`

Agent responsibilities:

- outbound secure connection;
- local policy enforcement;
- connector execution;
- credential isolation;
- health reporting;
- signed updates;
- offline queueing where safe.

Inbound exposure should be avoided by default.

---

# 49. Connector Agent Security

Agent requirements:

- device identity;
- mutual authentication;
- certificate/key rotation;
- signed packages;
- verified updates;
- least privilege;
- local allowlists;
- process isolation;
- tamper detection where appropriate;
- secure logs;
- revocation.

A compromised agent must not provide unrestricted enterprise access.

---

# 50. API Platform

APIs should expose controlled resources for:

- organizations;
- businesses;
- users;
- permissions;
- connectors;
- capabilities;
- live queries;
- reports;
- alerts;
- approvals;
- workflows;
- actions;
- audit;
- health.

API standards:

- versioning;
- authentication;
- authorization;
- rate limits;
- idempotency;
- pagination;
- filtering;
- consistent errors;
- correlation IDs;
- schema validation.

---

# 51. Connector SDK

Connector SDK should provide reusable contracts for:

- authentication;
- discovery;
- capabilities;
- entity definitions;
- field mappings;
- query operations;
- action operations;
- health;
- webhooks;
- tests.

Connector packages should be versioned and independently testable.

---

# 52. Connector Marketplace

Future marketplace architecture:

`SDK → Connector Package → Security Review → Certification → Publication → Installation → Updates`

Third-party connectors must have:

- declared permissions;
- declared capabilities;
- version;
- author;
- security metadata;
- compatibility metadata;
- audit behavior.

No connector should receive hidden capabilities.

---

# 53. Configuration

Configuration levels:

1. Platform.
2. Organization.
3. Business.
4. Connector.
5. User.
6. Role.
7. Workflow.
8. AI policy.

Configuration changes must be audited.

Feature flags must support:

- gradual rollout;
- per-tenant enablement;
- rollback;
- experimental features;
- emergency disablement.

---

# 54. Multi-Region and Scalability

Architecture should be capable of scaling from:

- one business;
- one organization;
- one connector;

to:

- many businesses;
- many organizations;
- thousands of connectors;
- high query volume;
- distributed agents.

Scale-out components should be stateless where practical.

Stateful services must have documented replication and recovery strategies.

---

# 55. Performance Targets

Targets must be measurable and environment-specific.

Initial engineering objectives:

- fast dashboard shell load;
- parallel independent data retrieval;
- bounded connector calls;
- cancellation of abandoned queries;
- pagination for large datasets;
- streaming where appropriate;
- caching only where permitted;
- background report generation;
- queue-based long-running workflows.

Performance testing must use representative workloads rather than artificial single-user tests only.

---

# 56. Availability and Disaster Recovery

Production architecture should define:

- backups;
- restore tests;
- recovery point objective;
- recovery time objective;
- failover strategy;
- database recovery;
- queue recovery;
- connector recovery;
- secret recovery;
- configuration recovery.

A backup is not considered reliable until restoration has been tested.

---

# 57. Localization

Support:

- multiple currencies;
- time zones;
- localized dates;
- localized numbers;
- multilingual interfaces;
- multilingual AI interaction.

Currency and timezone must come from business configuration or source context, not global assumptions.

---

# 58. Accessibility

Support:

- keyboard navigation;
- screen readers;
- scalable text;
- sufficient contrast;
- accessible forms;
- accessible tables;
- accessible charts;
- reduced motion;
- clear focus states;
- semantic status indicators.

Accessibility is part of the definition of done.

---

# 59. Cross-Device Experience

EIP should support:

- desktop;
- laptop;
- tablet;
- phone.

Core functionality should remain consistent across devices while layouts adapt to screen size.

Security policies must remain consistent.

---

# 60. Dashboard Customization

Users may eventually:

- reorder widgets;
- show/hide widgets;
- pin KPIs;
- save views;
- create business dashboards;
- create portfolio dashboards;
- create role dashboards.

Customization cannot bypass authorization.

---

# 61. Business Health

Business health indicators must be explainable.

Potential evidence:

- sales trend;
- margin trend;
- receivables;
- payables;
- payment delays;
- inventory risk;
- expense variance;
- operational alerts.

Health indicators must show the underlying metrics and time period.

They must never be unexplained AI judgments.

---

# 62. Security Architecture

Security layers:

1. Identity.
2. Authentication.
3. Session security.
4. Authorization.
5. Tenant isolation.
6. Connector isolation.
7. Secret management.
8. Network security.
9. Input validation.
10. Output validation.
11. Audit.
12. Monitoring.
13. Incident response.

Threats to explicitly test:

- SQL injection;
- command injection;
- XSS;
- CSRF;
- SSRF;
- path traversal;
- broken access control;
- IDOR;
- credential leakage;
- prompt injection;
- replay attacks;
- webhook forgery;
- token theft;
- privilege escalation;
- tenant isolation failures.

---

# 63. Secrets Management

Secrets must be:

- encrypted;
- access-controlled;
- rotated;
- never logged;
- never returned to clients;
- scoped to connectors;
- revocable;
- fail-closed when unavailable or integrity checks fail.

### Credential encryption

Tenant database and integration credentials must use authenticated encryption backed by a platform-managed master secret.

Current EIP encryption requirements:

- AES-256-GCM;
- per-value random IV;
- master-key-backed per-organization derivation;
- organization context authenticated as additional data;
- explicit encryption version;
- no plaintext fallback;
- no Base64-as-encryption fallback;
- no organization-ID-only key material;
- unsupported or tampered ciphertext must fail closed.

The production master secret is `EIP_ENCRYPTION_MASTER_KEY`.

The secret must exist only in deployment secret storage/environment and must never be persisted in tenant data.

Legacy credentials may be migrated through an explicit, audited migration workflow. New writes must never generate legacy encryption formats.

Application configuration must distinguish:

- public configuration;
- sensitive configuration;
- secret material.

Database-selection failures caused by credential decryption/integrity failures must not silently redirect a tenant to another database.

---

# 64. Network Security

Required controls include:

- TLS;
- secure cookies;
- HSTS where appropriate;
- secure headers;
- CORS policy;
- network segmentation;
- egress controls;
- connector isolation;
- webhook verification;
- API rate limiting.

Internal services must authenticate to one another where required.

---

# 65. Secure Webhooks

Incoming webhooks must support:

- signature verification;
- timestamp validation;
- replay protection;
- schema validation;
- source identification;
- rate limiting;
- idempotency.

Never trust webhook payloads merely because they reach the endpoint.

---

# 66. Error Handling

Errors must be:

- structured;
- safe;
- actionable;
- traceable;
- non-sensitive.

Users should see useful explanations.

Developers should have correlation IDs and diagnostic context.

Secrets, tokens, stack traces, and internal credentials must not leak into user-facing errors.

---

# 67. Degraded Operation

When a source fails:

EIP should:

1. detect failure;
2. isolate the failure;
3. continue unaffected sources;
4. show the source as unavailable;
5. display last permitted known state only if retained;
6. label stale information;
7. avoid false completeness;
8. retry safely;
9. record the incident.

Queued actions must never be displayed as completed.

---

# 68. Data Freshness Contract

Every source-derived value has:

- source timestamp;
- retrieval timestamp;
- freshness class;
- source identity;
- cache state where applicable.

The UI must never make stale data look current.

---

# 69. Enterprise UX

The interface should feel:

- premium;
- clean;
- fast;
- trustworthy;
- professional;
- information-dense without being cluttered;
- responsive;
- consistent.

The system should expose complexity progressively.

Executives should see outcomes first.

Technical administrators should be able to inspect deeper details.

---

# 70. Design System

A shared design system must define:

- typography;
- spacing;
- colors;
- surfaces;
- cards;
- tables;
- forms;
- dialogs;
- notifications;
- charts;
- loading states;
- empty states;
- error states;
- accessibility states.

Product branding must remain consistent across EIP applications.

---

# 71. Mobile UX

Mobile must prioritize:

- dashboard summary;
- alerts;
- approvals;
- AI assistant;
- search;
- reports;
- urgent actions.

Large enterprise tables must provide responsive alternatives rather than simply shrinking unreadable columns.

---

# 72. International Enterprise Readiness

Architecture should support:

- KES and other currencies;
- VAT/tax configuration;
- regional business rules;
- timezone-aware schedules;
- localized document formats;
- configurable fiscal periods.

Country-specific rules must be implemented as configurable modules rather than hard-coded assumptions.

---

# 73. Compliance Architecture

EIP should support configurable compliance controls.

Depending on deployment and jurisdiction, the platform may need:

- audit retention;
- access reporting;
- data export;
- deletion workflows;
- policy enforcement;
- approval separation;
- financial record traceability.

Compliance claims must be verified against the actual deployment and applicable law.

---

# 74. Testing Strategy

## Unit

Test:

- permissions;
- normalization;
- calculations;
- parsers;
- query planning;
- policies;
- report generation.

## Integration

Test:

- authentication;
- connectors;
- source retrieval;
- mappings;
- actions;
- webhooks.

## Security

Test:

- tenant isolation;
- authorization;
- SSRF;
- injection;
- secret handling;
- session security;
- replay protection;
- prompt injection.

## End-to-End

Test:

`Login → Business → Connector → Live Data → Dashboard`

and:

`Natural Language → Query Plan → Source → Answer`

and:

`Report → Schedule → Generate → Store → Notify`

## Failure

Test:

- source offline;
- timeout;
- malformed response;
- revoked credential;
- partial response;
- duplicate action;
- permission removed during request;
- connector crash.

---

# 75. Test Data and Sandboxes

Each connector should support a safe test environment where possible.

Financial actions must never be tested against production accidentally.

Test environments must clearly identify:

- sandbox;
- staging;
- production.

Production credentials must never be silently used in development.

---

# 76. CI/CD

The repository should enforce:

- formatting;
- linting;
- type checking;
- unit tests;
- integration tests;
- security checks;
- build verification;
- dependency checks;
- migration checks where applicable.

Deployments should be:

- repeatable;
- traceable;
- reversible;
- environment-aware.

---

# 77. Database Architecture

The database must support:

- tenant isolation;
- migrations;
- indexed scope queries;
- audit records;
- configuration;
- workflows;
- reports;
- connector metadata.

Indexes should reflect real query patterns.

Database migrations must be versioned and tested.

Destructive migrations require explicit review.

---

# 78. Caching

Cache keys must include relevant scope.

Example:

`organization/business/resource/query-hash`

Caching must account for:

- permissions;
- TTL;
- source freshness;
- invalidation;
- privacy.

Sensitive responses must not be shared across users through incorrectly scoped caches.

---

# 79. Background Jobs

Long-running tasks should use workers/queues.

Examples:

- report generation;
- scheduled queries;
- document processing;
- connector synchronization;
- notifications;
- workflow execution.

Jobs must support:

- retries;
- idempotency;
- timeout;
- cancellation;
- status;
- failure reporting.

---

# 80. Scheduling

Schedules should support:

- timezone;
- start date;
- end date;
- recurrence;
- business scope;
- report definition;
- notification destination;
- failure behavior.

A schedule must not accidentally execute in UTC when the user expects local business time.

---

# 81. Import and Export

Exports must be:

- permission-checked;
- scoped;
- logged;
- time-limited where appropriate;
- protected against accidental data leakage.

Imports must support:

- schema validation;
- preview;
- mapping;
- duplicate detection;
- rollback or safe failure;
- audit.

---

# 82. Versioning

Version:

- APIs;
- connector contracts;
- UEM schemas;
- workflow definitions;
- report definitions;
- AI tool schemas;
- configuration schemas.

Backward compatibility should be maintained where practical.

Breaking changes require migration plans.

---

# 83. Migration Strategy

Migrations must define:

- current state;
- target state;
- transformation;
- rollback;
- validation;
- downtime requirement;
- data backup requirement.

No migration is complete until post-migration validation succeeds.

---

# 84. Feature Flags

Incomplete functionality must be protected with feature flags.

Flags may be scoped to:

- development;
- staging;
- organization;
- business;
- user;
- percentage rollout.

Emergency disablement must be possible for risky capabilities.

---

# 85. Licensing and Commercial Architecture

EIP should be architected so commercial controls can eventually support:

- organizations;
- plans;
- modules;
- connector limits;
- user limits;
- usage limits;
- AI usage;
- storage;
- reports;
- premium capabilities.

Licensing must not corrupt core authorization logic.

A disabled commercial feature should fail safely and transparently.

---

# 86. Usage Metering

Metering may track:

- users;
- businesses;
- connectors;
- queries;
- AI requests;
- report generation;
- workflow executions;
- storage;
- API calls.

Usage records must be accurate enough for billing and diagnostics.

---

# 87. Cost Controls

EIP should prevent uncontrolled infrastructure or AI costs through:

- quotas;
- rate limits;
- token budgets;
- query limits;
- connector limits;
- report limits;
- concurrency limits.

Cost controls must not silently corrupt business data retrieval.

---

# 88. Extensibility

New enterprise capabilities should be addable without redesigning the entire platform.

Architecture should use:

- interfaces;
- adapters;
- registries;
- schemas;
- events;
- plugins;
- capability contracts.

A new connector should not require hard-coding its UI throughout the platform.

---

# 89. Dynamic Capability UI

Where a connected system exposes a supported capability, the UI should be able to generate or configure:

- navigation;
- entity lists;
- filters;
- detail views;
- actions;
- reports.

Dynamic UI must still use approved schemas and design-system components.

Arbitrary remote HTML/JS must never be trusted as UI.

---

# 90. Enterprise Knowledge Graph

Future EIP versions may maintain a controlled semantic graph of:

- businesses;
- people;
- products;
- suppliers;
- customers;
- accounts;
- transactions;
- systems;
- relationships.

The graph should store references and derived relationships rather than becoming an uncontrolled operational-data copy.

---

# 91. Advanced Analytics

EIP may eventually support:

- trends;
- forecasting;
- anomaly detection;
- variance analysis;
- scenario analysis;
- KPI modeling;
- cohort analysis;
- cross-business benchmarking.

Analytical models must expose:

- input period;
- data sources;
- assumptions;
- model/version;
- limitations.

---

# 92. Forecasting

Forecasting is advisory unless explicitly incorporated into an authorized workflow.

Forecast outputs should include:

- forecast period;
- source data period;
- methodology/model;
- confidence information where statistically justified;
- assumptions;
- limitations.

Forecasts must never be presented as guaranteed outcomes.

---

# 93. Autonomous Operations

Advanced automation may eventually allow EIP to execute predefined actions automatically.

Autonomy requires:

- explicit policy;
- bounded scope;
- approved tools;
- action limits;
- spending limits;
- confirmation rules;
- kill switch;
- complete audit;
- failure handling.

Autonomous operation is never enabled merely because an AI model recommends it.

---

# 94. Human-in-the-Loop

For sensitive decisions, EIP should require humans to review:

- financial actions;
- sensitive data releases;
- destructive operations;
- security changes;
- high-risk workflows.

The system should make the evidence available to the human reviewer.

---

# 95. Incident Response

EIP should support:

- security alerts;
- incident creation;
- severity;
- assignment;
- evidence;
- containment;
- connector revocation;
- credential rotation;
- investigation;
- resolution;
- post-incident reporting.

Critical incidents should be traceable from detection to resolution.

---

# 96. Backup and Restore

Backup scope includes:

- configuration;
- organization data;
- audit data according to policy;
- workflows;
- report definitions;
- required historical metrics.

Restore tests must verify:

- integrity;
- tenant boundaries;
- permissions;
- connector configuration;
- application functionality.

---

# 97. Documentation

The repository must maintain documentation for:

- architecture;
- APIs;
- connector contracts;
- UEM;
- permissions;
- deployment;
- operations;
- security;
- troubleshooting;
- workflows;
- AI tools;
- configuration;
- testing.

Documentation must be updated with architectural changes.

---

# 98. Developer Rules

Developers must:

1. Read the master specification before major implementation.
2. Prefer reusable abstractions.
3. Avoid one-off hacks.
4. Preserve source traceability.
5. Never bypass authorization for convenience.
6. Add tests with important features.
7. Add observability to important services.
8. Document new public contracts.
9. Keep migrations reversible where possible.
10. Never commit secrets.
11. Avoid unnecessary data duplication.
12. Keep incomplete features behind flags.
13. Preserve backward compatibility where required.
14. Treat security failures as release blockers.
15. Keep implementation aligned with this specification.

---

# 99. Definition of Done

A feature is **not complete** because the UI exists.

A production feature requires:

- architecture;
- implementation;
- authorization;
- tenant isolation;
- data policy;
- integration;
- validation;
- error handling;
- audit;
- observability;
- tests;
- documentation;
- security review;
- migration strategy where required;
- freshness state;
- failure behavior;
- rollback/recovery plan where appropriate.

A feature is complete only when all applicable requirements pass verification.

---

# 100. Definition of EIP Complete

EIP is considered complete for a release only when:

- required specification items are implemented;
- critical user journeys work;
- supported connectors are reliable;
- authorization is verified;
- tenant isolation is tested;
- AI cannot bypass security;
- reports work;
- alerts work;
- workflows work;
- required actions are safe;
- audit is functional;
- observability is operational;
- backup/restore has been tested;
- deployment is repeatable;
- security testing has passed;
- documentation is current;
- known blockers are resolved or explicitly accepted.

“Looks finished” is not the definition of complete.

---

# 101. Canonical User Journey — Opening

`Owner Login → Resolve Authorized Businesses → Load Dashboard → Retrieve Live Signals → Normalize → Summarize → Show Attention Items → Remain Ready`

The owner should immediately understand:

- what is happening;
- what needs attention;
- which data is live;
- which systems are unavailable.

---

# 102. Canonical User Journey — Question

Example:

> “Check all cheques that haven't been processed.”

Process:

1. Resolve user.
2. Resolve organization.
3. Resolve business scope.
4. Resolve payment capability.
5. Resolve cheque entity.
6. Check permission.
7. Select source.
8. Build query.
9. Retrieve live data.
10. Normalize.
11. Validate.
12. Display result.
13. Display source and timestamp.
14. Log the request.

---

# 103. Canonical User Journey — Report

Example:

> “Send me this report every morning.”

Process:

1. Resolve report.
2. Resolve scope.
3. Resolve schedule timezone.
4. Validate permissions.
5. Save schedule.
6. Execute at scheduled time.
7. Retrieve authorized data.
8. Generate report.
9. Store artifact according to policy.
10. Deliver.
11. Record status.

---

# 104. Canonical User Journey — Action

Example:

> “Approve this supplier payment.”

Process:

1. Identify payment.
2. Verify source.
3. Verify user.
4. Verify business scope.
5. Verify permission.
6. Verify action capability.
7. Apply policy.
8. Apply risk classification.
9. Request confirmation if required.
10. Execute through connector.
11. Confirm source response.
12. Record source transaction/result.
13. Audit.

No step may be skipped because the request came from AI.

---

# 105. Development Phases

## Phase 1 — Foundation

- organizations;
- businesses;
- users;
- sessions;
- roles;
- permissions;
- audit;
- security foundations.

## Phase 2 — SuperAdmin

- platform administration;
- users;
- organizations;
- businesses;
- connectors;
- health;
- configuration;
- licensing.

## Phase 3 — Business Owner Experience

- business selector;
- executive dashboard;
- navigation;
- settings;
- users;
- roles.

## Phase 4 — Connector Fabric

- registry;
- authentication;
- lifecycle;
- health;
- secrets;
- capability discovery.

## Phase 5 — Live Access Engine

- query planner;
- live retrieval;
- normalization;
- caching;
- freshness;
- partial failure.

## Phase 6 — Business Capabilities

- ERP;
- POS;
- HR;
- CRM;
- finance;
- inventory;
- payments;
- cheques.

## Phase 7 — UEM

- entities;
- mappings;
- entity resolution;
- provenance.

## Phase 8 — Universal Query

- natural language;
- intent;
- query planning;
- cross-system retrieval.

## Phase 9 — Executive Intelligence

- summaries;
- anomalies;
- evidence;
- recommendations.

## Phase 10 — Portfolio Intelligence

- comparison;
- portfolio;
- attention;
- group reporting.

## Phase 11 — Reporting

- reports;
- schedules;
- artifacts;
- snapshots.

## Phase 12 — Alerts and Approvals

- alert engine;
- approval queues;
- escalation;
- notifications.

## Phase 13 — Action Engine

- create;
- update;
- approve;
- reject;
- send;
- trigger.

## Phase 14 — Connector Agent

- private networks;
- local databases;
- on-premise systems.

## Phase 15 — Advanced Integrations

- SOAP;
- messaging;
- legacy;
- specialized protocols.

## Phase 16 — Ecosystem

- SDK;
- marketplace;
- public API;
- partner connectors.

## Phase 17 — Advanced Intelligence

- forecasting;
- proactive monitoring;
- workflow planning;
- bounded autonomous operations.

---

# 106. Implementation Order Rule

Implementation must proceed in order unless a dependency requires otherwise.

A phase is not considered complete merely because coding has started.

Before advancing:

- implementation complete;
- tests complete;
- security verified;
- integration verified;
- documentation updated;
- acceptance criteria passed.

---

# 107. Project Completion Discipline

EIP development must follow:

`ONE PROJECT → COMPLETE → TEST → AUDIT → ACCEPT → CLOSE → NEXT PROJECT`

No unrelated Ellines project should be introduced into an active EIP implementation cycle.

Within EIP, work should also remain focused on the current phase until its acceptance criteria are satisfied.

---

# 108. Release Gates

### Gate A — Development

Code exists and local tests run.

### Gate B — Integration

Dependencies and connectors work.

### Gate C — Security

Authorization and security tests pass.

### Gate D — Reliability

Failure/recovery tests pass.

### Gate E — User Acceptance

Required workflows work end-to-end.

### Gate F — Production

Deployment, monitoring, backups, and rollback are ready.

A feature cannot be called production-ready before the applicable gates pass.

---

# 109. Master Acceptance Matrix

Every major capability must eventually have:

| Capability | UI | API | Auth | Data Policy | Tests | Audit | Observability | Failure Handling | Docs |
|---|---|---|---|---|---|---|---|---|---|
| Identity | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Businesses | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Connectors | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Live Queries | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| UEM | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| AI | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Reports | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Alerts | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Workflows | Required | Required | Required | Required | Required | Required | Required | Required | Required |
| Actions | Required | Required | Required | Required | Required | Required | Required | Required | Required |

---

# 110. Current Repository Alignment

The current repository architecture is expected to remain modular:

```
apps/
  web/
  api-gateway/

services/
  identity/
  integration-hub/
  ellinea-ai/
  workflow/
  notification/

packages/
  shared/
  ui/
  connectors-sdk/
  config/

infra/
  docker/
  k8s/

docs/
assets/
```

The implementation may evolve this structure when justified, but changes must preserve the architectural principles in this document.

---

# 111. Existing Product Documentation

The master specification must remain the highest-level architectural contract.

Other documents should specialize rather than contradict it.

Examples:

- product overview;
- MVP scope;
- master blueprint;
- enterprise lexicon;
- build queue;
- automation instructions;
- API references;
- RBAC references;
- SuperAdmin specification;
- deployment documentation.

When documents conflict, the conflict must be resolved explicitly rather than allowing two competing truths.

---

# 112. Change Control

A major architectural change must document:

- reason;
- affected components;
- migration;
- security implications;
- compatibility;
- tests;
- rollback;
- documentation changes.

The master specification should be updated before or together with implementation of major architectural changes.

---

# 113. Future Capability Categories

EIP should remain extensible toward:

- manufacturing;
- logistics;
- fleet;
- procurement;
- banking;
- education;
- healthcare;
- hospitality;
- property;
- e-commerce;
- messaging;
- project management;
- custom enterprise applications.

These are capability families, not mandatory modules for every deployment.

---

# 114. Enterprise Intelligence Loop

The long-term EIP loop is:

```
CONNECT
   ↓
DISCOVER
   ↓
UNDERSTAND
   ↓
QUERY
   ↓
NORMALIZE
   ↓
VALIDATE
   ↓
ANALYZE
   ↓
EXPLAIN
   ↓
REPORT
   ↓
ALERT
   ↓
RECOMMEND
   ↓
APPROVE
   ↓
ACT
   ↓
AUDIT
   ↓
LEARN FROM AUTHORIZED HISTORY
   ↓
IMPROVE
```

Every transition must remain bounded by policy and authorization.

---

# 115. Final Architectural Principles

1. Source systems remain authoritative.
2. Live data is preferred for current operational questions.
3. Stored data must have a purpose.
4. AI is not authorization.
5. Every important answer should have evidence.
6. Every action must be auditable.
7. Every business must be isolated.
8. Every connector must be isolated.
9. Unsupported capabilities must not appear functional.
10. Stale data must never look live.
11. Failures must be visible.
12. Financial actions require idempotency.
13. Security is part of the feature, not a later addition.
14. The platform must remain vendor-neutral.
15. New capabilities should use reusable contracts.
16. Human oversight remains available for high-risk operations.
17. EIP must scale without becoming architecturally chaotic.
18. Privacy and data minimization are default behaviors.
19. Documentation must remain synchronized with implementation.
20. Completion means verified functionality, not merely visible functionality.

---

# 116. Final Product Definition

Ellines EIP is:

> **A secure, intelligent, live enterprise command platform that connects authorized business systems, understands their capabilities and data, unifies their meaning, provides evidence-backed intelligence, coordinates workflows, produces reports, surfaces attention items, and executes only explicitly authorized actions while preserving the source systems as authoritative records.**

The platform must be:

**Secure. Live. Explainable. Extensible. Multi-business. Vendor-neutral. Auditable. Reliable. AI-native. Human-controlled.**

---

# 117. Final Rule

> **EIP should know enough to help, retrieve enough to answer, store enough to remember what the organization explicitly needs remembered, and never obtain or retain more than necessary.**

This document is the canonical master specification for Ellines EIP.

Implementation must follow it.


---
## Source: docs/01_EIP_in_60_seconds.md

# Ellines EIP in 60 Seconds

**Ellines EIP** — *Enterprise Intelligence Platform*  
*Where Enterprise Systems Think Together.*  
Powered by **Ellinea AI**

---

## The Problem

Modern organizations run dozens of systems — ERP, CRM, hospital information systems, payroll, inventory, email, and more. Each works well on its own, but together they create **information silos**. Leaders spend hours collecting reports instead of making decisions.

## The Solution

**Ellines EIP does not replace your existing systems.** It sits above them as the **System of Intelligence (SoI)** while your current software remains the **System of Record (SoR)**.

```
         CEO / Director / Manager
                    │
              Ellinea AI
                    │
         ┌─────────────────────┐
         │     Ellines EIP      │  ← System of Intelligence
         └─────────────────────┘
              ▲           ▲
              │           │
        Integration    Event Bus
              │           │
         ┌─────────────────────┐
         │  Your Existing       │  ← System of Record
         │  Business Systems    │     (Hospidia, ERP, CRM…)
         └─────────────────────┘
```

## What It Does

| Pillar | What EIP Delivers |
|--------|-------------------|
| **Connect** | Integrate ERP, CRM, databases, APIs, email, and files |
| **Understand** | Unified dashboards, search, and enterprise context |
| **Decide** | AI insights, CEO Daily Brief, risk alerts, recommendations |
| **Automate** | Approvals, workflows, notifications, scheduled reports |
| **Learn** | Enterprise Memory — policies, decisions, and knowledge preserved |

## Who It's For

- **CEOs and executives** who need one view across companies, branches, and departments
- **Operations leaders** who need real-time visibility without replacing existing software
- **Healthcare, retail, manufacturing, finance, education, and government** organizations with multiple systems

## MVP v1.0 (What We Build First)

1. Identity & organization management (SSO, RBAC)
2. Integration Hub (REST API, PostgreSQL, CSV, Email connectors)
3. Executive Command Center (dashboard + KPIs)
4. Ellinea AI (natural language Q&A + daily brief)
5. Enterprise Memory (document store + search)
6. Basic workflows & notifications

## Why It's Different

| Traditional Software | Ellines EIP |
|---------------------|-------------|
| Records transactions | Understands the business |
| Generates reports | Generates intelligence |
| Waits for commands | Observes, learns, recommends |
| Replaces systems | Connects and enhances them |

## One Line That Says It All

> **Ellines EIP does not replace enterprise systems. It connects them, understands them, learns from them, and transforms them into one intelligent enterprise.**

---

*Developed by Ellines Tech · Confidential*

---
## Source: docs/02_MVP_Scope_v1.0.md

# Ellines EIP — MVP Scope v1.0

**Product:** Ellines EIP (Enterprise Intelligence Platform)  
**Version:** 1.0 Foundation  
**Status:** Approved for development  
**Powered by:** Ellinea AI

---

## MVP Goal

Deliver a working **Enterprise Intelligence Platform** that connects 3–5 external systems, gives executives a unified dashboard, and enables natural-language intelligence via Ellinea AI — without replacing any existing business software.

**Target maturity level:** Level 2–3 (Connected → Visible → Intelligent)

---

## In Scope (v1.0)

### Phase 1 — Platform Foundation (Weeks 1–6)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 1.1 | **Monorepo & CI** | Project structure, linting, Docker, GitHub Actions | P0 |
| 1.2 | **Identity Core** | Organizations, users, roles, RBAC, JWT auth | P0 |
| 1.3 | **API Gateway** | Central routing, auth middleware, rate limiting | P0 |
| 1.4 | **Audit Trail** | Log all user and system actions | P0 |
| 1.5 | **Admin Console** | Org setup, user management, connector config | P0 |

**Exit criteria:** Admin can create org, add users, assign roles, and all API calls are authenticated and audited.

---

### Phase 2 — Integration Hub (Weeks 5–10)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.1 | **Connector Framework** | Plugin architecture + connector SDK | P0 |
| 2.2 | **REST API Connector** | Pull data from external REST APIs | P0 |
| 2.3 | **PostgreSQL Connector** | Read-only sync from PostgreSQL databases | P0 |
| 2.4 | **CSV/File Connector** | Scheduled import of CSV/Excel files | P1 |
| 2.5 | **Email Connector** | IMAP ingestion + summarization pipeline | P1 |
| 2.6 | **Universal Enterprise Model** | Normalize external data to shared schema | P0 |
| 2.7 | **Sync Scheduler** | Configurable sync intervals per connector | P0 |

**Launch connectors:** REST API, PostgreSQL, CSV, Email (4 minimum)

**Exit criteria:** At least 2 live data sources feeding normalized enterprise data.

---

### Phase 3 — Executive Command Center (Weeks 9–14)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 3.1 | **Executive Dashboard** | Role-based web dashboard (CEO/Director view) | P0 |
| 3.2 | **KPI Widgets** | Revenue, operations, alerts — configurable | P0 |
| 3.3 | **Enterprise Health Score** | Composite 0–100 score with drill-down | P1 |
| 3.4 | **Enterprise Timeline** | Chronological event feed | P1 |
| 3.5 | **Enterprise Search** | Full-text search across connected data | P1 |
| 3.6 | **Notification Center** | In-app + email alerts | P0 |

**Exit criteria:** Executive sees unified KPIs from connected systems on one dashboard.

---

### Phase 4 — Ellinea AI (Weeks 13–18)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 4.1 | **Natural Language Q&A** | Ask questions about enterprise data | P0 |
| 4.2 | **CEO Daily Brief** | Automated morning summary | P0 |
| 4.3 | **Explainable Recommendations** | Insights with evidence + confidence score | P0 |
| 4.4 | **Enterprise Memory** | Store policies, decisions, documents | P0 |
| 4.5 | **Context Engine** | Role, org, and Enterprise DNA-aware responses | P1 |
| 4.6 | **Chat Interface** | Web-based Ask Ellinea assistant | P0 |

**Example queries v1 must support:**
- "How are all my businesses performing today?"
- "Summarize yesterday's critical alerts."
- "Which branches need immediate attention?"
- "Generate this week's executive report."

**Exit criteria:** CEO receives daily brief and can ask natural-language questions with explainable answers.

---

### Phase 5 — Workflow & Automation (Weeks 17–20)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 5.1 | **Approval Workflows** | Configurable multi-step approvals | P1 |
| 5.2 | **Business Rules Engine** | If/then rules on enterprise events | P1 |
| 5.3 | **Scheduled Reports** | Daily/weekly PDF or email reports | P1 |
| 5.4 | **Event Bus** | Internal pub/sub for enterprise events | P0 |

**Exit criteria:** At least one approval workflow and one scheduled report running in production.

---

## Out of Scope (v1.0 — Future Versions)

| Feature | Target Version |
|---------|---------------|
| **Mobile Work Companion** (simplified phone app: fleet/car tracking, employee register, pull live data, summary reports, Ellinea suggestions, work-email summarization — wraps Systems of Record; Owner / permitted employees) | v1.1 |
| Marketplace / connector store | v2.0 |
| Digital twin | v2.0+ |
| IoT / GPS connectors | v2.0 |
| Autonomous AI agents | v2.0+ |
| Multi-company consolidation | v1.1 |
| Voice assistant | v2.0 |
| Offline edge deployment | v1.1 |
| Industry solution packs | v1.2 |
| RPA connectors | v2.0 |
| Ellinea continuous learning (feedback + DNA) | v1.0 late / v1.1 |
| Ellinea AI standalone service + SDK | v1.1–v2.0 |

---

## Build Order Summary

```
Week  1–6   ████ Identity + API Gateway + Admin
Week  5–10  ████ Integration Hub + Connectors
Week  9–14  ████ Executive Dashboard + Search
Week 13–18  ████ Ellinea AI + Enterprise Memory
Week 17–20  ████ Workflows + Events + Reports
```

**Critical path:** Identity → Integration Hub → Dashboard → Ellinea AI

---

## Technical Stack (v1.0)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, TypeScript |
| API Gateway | Node.js / Fastify or NestJS |
| Services | Node.js microservices |
| Database | PostgreSQL (primary), Redis (cache/queue) |
| Search | PostgreSQL full-text → Elasticsearch in v1.1 |
| AI | LLM API + RAG over Enterprise Memory |
| Message Queue | Redis Streams or RabbitMQ |
| Containers | Docker + Docker Compose (dev), K8s (prod) |

---

## Success Metrics (v1.0)

| Metric | Target |
|--------|--------|
| Connectors live | ≥ 4 |
| Dashboard load time | < 2 seconds |
| Daily brief generation | < 60 seconds |
| NL query response | < 10 seconds |
| Uptime | 99.5% |
| Pilot customer | 1 organization live |

---

## Pilot Scenario

**Recommended first deployment:** Multi-branch business or hospital group using an existing System of Record (e.g., Hospidia) where EIP connects read-only, provides executive intelligence, and never modifies source data.

---

*This document is the authoritative MVP scope. All v1.0 development must align with this scope unless explicitly revised.*

---
## Source: docs/03_Master_Blueprint.md

# Ellines EIP — Master Blueprint

**Ellines EIP (Enterprise Intelligence Platform)**  
*Where Enterprise Systems Think Together.*  
Powered by **Ellinea AI** · Developed by **Ellines Tech**

> **Official name:** Ellines EIP (Enterprise Intelligence Platform)  
> **AI engine:** Ellinea AI  
> **Parent company:** Ellines Tech

---

## 1. Executive Summary

Ellines EIP is an AI-native enterprise operating platform that **does not replace existing business systems**. Instead, it integrates with them, unifies their data, understands organizational context through Ellinea AI, and transforms isolated information into enterprise-wide intelligence, automation, and executive decision support.

Ellines EIP becomes the organization's **digital brain** — connecting people, processes, systems, devices, and data into one intelligent ecosystem.

### Core Value Proposition

> Ellines EIP does not replace enterprise systems. It connects them, understands them, learns from them, and transforms them into one intelligent enterprise.

### System of Record vs. System of Intelligence

| Layer | Role | Example |
|-------|------|---------|
| **System of Record (SoR)** | Stores and manages business transactions | Hospidia, SAP, Odoo, QuickBooks |
| **System of Intelligence (SoI)** | Connects, analyzes, recommends, automates | **Ellines EIP** |

Existing systems continue operating unchanged. EIP observes, analyzes, summarizes, and automates **only where authorized**.

---

## 2. Vision & Mission

**Vision:** To become the world's leading Enterprise Intelligence Platform, enabling organizations of every size and industry to operate as intelligent, connected, secure, and autonomous enterprises.

**Vision Statement:** One Question. One Platform. Every Business. Unlimited Intelligence.

**Mission:** To empower every organization with enterprise intelligence by connecting existing systems, automating complex operations, delivering real-time insights, and enabling AI-assisted decision-making from anywhere in the world.

---

## 3. The EIP Manifesto

1. We build intelligence, not just software.
2. Every enterprise already has systems; EIP enables them to think together.
3. AI must assist people, not replace sound human judgment.
4. Integration comes before duplication.
5. Security, privacy, and auditability are foundational.
6. Offline capability is a first-class feature.
7. Every feature must deliver measurable business value.
8. Design for scalability from startup to multinational enterprise.
9. Keep the platform modular and API-first.
10. Continuously learn from enterprise knowledge through Ellinea AI.

---

## 4. The Five Pillars

| Pillar | Purpose |
|--------|---------|
| **Connect** | Integrate ERP, CRM, HR, finance, healthcare, and third-party systems |
| **Understand** | Interpret enterprise data, documents, emails, conversations, and workflows |
| **Decide** | Generate executive insights, risk analysis, and recommendations |
| **Automate** | Execute approved workflows, notifications, and recurring processes |
| **Learn** | Continuously improve from organizational knowledge and feedback |

---

## 5. Enterprise Intelligence Maturity Model

| Level | Name | Outcome |
|-------|------|---------|
| 1 | Connected | Integrate existing systems; centralize authentication |
| 2 | Visible | Unified dashboards, reporting, and notifications |
| 3 | Intelligent | AI-driven insights, summaries, and recommendations |
| 4 | Autonomous | Workflow automation and AI agents execute approved tasks |
| 5 | Predictive Enterprise | Continuous forecasting, optimization, and strategic guidance |

**MVP v1.0 targets Levels 1–3.**

---

## 6. Intelligence Domains

Ellines EIP is organized around **Intelligence Domains** — not isolated software modules:

- Executive Intelligence
- Financial Intelligence
- Workforce Intelligence
- Customer Intelligence
- Clinical Intelligence
- Operational Intelligence
- Supply Chain Intelligence
- Project Intelligence
- Communication Intelligence
- Risk & Compliance Intelligence
- Cybersecurity Intelligence
- Knowledge Intelligence

---

## 7. Core Platform Services

| Service | Purpose |
|---------|---------|
| **Identity Core** | SSO, RBAC, MFA, organization management |
| **Integration Hub** | Connects ERPs, CRMs, databases, APIs, email |
| **Workflow Engine** | Designs and automates business processes |
| **Event Bus** | Distributes enterprise events in real time |
| **Document Hub** | Stores and indexes enterprise documents |
| **Notification Center** | Email, SMS, WhatsApp, push, in-app alerts |
| **Reporting Hub** | Unified reporting across every domain |
| **Audit Center** | Immutable audit trail for all platform activities |
| **Ellinea AI** | Enterprise intelligence engine |

---

## 8. Ellinea AI — Enterprise Intelligence Engine

Ellinea AI combines Enterprise Intelligence, Enterprise Memory, Enterprise Context, Enterprise DNA, and AI models to deliver trusted, explainable, actionable intelligence.

### v1.0 Capabilities
- Natural language Q&A across connected systems
- CEO Daily Brief (automated executive summary)
- Explainable recommendations with confidence scores
- Email summarization and prioritization
- Enterprise Memory (document + decision storage)
- Context-aware responses (role, org, department)

### Continuous learning (v1.0 → v1.1)
- Capture Owner/Admin feedback on recommendations (helpful / dismiss)
- Grow Enterprise Memory™ and Enterprise DNA™ from decisions and approvals
- Re-rank insights from outcomes over time (per organization only)
- Ground answers with RAG once server Memory exists

### Ellinea as a standalone engine (post-Foundation)
Ellinea AI is the intelligence product of Ellines Tech. EIP is the first full platform that embeds it. After Foundation, extract Ellinea as:
- a dedicated service + API (`ask` / `brief` / `recommend` / `memory` / `feedback`)
- an SDK other Ellines products and partner systems can use
- tenant-isolated learning so each business teaches Ellinea *its* way of working

See build queue Phase 4 (`4.7`–`4.10`, `4.S`) and Phase 6.

### Future Capabilities (v2.0+)
- Autonomous AI agents
- Enterprise knowledge graph
- Predictive maintenance
- Digital twin
- Voice assistant
- Cross-company benchmarking

---

## 9. Key Enterprise Concepts

| Concept | Definition |
|---------|------------|
| **Enterprise Memory** | Permanent repository of organizational knowledge, decisions, and history |
| **Enterprise DNA** | Digital representation of an organization's unique identity, policies, and rules |
| **Enterprise Context** | Complete operational environment surrounding any request or decision |
| **Enterprise Insight** | Meaningful observation or recommendation generated from enterprise intelligence |
| **Enterprise Health Score** | Composite 0–100 metric of organizational health |
| **Enterprise Timeline** | Chronological history of all significant enterprise events |
| **Enterprise Intelligence Layer** | Core layer that connects systems and generates intelligence above them |

*Full definitions: see [04_Enterprise_Lexicon.md](./04_Enterprise_Lexicon.md)*

---

## 10. Ellines Enterprise Reference Architecture (EERA)

| Layer | Purpose |
|-------|---------|
| **Experience Layer** | Web, Mobile, Desktop, Voice, APIs |
| **Intelligence Layer** | Ellinea AI, Decision Engine, Knowledge Graph |
| **Business Layer** | Industry solution packs and enterprise services |
| **Integration Layer** | API Gateway, Event Bus, Connectors, ETL |
| **Data Layer** | Operational DBs, analytics, search, backups |
| **Infrastructure Layer** | Cloud, on-premises, hybrid, containers |

---

## 11. Universal Enterprise Object Model

| Object | Primary Usage |
|--------|--------------|
| Organization | Global configuration |
| Branch | Multi-site operations |
| Department | Business units |
| Person | Employees, patients, customers |
| User | Authentication |
| Document | Enterprise records |
| Asset | Asset lifecycle |
| Task | Workflow engine |
| Notification | Enterprise alerts |
| Event | Enterprise timeline |

---

## 12. Integration Framework

| Method | Use Case |
|--------|----------|
| REST/GraphQL API | Modern platforms (preferred) |
| Database sync | PostgreSQL, MySQL, SQL Server, Oracle |
| Event streaming | Kafka, RabbitMQ, MQTT |
| File import | CSV, Excel, XML, JSON |
| Email | IMAP ingestion and summarization |
| Connector SDK | Custom connector development |

**Principle:** Read-only by default. Write operations require explicit authorization and audit.

---

## 13. Deployment Models

- Cloud SaaS
- Private Cloud
- Hybrid Cloud
- On-Premises
- Offline Edge (v1.1+)
- Multi-Site / Multi-Company

---

## 14. Security & Governance

- Role-Based Access Control (RBAC)
- Multi-Factor Authentication (MFA)
- Single Sign-On (SSO)
- Encryption in transit and at rest
- Immutable audit trails
- AI governance (explainable, human-approved for sensitive actions)
- Data ownership remains with the customer

---

## 15. Trustworthy AI Principles

1. AI recommendations must be explainable.
2. Human approval remains available for sensitive actions.
3. Every AI action is logged and auditable.
4. Customers retain ownership of their data.
5. Models configurable for local deployment where required.

---

## 16. Product Roadmap

| Version | Focus | Major Deliverables |
|---------|-------|-------------------|
| **1.0** | Foundation | Core platform, AI, integrations, security |
| **1.1** | Growth + learning | **Mobile Work Companion** (phone ops: fleet, people, reports, Ellinea everywhere — wraps SoR); offline; multi-company; Ellinea API extract |
| **2.0** | Enterprise | Marketplace, advanced analytics, industry packs; **Ellinea standalone SDK** |
| **3.0** | Autonomous | AI agents, digital twin, predictive operations |

*Detailed v1.0 scope: [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)*

---

## 17. Brand Identity

| Element | Value |
|---------|-------|
| Product name | Ellines EIP (Enterprise Intelligence Platform) |
| Tagline | Where Enterprise Systems Think Together |
| AI engine | Ellinea AI |
| Parent brand | Ellines Tech |
| Primary purple | `#6F2D8D` |
| Deep purple | `#4A148C` |
| Vibrant blue | `#2563EB` |
| Dark navy | `#0F172A` |
| Typography | Exo 2 (Bold, SemiBold, Regular) |

*Brand assets: `assets/brand/`*

---

## 18. Architecture Review Checklist

Every new feature must answer:

- [ ] Does it reuse EIP Core services?
- [ ] Does it improve enterprise intelligence?
- [ ] Can it be configured instead of customized?
- [ ] Is it secure by design?
- [ ] Does it expose standard APIs?
- [ ] Can Ellinea AI understand and assist with it?
- [ ] Is it measurable through KPIs?

---

## 19. Competitive Positioning

Ellines EIP is **not** another ERP, reporting tool, dashboard, or chatbot. It is the **Enterprise Intelligence Platform** that enables enterprise systems to think together.

It sits above existing systems — vendor-neutral, non-intrusive, and investment-protecting — similar in ambition to enterprise data intelligence platforms but differentiated by:
- Universal connector framework
- Enterprise Memory + Enterprise DNA
- Explainable Ellinea AI
- Multi-company / multi-industry from day one
- Offline-first capability

---

*This is the single authoritative product blueprint. Technical implementation details live in the codebase and service READMEs.*

---
## Source: docs/04_Enterprise_Lexicon.md

# Ellines EIP — Enterprise Lexicon (Summary)

**Official vocabulary for Ellines EIP (Enterprise Intelligence Platform)**  
Version 1.0 · Ellines Tech

> Whenever a defined term appears in any Ellines product, document, API, or UI, the definitions here take precedence.

---

## Part I — Enterprise Concepts

### EC-001 Enterprise
An organized entity that achieves objectives through people, processes, information, technology, and governance. The highest organizational unit managed by Ellines EIP.

### EC-002 Enterprise Intelligence
The capability of transforming operational data, Enterprise Memory, Enterprise Context, Enterprise DNA, and AI into trusted, explainable insights that improve decision-making.

### EC-003 Enterprise Memory™
The permanent organizational repository preserving history, decisions, documents, conversations, policies, and institutional knowledge — answering *"What has happened throughout the life of the organization?"*

### EC-004 Enterprise DNA™
The digital representation of an organization's unique identity — policies, rules, governance, culture, and decision patterns. Enables Ellinea AI to adapt to how *this* organization operates.

### EC-005 Enterprise Context
The complete set of circumstances surrounding any event, request, or decision — user role, department, branch, permissions, time, workflow, and connected systems.

### EC-006 Enterprise Insight
A meaningful conclusion, recommendation, prediction, or explanation generated through Enterprise Intelligence. Actionable, explainable, and evidence-based.

### EC-010 Enterprise Health
The overall condition of an organization across financial, operational, workforce, technology, compliance, and customer dimensions.

### EC-011 Enterprise Health Score™
Standardized composite 0–100 measurement of organizational health with explainable drill-down.

### EC-013 Enterprise Governance
The system of leadership, policies, decision authority, accountability, and controls directing how an enterprise operates.

### EC-030 Enterprise Decision
A deliberate organizational choice made using Enterprise Intelligence, context, governance, and evidence. Must be transparent, explainable, and auditable.

### EC-032 Enterprise Workflow
The ordered sequence of tasks, approvals, decisions, and automated actions to complete a business activity.

### EC-034 Enterprise Event
Any significant occurrence that may influence operations, workflows, decisions, or compliance. Stored on the Enterprise Timeline.

### EC-036 Enterprise Intelligence Layer (EIL)
The core intelligence component connecting enterprise systems, applying context and AI, and generating intelligence **above** existing Systems of Record — non-intrusive and vendor-neutral.

### EC-038 Enterprise Timeline
Chronological history of significant enterprise events, decisions, and milestones within Enterprise Memory.

### EC-040 Intelligent Enterprise
An organization that continuously senses, understands, learns, decides, and acts through Enterprise Intelligence, AI, automation, and human expertise.

---

## Part II — Artificial Intelligence Concepts

### AI-001 Artificial Intelligence
Computer systems that perceive, reason, learn, and assist decision-making. Within Ellines, AI **augments** human expertise under governance and oversight.

### AI-002 Enterprise Artificial Intelligence
AI applied within an enterprise using enterprise data, governance, business rules, and Enterprise Context.

### AI-003 Ellinea AI™
The official Enterprise Intelligence Engine of Ellines EIP. Purpose-built to understand organizations, their structures, workflows, policies, and connected systems.

### AI-004 AI Agent
An autonomous software entity within Ellinea AI that performs specialized intelligent tasks within assigned authority and governance.

### AI-005 AI Assistant
The conversational interface (natural language, voice) through which users interact with Ellinea AI.

### AI-010 AI Recommendation
An explainable, evidence-based suggestion with confidence score, supporting factors, and expected outcomes.

### AI-011 AI Confidence
Quantified certainty (0–100%) assigned to predictions and recommendations based on evidence quality and context.

### AI-012 AI Explainability
The capability to clearly communicate how a conclusion or recommendation was reached — transparent, auditable, trustworthy.

---

## Part III — Architecture Concepts

### Universal Connector Framework
Configurable architecture mapping external system data into the Universal Enterprise Model. Supports API, database, file, event, and email integration.

### Universal Enterprise Object Model
Shared schema: Organization, Branch, Department, Person, User, Document, Asset, Task, Notification, Event.

### Event Bus / Event Mesh
Distributes standardized enterprise events securely to modules, integrations, and Ellinea AI.

### Enterprise Command Language
Consistent natural-language commands across all modules:
- *"Summarize today's business performance."*
- *"Show branches with declining revenue."*
- *"Find overdue approvals."*

---

## Usage Rules

1. Use **Ellines EIP (Enterprise Intelligence Platform)** as the full official name on first reference; **Ellines EIP** thereafter.
2. Use **Ellinea AI** (not "Ellinea" alone) when referring to the AI engine.
3. Trademark terms (Enterprise Memory™, Enterprise DNA™, Ellinea AI™) use ™ in official documents.
4. API identifiers use snake_case: `enterprise_memory`, `enterprise_dna`, `ellinea_ai`.
5. UI labels use title case: "Enterprise Memory", "Enterprise Health Score".

---

*Full lexicon with all 40+ enterprise concepts and 15+ AI concepts will expand in this document as the platform grows.*

---
## Source: docs/09_Access_Layers.md

# Ellines EIP — Access Layers

**Product:** Ellines EIP v1.0 Foundation  
**Related:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md), [04_Enterprise_Lexicon.md](./04_Enterprise_Lexicon.md)

Ellines EIP has **three access layers** on one product — not three separate apps for CEO / HR / Manager.

---

## Layers

| Layer | Route | Who | Job |
|-------|-------|-----|-----|
| **Work Console** | `/app` | Business users | Decide and act — KPIs, alerts, Ellinea — grounded in connected System B data |
| **Org Admin / IT** | `/app/admin`, `/app/connectors` | Owner + invited IT | People, authority, connectors to prime systems |
| **Platform Super Admin** | `/app/platform` | Ellines operators | Tenants, feature flags, connector packs |

```
Platform Super Admin (Ellines)
        │  create / suspend orgs, flags, connector packs
        ▼
Owner (business) — role `owner`
        │  owns the org; grants IT; full Work Console
        ▼
IT Admin — role `admin` (invited by Owner)
        │  connectors, sync, invite work users (not Owner/IT)
        ▼
Work Console (executive / manager / member / viewer)
        │  role-scoped intelligence from connected systems
        ▼
Connected enterprise data (System B capabilities → EIP)
```

---

## Owner vs IT (authority)

| | **Owner (`owner`)** | **IT Admin (`admin`)** |
|---|---|---|
| Job | Business control of the organization | Technical operation of EIP + connectors |
| Invite | Anyone, including IT and other Owners | Work roles only: executive, manager, member, viewer |
| Manage | All accounts | Work users only — **cannot** change Owner or IT accounts |
| Connectors | Full access (override) | Day-to-day install / test / sync |
| Source of trust | Yes — grants authority to IT | Delegated by Owner |

IT often knows more about databases and APIs than the Owner. **Knowledge ≠ authority.** Who is IT, and what systems may connect for the org, stays with the Owner.

---

## Org roles → default home

| Role | Layer | Default home focus |
|------|-------|--------------------|
| `owner` | Org Admin + Work Console | People & authority + full enterprise view |
| `admin` | IT Admin + Connectors (+ Work Console) | Users (work roles), connectors, sync health |
| `executive` | Work Console | Enterprise health, Daily Brief, org-wide alerts |
| `manager` | Work Console | Branch / department KPIs and local alerts |
| `member` | Work Console | “What needs me” — tasks, alerts, Ellinea |
| `viewer` | Work Console | Read-only KPIs and briefs |

CEO, HR, Finance, etc. are **personas** (widget packs / scopes) inside the Work Console — not separate products.

---

## Platform Super Admin

- **Not** an org RBAC role. Customer IT cannot grant it.
- Granted when the user’s email is listed in `PLATFORM_ADMIN_EMAILS` (Pages / Identity env).
- Console: tenant list (suspend / resume), connector packs, feature-flag placeholders, platform health stubs.
- **Suspend org:** stores `settings.platformStatus = suspended`; blocks tenant login (except platform allowlist) and connector sync.

---

## Guards (client + API)

- `/app/*` — authenticated session required.
- `/app/admin/*`, `/app/connectors/*` — `owner` or `admin` only (`ORG_ADMIN_ROLES`).
- `/app/platform/*` — platform admin email allowlist only.
- Assign Owner / IT Admin — **Owner only**.
- Mutations (invite, role change, deactivate) — same rules on Nest Identity and Cloudflare Pages Functions.

---

## Build order (why)

1. **Owner / IT Admin** first — without invite/role assignment, every other dashboard is theater.
2. **Connectors** — EIP mirrors what System B can do for Owner, IT, and employees.
3. **Work Console** — role-adaptive modules from live snapshots.
4. **Super Admin** — operate tenants and publish packs after customers can stand themselves up.

---
## Source: docs/11_Ellinea_API_Contract.md

# Ellinea AI API contract (v0.1)

Base path: `/api/v1`  
Service: `@ellines-eip/ellinea-service` (Nest on `:3002`) · Live web also exposes Memory / Ask via Pages Functions.  
Package engine: `@ellines-eip/ellinea-ai` · Client: `@ellines-eip/ellinea-sdk`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness (`{ status, service, version, contract }`) |
| `POST` | `/ellinea/ask` | Grounded Q&A (template + RAG; multi-hop enterprise reasoning) |
| `POST` | `/ellinea/brief` | CEO / role daily brief |
| `POST` | `/ellinea/recommend` | Explainable recommendations |
| `POST` | `/ellinea/memory/search` | Rank Memory notes for a query |
| `POST` | `/ellinea/feedback` | Record helpful/dismiss (stateless echo + ranked list) |

EIP Pages also serve org-scoped Memory / Learning under `/api/v1/orgs/me/ellinea-*` (JWT via Identity) — those are not duplicated on the Nest stub.

## Shared payload types

```ts
type EllineaEnterpriseSnapshot = {
  status: 'idle' | 'synced' | 'error';
  healthScore: number;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  briefHighlight: string;
  connectorName: string;
  connectorId: string;
  timeline: { title: string; detail: string }[];
  model?: { counts?: Record<string, number>; objects?: Array<{ id: string; kind: string; name: string; status?: string }> } | null;
  syncedAt: string | null;
};

type EllineaMemoryNote = { id: string; title: string; body: string; updatedAt: string };
```

### POST `/ellinea/ask`

Request: `{ question: string; summary?: EllineaEnterpriseSnapshot | null; memory?: EllineaMemoryNote[]; role?: string; organizationName?: string }`  
Response: `{ answer: string; mode: 'template+rag'; grounding: string; recommendations: Recommendation[] }`

### POST `/ellinea/brief`

Request: `{ summary?: EllineaEnterpriseSnapshot | null; role?: string; organizationName?: string }`  
Response: `{ brief: string }`

### POST `/ellinea/recommend`

Request: `{ summary?: EllineaEnterpriseSnapshot | null; role?: string; feedback?: Record<string, { helpful: number; dismiss: number }> }`  
Response: `{ recommendations: Recommendation[] }`

### POST `/ellinea/memory/search`

Request: `{ question: string; memory: EllineaMemoryNote[]; summary?: EllineaEnterpriseSnapshot | null }`  
Response: `{ chunks: RagChunk[] }`

### POST `/ellinea/feedback`

Request: `{ organizationId: string; recId: string; vote: 'helpful' | 'dismiss'; recommendations?: Recommendation[]; feedback?: FeedbackMap; summary?: EllineaEnterpriseSnapshot | null; role?: string }`  
Response: `{ feedback: FeedbackMap; recommendations: Recommendation[] }`

## Auth

| Mode | Behavior |
|------|----------|
| **MVP default** | Nest stub is open (localhost). `Authorization: Bearer …` is accepted by the SDK/`EllineaAuthStubGuard` but not required. Health is always open. |
| **`ELLINEA_REQUIRE_AUTH=1`** | Guard requires a Bearer token (presence check). Full JWT verify + tenant isolation remain Identity-backed (see 6.5 on Pages / Nest Identity). |

Production EIP Ask uses Pages Functions with the signed-in org JWT. Standalone Nest is for SDK / operator console smoke tests.

## EIP surfaces that consume this contract

| Surface | How |
|---------|-----|
| **Ask Ellinea** (`/app/ellinea` + float) | Pages Ask / local engine (brief, recommend, memory, DNA) |
| **Ellinea Console** (`/app/ellinea-console`) | Owner/IT operator lab against Nest + SDK |
| **Organization System** (`/app/org-system`) | Owner/IT capability catalog embeds local `buildDailyBriefText` / `buildEllineaRecommendations` over the enterprise snapshot — same engine semantics; not a second API |

## Client SDK

`@ellines-eip/ellinea-sdk` — `createEllineaClient({ baseUrl, getAccessToken? })` wraps health / ask / brief / recommend / memorySearch / feedback. Pass `getAccessToken` when calling a locked Nest instance or any JWT-gated proxy.

---
## Source: docs/30_RBAC_Setup_Guide.md

# RBAC Setup Guide: Creating and Managing Custom Roles

**Version:** v1.1  
**Date:** August 1, 2026  
**Audience:** Organization owners, IT admins  
**Related:** [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) · [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)

---

## Overview

Custom roles let you tailor permissions to your organization's needs. Rather than assigning fixed roles (Owner, Admin, Manager, Member, Viewer), you can create roles like "Finance Manager," "IT Operator," or "Approval Officer" with exactly the permissions they need.

### Fixed Roles vs. Custom Roles

**Fixed Roles (built-in):**
- Owner — Full access
- Admin — Almost full access (can't delete org)
- Manager — Team leads (reports, approvals, some admin)
- Member — Standard users (create reports, use features)
- Viewer — Read-only

**Custom Roles (you create):**
- Tailored permission sets
- Named for your org's roles (e.g., "Finance Manager")
- Can combine features (e.g., "IT Operator" has connectors + settings)
- Can delegate specific permissions (e.g., "Can decide approvals" only)
- Easily updated or deleted

---

## Creating a Custom Role

### Step 1: Navigate to Custom Roles

1. Go to **Settings** (bottom of left sidebar)
2. Click the gear icon → **System Settings**
3. Scroll down and click **Custom Roles** (in org settings section)
4. Or go directly to `/app/settings/custom-roles`

### Step 2: Create New Role

1. Click the **Create custom role** button
2. Fill in the form:
   - **Role name** (e.g., "Finance Manager") — required
   - **Description** (e.g., "Manages financial reports and approvals") — optional but recommended
   - **Role badge color** — choose Violet, Blue, or Teal (visual hint for role cards)

### Step 3: Select Permissions

The permission matrix shows 12 feature groups with 50+ granular permissions:

#### Permission Groups

**1. Authentication & Organization** (4 permissions)
- `auth.register_org` — Create a new organization
- `auth.invite_user` — Invite users to org
- `auth.change_password` — Change own password
- `auth.manage_sso_providers` — Configure OAuth2/SAML

**2. Organization Administration** (8 permissions)
- `org.view` — View org info
- `org.edit_name` — Rename organization
- `org.edit_settings` — Modify org settings
- `org.manage_members` — Add/remove/modify team members
- `org.create_child_org` — Create linked org (multi-company)
- `org.manage_branches` — Create/edit branches
- `org.manage_departments` — Create/edit departments
- `org.view_audit_logs` — View audit trail

**3. System Connectors** (8 permissions)
- `connector.install` — Add new system connector
- `connector.test` — Test connector connectivity
- `connector.sync` — Manually trigger sync
- `connector.delete` — Remove connector
- `connector.configure_auth` — Update credentials
- `connector.autoscan` — Auto-detect systems
- `connector.view_history` — See sync logs
- `connector.manage_webhook` — Configure webhooks

**4. Reports & Analytics** (8 permissions)
- `report.create` — Create new report
- `report.edit` — Modify existing report
- `report.delete` — Remove report
- `report.schedule` — Set up recurring reports
- `report.export` — Download report data (CSV/PDF)
- `report.share` — Send report to team
- `report.run_now` — Execute report manually
- `report.view_all` — See all org reports

**5. Workflows & Automation** (6 permissions)
- `workflow.create` — Create workflow
- `workflow.edit` — Modify workflow
- `workflow.delete` — Remove workflow
- `workflow.execute` — Run workflow
- `workflow.view_history` — See execution logs
- `workflow.manage_templates` — Create/edit templates

**6. Approvals** (6 permissions)
- `approval.view` — See pending approvals
- `approval.decide` — Approve/reject requests
- `approval.create_template` — Create approval workflow
- `approval.edit_template` — Modify template
- `approval.delete_template` — Remove template
- `approval.view_history` — See approval history

**7. Dashboards & KPIs** (6 permissions)
- `dashboard.create` — Create dashboard
- `dashboard.edit` — Modify dashboard
- `dashboard.delete` — Remove dashboard
- `dashboard.export` — Download dashboard data
- `dashboard.share` — Send dashboard to team
- `dashboard.view_all` — See all org dashboards

**8. Organization System & UEM** (8 permissions)
- `org_system.view` — Access org system hub
- `org_system.view_people` — See people/employees
- `org_system.view_fleet` — See assets/fleet
- `org_system.view_documents` — See documents
- `org_system.view_alerts` — See alerts & issues
- `org_system.view_finance` — See financial data
- `org_system.view_branches` — See branch structure
- `org_system.view_tasks` — See tasks/workflow items

**9. Ellinea AI & Intelligence** (8 permissions)
- `ellinea.ask` — Use Ask Ellinea
- `ellinea.brief` — Get daily brief
- `ellinea.recommend` — Receive recommendations
- `ellinea.memory_read` — Access enterprise memory
- `ellinea.memory_write` — Update enterprise memory
- `ellinea.dna_read` — View enterprise DNA
- `ellinea.dna_write` — Train enterprise DNA
- `ellinea.feedback` — Give recommendation feedback

**10. Settings & Configuration** (7 permissions)
- `settings.view_audit` — View audit logs
- `settings.manage_webhooks` — Configure webhooks
- `settings.manage_api_keys` — Generate/revoke API keys
- `settings.manage_sso` — Set up OAuth2/SAML
- `settings.manage_notification_policy` — Control email/push
- `settings.manage_ui_policy` — Set org-wide UI rules
- `settings.view_org_settings` — View general settings

**11. Events & Notifications** (6 permissions)
- `events.create` — Create events
- `events.view` — View events feed
- `events.delete` — Remove events
- `events.manage_subscriptions` — Configure event subscriptions
- `notifications.view` — See notifications
- `notifications.delete` — Clear notifications

**12. Platform Administration** (4 permissions)
- `platform.suspend_org` — Suspend organization (Super Admin only)
- `platform.resume_org` — Re-activate organization (Super Admin only)
- `platform.view_all_orgs` — See all orgs on platform (Super Admin)
- `platform.manage_platform_settings` — Manage platform config (Super Admin)

### Step 4: Select Permissions

1. **Click group headers** to toggle all permissions in that group
2. **Check/uncheck individual permissions** for fine-grained control
3. **Use toolbar:**
   - **Select all** — Check all 50+ permissions (start here if using role as template)
   - **Clear all** — Uncheck everything (start fresh)
4. **See real-time counter** — "X selected" feedback
5. **Responsive grid** — Adapts to screen size (mobile-friendly)

### Step 5: Save

1. Verify role name is entered
2. Check that at least 1 permission is selected
3. Click **Create role** to save
4. Success message appears
5. Role now visible in role list

---

## Common Role Templates

Start with these pre-built templates and customize as needed:

### 1. Finance Manager

**Permissions:** 10 total
- `report.create`, `report.edit`, `report.schedule`, `report.export`, `report.view_all`
- `approval.view`, `approval.decide`
- `dashboard.view_all`
- `org_system.view_finance`
- `ellinea.ask`, `ellinea.recommend`

**Use case:** CFO, accounting director, financial analyst
**What they can do:**
- Create and schedule financial reports
- Export data for external use
- Approve financial workflows
- View financial dashboards
- Get Ellinea AI insights on spending/budget

### 2. IT Operator

**Permissions:** 13 total
- `connector.install`, `connector.test`, `connector.sync`, `connector.configure_auth`, `connector.autoscan`, `connector.view_history`, `connector.manage_webhook`
- `org.manage_branches`, `org.manage_departments`
- `settings.manage_webhooks`, `settings.manage_api_keys`
- `ellinea.ask`
- `events.view`

**Use case:** IT Admin, system administrator, DevOps engineer
**What they can do:**
- Install and manage system connectors (SQL, REST, etc.)
- Configure branch/department structure
- Set up webhooks for data flows
- Generate API keys for integrations
- Monitor system events

### 3. Analyst

**Permissions:** 10 total
- `report.create`, `report.edit`, `report.export`, `report.run_now`, `report.view_all`
- `dashboard.create`, `dashboard.view_all`
- `org_system.view`, `org_system.view_people`, `org_system.view_fleet`
- `ellinea.ask`, `ellinea.recommend`

**Use case:** Data analyst, business analyst, BI developer
**What they can do:**
- Create and modify reports without admin
- Create custom dashboards
- Run reports on-demand
- View org data through Organization System
- Get Ellinea recommendations for trends

### 4. Approval Officer

**Permissions:** 7 total
- `approval.view`, `approval.decide`, `approval.view_history`
- `workflow.view_history`
- `org.view`
- `org_system.view`
- `ellinea.ask`
- `events.view`

**Use case:** Compliance officer, quality reviewer, procurement manager
**What they can do:**
- Review and approve/reject workflows
- See approval history for audit trails
- View workflow execution logs
- Access org system for context
- No ability to create workflows (protected)

### 5. Department Manager

**Permissions:** 12 total
- `org.view`, `org.manage_members`, `org.manage_departments`
- `report.create`, `report.view_all`
- `approval.view`, `approval.decide`
- `org_system.view`, `org_system.view_people`
- `ellinea.ask`
- `events.view`
- `notifications.view`

**Use case:** Department head, team lead, regional manager
**What they can do:**
- Manage team members in their department
- Create/view reports for team
- Approve team requests
- View organizational structure
- See team availability and performance

---

## Best Practices

### 1. Principle of Least Privilege

Grant only the permissions needed for the role.

❌ **Bad:** Finance Manager gets `connector.install`, `settings.manage_sso`
✅ **Good:** Finance Manager gets only report/approval/dashboard permissions

### 2. Use Descriptive Names

Role names should be clear about responsibility.

❌ **Bad:** "Manager 1", "Role A", "User with perms"
✅ **Good:** "Finance Manager", "IT Operator", "Approval Officer"

### 3. Document Custom Roles

Create a reference in your org wiki:

```
## Custom Roles

- **Finance Manager:** Can create/view financial reports, approve financial workflows
- **IT Operator:** Can manage system connectors and infrastructure
- **Analyst:** Can create reports and dashboards
```

### 4. Start with Templates

Don't create roles from scratch.

1. Click **Select all** to get all 50+ permissions
2. Then **uncheck** groups you don't need
3. Or start with a template name (Finance Manager) and customize

### 5. Test Before Rolling Out

1. Create the role
2. Assign to 1–2 test users
3. Have them test workflows
4. Refine permissions if needed
5. Roll out to full team

### 6. Avoid Permission Explosion

Don't create a new role for every edge case.

❌ **Bad:** "Finance Manager (Approvals)", "Finance Manager (Reports)", "Finance Manager (No Delete)", etc.
✅ **Good:** One "Finance Manager" with all needed perms; delegate specific perms to individuals if needed

### 7. Periodic Audits

Every quarter, review custom roles:
- Are they still used?
- Do assignments match descriptions?
- Should permissions be adjusted?

Use the audit log (`org.view_audit_logs`) to see who has what access.

### 8. Name Permissions in Descriptions

When describing a role, list key permissions:

```
Finance Manager
Manages financial reports and approvals
Key permissions: report.*, approval.view/decide, dashboard.view_all, org_system.view_finance
```

---

## Editing and Deleting Roles

### Edit a Role

1. Go to **Settings** → **Custom Roles**
2. Click **Edit** on the role card
3. Modify name, description, or permissions
4. Click **Update role**
5. All users with this role immediately get the new permissions

### Delete a Role

1. Go to **Settings** → **Custom Roles**
2. Click **Delete** on the role card
3. Confirm deletion (cannot be undone)
4. Users keep their org access but lose the role's permissions
   - They revert to fixed roles or other custom roles
   - Monitor audit log for permission changes

### Disable Instead of Delete

To temporarily disable a role without deleting:

1. Edit the role
2. Remove all permissions (leave it empty)
3. Save → role is now inactive
4. Users can't use it but it's not permanently deleted
5. Later, add permissions back to re-enable

---

## Troubleshooting

### Problem: User still can't access feature after assigning role

**Causes:**
- Permissions cache not refreshed (TTL: 5 seconds)
- User not logged out/in after role change
- Wrong permission name in role

**Solution:**
1. Wait 10 seconds
2. Have user log out and log back in
3. Check role via Settings → Custom Roles (verify permissions)
4. Check user's effective permissions: `GET /api/v1/orgs/me/permissions`

### Problem: Can't delete a role

**Cause:** Role is still assigned to users

**Solution:**
1. Go to Org Admin → Members
2. Find users with that role
3. Reassign them to a different role
4. Now delete the role

### Problem: Role name conflicts with another role

**Cause:** Duplicate role name in org

**Solution:**
1. Edit the conflicting role
2. Add a suffix (e.g., "Finance Manager v2")
3. Or include department: "Finance Manager (NYC)"

### Problem: Too many permissions, hard to find one

**Solution:**
1. Use browser Find (Ctrl+F / Cmd+F) to search the page
2. Or use permission group headers (click to toggle groups)
3. Start with "Select all" then uncheck groups you don't need

---

## Related Resources

- **[31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md)** — API endpoints for custom roles
- **[32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md)** — Complete permission reference table
- **[33_RBAC_Troubleshooting.md](./33_RBAC_Troubleshooting.md)** — Common issues and solutions
- **[34_RBAC_UI_Guide.md](./34_RBAC_UI_Guide.md)** — Visual walkthrough of Settings UI
- **[29_Track_D_RBAC_Implementation.md](./29_Track_D_RBAC_Implementation.md)** — Technical implementation details

---

## FAQ

**Q: Can I modify fixed roles (Owner, Admin, etc.)?**
A: No, fixed roles are built-in and unchangeable. Custom roles are your way to tailor permissions.

**Q: What if I need different permissions per department?**
A: Create multiple custom roles:
- "Finance Manager (NYC)"
- "Finance Manager (LA)"
- Each with slightly different permissions if needed
- Or use one "Finance Manager" and delegate specific permissions to individuals via the Elevate / Delegate features.

**Q: Can I create a role with no permissions?**
A: The UI requires at least 1 permission. But you can remove all permissions to effectively disable a role.

**Q: How many custom roles can I create?**
A: Unlimited (within reason). Most orgs have 5–10 custom roles.

**Q: Can users have multiple custom roles?**
A: Not simultaneously in this version. A user has one fixed role or one custom role. Future versions may support role stacking.

**Q: How long does a permission change take to apply?**
A: Up to 5 seconds (cache TTL). If urgent, have user log out/in.

**Q: Can I export/import custom roles?**
A: Not in v1.1. Custom roles are per-organization. To replicate across orgs, you'd recreate them manually or contact support.

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Feedback:** For issues, see [33_RBAC_Troubleshooting.md](./33_RBAC_Troubleshooting.md)

---
## Source: docs/31_RBAC_API_Reference.md

# RBAC API Reference

**Version:** v1.1  
**Date:** August 1, 2026  
**Base URL:** `http://localhost:3100/api/v1` (local) or `https://eip.ellines.co.ke/api/v1` (production)  
**Authentication:** Bearer JWT (in `Authorization` header)

---

## Overview

The RBAC API provides 8 endpoints for managing custom roles, permissions, and role assignments:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/orgs/me/roles` | List all custom roles |
| POST | `/orgs/me/roles` | Create new custom role |
| GET | `/orgs/me/roles/{id}` | Get role details |
| PATCH | `/orgs/me/roles/{id}` | Update role |
| DELETE | `/orgs/me/roles/{id}` | Delete role |
| POST | `/orgs/me/custom-roles/assign` | Assign role to user |
| GET | `/orgs/me/permissions` | Get user's effective permissions |
| POST | `/orgs/me/members/{userId}/elevate` | Temporarily elevate role |
| POST | `/orgs/me/members/{userId}/delegate-permission` | Delegate specific permission |

---

## Endpoints

### 1. List Custom Roles

**Endpoint:** `GET /orgs/me/roles`

**Description:** Fetch all custom roles in the organization.

**Required Permissions:** `org.view` (any authenticated user)

**Query Parameters:** None

**Request:**
```bash
GET /api/v1/orgs/me/roles
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "role_fin_mgr_001",
    "name": "Finance Manager",
    "description": "Manages financial reports and approvals",
    "permissions": [
      "report.create",
      "report.edit",
      "report.schedule",
      "report.export",
      "approval.view",
      "approval.decide",
      "dashboard.view_all",
      "org_system.view_finance",
      "ellinea.ask",
      "ellinea.recommend"
    ],
    "isActive": true,
    "createdBy": "user_owner_001",
    "createdAt": "2026-08-01T10:30:00Z",
    "updatedAt": "2026-08-01T10:30:00Z"
  },
  {
    "id": "role_it_op_001",
    "name": "IT Operator",
    "description": "System administrator and connector management",
    "permissions": [
      "connector.install",
      "connector.test",
      "connector.sync",
      "connector.configure_auth",
      "connector.autoscan",
      "org.manage_branches",
      "org.manage_departments",
      "settings.manage_webhooks",
      "settings.manage_api_keys"
    ],
    "isActive": true,
    "createdBy": "user_owner_001",
    "createdAt": "2026-08-01T11:00:00Z",
    "updatedAt": "2026-08-01T11:00:00Z"
  }
]
```

**Error Responses:**
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org member

---

### 2. Create Custom Role

**Endpoint:** `POST /orgs/me/roles`

**Description:** Create a new custom role with specified permissions.

**Required Permissions:** `org.edit_settings` (Owner or Admin only)

**Request Body:**
```json
{
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals with dashboard access",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend"
  ]
}
```

**Field Validation:**
- `name` — Required, 1–100 characters, unique within org
- `description` — Optional, 0–500 characters
- `permissions` — Required, array of valid permission strings
  - Must have at least 1 permission
  - All permissions must exist (see [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md))

**Request:**
```bash
POST /api/v1/orgs/me/roles
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Finance Manager",
  "description": "...",
  "permissions": [...]
}
```

**Response (201 Created):**
```json
{
  "id": "role_fin_mgr_001",
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals with dashboard access",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend"
  ],
  "isActive": true,
  "createdBy": "user_owner_001",
  "createdAt": "2026-08-01T10:30:00Z",
  "updatedAt": "2026-08-01T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request` — Invalid permission name, missing fields, name already exists
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 3. Get Role Details

**Endpoint:** `GET /orgs/me/roles/{id}`

**Description:** Fetch a specific custom role.

**Required Permissions:** `org.view`

**Path Parameters:**
- `id` — Role ID (e.g., `role_fin_mgr_001`)

**Request:**
```bash
GET /api/v1/orgs/me/roles/role_fin_mgr_001
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "id": "role_fin_mgr_001",
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend"
  ],
  "isActive": true,
  "createdBy": "user_owner_001",
  "createdAt": "2026-08-01T10:30:00Z",
  "updatedAt": "2026-08-01T10:30:00Z"
}
```

**Error Responses:**
- `404 Not Found` — Role does not exist
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org member

---

### 4. Update Custom Role

**Endpoint:** `PATCH /orgs/me/roles/{id}`

**Description:** Update role name, description, or permissions.

**Required Permissions:** `org.edit_settings` (Owner or Admin only)

**Path Parameters:**
- `id` — Role ID

**Request Body:**
```json
{
  "name": "Finance Manager (Updated)",
  "description": "Updated description",
  "permissions": [
    "report.create",
    "report.edit",
    "approval.view"
  ]
}
```

**All fields optional** — Only send fields to update

**Request:**
```bash
PATCH /api/v1/orgs/me/roles/role_fin_mgr_001
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule"
  ]
}
```

**Response (200 OK):**
```json
{
  "id": "role_fin_mgr_001",
  "name": "Finance Manager",
  "description": "Manages financial reports and approvals",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule"
  ],
  "isActive": true,
  "createdBy": "user_owner_001",
  "createdAt": "2026-08-01T10:30:00Z",
  "updatedAt": "2026-08-01T11:00:00Z"
}
```

**Note:** Changes apply immediately to all users with this role (up to 5-second cache TTL).

**Error Responses:**
- `400 Bad Request` — Invalid permission, empty permission set, duplicate name
- `404 Not Found` — Role not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 5. Delete Custom Role

**Endpoint:** `DELETE /orgs/me/roles/{id}`

**Description:** Delete a custom role. Users with this role lose it but keep org access.

**Required Permissions:** `org.edit_settings` (Owner or Admin only)

**Path Parameters:**
- `id` — Role ID

**Request:**
```bash
DELETE /api/v1/orgs/me/roles/role_fin_mgr_001
Authorization: Bearer <jwt>
```

**Response (204 No Content):**
```
(empty body)
```

**Side Effects:**
- Users assigned this role revert to their fixed role
- Audit log records deletion
- Cannot be undone (permanent)

**Error Responses:**
- `404 Not Found` — Role not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 6. Assign Role to User

**Endpoint:** `POST /orgs/me/custom-roles/assign`

**Description:** Assign a custom role to a user.

**Required Permissions:** `org.manage_members`

**Request Body:**
```json
{
  "userId": "user_john_001",
  "customRoleId": "role_fin_mgr_001"
}
```

**Request:**
```bash
POST /api/v1/orgs/me/custom-roles/assign
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "userId": "user_john_001",
  "customRoleId": "role_fin_mgr_001"
}
```

**Response (200 OK):**
```json
{
  "userId": "user_john_001",
  "customRoleId": "role_fin_mgr_001",
  "isActive": true,
  "createdAt": "2026-08-01T10:35:00Z"
}
```

**Note:** User immediately gains all permissions in the role (up to 5-second cache).

**Error Responses:**
- `404 Not Found` — User or role not found
- `400 Bad Request` — Invalid user/role IDs
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org member manager

---

### 7. Get User's Effective Permissions

**Endpoint:** `GET /orgs/me/permissions`

**Description:** Fetch the current user's effective permissions (including delegated and elevated).

**Required Permissions:** None (every user can check their own)

**Request:**
```bash
GET /api/v1/orgs/me/permissions
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "userId": "user_john_001",
  "permissions": [
    "report.create",
    "report.edit",
    "report.schedule",
    "report.export",
    "report.view_all",
    "approval.view",
    "approval.decide",
    "dashboard.view_all",
    "org_system.view_finance",
    "ellinea.ask",
    "ellinea.recommend",
    "org.view",
    "events.view",
    "notifications.view"
  ],
  "effectiveRole": "custom:role_fin_mgr_001",
  "isElevated": false,
  "delegatedPermissions": [],
  "cacheValidUntil": "2026-08-01T10:45:00Z"
}
```

**Fields:**
- `userId` — Current user's ID
- `permissions` — Array of all permissions user can exercise
- `effectiveRole` — Current role (fixed or custom)
- `isElevated` — Whether user is temporarily elevated
- `delegatedPermissions` — Any delegated-to-me permissions (future feature)
- `cacheValidUntil` — When this cache expires (permission check will re-fetch)

**Use case:** Client code can check `permissions.includes('report.create')` to show/hide UI

**Error Responses:**
- `401 Unauthorized` — Not authenticated

---

### 8. Temporary Role Elevation

**Endpoint:** `POST /orgs/me/members/{userId}/elevate`

**Description:** Temporarily elevate a user to a higher role (e.g., member → admin for 2 hours).

**Required Permissions:** `org.manage_members` (Owner/Admin only)

**Path Parameters:**
- `userId` — User to elevate

**Request Body:**
```json
{
  "targetRole": "admin",
  "durationMinutes": 120,
  "reason": "Emergency database migration"
}
```

**Fields:**
- `targetRole` — Target role: `owner`, `admin`, `manager`, `member`, `viewer`, or custom role ID
- `durationMinutes` — How long (max 1440 = 24 hours)
- `reason` — Why (logged to audit trail)

**Request:**
```bash
POST /api/v1/orgs/me/members/user_john_001/elevate
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "targetRole": "admin",
  "durationMinutes": 120,
  "reason": "Emergency database migration"
}
```

**Response (200 OK):**
```json
{
  "id": "elev_abc123",
  "userId": "user_john_001",
  "fromRole": "member",
  "toRole": "admin",
  "reason": "Emergency database migration",
  "elevatedBy": "user_owner_001",
  "expiresAt": "2026-08-01T12:30:00Z",
  "createdAt": "2026-08-01T10:30:00Z"
}
```

**Note:**
- Audit log records elevation
- After `expiresAt`, user reverts to original role
- Can be manually revoked before expiry

**Error Responses:**
- `400 Bad Request` — Invalid target role, negative duration
- `404 Not Found` — User not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not Owner/Admin

---

### 9. Delegate Specific Permission

**Endpoint:** `POST /orgs/me/members/{userId}/delegate-permission`

**Description:** Delegate a specific permission to a user for a limited time.

**Required Permissions:** `org.manage_members`

**Path Parameters:**
- `userId` — User receiving delegation

**Request Body:**
```json
{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation"
}
```

**Fields:**
- `permission` — Permission to delegate (must be valid permission string)
- `expiresAt` — When delegation expires (ISO 8601)
- `reason` — Why (for audit trail)

**Request:**
```bash
POST /api/v1/orgs/me/members/user_finance_lead/delegate-permission
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation, deputizing for approvals"
}
```

**Response (200 OK):**
```json
{
  "id": "deleg_def456",
  "userId": "user_finance_lead",
  "permission": "approval.decide",
  "reason": "Manager on vacation, deputizing for approvals",
  "delegatedBy": "user_manager_001",
  "expiresAt": "2026-08-15T00:00:00Z",
  "createdAt": "2026-08-01T10:35:00Z"
}
```

**Note:**
- User can exercise delegated permission even without it in their base role
- After `expiresAt`, permission is revoked
- Logged to audit trail

**Error Responses:**
- `400 Bad Request` — Invalid permission, past expiry date
- `404 Not Found` — User not found
- `401 Unauthorized` — Not authenticated
- `403 Forbidden` — Not org admin

---

## Error Responses

All endpoints return standard error responses:

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Invalid permission name: 'report.does_not_exist'",
  "error": "BadRequest"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Authorization required",
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Only Owner or Admin can manage custom roles",
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Role not found",
  "error": "NotFound"
}
```

### 409 Conflict
```json
{
  "statusCode": 409,
  "message": "Role name 'Finance Manager' already exists in this organization",
  "error": "Conflict"
}
```

---

## Rate Limiting

- **Per-user rate limit:** 100 requests / minute
- **Global rate limit:** 10,000 requests / minute
- **Response headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Caching

Permission checks are cached:
- **Client-side:** `localStorage` with 5-minute TTL
- **Server-side:** Redis cache with 5-second TTL
- **Cache invalidation:** Automatic on permission change or manual logout/login

---

## Examples

### Complete Workflow: Create and Assign Role

**1. Create role (Admin only)**
```bash
POST /api/v1/orgs/me/roles
{
  "name": "Finance Manager",
  "description": "Financial reports and approvals",
  "permissions": [
    "report.create",
    "report.edit",
    "approval.view",
    "approval.decide"
  ]
}
→ 201 Created: { id: "role_fin_001", ... }
```

**2. Assign to user (Admin)**
```bash
POST /api/v1/orgs/me/custom-roles/assign
{
  "userId": "user_jane_001",
  "customRoleId": "role_fin_001"
}
→ 200 OK: { userId: "user_jane_001", customRoleId: "role_fin_001" }
```

**3. User checks their permissions**
```bash
GET /api/v1/orgs/me/permissions (as user_jane_001)
→ 200 OK: { permissions: ["report.create", "report.edit", "approval.view", "approval.decide", ...] }
```

**4. Frontend checks permission before showing UI**
```typescript
const session = getSession();
if (session.permissions.includes('report.create')) {
  // Show "Create Report" button
}
```

**5. Admin revokes permission temporarily**
```bash
PATCH /api/v1/orgs/me/roles/role_fin_001
{
  "permissions": ["report.view_all", "approval.view"]  // Remove create/edit/decide
}
→ 200 OK: { permissions: ["report.view_all", "approval.view"] }
```

**6. User's next request has reduced permissions**
```bash
GET /api/v1/orgs/me/permissions
→ 200 OK: { permissions: ["report.view_all", "approval.view", ...] }
```

---

## SDK Integration

### JavaScript/TypeScript

```typescript
import { getSession } from '@/lib/api';

// Check permission client-side
const session = getSession();
if (session?.permissions.includes('report.create')) {
  // Show Create button
}

// Or call API
const perms = await fetch('/api/v1/orgs/me/permissions').then(r => r.json());
if (perms.permissions.includes('approval.decide')) {
  // Allow approval workflow
}
```

### NestJS (Backend)

```typescript
import { RbacService } from '@ellines-eip/identity';

constructor(private rbac: RbacService) {}

async canApprove(userId: string, orgId: string) {
  return this.rbac.canUserPerform(userId, orgId, 'approval.decide');
}
```

---

## Related

- [30_RBAC_Setup_Guide.md](./30_RBAC_Setup_Guide.md) — User guide for creating roles
- [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md) — Complete permission reference
- [29_Track_D_RBAC_Implementation.md](./29_Track_D_RBAC_Implementation.md) — Implementation details

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Status:** Production-ready

---
## Source: docs/32_RBAC_Permission_Matrix.md

# RBAC Permission Matrix Reference

**Version:** v1.1  
**Date:** August 1, 2026  
**Total Permissions:** 50+  
**Feature Areas:** 12 groups  

---

## Permission Matrix Table

Complete reference of all permissions with fixed role assignments and custom use cases.

### Legend

- **✅** = Permission included by default
- **−** = Permission not included
- **Fixed Roles** = Owner, Admin, Manager, Member, Viewer
- **Custom Use** = Example custom roles that might need this

---

| # | Permission ID | Feature Area | Description | Owner | Admin | Manager | Member | Viewer | Custom Use |
|---|---|---|---|---|---|---|---|---|---|
| 1 | auth.register_org | Auth | Create a new organization | ✅ | − | − | − | − | — |
| 2 | auth.invite_user | Auth | Invite users to organization | ✅ | ✅ | − | − | − | Org Admin |
| 3 | auth.change_password | Auth | Change own password | ✅ | ✅ | ✅ | ✅ | ✅ | All users |
| 4 | auth.manage_sso_providers | Auth | Configure OAuth2/SAML | ✅ | ✅ | − | − | − | IT Admin |
| **5–12** | **org.*** | Org Admin | Organization management | | | | | | |
| 5 | org.view | Org Admin | View organization info | ✅ | ✅ | ✅ | ✅ | ✅ | All users |
| 6 | org.edit_name | Org Admin | Rename organization | ✅ | − | − | − | − | Owner only |
| 7 | org.edit_settings | Org Admin | Modify org settings | ✅ | ✅ | − | − | − | IT Admin |
| 8 | org.manage_members | Org Admin | Add/remove/modify team members | ✅ | ✅ | ✅ | − | − | Manager, Dept Head |
| 9 | org.create_child_org | Org Admin | Create linked org (multi-company) | ✅ | − | − | − | − | Parent Org Owner |
| 10 | org.manage_branches | Org Admin | Create/edit branches | ✅ | ✅ | − | − | − | IT Admin |
| 11 | org.manage_departments | Org Admin | Create/edit departments | ✅ | ✅ | ✅ | − | − | Dept Manager |
| 12 | org.view_audit_logs | Org Admin | View audit trail | ✅ | ✅ | − | − | − | Compliance Officer |
| **13–20** | **connector.*** | Connectors | System integration | | | | | | |
| 13 | connector.install | Connectors | Add new system connector | ✅ | ✅ | − | − | − | IT Operator |
| 14 | connector.test | Connectors | Test connector connectivity | ✅ | ✅ | − | − | − | IT Operator |
| 15 | connector.sync | Connectors | Manually trigger sync | ✅ | ✅ | − | − | − | IT Operator |
| 16 | connector.delete | Connectors | Remove connector | ✅ | ✅ | − | − | − | IT Operator |
| 17 | connector.configure_auth | Connectors | Update credentials | ✅ | ✅ | − | − | − | IT Operator |
| 18 | connector.autoscan | Connectors | Auto-detect systems | ✅ | ✅ | − | − | − | IT Admin |
| 19 | connector.view_history | Connectors | See sync logs | ✅ | ✅ | − | − | − | IT Operator |
| 20 | connector.manage_webhook | Connectors | Configure webhooks | ✅ | ✅ | − | − | − | IT Admin |
| **21–28** | **report.*** | Reports | Report management | | | | | | |
| 21 | report.create | Reports | Create new report | ✅ | ✅ | ✅ | ✅ | − | Finance Manager, Analyst |
| 22 | report.edit | Reports | Modify existing report | ✅ | ✅ | ✅ | ✅ | − | Finance Manager, Analyst |
| 23 | report.delete | Reports | Remove report | ✅ | ✅ | ✅ | − | − | Report Owner |
| 24 | report.schedule | Reports | Set up recurring reports | ✅ | ✅ | ✅ | − | − | Finance Manager |
| 25 | report.export | Reports | Download report data (CSV/PDF) | ✅ | ✅ | ✅ | ✅ | − | Finance Manager |
| 26 | report.share | Reports | Send report to team | ✅ | ✅ | ✅ | ✅ | − | Finance Manager |
| 27 | report.run_now | Reports | Execute report manually | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 28 | report.view_all | Reports | See all org reports | ✅ | ✅ | ✅ | − | ✅ | Analyst, Viewer |
| **29–34** | **workflow.*** | Workflows | Automation | | | | | | |
| 29 | workflow.create | Workflows | Create workflow | ✅ | ✅ | − | − | − | Process Manager |
| 30 | workflow.edit | Workflows | Modify workflow | ✅ | ✅ | − | − | − | Process Manager |
| 31 | workflow.delete | Workflows | Remove workflow | ✅ | ✅ | − | − | − | Process Manager |
| 32 | workflow.execute | Workflows | Run workflow | ✅ | ✅ | ✅ | ✅ | − | Team Lead |
| 33 | workflow.view_history | Workflows | See execution logs | ✅ | ✅ | ✅ | − | − | Analyst |
| 34 | workflow.manage_templates | Workflows | Create/edit templates | ✅ | ✅ | − | − | − | Process Manager |
| **35–40** | **approval.*** | Approvals | Request workflows | | | | | | |
| 35 | approval.view | Approvals | See pending approvals | ✅ | ✅ | ✅ | − | − | All decision makers |
| 36 | approval.decide | Approvals | Approve/reject requests | ✅ | ✅ | ✅ | − | − | Manager, Officer |
| 37 | approval.create_template | Approvals | Create approval workflow | ✅ | ✅ | − | − | − | Process Manager |
| 38 | approval.edit_template | Approvals | Modify template | ✅ | ✅ | − | − | − | Process Manager |
| 39 | approval.delete_template | Approvals | Remove template | ✅ | ✅ | − | − | − | Process Manager |
| 40 | approval.view_history | Approvals | See approval history | ✅ | ✅ | ✅ | − | − | Compliance, Audit |
| **41–46** | **dashboard.*** | Dashboards | Custom KPI views | | | | | | |
| 41 | dashboard.create | Dashboards | Create dashboard | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 42 | dashboard.edit | Dashboards | Modify dashboard | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 43 | dashboard.delete | Dashboards | Remove dashboard | ✅ | ✅ | ✅ | − | − | Dashboard Owner |
| 44 | dashboard.export | Dashboards | Download dashboard data | ✅ | ✅ | ✅ | ✅ | − | Executive, Analyst |
| 45 | dashboard.share | Dashboards | Send dashboard to team | ✅ | ✅ | ✅ | ✅ | − | Analyst |
| 46 | dashboard.view_all | Dashboards | See all org dashboards | ✅ | ✅ | ✅ | − | − | Finance Manager |
| **47–54** | **org_system.*** | Org System | UEM catalog access | | | | | | |
| 47 | org_system.view | Org System | Access org system hub | ✅ | ✅ | ✅ | − | − | Manager, Analyst |
| 48 | org_system.view_people | Org System | See people/employees | ✅ | ✅ | ✅ | − | − | Manager, HR |
| 49 | org_system.view_fleet | Org System | See assets/fleet | ✅ | ✅ | − | − | − | Fleet Manager |
| 50 | org_system.view_documents | Org System | See documents | ✅ | ✅ | − | − | − | Document Manager |
| 51 | org_system.view_alerts | Org System | See alerts & issues | ✅ | ✅ | ✅ | − | − | Incident Commander |
| 52 | org_system.view_finance | Org System | See financial data | ✅ | ✅ | − | − | − | Finance Manager |
| 53 | org_system.view_branches | Org System | See branch structure | ✅ | ✅ | − | − | − | Regional Manager |
| 54 | org_system.view_tasks | Org System | See tasks/workflow items | ✅ | ✅ | ✅ | − | − | Task Manager |
| **55–62** | **ellinea.*** | Ellinea AI | Intelligence features | | | | | | |
| 55 | ellinea.ask | Ellinea AI | Use Ask Ellinea | ✅ | ✅ | ✅ | ✅ | − | All users (toggle) |
| 56 | ellinea.brief | Ellinea AI | Get daily brief | ✅ | ✅ | ✅ | ✅ | − | Executive, Manager |
| 57 | ellinea.recommend | Ellinea AI | Receive recommendations | ✅ | ✅ | ✅ | ✅ | − | Manager, Analyst |
| 58 | ellinea.memory_read | Ellinea AI | Access enterprise memory | ✅ | ✅ | ✅ | − | − | Decision Maker |
| 59 | ellinea.memory_write | Ellinea AI | Update enterprise memory | ✅ | ✅ | − | − | − | Memory Curator |
| 60 | ellinea.dna_read | Ellinea AI | View enterprise DNA | ✅ | ✅ | − | − | − | Executive |
| 61 | ellinea.dna_write | Ellinea AI | Train enterprise DNA | ✅ | ✅ | − | − | − | AI Trainer |
| 62 | ellinea.feedback | Ellinea AI | Give recommendation feedback | ✅ | ✅ | ✅ | ✅ | − | All users |
| **63–69** | **settings.*** | Settings | Configuration | | | | | | |
| 63 | settings.view_audit | Settings | View audit logs | ✅ | ✅ | − | − | − | Compliance, Audit |
| 64 | settings.manage_webhooks | Settings | Configure webhooks | ✅ | ✅ | − | − | − | IT Admin |
| 65 | settings.manage_api_keys | Settings | Generate/revoke API keys | ✅ | ✅ | − | − | − | Developer, IT |
| 66 | settings.manage_sso | Settings | Set up OAuth2/SAML | ✅ | ✅ | − | − | − | IT Admin, Security |
| 67 | settings.manage_notification_policy | Settings | Control email/push | ✅ | ✅ | − | − | − | IT Admin |
| 68 | settings.manage_ui_policy | Settings | Set org-wide UI rules | ✅ | ✅ | − | − | − | IT Admin |
| 69 | settings.view_org_settings | Settings | View general settings | ✅ | ✅ | − | − | − | All users (read-only) |
| **70–75** | **events.*** / **notifications.*** | Events | System events | | | | | | |
| 70 | events.create | Events | Create events | ✅ | ✅ | − | − | − | Automation, System |
| 71 | events.view | Events | View events feed | ✅ | ✅ | ✅ | ✅ | − | All users |
| 72 | events.delete | Events | Remove events | ✅ | ✅ | − | − | − | Admin |
| 73 | events.manage_subscriptions | Events | Configure subscriptions | ✅ | ✅ | − | − | − | IT Admin |
| 74 | notifications.view | Notifications | See notifications | ✅ | ✅ | ✅ | ✅ | − | All users |
| 75 | notifications.delete | Notifications | Clear notifications | ✅ | ✅ | ✅ | ✅ | − | All users |
| **76–79** | **platform.*** | Platform | Super-admin (global) | | | | | | |
| 76 | platform.suspend_org | Platform | Suspend organization | ✅ | − | − | − | − | Platform Super Admin |
| 77 | platform.resume_org | Platform | Re-activate organization | ✅ | − | − | − | − | Platform Super Admin |
| 78 | platform.view_all_orgs | Platform | See all orgs on platform | ✅ | − | − | − | − | Platform Super Admin |
| 79 | platform.manage_platform_settings | Platform | Manage platform config | ✅ | − | − | − | − | Platform Super Admin |

---

## Summary by Feature Area

### Authentication & Organization (4 perms)
- Required by: Owner, IT Admin
- Custom roles: Org Admin, IT Admin
- Total: 4 permissions

### Organization Administration (8 perms)
- Required by: Owner, Admin, some Managers
- Custom roles: Org Admin, Dept Manager, HR Admin
- Total: 8 permissions

### System Connectors (8 perms)
- Required by: Admin
- Custom roles: IT Operator, IT Admin, System Engineer
- Total: 8 permissions

### Reports & Analytics (8 perms)
- Required by: Manager, Member
- Custom roles: Finance Manager, Analyst, Report Writer
- Total: 8 permissions

### Workflows & Automation (6 perms)
- Required by: Admin
- Custom roles: Process Manager, Automation Engineer
- Total: 6 permissions

### Approvals (6 perms)
- Required by: Manager, some Members
- Custom roles: Approval Officer, Compliance Manager
- Total: 6 permissions

### Dashboards & KPIs (6 perms)
- Required by: Manager, Member
- Custom roles: BI Developer, Analyst, Executive
- Total: 6 permissions

### Organization System & UEM (8 perms)
- Required by: Manager, Member (some)
- Custom roles: Analyst, Manager, Fleet Manager, HR Admin
- Total: 8 permissions

### Ellinea AI & Intelligence (8 perms)
- Required by: All roles
- Custom roles: All (typically ask/brief/recommend subset)
- Total: 8 permissions

### Settings & Configuration (7 perms)
- Required by: Admin
- Custom roles: IT Admin, Security Officer, Compliance Officer
- Total: 7 permissions

### Events & Notifications (6 perms)
- Required by: All roles (view) / Admin (manage)
- Custom roles: Incident Commander, Automation
- Total: 6 permissions

### Platform Administration (4 perms)
- Required by: Platform Super Admin only
- Custom roles: Not typically used
- Total: 4 permissions

---

## Total Permissions

- **By Feature Area:** 12 groups
- **Total Permissions:** 79+ (with expansion capability)
- **Fixed Roles Covered:** 5 (Owner, Admin, Manager, Member, Viewer)
- **Example Custom Roles:** 5+ (Finance Manager, IT Operator, Analyst, Officer, Manager)

---

## Common Permission Patterns

### Read-Only Role
```
Permissions needed: [].view, [].view_all, org.view, events.view, notifications.view
Example: Viewer role, Analyst (reports only)
```

### Manager Role
```
Permissions needed: org.manage_members, org.manage_departments, approval.*, 
                    report.create/edit/view_all, dashboard.view_all, ellinea.*
Example: Department Manager, Team Lead
```

### Developer/Admin Role
```
Permissions needed: connector.*, settings.manage_api_keys, settings.manage_webhooks,
                    workflow.*, org.manage_branches, org.manage_departments
Example: IT Operator, System Engineer
```

### Executive Role
```
Permissions needed: org_system.view_*, ellinea.brief, ellinea.dna_read, 
                    dashboard.view_all, report.view_all, approval.view
Example: C-Level, Director, VP
```

### Finance Role
```
Permissions needed: report.*, dashboard.view_all, org_system.view_finance,
                    approval.view/decide, ellinea.ask/recommend
Example: Finance Manager, CFO, Accountant
```

---

## Permission Enforcement Points

Each permission is checked at these locations:

1. **Frontend UI:** Show/hide buttons, menus, pages
2. **Pages Functions:** `requirePermissionAsync()` guard on API endpoints
3. **Backend (Nest):** `@Permissions()` guard on routes
4. **Audit Log:** Record all permission checks + denials

---

## Delegating Permissions

You can delegate specific permissions to individuals without changing their full role:

```typescript
// Give Finance Lead "approval.decide" while their manager is on vacation
POST /api/v1/orgs/me/members/{userId}/delegate-permission
{
  "permission": "approval.decide",
  "expiresAt": "2026-08-15T00:00:00Z",
  "reason": "Manager on vacation"
}
```

---

## Permission Validation

When creating/updating custom roles:
- ✅ All permission strings must be in this reference
- ✅ At least 1 permission required
- ✅ No duplicates
- ✅ Maximum 50+ permissions per role (recommended)

---

## Related Documentation

- [30_RBAC_Setup_Guide.md](./30_RBAC_Setup_Guide.md) — How to create custom roles
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — API endpoints
- [29_Track_D_RBAC_Implementation.md](./29_Track_D_RBAC_Implementation.md) — Implementation details

---

**Version:** v1.1 (Track D)  
**Last Updated:** August 1, 2026  
**Status:** Production-ready

---
## Source: docs/33_Complete_API_Reference.md

# Ellines EIP — Complete API Reference

**Version:** v1.0  
**Date:** August 8, 2026  
**Base URL (local):** `http://localhost:3100/api/v1`  
**Base URL (production):** `https://eip.ellines.co.ke/api/v1`  
**Authentication:** Bearer JWT in `Authorization` header

---

## Table of Contents

1. [System Health & Info](#1-system-health--info)
2. [Authentication](#2-authentication)
3. [Organization Management](#3-organization-management)
4. [Platform Super Admin](#4-platform-super-admin)
5. [Users & Members](#5-users--members)
6. [RBAC & Permissions](#6-rbac--permissions)
7. [Connectors](#7-connectors)
8. [Dashboards](#8-dashboards)
9. [Workflows & Approvals](#9-workflows--approvals)
10. [Ellinea AI](#10-ellinea-ai)
11. [Enterprise Data](#11-enterprise-data)
12. [Notifications](#12-notifications)
13. [Webhooks](#13-webhooks)
14. [Audit Logs](#14-audit-logs)

---

## 1. System Health & Info

### GET `/health`

**Description:** Service health check

**Authentication:** None (public)

**Request:**
```bash
GET /api/v1/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "ellines-eip-pages",
  "version": "1.0.0",
  "ts": "2026-08-08T10:00:00.000Z",
  "uptimeSeconds": 3600,
  "email": {
    "provider": "smtp",
    "live": true
  }
}
```

---


## 2. Authentication

### POST `/auth/register`

**Description:** Register new organization with owner account

**Authentication:** None

**Request Body:**
```json
{
  "organizationName": "Acme Corp",
  "organizationSlug": "acme-corp",
  "ownerName": "John Doe",
  "ownerEmail": "john@acme.com",
  "password": "SecurePass123!"
}
```

**Response (201 Created):**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "user_001",
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "owner",
    "organizationId": "org_001"
  },
  "organization": {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp"
  }
}
```

---

### POST `/auth/login`

**Description:** Login with email and password

**Authentication:** None

**Request Body:**
```json
{
  "email": "john@acme.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "user_001",
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "owner",
    "organizationId": "org_001"
  }
}
```

---

### GET `/auth/me`

**Description:** Get current user info

**Authentication:** Required

**Request:**
```bash
GET /api/v1/auth/me
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "id": "user_001",
  "name": "John Doe",
  "email": "john@acme.com",
  "role": "owner",
  "organizationId": "org_001",
  "organizationName": "Acme Corp",
  "createdAt": "2026-08-01T10:00:00Z"
}
```

---

### PATCH `/auth/me`

**Description:** Update user profile

**Authentication:** Required

**Request Body:**
```json
{
  "name": "John A. Doe"
}
```

**Response (200 OK):**
```json
{
  "id": "user_001",
  "name": "John A. Doe",
  "email": "john@acme.com",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### POST `/auth/forgot-password`

**Description:** Request password reset email

**Authentication:** None

**Request Body:**
```json
{
  "email": "john@acme.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset email sent if account exists"
}
```

---

### POST `/auth/reset-password`

**Description:** Reset password with token

**Authentication:** None

**Request Body:**
```json
{
  "token": "reset_token_123",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successful"
}
```

---

### POST `/auth/change-password`

**Description:** Change password (authenticated user)

**Authentication:** Required

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

**Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

---

## 3. Organization Management

### GET `/orgs/me`

**Description:** Get current organization info

**Authentication:** Required

**Request:**
```bash
GET /api/v1/orgs/me
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
{
  "id": "org_001",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "createdAt": "2026-08-01T10:00:00Z",
  "settings": {
    "timezone": "Africa/Nairobi",
    "dateFormat": "DD/MM/YYYY",
    "timeFormat": "24h"
  }
}
```

---

### GET `/orgs/me/settings`

**Description:** Get org date/time settings

**Authentication:** Required

**Response (200 OK):**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "fiscalYearStart": "01-01"
}
```

---

### PATCH `/orgs/me/settings`

**Description:** Update org settings

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY"
}
```

**Response (200 OK):**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/status`

**Description:** Get organization status

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "active",
  "userCount": 25,
  "connectorCount": 8,
  "lastSyncAt": "2026-08-08T09:45:00Z"
}
```

---

### GET `/orgs/my-orgs`

**Description:** List all orgs user belongs to (multi-org support)

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "role": "owner"
  },
  {
    "id": "org_002",
    "name": "Subsidiary Inc",
    "slug": "subsidiary",
    "role": "admin"
  }
]
```

---

### POST `/orgs/switch`

**Description:** Switch to different organization

**Authentication:** Required

**Request Body:**
```json
{
  "organizationId": "org_002"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGc...",
  "organizationId": "org_002",
  "organizationName": "Subsidiary Inc"
}
```

---

## 4. Platform Super Admin

> **Note:** These endpoints require Platform Admin email to be in `PLATFORM_ADMIN_EMAILS` environment variable

### GET `/platform/orgs`

**Description:** List all organizations (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Request:**
```bash
GET /api/v1/platform/orgs
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "createdAt": "2026-08-01T10:00:00Z",
    "userCount": 25,
    "status": "active"
  },
  {
    "id": "org_002",
    "name": "Beta Corp",
    "slug": "beta-corp",
    "createdAt": "2026-08-02T11:00:00Z",
    "userCount": 12,
    "status": "suspended"
  }
]
```

---

### PATCH `/platform/orgs/:id`

**Description:** Update organization status (suspend/activate)

**Authentication:** Required (Platform Admin)

**Path Parameters:**
- `id` — Organization ID

**Request Body:**
```json
{
  "status": "suspended"
}
```

**Valid status values:** `active`, `suspended`

**Response (200 OK):**
```json
{
  "id": "org_002",
  "status": "suspended",
  "updatedAt": "2026-08-08T10:00:00Z",
  "updatedBy": "admin@platform.com"
}
```

---

### GET `/platform/orgs/:id/settings`

**Description:** Get org settings (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Response (200 OK):**
```json
{
  "timezone": "Africa/Nairobi",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "status": "active"
}
```

---

### PATCH `/platform/orgs/:id/settings`

**Description:** Update org settings (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Request Body:**
```json
{
  "timezone": "UTC",
  "status": "active"
}
```

**Response (200 OK):**
```json
{
  "timezone": "UTC",
  "dateFormat": "DD/MM/YYYY",
  "status": "active",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/platform/flags`

**Description:** List platform feature flags

**Authentication:** Required (Platform Admin)

**Response (200 OK):**
```json
{
  "flags": {
    "ellinea_ai_enabled": true,
    "multi_org_enabled": true,
    "sso_enabled": true,
    "api_gateway_enabled": false
  }
}
```

---

### GET `/platform/connector-packs`

**Description:** List all connector packs (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Response (200 OK):**
```json
[
  {
    "id": "pack_001",
    "slug": "erp-suite",
    "name": "ERP Suite Pack",
    "description": "Full ERP integration pack",
    "templateCount": 5,
    "published": true
  }
]
```

---

### POST `/platform/connector-packs`

**Description:** Create new connector pack (Platform Admin only)

**Authentication:** Required (Platform Admin)

**Request Body:**
```json
{
  "slug": "accounting-pack",
  "name": "Accounting Pack",
  "description": "Accounting systems integration",
  "catalogId": "cat_001",
  "published": false
}
```

**Response (201 Created):**
```json
{
  "id": "pack_002",
  "slug": "accounting-pack",
  "name": "Accounting Pack",
  "description": "Accounting systems integration",
  "published": false,
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 5. Users & Members

### GET `/orgs/me/users`

**Description:** List organization members

**Authentication:** Required (Owner/Admin)

**Request:**
```bash
GET /api/v1/orgs/me/users
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "user_001",
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "owner",
    "status": "active",
    "createdAt": "2026-08-01T10:00:00Z"
  },
  {
    "id": "user_002",
    "name": "Jane Smith",
    "email": "jane@acme.com",
    "role": "manager",
    "status": "active",
    "createdAt": "2026-08-02T11:00:00Z"
  }
]
```

---

### POST `/orgs/me/users`

**Description:** Invite user to organization

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "email": "newuser@acme.com",
  "name": "New User",
  "role": "member"
}
```

**Valid roles:** `admin`, `manager`, `member`, `viewer`

**Response (201 Created):**
```json
{
  "id": "user_003",
  "email": "newuser@acme.com",
  "name": "New User",
  "role": "member",
  "status": "invited",
  "invitedAt": "2026-08-08T10:00:00Z"
}
```

---

### PATCH `/orgs/me/users/:userId`

**Description:** Update user role or status

**Authentication:** Required (Owner/Admin)

**Path Parameters:**
- `userId` — User ID to update

**Request Body:**
```json
{
  "role": "manager"
}
```

**Response (200 OK):**
```json
{
  "id": "user_003",
  "role": "manager",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/branches`

**Description:** List organization branches

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "branch_001",
    "name": "Nairobi HQ",
    "location": "Nairobi, Kenya",
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/orgs/me/branches`

**Description:** Create new branch

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Mombasa Office",
  "location": "Mombasa, Kenya"
}
```

**Response (201 Created):**
```json
{
  "id": "branch_002",
  "name": "Mombasa Office",
  "location": "Mombasa, Kenya",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/departments`

**Description:** List organization departments

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "dept_001",
    "name": "Finance",
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/orgs/me/departments`

**Description:** Create new department

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Operations"
}
```

**Response (201 Created):**
```json
{
  "id": "dept_002",
  "name": "Operations",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 6. RBAC & Permissions

> **See also:** [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) for detailed RBAC documentation

### GET `/orgs/me/roles`

**Description:** List all custom roles

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "role_001",
    "name": "Finance Manager",
    "description": "Manages financial reports and approvals",
    "permissions": [
      "report.create",
      "report.edit",
      "approval.view",
      "approval.decide"
    ],
    "isActive": true,
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/orgs/me/roles`

**Description:** Create custom role

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "IT Operator",
  "description": "System administrator",
  "permissions": [
    "connector.install",
    "connector.test",
    "connector.sync"
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "role_002",
  "name": "IT Operator",
  "permissions": ["connector.install", "connector.test", "connector.sync"],
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/orgs/me/permissions`

**Description:** Get current user's effective permissions

**Authentication:** Required

**Response (200 OK):**
```json
{
  "userId": "user_001",
  "permissions": [
    "org.view",
    "org.edit_settings",
    "report.create",
    "approval.decide",
    "connector.install"
  ],
  "effectiveRole": "owner",
  "isElevated": false
}
```

---

### POST `/orgs/me/custom-roles/assign`

**Description:** Assign custom role to user

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "userId": "user_003",
  "customRoleId": "role_001"
}
```

**Response (200 OK):**
```json
{
  "userId": "user_003",
  "customRoleId": "role_001",
  "isActive": true,
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 7. Connectors

### GET `/api/v1/connectors/templates`

**Description:** List available connector templates

**Authentication:** Required

**Query Parameters:**
- `category` (optional) — Filter by category

**Request:**
```bash
GET /api/v1/connectors/templates?category=ERP
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "tmpl_erp_001",
    "name": "SAP ERP Connector",
    "category": "ERP",
    "description": "Connect to SAP ERP systems",
    "version": "1.0.0"
  },
  {
    "id": "tmpl_sql_001",
    "name": "SQL Database",
    "category": "Database",
    "description": "Generic SQL database connector",
    "version": "1.0.0"
  }
]
```

---

### GET `/api/v1/connectors/templates/:id`

**Description:** Get connector template details

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "tmpl_sql_001",
  "name": "SQL Database",
  "category": "Database",
  "description": "Generic SQL database connector",
  "configSchema": {
    "host": { "type": "string", "required": true },
    "port": { "type": "number", "default": 5432 },
    "database": { "type": "string", "required": true },
    "username": { "type": "string", "required": true },
    "password": { "type": "string", "required": true, "secure": true }
  },
  "version": "1.0.0"
}
```

---

### POST `/api/v1/connectors/install-from-template`

**Description:** Install connector from template

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "organizationId": "org_001",
  "templateId": "tmpl_sql_001",
  "displayName": "Production Database",
  "templateConfig": {
    "host": "db.acme.com",
    "port": 5432,
    "database": "production",
    "username": "eip_user",
    "password": "encrypted_pass"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "conn_001",
  "name": "Production Database",
  "templateId": "tmpl_sql_001",
  "status": "connected",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/api/v1/orgs/me/connectors/installations`

**Description:** List installed connectors

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "conn_001",
    "name": "Production Database",
    "templateId": "tmpl_sql_001",
    "status": "connected",
    "lastSyncAt": "2026-08-08T09:45:00Z"
  }
]
```

---

### POST `/api/v1/orgs/me/connectors/[id]/sync`

**Description:** Trigger connector sync

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "conn_001",
  "syncStartedAt": "2026-08-08T10:00:00Z",
  "status": "syncing"
}
```

---

### POST `/api/v1/connectors/test-template`

**Description:** Test connector configuration

**Authentication:** Required

**Request Body:**
```json
{
  "templateId": "tmpl_sql_001",
  "config": {
    "host": "db.acme.com",
    "port": 5432,
    "database": "production",
    "username": "eip_user",
    "password": "test_pass"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Connection successful",
  "latencyMs": 45
}
```

---

## 8. Dashboards

### GET `/api/v1/dashboards`

**Description:** List all dashboards

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "dash_001",
    "name": "Executive Dashboard",
    "description": "CEO overview",
    "widgetCount": 8,
    "isPublic": false,
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

---

### POST `/api/v1/dashboards`

**Description:** Create new dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "organizationId": "org_001",
  "name": "Sales Dashboard",
  "description": "Sales metrics and KPIs",
  "layout": [],
  "refreshRate": 300,
  "isPublic": false,
  "createdBy": "user_001"
}
```

**Response (201 Created):**
```json
{
  "id": "dash_002",
  "name": "Sales Dashboard",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

### GET `/api/v1/dashboards/:id`

**Description:** Get dashboard details

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "dash_001",
  "name": "Executive Dashboard",
  "description": "CEO overview",
  "layout": [
    {
      "widgetId": "widget_001",
      "position": { "x": 0, "y": 0, "w": 6, "h": 4 }
    }
  ],
  "widgets": [
    {
      "id": "widget_001",
      "type": "metric",
      "title": "Total Revenue",
      "config": { "metric": "revenue", "format": "currency" }
    }
  ]
}
```

---

### PATCH `/api/v1/dashboards/:id`

**Description:** Update dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Executive Dashboard v2",
  "description": "Updated overview"
}
```

**Response (200 OK):**
```json
{
  "id": "dash_001",
  "name": "Executive Dashboard v2",
  "updatedAt": "2026-08-08T10:00:00Z"
}
```

---

### DELETE `/api/v1/dashboards/:id`

**Description:** Delete dashboard

**Authentication:** Required

**Response (204 No Content)**

---

### POST `/api/v1/dashboards/:id/widgets`

**Description:** Add widget to dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "organizationId": "org_001",
  "type": "chart",
  "title": "Monthly Sales",
  "config": {
    "chartType": "line",
    "dataSource": "conn_001"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "widget_002",
  "type": "chart",
  "title": "Monthly Sales",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 9. Workflows & Approvals

### GET `/api/v1/orgs/me/approvals`

**Description:** List pending approvals

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "appr_001",
    "type": "purchase_order",
    "title": "Purchase Order #12345",
    "amount": 5000,
    "currency": "KES",
    "requestedBy": "user_002",
    "requestedAt": "2026-08-08T09:00:00Z",
    "status": "pending"
  }
]
```

---

### POST `/api/v1/orgs/me/approvals/:id/decide`

**Description:** Approve or reject request

**Authentication:** Required (with approval.decide permission)

**Request Body:**
```json
{
  "decision": "approved",
  "comment": "Approved for Q3 budget"
}
```

**Valid decisions:** `approved`, `rejected`

**Response (200 OK):**
```json
{
  "id": "appr_001",
  "status": "approved",
  "decidedBy": "user_001",
  "decidedAt": "2026-08-08T10:00:00Z",
  "comment": "Approved for Q3 budget"
}
```

---

### GET `/api/v1/workflows/rules`

**Description:** List workflow automation rules

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "rule_001",
    "name": "Auto-approve small purchases",
    "trigger": "approval.created",
    "condition": "amount < 1000",
    "action": "auto_approve",
    "isActive": true
  }
]
```

---

### POST `/api/v1/workflows/rules`

**Description:** Create workflow rule

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Notify finance on large purchases",
  "trigger": "approval.created",
  "condition": "amount > 10000",
  "action": "send_notification",
  "config": {
    "recipients": ["finance@acme.com"]
  }
}
```

**Response (201 Created):**
```json
{
  "id": "rule_002",
  "name": "Notify finance on large purchases",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 10. Ellinea AI

> **See also:** [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md) for detailed Ellinea AI documentation

### POST `/api/v1/ellinea/ask`

**Description:** Ask Ellinea AI a question

**Authentication:** Required

**Request Body:**
```json
{
  "question": "What is our current cash position?",
  "summary": {
    "status": "synced",
    "healthScore": 85,
    "openAlerts": 2,
    "connectedSystems": 8
  },
  "role": "ceo",
  "organizationName": "Acme Corp"
}
```

**Response (200 OK):**
```json
{
  "answer": "Your current cash position is KES 2.5M as of today...",
  "mode": "template+rag",
  "grounding": "Based on Financial Connector sync at 09:45 today",
  "recommendations": [
    {
      "id": "rec_001",
      "title": "Review pending invoices",
      "priority": "medium"
    }
  ]
}
```

---

### POST `/api/v1/ellinea/brief`

**Description:** Get daily brief for user role

**Authentication:** Required

**Request Body:**
```json
{
  "summary": {
    "status": "synced",
    "healthScore": 85
  },
  "role": "ceo",
  "organizationName": "Acme Corp"
}
```

**Response (200 OK):**
```json
{
  "brief": "Good morning. Here's your daily brief for Acme Corp..."
}
```

---

### POST `/api/v1/ellinea/recommend`

**Description:** Get AI recommendations

**Authentication:** Required

**Request Body:**
```json
{
  "summary": {
    "status": "synced",
    "healthScore": 85,
    "openAlerts": 2
  },
  "role": "ceo"
}
```

**Response (200 OK):**
```json
{
  "recommendations": [
    {
      "id": "rec_001",
      "title": "Address cash flow alerts",
      "priority": "high",
      "detail": "2 cash flow alerts require attention"
    }
  ]
}
```

---

### GET `/api/v1/orgs/me/ellinea-memory`

**Description:** Get organization's Ellinea memory notes

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "note_001",
    "title": "Q3 Strategy",
    "body": "Focus on customer retention...",
    "updatedAt": "2026-08-07T15:00:00Z"
  }
]
```

---

### PUT `/api/v1/orgs/me/ellinea-memory`

**Description:** Update Ellinea memory notes

**Authentication:** Required

**Request Body:**
```json
[
  {
    "id": "note_001",
    "title": "Q3 Strategy",
    "body": "Updated strategy..."
  }
]
```

**Response (200 OK):**
```json
{
  "message": "Memory updated",
  "count": 1
}
```

---

## 11. Enterprise Data

### POST `/api/v1/enterprise/ingest`

**Description:** Ingest enterprise data snapshot

**Authentication:** Required

**Request Body:**
```json
{
  "connectorId": "conn_001",
  "data": {
    "customers": [...],
    "transactions": [...]
  },
  "timestamp": "2026-08-08T10:00:00Z"
}
```

**Response (200 OK):**
```json
{
  "ingested": true,
  "recordCount": 1500,
  "timestamp": "2026-08-08T10:00:00Z"
}
```

---

### GET `/api/v1/enterprise/summary`

**Description:** Get enterprise data summary

**Authentication:** Required

**Response (200 OK):**
```json
{
  "status": "synced",
  "healthScore": 85,
  "openAlerts": 2,
  "openDecisions": 5,
  "connectedSystems": 8,
  "syncedAt": "2026-08-08T09:45:00Z"
}
```

---

## 12. Notifications

### GET `/api/v1/orgs/me/notifications`

**Description:** List user notifications

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "notif_001",
    "type": "approval_request",
    "title": "Approval needed: Purchase Order #12345",
    "body": "John Doe requests approval for KES 5,000",
    "read": false,
    "createdAt": "2026-08-08T09:00:00Z"
  }
]
```

---

### PATCH `/api/v1/orgs/me/notifications/:id/read`

**Description:** Mark notification as read

**Authentication:** Required

**Response (200 OK):**
```json
{
  "id": "notif_001",
  "read": true,
  "readAt": "2026-08-08T10:00:00Z"
}
```

---

### POST `/api/v1/notifications/push-subscription`

**Description:** Subscribe to push notifications

**Authentication:** Required

**Request Body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

**Response (200 OK):**
```json
{
  "subscribed": true
}
```

---

### GET `/api/v1/orgs/me/notify-policy`

**Description:** Get notification policy

**Authentication:** Required

**Response (200 OK):**
```json
{
  "emailEnabled": true,
  "pushEnabled": true,
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

---

### PUT `/api/v1/orgs/me/notify-policy`

**Description:** Update notification policy

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "emailEnabled": true,
  "pushEnabled": true,
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

**Response (200 OK):**
```json
{
  "message": "Notification policy updated"
}
```

---

## 13. Webhooks

### GET `/api/v1/orgs/me/webhook-secret`

**Description:** Get webhook signing secret

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "secret": "whsec_abc123...",
  "createdAt": "2026-08-01T10:00:00Z"
}
```

---

### POST `/api/v1/orgs/me/webhook-secret`

**Description:** Rotate webhook secret

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "secret": "whsec_xyz789...",
  "createdAt": "2026-08-08T10:00:00Z",
  "rotatedBy": "user_001"
}
```

---

### POST `/api/v1/webhooks/inbound`

**Description:** Receive inbound webhook (from external systems)

**Authentication:** Webhook signature verification

**Headers:**
- `X-EIP-Signature` — HMAC signature

**Request Body:**
```json
{
  "event": "invoice.created",
  "data": {
    "invoiceId": "INV-001",
    "amount": 5000,
    "currency": "KES"
  }
}
```

**Response (200 OK):**
```json
{
  "received": true,
  "eventId": "evt_001"
}
```

---

## 14. Audit Logs

### GET `/api/v1/orgs/me/audit-logs`

**Description:** List audit logs

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) — Number of logs to return (default: 80)

**Request:**
```bash
GET /api/v1/orgs/me/audit-logs?limit=50
Authorization: Bearer <jwt>
```

**Response (200 OK):**
```json
[
  {
    "id": "log_001",
    "action": "user.invited",
    "actor": "user_001",
    "actorEmail": "john@acme.com",
    "target": "user_003",
    "targetEmail": "newuser@acme.com",
    "metadata": {
      "role": "member"
    },
    "timestamp": "2026-08-08T10:00:00Z",
    "ipAddress": "192.168.1.1"
  }
]
```

---

## 15. API Keys

### GET `/api/v1/orgs/me/api-keys`

**Description:** List organization API keys

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
[
  {
    "id": "key_001",
    "name": "Production API Key",
    "prefix": "eip_live_abc",
    "createdBy": "user_001",
    "createdAt": "2026-08-01T10:00:00Z",
    "expiresAt": "2027-08-01T10:00:00Z",
    "lastUsedAt": "2026-08-08T09:30:00Z"
  }
]
```

---

### POST `/api/v1/orgs/me/api-keys`

**Description:** Create new API key

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "name": "Integration Key",
  "expiresInDays": 365
}
```

**Response (201 Created):**
```json
{
  "id": "key_002",
  "name": "Integration Key",
  "key": "eip_live_xyz123...",
  "createdAt": "2026-08-08T10:00:00Z",
  "expiresAt": "2027-08-08T10:00:00Z"
}
```

> **Note:** The full `key` value is only shown once at creation time.

---

### DELETE `/api/v1/orgs/me/api-keys`

**Description:** Revoke API key

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "id": "key_002"
}
```

**Response (200 OK):**
```json
{
  "message": "API key revoked",
  "revokedAt": "2026-08-08T10:00:00Z"
}
```

---

## 16. Documents & Knowledge

### GET `/api/v1/orgs/me/documents`

**Description:** List organization documents

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "doc_001",
    "name": "Q3 Budget.xlsx",
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size": 45120,
    "tags": ["finance", "budget"],
    "uploadedBy": "user_001",
    "uploadedAt": "2026-08-07T14:00:00Z",
    "branch": "Nairobi HQ",
    "department": "Finance"
  }
]
```

---

### POST `/api/v1/orgs/me/documents`

**Description:** Upload document

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Policy Manual.pdf",
  "mimeType": "application/pdf",
  "content": "base64_encoded_content...",
  "tags": ["policy", "hr"],
  "branch": "Nairobi HQ",
  "department": "HR",
  "summary": "Updated employee policy manual"
}
```

**Response (201 Created):**
```json
{
  "id": "doc_002",
  "name": "Policy Manual.pdf",
  "size": 102400,
  "uploadedAt": "2026-08-08T10:00:00Z"
}
```

---

### DELETE `/api/v1/orgs/me/documents`

**Description:** Delete document

**Authentication:** Required (Owner/Admin or document owner)

**Request Body:**
```json
{
  "id": "doc_002"
}
```

**Response (200 OK):**
```json
{
  "message": "Document deleted",
  "deletedAt": "2026-08-08T10:00:00Z"
}
```

---

## 17. Reports

### GET `/api/v1/orgs/me/reports`

**Description:** List scheduled reports

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "report_001",
    "name": "Weekly Financial Summary",
    "schedule": "0 9 * * MON",
    "recipients": ["finance@acme.com"],
    "format": "pdf",
    "lastRunAt": "2026-08-05T09:00:00Z",
    "nextRunAt": "2026-08-12T09:00:00Z"
  }
]
```

---

### POST `/api/v1/orgs/me/reports`

**Description:** Create scheduled report

**Authentication:** Required (with report.schedule permission)

**Request Body:**
```json
{
  "name": "Monthly Sales Report",
  "schedule": "0 8 1 * *",
  "recipients": ["sales@acme.com"],
  "format": "excel",
  "dashboardId": "dash_002"
}
```

**Response (201 Created):**
```json
{
  "id": "report_002",
  "name": "Monthly Sales Report",
  "schedule": "0 8 1 * *",
  "nextRunAt": "2026-09-01T08:00:00Z",
  "createdAt": "2026-08-08T10:00:00Z"
}
```

---

## 18. Alert Correlations

### GET `/api/v1/orgs/me/alert-correlations`

**Description:** Get real-time alert correlation analysis

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "correlations": [
    {
      "id": "corr_001",
      "pattern": "cash_flow_decline",
      "alerts": ["alert_001", "alert_003"],
      "severity": "high",
      "recommendation": "Review AR aging and collections",
      "detectedAt": "2026-08-08T09:30:00Z"
    }
  ],
  "totalAlerts": 5,
  "correlatedAlerts": 2
}
```

---

## 19. Learning & Training

### GET `/api/v1/orgs/me/ellinea-learning`

**Description:** Get Ellinea learning data

**Authentication:** Required

**Response (200 OK):**
```json
{
  "insights": [
    {
      "topic": "cash_flow",
      "learned": "Peak collections on Fridays",
      "confidence": 0.85
    }
  ],
  "lastUpdated": "2026-08-08T09:00:00Z"
}
```

---

### PUT `/api/v1/orgs/me/ellinea-learning`

**Description:** Update Ellinea learning data

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "insights": [
    {
      "topic": "inventory",
      "learned": "Reorder threshold: 100 units",
      "confidence": 0.9
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "message": "Learning data updated",
  "insightCount": 1
}
```

---

## 20. Database Configuration

### GET `/api/v1/orgs/me/database-config`

**Description:** Get organization database configuration

**Authentication:** Required (Owner/Admin)

**Response (200 OK):**
```json
{
  "type": "postgresql",
  "host": "db.acme.com",
  "port": 5432,
  "database": "acme_prod",
  "schema": "public",
  "connectionPoolSize": 10,
  "configured": true
}
```

---

### POST `/api/v1/orgs/me/database-config`

**Description:** Configure organization database

**Authentication:** Required (Owner/Admin)

**Request Body:**
```json
{
  "type": "postgresql",
  "host": "db.acme.com",
  "port": 5432,
  "database": "acme_prod",
  "username": "eip_user",
  "password": "secure_password",
  "schema": "public"
}
```

**Response (200 OK):**
```json
{
  "message": "Database configuration saved",
  "testConnection": true
}
```

---

## Common Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request succeeded with no response body |
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated but not authorized for this action |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Resource conflict (e.g., duplicate name) |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

---

## Error Response Format

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Invalid request body: missing required field 'email'",
  "error": "BadRequest",
  "timestamp": "2026-08-08T10:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

---

## Authentication

### Bearer Token

All authenticated endpoints require a JWT token in the Authorization header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key

Some endpoints support API key authentication:

```bash
X-API-Key: eip_live_abc123...
```

### Token Expiration

- JWT tokens expire after 24 hours
- Refresh tokens are not yet implemented (planned for v1.1)
- API keys expire based on configured expiration (default: 365 days)

---

## Rate Limiting

| Tier | Requests per minute | Requests per hour |
|------|---------------------|-------------------|
| Per User | 100 | 5,000 |
| Per Organization | 1,000 | 50,000 |
| Per IP Address | 300 | 15,000 |
| Platform Global | 10,000 | 500,000 |

**Response Headers:**
- `X-RateLimit-Limit` — Maximum requests allowed
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — Unix timestamp when limit resets

---

## Pagination

List endpoints support pagination using query parameters:

**Query Parameters:**
- `page` — Page number (default: 1)
- `limit` — Items per page (default: 20, max: 100)
- `sort` — Sort field (e.g., `createdAt`)
- `order` — Sort order: `asc` or `desc` (default: `desc`)

**Example:**
```bash
GET /api/v1/orgs/me/users?page=2&limit=50&sort=createdAt&order=asc
```

**Response with Pagination:**
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 150,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": true
  }
}
```

---

## Filtering

Some endpoints support filtering:

**Example:**
```bash
GET /api/v1/orgs/me/users?role=admin&status=active
GET /api/v1/orgs/me/documents?tags=finance,budget&department=Finance
```

---

## Webhooks

### Webhook Events

EIP can send webhooks for these events:

| Event | Trigger |
|-------|---------|
| `org.created` | New organization registered |
| `user.invited` | User invited to organization |
| `user.joined` | User accepted invite |
| `user.role_changed` | User role updated |
| `connector.installed` | Connector installed |
| `connector.synced` | Connector sync completed |
| `connector.error` | Connector sync failed |
| `approval.created` | Approval request created |
| `approval.decided` | Approval decided |
| `dashboard.created` | Dashboard created |
| `alert.triggered` | Alert condition met |
| `report.generated` | Scheduled report generated |

### Webhook Payload Format

```json
{
  "event": "approval.created",
  "timestamp": "2026-08-08T10:00:00Z",
  "organizationId": "org_001",
  "data": {
    "approvalId": "appr_001",
    "type": "purchase_order",
    "amount": 5000,
    "requestedBy": "user_002"
  }
}
```

### Webhook Signature Verification

Webhooks include `X-EIP-Signature` header with HMAC-SHA256 signature:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}
```

---

## SDK Usage Examples

### JavaScript/TypeScript

```typescript
// Initialize client
import { EIPClient } from '@ellines-eip/client';

const client = new EIPClient({
  baseUrl: 'https://eip.ellines.co.ke/api/v1',
  accessToken: 'eyJhbGc...'
});

// Get current user
const user = await client.auth.me();

// List organizations
const orgs = await client.platform.listOrgs();

// Create custom role
const role = await client.rbac.createRole({
  name: 'Finance Manager',
  permissions: ['report.create', 'approval.decide']
});

// Ask Ellinea AI
const answer = await client.ellinea.ask({
  question: 'What is our cash position?',
  role: 'ceo'
});
```

### Python

```python
from ellines_eip import EIPClient

client = EIPClient(
    base_url='https://eip.ellines.co.ke/api/v1',
    access_token='eyJhbGc...'
)

# Get current user
user = client.auth.me()

# List connectors
connectors = client.connectors.list_templates()

# Create dashboard
dashboard = client.dashboards.create({
    'name': 'Sales Dashboard',
    'description': 'Sales KPIs'
})
```

### cURL

```bash
# Login
curl -X POST https://eip.ellines.co.ke/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@acme.com","password":"SecurePass123!"}'

# Get organizations (Platform Admin)
curl -X GET https://eip.ellines.co.ke/api/v1/platform/orgs \
  -H "Authorization: Bearer eyJhbGc..."

# Create approval
curl -X POST https://eip.ellines.co.ke/api/v1/orgs/me/approvals \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{"type":"purchase_order","amount":5000,"title":"Office Supplies"}'
```

---

## Super Admin Dashboard API Summary

The following endpoints are specifically relevant for the **Platform Super Admin Dashboard**:

### Core Super Admin Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/platform/orgs` | List all organizations |
| `PATCH` | `/platform/orgs/:id` | Suspend/activate organization |
| `GET` | `/platform/orgs/:id/settings` | View org settings |
| `PATCH` | `/platform/orgs/:id/settings` | Update org settings |
| `GET` | `/platform/flags` | View feature flags |
| `GET` | `/platform/connector-packs` | List connector packs |
| `POST` | `/platform/connector-packs` | Create connector pack |

### Monitoring & Analytics

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | System health check |
| `GET` | `/orgs/me/audit-logs` | View audit logs (per org) |
| `GET` | `/orgs/me/alert-correlations` | Alert correlation analysis |

---

## Super Admin Dashboard Features

The Super Admin Dashboard should expose:

### 1. Organization Management
- View all organizations with status, user count, creation date
- Suspend/activate organizations
- View org settings (timezone, formats)
- Update org settings if needed
- View per-org statistics (users, connectors, data volume)

### 2. Platform Health
- System uptime and health status
- Email provider status
- Service versions
- API response times
- Error rates

### 3. Feature Flags
- View current feature flag states
- Toggle feature flags (future enhancement)

### 4. Connector Packs
- View all published connector packs
- Create new connector packs
- View pack usage statistics

### 5. User Analytics (Future)
- Total users across all orgs
- Active users by time period
- User growth trends
- Role distribution

### 6. Usage Metrics (Future)
- API call volume by endpoint
- Data storage per organization
- Connector sync frequency
- Most used features

### 7. Audit Trail
- Platform-level actions (org created, suspended)
- Admin actions across organizations
- Security events
- System configuration changes

---

## Implementation Notes

### Platform Admin Authentication

Platform Admins are identified by email in the `PLATFORM_ADMIN_EMAILS` environment variable:

```bash
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,superadmin@ellines.co.ke
```

The backend validates:
```typescript
import { isPlatformAdminEmail, parsePlatformAdminEmails } from '@ellines-eip/shared';

const allowlist = parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
if (!isPlatformAdminEmail(userEmail, allowlist)) {
  throw new ForbiddenException('Platform admin only');
}
```

### Accessing the Super Admin Dashboard

1. Login with a platform admin email
2. Navigate to `/app/super-admin` (route to be implemented)
3. Dashboard will call platform endpoints with your JWT token
4. Backend validates your email against `PLATFORM_ADMIN_EMAILS`

---

## API Versioning

Current version: **v1**

Base path: `/api/v1`

Future versions will be available at:
- `/api/v2` (when v2 is released)
- `/api/v3` (when v3 is released)

Version 1 will be supported for at least 12 months after v2 release.

---

## CORS Configuration

CORS is enabled for:
- `http://localhost:3100` (development)
- `https://eip.ellines.co.ke` (production)
- `https://*.ellines.co.ke` (subdomains)

Allowed methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`

Allowed headers: `Authorization`, `Content-Type`, `X-API-Key`

---

## Security Best Practices

### For API Consumers

1. **Store tokens securely**
   - Use secure storage (not localStorage for sensitive apps)
   - Never commit tokens to version control
   - Rotate tokens regularly

2. **Validate responses**
   - Check status codes
   - Validate response schema
   - Handle errors gracefully

3. **Use HTTPS**
   - Always use HTTPS in production
   - Never send tokens over HTTP

4. **Implement rate limiting**
   - Respect rate limit headers
   - Implement exponential backoff on 429 responses

5. **Verify webhooks**
   - Always verify webhook signatures
   - Validate event payloads
   - Use timing-safe comparison

### For Platform Admins

1. **Secure admin emails**
   - Use strong passwords
   - Enable 2FA (when available)
   - Limit number of platform admins

2. **Monitor platform access**
   - Review audit logs regularly
   - Watch for suspicious activity
   - Set up alerts for critical actions

3. **Rotate secrets**
   - Rotate webhook secrets regularly
   - Rotate API keys periodically
   - Update admin email list as needed

---

## Testing the API

### Local Development

```bash
# Start services
npm run dev:identity  # Port 3001
npm run dev:web       # Port 3100

# Health check
curl http://localhost:3100/api/v1/health

# Register test org
curl -X POST http://localhost:3100/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test Corp",
    "organizationSlug": "test-corp",
    "ownerName": "Test User",
    "ownerEmail": "test@example.com",
    "password": "TestPass123!"
  }'
```

### Production Testing

```bash
# Health check
curl https://eip.ellines.co.ke/api/v1/health

# Login
curl -X POST https://eip.ellines.co.ke/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"YourPassword"}'
```

### Postman Collection

A Postman collection is available at `docs/postman/EIP_API_v1.postman_collection.json` (to be created).

---

## Changelog

### v1.0.0 (August 8, 2026)

**Initial Release**

- Authentication & Authorization (JWT)
- Organization Management
- Platform Super Admin APIs
- User & Member Management
- RBAC & Custom Roles
- Connector Management
- Dashboard APIs
- Workflow & Approval APIs
- Ellinea AI Integration
- Webhook Support
- Audit Logging
- API Key Management
- Document Storage

---

## Support & Documentation

### Related Documentation

- [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md) — Ellinea AI API details
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — RBAC API complete reference
- [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md) — Permission definitions
- [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md) — Product scope
- [03_Master_Blueprint.md](./03_Master_Blueprint.md) — Architecture overview

### Getting Help

- **Issues:** Report bugs via GitHub Issues
- **Questions:** Contact support@ellines.co.ke
- **Documentation:** https://docs.ellines.co.ke
- **Status Page:** https://status.ellines.co.ke (planned)

---

**Document Version:** 1.0.0  
**Last Updated:** August 8, 2026  
**Status:** Production Ready  
**Maintainer:** Ellines Tech Platform Team


---
## Source: docs/34_Super_Admin_Dashboard_Spec.md

# Ellines EIP — Super Admin Control Plane Specification

**Version:** 2.0  
**Status:** Canonical SuperAdmin UX/control specification  
**Route:** `/app/platform`  
**Access:** Platform Super Admin only

## 1. Purpose

The Super Admin Control Plane is the operator console for **Ellines EIP itself**.

It is intentionally different from every business dashboard.

A business dashboard answers: **“How is this business operating?”**

The Super Admin console answers:

- Is EIP operating correctly?
- Which businesses are onboarded?
- Which businesses are active, suspended, or disconnected?
- What service package does each business have?
- Who has access?
- What needs troubleshooting?
- What configuration/features are enabled?
- What privileged actions happened?
- Which customer integrations require intervention?
- What platform-level capacity, security, usage, and reliability issues exist?

## 2. Connector boundary

Customer connectors must **not** be presented as EIP infrastructure.

EIP must operate without any customer connector.

Connectors exist because an onboarded business needs EIP to interact with that business's systems.

Therefore:

- **Do not place Connectors as a primary Command Center KPI.**
- **Do not define platform health from connector availability.**
- **Do not require a connector for EIP startup, authentication, tenant administration, audit, or core platform operation.**
- Connector templates/packs belong under **Business Services / Integration Catalog**.
- SuperAdmin may inspect, troubleshoot, disconnect, revoke, or publish business integrations when authorized.

## 3. Primary navigation

### Platform
1. **Command Center**
2. **Businesses**
3. **Register Business**

### Commercial
4. **Service Packages**
5. **Licensing / Entitlements**
6. **Usage / Quotas**

### Control
7. **Access & Control**
8. **System Health**
9. **Security & Audit**
10. **Troubleshooting / Incidents**

### Intelligence
11. **Ellinea AI**
12. **Platform Insights**

### System
13. **Feature Controls**
14. **Platform Configuration**
15. **Developer / API Operations**
16. **Recovery / Maintenance**

Customer connector administration is accessed from the relevant business or Service Catalog, not from the EIP core-health navigation.

## 4. Command Center

The first screen must focus on EIP platform operation.

### Core KPIs

- businesses onboarded;
- active businesses;
- suspended/disconnected businesses;
- total tenant users;
- platform availability;
- service health;
- API latency;
- background-job health;
- failed jobs;
- security alerts;
- pending operator actions;
- current usage/capacity.

### Business lifecycle summary

Show:

- newly registered;
- active;
- suspended;
- disconnected;
- onboarding/incomplete;
- package assigned/unassigned.

### Platform health

Platform health must come from real platform telemetry.

Never use:

- random values;
- fake percentages;
- fake latency;
- synthetic incidents;
- fabricated predictive forecasts.

Unavailable telemetry must be explicitly displayed as **Unavailable** or **Not connected**.

## 5. Business control

SuperAdmin must be able to:

- register a business;
- create its initial owner;
- inspect tenant identity;
- inspect tenant users;
- assign/change service package;
- change tenant settings;
- activate;
- suspend;
- disconnect;
- reconnect;
- inspect usage;
- inspect integration status;
- inspect recent activity;
- inspect audit history;
- troubleshoot the tenant.

### Disconnect behavior

Disconnect/suspend should be reversible where possible.

The normal control plane must not expose irreversible hard deletion without a separate destructive workflow with:

- explicit reason;
- confirmation;
- audit event;
- dependency checks;
- recovery/backup consideration;
- elevated re-authentication;
- optional dual approval.

## 6. Service packages

SuperAdmin must manage commercial capability packages.

A package may define:

- maximum users;
- maximum integrations;
- API request limits;
- burst limits;
- export limits;
- SSO;
- custom roles;
- autonomous agents;
- advanced BI;
- webhooks;
- support priority;
- pricing;
- custom overrides.

A package can be assigned to an onboarded business.

Package changes must be audited.

## 7. Business Service / Integration Catalog

This is where customer-facing integration offerings belong.

SuperAdmin may:

- publish connector/service templates;
- maintain reusable integration packs;
- version templates;
- inspect installation compatibility;
- troubleshoot customer integrations;
- disconnect/revoke a business integration;
- publish or unpublish a service offering.

This area must never be confused with EIP platform health.

## 8. Access & Control

SuperAdmin must be able to inspect and control tenant users:

- list users;
- create users;
- activate/deactivate users;
- change roles;
- reset credentials through the approved secure flow;
- inspect recent access activity.

Every privileged change is audited.

## 9. Security & Audit

Provide a cross-business audit center with:

- actor;
- business;
- action;
- resource;
- timestamp;
- IP/security metadata where permitted;
- reason/reference where required;
- before/after metadata where appropriate.

Support filtering by:

- business;
- actor;
- action;
- resource;
- date range;
- security severity.

## 10. Troubleshooting

Provide a dedicated operator troubleshooting workspace.

It should correlate:

- platform health;
- tenant status;
- service package;
- user/access failures;
- integration health;
- recent events;
- audit activity;
- failed jobs;
- error signatures;
- incident history.

AI may summarize evidence, but it must not invent evidence or silently perform privileged actions.

## 11. Feature controls

SuperAdmin may enable/disable global feature flags.

Every change must:

- require platform authorization;
- be auditable;
- show current state;
- show impact/description;
- avoid silently changing tenant permissions.

## 12. System configuration

SuperAdmin controls platform-wide settings and selected tenant-level administrative settings.

Examples:

- feature flags;
- date/time defaults;
- service configuration;
- quotas;
- rate limits;
- notification configuration;
- maintenance controls;
- release configuration.

## 13. Modern UX requirements

The console should feel like a high-end platform operations center:

- dense but readable information hierarchy;
- responsive layout;
- keyboard accessible;
- dark/light/high-contrast support where appropriate;
- clear severity states;
- live refresh where authoritative telemetry exists;
- drill-down instead of information overload;
- command/search capability;
- persistent context for selected business;
- safe destructive-action flows;
- no fake data.

## 14. Control philosophy

SuperAdmin is **not** another business dashboard with more permissions.

It is the **EIP platform operating console**.

Business dashboards operate business data.

SuperAdmin operates:

**Platform → Businesses → Services → Access → Security → Configuration → Recovery.**

## 15. Acceptance criteria

The SuperAdmin implementation is accepted only when:

- EIP works without customer connectors;
- Command Center focuses on platform performance and lifecycle;
- business registration works;
- business activation/suspension/disconnection works;
- package creation and assignment work;
- tenant user administration works;
- feature flags can be controlled;
- global audit is searchable;
- system health uses real telemetry;
- customer integrations are clearly separated from EIP infrastructure;
- privileged actions are audited;
- no dashboard telemetry is fabricated;
- destructive operations have safeguards;
- UI works on desktop and mobile;
- build/type-check/tests pass.


---
## Source: docs/35_API_Documentation_Guide.md

# Ellines EIP API Documentation Guide (B.3.3)

## Overview

The Ellines EIP API is fully documented using **OpenAPI 3.0** (Swagger) specification. Interactive API documentation is available at `/api/docs` with a built-in testing interface.

## Accessing API Documentation

### Local Development
```
http://localhost:3001/api/docs
```

### Production
```
https://eip.ellines.co.ke/api/docs
```

### From Web App
Navigate to `/api-docs` in the web application, which will redirect to the full Swagger UI.

## Authentication

All authenticated endpoints require a **JWT Bearer token** in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Getting a Token

**1. Register a new organization:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePassword123!",
  "fullName": "John Doe",
  "organizationName": "Acme Corp"
}
```

**2. Login:**
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h",
  "user": {
    "id": "usr_123",
    "email": "admin@example.com",
    "fullName": "John Doe",
    "role": "owner"
  },
  "organization": {
    "id": "org_abc",
    "name": "Acme Corp",
    "slug": "acme-corp"
  }
}
```

## Rate Limiting

All API requests are subject to rate limits based on your organization's tier:

| Tier | Requests/Day | Requests/Hour | Requests/Minute |
|------|-------------|---------------|-----------------|
| **Free** | 100 | 20 | 5 |
| **Starter** | 1,000 | 200 | 20 |
| **Professional** | 10,000 | 2,000 | 100 |
| **Enterprise** | 100,000 | 20,000 | 1,000 |

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9847
X-RateLimit-Reset: 2026-08-09T00:00:00Z
X-RateLimit-Tier: Professional
```

### Rate Limit Exceeded

When limits are exceeded, you'll receive a `429 Too Many Requests` response:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-08-09T00:00:00Z

{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Tier: Professional. Limit: 10000 requests. Try again in 3600 seconds.",
  "limit": 10000,
  "remaining": 0,
  "reset": "2026-08-09T00:00:00Z",
  "tier": "Professional"
}
```

## API Endpoints by Category

### Authentication
- `POST /api/v1/auth/register` - Register new organization
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/change-password` - Change password
- `GET /api/v1/auth/me` - Get current user

### Organizations
- `GET /api/v1/orgs/me` - Get organization profile
- `PATCH /api/v1/orgs/me` - Update organization
- `GET /api/v1/orgs/me/users` - List users
- `POST /api/v1/orgs/me/users` - Invite user
- `PATCH /api/v1/orgs/me/users/:id` - Update user
- `DELETE /api/v1/orgs/me/users/:id` - Delete user

### Connectors
- `GET /api/v1/connectors` - List connectors
- `GET /api/v1/connectors/installations` - List installations
- `POST /api/v1/connectors/installations` - Install connector
- `PATCH /api/v1/connectors/installations/:id` - Update installation
- `DELETE /api/v1/connectors/installations/:id` - Delete installation
- `POST /api/v1/connectors/installations/:id/test` - Test connection
- `POST /api/v1/connectors/installations/:id/sync` - Sync data

### Dashboards
- `GET /api/v1/orgs/me/dashboards` - List dashboards
- `POST /api/v1/orgs/me/dashboards` - Create dashboard
- `GET /api/v1/orgs/me/dashboards/:id` - Get dashboard
- `PATCH /api/v1/orgs/me/dashboards/:id` - Update dashboard
- `DELETE /api/v1/orgs/me/dashboards/:id` - Delete dashboard

### Workflows
- `GET /api/v1/orgs/me/approvals` - List approvals
- `POST /api/v1/orgs/me/approvals` - Create approval
- `POST /api/v1/orgs/me/approvals/:id/decide` - Decide on approval
- `GET /api/v1/orgs/me/rules` - List business rules
- `POST /api/v1/orgs/me/rules` - Create rule
- `GET /api/v1/orgs/me/reports` - List scheduled reports
- `POST /api/v1/orgs/me/reports` - Create report
- `POST /api/v1/orgs/me/reports/:id/run` - Run report

### Agents
- `GET /api/v1/orgs/me/agents` - List agents
- `POST /api/v1/orgs/me/agents` - Create agent
- `GET /api/v1/orgs/me/agents/:id` - Get agent
- `PATCH /api/v1/orgs/me/agents/:id` - Update agent
- `DELETE /api/v1/orgs/me/agents/:id` - Delete agent
- `POST /api/v1/orgs/me/agents/:id/execute` - Execute agent

### RBAC
- `GET /api/v1/orgs/me/custom-roles` - List custom roles
- `POST /api/v1/orgs/me/custom-roles` - Create custom role
- `GET /api/v1/orgs/me/custom-roles/:id` - Get custom role
- `PATCH /api/v1/orgs/me/custom-roles/:id` - Update custom role
- `DELETE /api/v1/orgs/me/custom-roles/:id` - Delete custom role
- `POST /api/v1/orgs/me/custom-roles/assign` - Assign role

### Rate Limits
- `GET /api/v1/rate-limits/tiers` - List rate limit tiers (public)
- `GET /api/v1/rate-limits/orgs/:orgId/tier` - Get organization tier
- `POST /api/v1/rate-limits/orgs/:orgId/tier` - Assign tier (platform admin)
- `GET /api/v1/rate-limits/orgs/:orgId/usage` - Get usage stats

### Ellinea AI
- `POST /api/v1/ellinea/ask` - Ask Ellinea a question
- `POST /api/v1/ellinea/brief` - Get executive brief
- `POST /api/v1/ellinea/recommend` - Get recommendations
- `GET /api/v1/orgs/me/ellinea-memory` - Get memory notes
- `PUT /api/v1/orgs/me/ellinea-memory` - Save memory notes

### Platform (Admin)
- `GET /api/v1/platform/orgs` - List all organizations
- `PATCH /api/v1/platform/orgs/:id` - Update organization
- `GET /api/v1/platform/flags` - Get feature flags

## Using the Interactive Documentation

### 1. Open Swagger UI
Navigate to `http://localhost:3001/api/docs`

### 2. Authorize
Click the **Authorize** button at the top right and enter your JWT token:
```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Try Endpoints
- Click any endpoint to expand it
- Click **Try it out**
- Fill in required parameters
- Click **Execute**
- View the response

### 4. View Models
Scroll down to see all request/response models (DTOs) with their schemas.

## Exporting the OpenAPI Spec

### JSON Format
```bash
curl http://localhost:3001/api/docs-json > openapi.json
```

### YAML Format
```bash
curl http://localhost:3001/api/docs-yaml > openapi.yaml
```

## Generating Client SDKs

Use the OpenAPI Generator to create client SDKs in any language:

### TypeScript/JavaScript
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g typescript-fetch \
  -o ./generated/typescript-client
```

### Python
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g python \
  -o ./generated/python-client
```

### Java
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g java \
  -o ./generated/java-client
```

### C#
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3001/api/docs-json \
  -g csharp \
  -o ./generated/csharp-client
```

## Common Patterns

### Pagination
Most list endpoints support pagination:
```http
GET /api/v1/orgs/me/users?page=1&limit=50
```

### Filtering
```http
GET /api/v1/orgs/me/approvals?status=pending
```

### Sorting
```http
GET /api/v1/orgs/me/users?sortBy=createdAt&sortOrder=desc
```

### Search
```http
GET /api/v1/orgs/me/users?q=john
```

## Error Responses

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email must be a valid email address"
    }
  ]
}
```

### Common Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Webhooks

Configure webhooks to receive real-time events:

```http
POST /api/v1/orgs/me/webhook-secret
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/ellines",
  "events": ["connector.synced", "approval.created", "agent.executed"]
}
```

Webhook payloads include:
```json
{
  "event": "connector.synced",
  "organizationId": "org_abc",
  "timestamp": "2026-08-08T12:00:00Z",
  "data": {
    "connectorId": "conn_123",
    "status": "success",
    "recordCount": 150
  }
}
```

## Support

- **Documentation**: https://eip.ellines.co.ke/api/docs
- **Email**: ellines.tech@gmail.com
- **GitHub**: https://github.com/EllinesTech/Ellines-EIP

## Changelog

### v2.0.0 (2026-08-08)
- Added rate limiting with 4 tiers
- Added Swagger/OpenAPI documentation
- Added bulk data export
- Enhanced RBAC with custom roles
- Added autonomous AI agents

### v1.0.0 (2026-08-01)
- Initial release
- Authentication and authorization
- Connector framework
- Ellinea AI integration
- Workflow automation

---
## Source: docs/API_QUICK_REFERENCE.md

# Ellines EIP API Quick Reference

**Base URL (Local):** `http://localhost:3100/api/v1`  
**Base URL (Production):** `https://eip.ellines.co.ke/api/v1`

---

## Authentication

```bash
# Login
curl -X POST /api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}'

# Returns: { "accessToken": "eyJhbGc..." }

# Use token in subsequent requests
Authorization: Bearer eyJhbGc...
```

---

## Platform Super Admin (Quick Reference)

### List All Organizations
```bash
GET /api/v1/platform/orgs
Authorization: Bearer <admin-jwt>

Response:
[
  {
    "id": "org_001",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "userCount": 25,
    "status": "active",
    "createdAt": "2026-08-01T10:00:00Z"
  }
]
```

### Suspend Organization
```bash
PATCH /api/v1/platform/orgs/:id
Content-Type: application/json
Authorization: Bearer <admin-jwt>

{ "status": "suspended" }
```

### Activate Organization
```bash
PATCH /api/v1/platform/orgs/:id
Content-Type: application/json
Authorization: Bearer <admin-jwt>

{ "status": "active" }
```

### View Feature Flags
```bash
GET /api/v1/platform/flags
Authorization: Bearer <admin-jwt>

Response:
{
  "flags": {
    "ellinea_ai_enabled": true,
    "multi_org_enabled": true,
    "sso_enabled": true
  }
}
```

---

## Organizations

```bash
# Get current org
GET /api/v1/orgs/me

# Get org settings
GET /api/v1/orgs/me/settings

# Update org settings
PATCH /api/v1/orgs/me/settings
{ "timezone": "Africa/Nairobi" }

# List my organizations
GET /api/v1/orgs/my-orgs

# Switch organization
POST /api/v1/orgs/switch
{ "organizationId": "org_002" }
```

---

## Users & Members

```bash
# List org members
GET /api/v1/orgs/me/users

# Invite user
POST /api/v1/orgs/me/users
{
  "email": "new@example.com",
  "name": "New User",
  "role": "member"
}

# Update user role
PATCH /api/v1/orgs/me/users/:userId
{ "role": "manager" }
```

---

## RBAC & Permissions

```bash
# List custom roles
GET /api/v1/orgs/me/roles

# Create custom role
POST /api/v1/orgs/me/roles
{
  "name": "Finance Manager",
  "permissions": ["report.create", "approval.decide"]
}

# Get my permissions
GET /api/v1/orgs/me/permissions

# Assign role to user
POST /api/v1/orgs/me/custom-roles/assign
{
  "userId": "user_003",
  "customRoleId": "role_001"
}
```

---

## Connectors

```bash
# List connector templates
GET /api/v1/connectors/templates

# Get template details
GET /api/v1/connectors/templates/:id

# Install connector
POST /api/v1/connectors/install-from-template
{
  "organizationId": "org_001",
  "templateId": "tmpl_sql_001",
  "displayName": "Production DB",
  "templateConfig": { "host": "db.example.com", ... }
}

# List installed connectors
GET /api/v1/orgs/me/connectors/installations

# Sync connector
POST /api/v1/orgs/me/connectors/:id/sync
```

---

## Dashboards

```bash
# List dashboards
GET /api/v1/dashboards

# Create dashboard
POST /api/v1/dashboards
{
  "organizationId": "org_001",
  "name": "Sales Dashboard",
  "createdBy": "user_001"
}

# Get dashboard
GET /api/v1/dashboards/:id

# Add widget
POST /api/v1/dashboards/:id/widgets
{
  "organizationId": "org_001",
  "type": "chart",
  "title": "Monthly Sales"
}
```

---

## Workflows & Approvals

```bash
# List pending approvals
GET /api/v1/orgs/me/approvals

# Approve/reject
POST /api/v1/orgs/me/approvals/:id/decide
{
  "decision": "approved",
  "comment": "Approved for Q3 budget"
}

# List workflow rules
GET /api/v1/workflows/rules

# Create rule
POST /api/v1/workflows/rules
{
  "name": "Auto-approve small purchases",
  "trigger": "approval.created",
  "condition": "amount < 1000",
  "action": "auto_approve"
}
```

---

## Ellinea AI

```bash
# Ask question
POST /api/v1/ellinea/ask
{
  "question": "What is our cash position?",
  "role": "ceo",
  "organizationName": "Acme Corp"
}

# Get daily brief
POST /api/v1/ellinea/brief
{
  "role": "ceo",
  "organizationName": "Acme Corp"
}

# Get recommendations
POST /api/v1/ellinea/recommend
{
  "role": "ceo"
}

# Get memory
GET /api/v1/orgs/me/ellinea-memory

# Update memory
PUT /api/v1/orgs/me/ellinea-memory
[
  { "id": "note_001", "title": "Q3 Strategy", "body": "..." }
]
```

---

## Notifications

```bash
# List notifications
GET /api/v1/orgs/me/notifications

# Mark as read
PATCH /api/v1/orgs/me/notifications/:id/read

# Subscribe to push
POST /api/v1/notifications/push-subscription
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." }
}

# Get notify policy
GET /api/v1/orgs/me/notify-policy

# Update notify policy
PUT /api/v1/orgs/me/notify-policy
{
  "emailEnabled": true,
  "pushEnabled": true
}
```

---

## Webhooks

```bash
# Get webhook secret
GET /api/v1/orgs/me/webhook-secret

# Rotate secret
POST /api/v1/orgs/me/webhook-secret

# Receive webhook (external)
POST /api/v1/webhooks/inbound
X-EIP-Signature: <hmac-signature>

{
  "event": "invoice.created",
  "data": { "invoiceId": "INV-001" }
}
```

---

## Audit & Monitoring

```bash
# List audit logs
GET /api/v1/orgs/me/audit-logs?limit=50

# Platform health
GET /api/v1/health

# Alert correlations
GET /api/v1/orgs/me/alert-correlations
```

---

## API Keys

```bash
# List API keys
GET /api/v1/orgs/me/api-keys

# Create API key
POST /api/v1/orgs/me/api-keys
{
  "name": "Integration Key",
  "expiresInDays": 365
}

# Revoke API key
DELETE /api/v1/orgs/me/api-keys
{ "id": "key_002" }
```

---

## Documents

```bash
# List documents
GET /api/v1/orgs/me/documents

# Upload document
POST /api/v1/orgs/me/documents
{
  "name": "Policy Manual.pdf",
  "mimeType": "application/pdf",
  "content": "base64_encoded_content...",
  "tags": ["policy", "hr"]
}

# Delete document
DELETE /api/v1/orgs/me/documents
{ "id": "doc_002" }
```

---

## Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Server Error |

---

## Environment Variables

```bash
# Platform Admin
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,super@ellines.co.ke

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase (if using)
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# JWT
JWT_SECRET=your-secret-key

# Email (optional)
RESEND_API_KEY=re_...
# or
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Push Notifications (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@ellines.co.ke
```

---

## TypeScript SDK Usage

```typescript
import { EIPClient } from '@ellines-eip/client';

const client = new EIPClient({
  baseUrl: 'https://eip.ellines.co.ke/api/v1',
  accessToken: 'eyJhbGc...'
});

// Platform admin operations
const orgs = await client.platform.listOrgs();
await client.platform.suspendOrg('org_001');

// Organization operations
const myOrg = await client.orgs.getMyOrg();
const users = await client.orgs.listUsers();

// RBAC operations
const roles = await client.rbac.listRoles();
const permissions = await client.rbac.getMyPermissions();

// Ellinea AI
const answer = await client.ellinea.ask({
  question: 'What is our revenue trend?',
  role: 'ceo'
});
```

---

## Rate Limits

- **Per User:** 100 req/min
- **Per Org:** 1,000 req/min
- **Platform:** 10,000 req/min

**Headers:**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Complete Documentation

For full details, see:
- [33_Complete_API_Reference.md](./33_Complete_API_Reference.md) — Full API documentation
- [34_Super_Admin_Dashboard_Spec.md](./34_Super_Admin_Dashboard_Spec.md) — Super admin dashboard spec
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — RBAC detailed docs


---
## Source: docs/API_SUMMARY.md

# Ellines EIP API Summary

**Created:** August 8, 2026  
**Status:** Documentation Complete

---

## What Was Created

I've documented the complete API surface of your Ellines EIP system in two comprehensive documents:

### 1. Complete API Reference ([33_Complete_API_Reference.md](./33_Complete_API_Reference.md))

**Contents:**
- All 100+ API endpoints documented
- Request/response examples for each endpoint
- Authentication and authorization details
- Error handling and status codes
- Rate limiting and pagination
- Webhook integration guide
- SDK usage examples (TypeScript, Python, cURL)
- Security best practices

**Sections:**
1. System Health & Info
2. Authentication (register, login, forgot password, etc.)
3. Organization Management
4. **Platform Super Admin** (org list, suspend/activate, settings)
5. Users & Members
6. RBAC & Permissions
7. Connectors
8. Dashboards
9. Workflows & Approvals
10. Ellinea AI
11. Enterprise Data
12. Notifications
13. Webhooks
14. Audit Logs
15. API Keys
16. Documents & Knowledge
17. Reports
18. Alert Correlations
19. Learning & Training
20. Database Configuration

### 2. Super Admin Dashboard Spec ([34_Super_Admin_Dashboard_Spec.md](./34_Super_Admin_Dashboard_Spec.md))

**Contents:**
- Complete specification for building the Platform Super Admin Dashboard
- UI mockups and component examples
- React/TypeScript code examples
- API integration guide
- Security considerations
- Implementation checklist
- Testing guidelines

**Features Specified:**
- Organizations list with suspend/activate
- Organization details and settings editor
- Platform health monitoring
- Feature flags viewer
- Connector packs management
- Real-time statistics

---

## Super Admin Dashboard Overview

The Super Admin Dashboard will be accessible at `/app/super-admin` and will provide:

### Core Functionality

1. **Organization Management**
   - View all organizations
   - Suspend/activate organizations
   - View and edit org settings
   - Monitor user counts

2. **Platform Monitoring**
   - System health status
   - Service uptime
   - Email provider status
   - API health checks

3. **Feature Control**
   - View feature flags
   - Toggle features (future)

4. **Connector Management**
   - View connector packs
   - Create new packs
   - Monitor usage

### Key APIs for Super Admin

All accessible only to Platform Admins (emails in `PLATFORM_ADMIN_EMAILS` env var):

```
GET    /api/v1/platform/orgs                 # List all orgs
PATCH  /api/v1/platform/orgs/:id             # Suspend/activate org
GET    /api/v1/platform/orgs/:id/settings    # View org settings
PATCH  /api/v1/platform/orgs/:id/settings    # Update org settings
GET    /api/v1/platform/flags                # View feature flags
GET    /api/v1/platform/connector-packs      # List connector packs
POST   /api/v1/platform/connector-packs      # Create pack
```

### Authentication

Platform admins are identified by email address:

```bash
# .env or Cloudflare Pages environment variables
PLATFORM_ADMIN_EMAILS=admin@ellines.co.ke,superadmin@ellines.co.ke
```

Backend validates on every platform endpoint:
```typescript
import { isPlatformAdminEmail, parsePlatformAdminEmails } from '@ellines-eip/shared';

const allowlist = parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
if (!isPlatformAdminEmail(userEmail, allowlist)) {
  throw new ForbiddenException('Platform admin only');
}
```

---

## Complete API Endpoint Count

Your system currently has **100+ documented endpoints** across:

- **Authentication:** 8 endpoints
- **Organizations:** 25 endpoints  
- **Platform Admin:** 7 endpoints
- **Users & Members:** 8 endpoints
- **RBAC:** 9 endpoints
- **Connectors:** 12 endpoints
- **Dashboards:** 15 endpoints
- **Workflows:** 8 endpoints
- **Ellinea AI:** 6 endpoints
- **Enterprise Data:** 4 endpoints
- **Notifications:** 6 endpoints
- **Webhooks:** 3 endpoints
- **Audit & Monitoring:** 5 endpoints
- **Documents:** 3 endpoints
- **Reports:** 2 endpoints

---

## How to Use This Documentation

### For Developers Building the Super Admin Dashboard

1. Read [34_Super_Admin_Dashboard_Spec.md](./34_Super_Admin_Dashboard_Spec.md)
2. Reference [33_Complete_API_Reference.md](./33_Complete_API_Reference.md) for API details
3. Use the provided React/TypeScript code examples as templates
4. Follow the implementation checklist

### For API Consumers

1. Start with [33_Complete_API_Reference.md](./33_Complete_API_Reference.md)
2. Review authentication requirements
3. Test endpoints using the cURL examples
4. Implement using the SDK examples

### For Platform Administrators

1. Understand the Platform Admin role in [34_Super_Admin_Dashboard_Spec.md](./34_Super_Admin_Dashboard_Spec.md)
2. Learn which endpoints you have access to
3. Review security best practices
4. Set up monitoring and alerts

---

## Next Steps

### Immediate (Super Admin Dashboard)

1. Create route: `/app/super-admin`
2. Add platform admin check (client-side guard)
3. Implement organizations list component
4. Add org suspend/activate functionality
5. Create platform health panel
6. Add feature flags viewer

### Future Enhancements

- User impersonation for troubleshooting
- Advanced analytics dashboard
- Resource quota management
- Billing integration
- Multi-region support

---

## Related Documentation

- [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md) — Ellinea AI API details
- [31_RBAC_API_Reference.md](./31_RBAC_API_Reference.md) — RBAC API complete reference
- [32_RBAC_Permission_Matrix.md](./32_RBAC_Permission_Matrix.md) — Permission definitions
- [09_Access_Layers.md](./09_Access_Layers.md) — Access layer architecture
- [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md) — Product scope

---

## Questions?

All API endpoints are documented with:
- Purpose and description
- Request/response examples
- Authentication requirements
- Error responses
- Usage notes

Refer to [33_Complete_API_Reference.md](./33_Complete_API_Reference.md) for complete details.

---

**Documents Created:**
- `docs/33_Complete_API_Reference.md` (20+ sections, 1000+ lines)
- `docs/34_Super_Admin_Dashboard_Spec.md` (complete implementation guide)
- `docs/API_SUMMARY.md` (this file)

**README Updated:**
- Added "API Documentation" section with links to all API docs


---
## Source: packages/connectors-sdk/README.md

# @ellines-eip/connectors-sdk

SDK for Ellines EIP connector plugins. **API is only one path** — file, database, email, and events are first-class.

## Available helpers

- `createDemoJsonConnector` — demo seed
- `createRestApiConnector` — HTTPS JSON URL
- `createCsvFileConnector` / `parseCsvToEnterprisePayload` — CSV/file export (no API)
- `parseOpenApiDocument` / `syncOpenApiRoutes` — OpenAPI → capabilities → sync
- `createPostgresConnector` / `assertReadOnlySql` / `rowsToEnterprisePayload` — read-only PostgreSQL
- `createSqlServerConnector` — read-only SQL Server (T-SQL)
- `createMysqlConnector` — read-only MySQL
- `buildAuthHeaders` — API key / Bearer / Basic
- `normalizeEnterprisePayload` — map varied JSON into the Universal Enterprise Model
- `CONNECTOR_CATALOG` — product catalog (live + planned)

## Philosophy

IT installs a connection without the vendor writing an EIP plugin:

1. OpenAPI / Swagger upload (capabilities listed automatically)
2. REST URL + auth
3. CSV / Excel / file export
4. Read-only PostgreSQL / SQL Server / MySQL (reporting replica)
5. Email / IMAP, SFTP, webhooks

Ellinea reads the normalized enterprise snapshot after sync — never each system’s proprietary UI.

---
## Source: assets/brand/README.md

# Ellines EIP Brand Assets

**Official name:** Ellines EIP (Enterprise Intelligence Platform)  
**Tagline:** Where Enterprise Systems Think Together  
**AI Engine:** Ellinea AI  
**Developer:** Ellines Tech

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Primary Purple | `#6F2D8D` / `#A855F7` | Logo gradient, CTAs, AI accents |
| Vibrant Blue | `#2563EB` / `#3B82F6` | Logo gradient, links, data |
| Dark Navy | `#121826` | App sidebar / chrome |
| Ink | `#05060F` | Splash / auth backgrounds |
| Soft surface | `#E8EDF5` | Dashboard work area |
| Medium Grey | `#6B7280` | Secondary text |

## Typography

- **Font:** Exo 2
- **Weights:** Regular (400), SemiBold (600), Bold (700)

## Logo Files (Hex-E)

Source folders: `Ellines EIP Logo/`, `Ellinea AI Logo/`  
Served from: `apps/web/public/brand/`

| File | Description |
|------|-------------|
| `logo/logo-mark.png` | Hex-E mark + ELLINES EIP lockup (primary) |
| `logo/logo-lockup.png` | Alternate lockup |
| `logo/logo-full.png` | Full brand lockup |
| `logo/ellinea-mark.png` | Ellinea AI mark (no bg) |
| `logo/ellinea-lockup.png` | Ellinea AI full lockup |

## Usage Rules

- Product UI uses **Hex-E** (Ellines EIP), not the retired orbital mark
- Splash → Get started → Login; slogan appears on splash and auth
- "Powered by Ellinea AI" uses the Ellinea mark
- Prefer dark chrome + lighter dashboard work surface

## Export Needed (future)

- [ ] Flat Hex-E SVG / favicon (16–32px)
- [ ] Monochrome / reverse variants

