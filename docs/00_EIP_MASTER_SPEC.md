# ELLINESEIP

## Enterprise Intelligence Platform

*Where Enterprise Systems Think Together.*

**Version:** 1.0  
**Status:** Canonical build specification  
**Target branch for implementation:** `eip-live-command-center-build`  
**Specification branch:** `main`  
**Last updated:** 2026-09-21

---

## 1. Purpose

ELLINESEIP (Enterprise Intelligence Platform) is an intelligent, live business command center that sits **above** a company's existing business systems.

EIP does **not** replace ERP, POS, HR, CRM, accounting, inventory, or other source systems. Those systems remain the systems of record.

EIP connects to authorized systems, discovers what they can provide, retrieves only the information required for the user's request, understands and normalizes that information, and presents useful business intelligence, reports, alerts, recommendations, and eventually authorized actions.

The owner should be able to manage and understand multiple businesses without physically visiting each business or repeatedly logging into each underlying system.

### Core principle

> **LIVE BY DEFAULT. STORE BY PURPOSE.**

Operational data should remain in the source system unless EIP has a defined, authorized reason to retain a derived artifact, metric, audit record, configuration, or requested historical snapshot.

---

## 2. Product Vision

EIP should feel like a secure live connection to the owner's businesses.

The user should not need to know:
- which ERP contains the data;
- which screen contains a transaction;
- which database table contains an entity;
- which API endpoint supplies the information;
- which connector is responsible for the request.

The user asks a business question in normal language and EIP determines how to obtain the answer.

Examples:

- "How are all my businesses doing?"
- "Show me Kamau Business."
- "What happened today?"
- "Give me today's sales."
- "Check all pending supplier payments."
- "Show me customer cheques that have not been processed."
- "Which business needs my attention?"
- "Compare Business A and Business B."
- "Why are expenses higher this month?"
- "Generate the monthly finance report."
- "Send the report to my finance team."
- "Create an approval request for this payment." (only when authorized)

---

## 3. Source-of-Truth Model

Each connected business system remains authoritative for its operational data.

### EIP should not normally duplicate

- full ERP databases;
- every POS transaction;
- every customer record;
- every employee record;
- every invoice;
- every inventory row;
- every purchase document;
- every operational document.

### EIP may persist

- users and organizations;
- businesses;
- permissions and security policies;
- connector configuration;
- encrypted credentials/tokens;
- system and capability metadata;
- data mappings;
- audit logs;
- EIP workflows;
- approvals created in EIP;
- notification definitions;
- report schedules;
- generated reports;
- requested exports;
- user-created dashboards;
- selected historical metrics;
- explicit historical snapshots;
- model/configuration metadata;
- operational health telemetry;
- minimal request/trace metadata needed for security and reliability.

### Temporary data

EIP may use short-lived encrypted caches for performance.

Cache entries must:
- have explicit TTLs;
- be scoped to organization/business/user permissions;
- never become an accidental permanent copy;
- be invalidated when appropriate;
- contain only the minimum required data.

---

## 4. Operating Modes

### 4.1 Live Mode

The default mode.

Flow:

`User Request → Intent → Authorization → Capability Discovery → Connector → Source System → Normalize → Analyze → Answer`

Live mode is used for:
- current balances;
- current sales;
- current inventory;
- pending payments;
- pending approvals;
- current employee/HR information;
- current alerts;
- current operational status.

### 4.2 Report Mode

Used when the user explicitly requests a generated artifact or recurring report.

Examples:
- daily;
- weekly;
- monthly;
- quarterly;
- annual;
- custom schedule;
- on-demand.

Generated reports may be retained according to the organization's retention policy.

### 4.3 Historical Analytics Mode

EIP may retain compact derived metrics required for trend analysis.

Example:

`Business A / 2026-09-20 / Revenue / Expenses / Profit / Receivables / Payables`

This is preferred over copying the complete source-system transaction history.

### 4.4 Snapshot Mode

The user may explicitly request:
- "save this report";
- "keep this snapshot";
- "compare today's position with this date";
- "store this monthly report."

Snapshots are clearly identified as snapshots and are not silently treated as live data.

---

## 5. Multi-Business Model

EIP must support one owner managing one or many businesses.

Hierarchy:

`Platform → Organization → Owner → Businesses → Systems → Capabilities → Data`

Example:

```
Owner
├── Kamau Business
│   ├── ERP
│   ├── POS
│   ├── HR
│   └── CRM
├── Business B
│   ├── ERP
│   └── POS
└── Business C
    ├── Accounting
    ├── Inventory
    └── CRM
```

Views:

1. **Business View** — one business.
2. **Portfolio View** — all authorized businesses.
3. **Comparison View** — selected businesses.
4. **Executive Attention View** — businesses/issues requiring attention.

A user must never see a business or system outside their effective permissions.

---

## 6. Owner Dashboard

The owner dashboard is the primary command center.

### Header

- Ellines EIP identity;
- organization/group selector;
- business selector;
- global search;
- AI/business assistant;
- notifications;
- approvals;
- user/profile;
- connection status.

### Executive overview

Display live or clearly timestamped:
- revenue;
- expenses;
- profit;
- growth;
- receivables;
- payables;
- inventory position;
- pending payments;
- pending approvals;
- major alerts;
- business/system health;
- recent material changes.

### Attention Required

Prioritize actionable observations such as:
- pending supplier payments;
- overdue customer payments;
- payment failures;
- unusual sales changes;
- inventory shortages;
- unusual expenses;
- overdue receivables;
- critical approvals;
- system connection failures;
- compliance/security events.

EIP must distinguish:
- factual observation;
- supporting evidence;
- interpretation;
- recommendation.

---

## 7. Owner Navigation

A business-specific sidebar should expose the capabilities available to that business.

### Business

- Dashboard
- Overview
- Activity
- Alerts
- Approvals

### ERP

ERP is a capability family, not a requirement that EIP replace an ERP.

Possible sections:

- Overview
- Sales
- Purchases
- Inventory
- Products
- Customers
- Suppliers
- Invoices
- Receivables
- Payables
- Payments
  - Supplier Payments
  - Customer Payments
  - Cheques
  - Bank Transfers
  - Cash Payments
  - Pending
  - Approved
  - Failed
  - Returned
  - Payment History
- Expenses
- Assets
- General Ledger / Finance
- Tax
- Branches
- Warehouses
- Approvals
- Documents

The actual navigation is capability-driven. Unsupported modules should not be displayed as if they exist.

### POS

- Overview
- Sales
- Transactions
- Products
- Customers
- Refunds
- Discounts
- Cashier activity
- Branch/register activity
- Payment methods
- End-of-day summaries

### HR

- Overview
- Employees
- Departments
- Attendance
- Leave
- Payroll
- Recruitment
- Performance
- Documents
- Employee activity permitted by role

### CRM

- Customers
- Leads
- Opportunities
- Activities
- Communications
- Pipelines
- Customer value
- Follow-ups

### Reports

- Executive
- Financial
- Sales
- Purchases
- Inventory
- Payments
- POS
- HR
- CRM
- Operations
- Tax
- Branch
- Custom
- Scheduled
- Saved Reports
- Report History

### Other dynamic capabilities

EIP must be able to expose additional connected capabilities such as:
- manufacturing;
- projects;
- fleet;
- logistics;
- procurement;
- banking;
- education;
- healthcare;
- hospitality;
- property;
- document management;
- e-commerce;
- messaging;
- custom enterprise applications.

---

## 8. Payments and Cheques

Payments are a first-class enterprise domain.

A cheque is a payment instrument and must not be treated as an unrelated top-level business domain.

### Payment model

```
Payments
├── Supplier Payments
│   ├── Cheque
│   ├── Bank Transfer
│   ├── Cash
│   └── Other
├── Customer Payments
│   ├── Cheque
│   ├── Bank Transfer
│   ├── Cash
│   └── Other
├── Pending
├── Awaiting Approval
├── Processing
├── Completed
├── Failed
├── Returned
└── History
```

EIP must normalize cheque information where available:
- cheque number;
- payer/payee;
- customer/supplier;
- amount;
- currency;
- issue date;
- due date;
- bank;
- status;
- approval state;
- processing state;
- return/failure reason;
- source system;
- source record reference.

Example request:

> "Show all cheques still in the queue."

EIP should determine:
1. selected business scope;
2. payment capability;
3. relevant supplier/customer payment entities;
4. cheque/payment status;
5. source system;
6. user permissions;
7. live query;
8. normalized result.

---

## 9. Universal Connector Fabric

EIP must use a common connector architecture.

Supported and planned connector families include:

### API

- REST;
- GraphQL;
- OpenAPI/Swagger;
- webhooks;
- OAuth 2.0/OIDC;
- API keys;
- bearer tokens;
- basic authentication where appropriate;
- signed requests.

### Databases

- PostgreSQL;
- MySQL/MariaDB;
- SQL Server;
- Oracle;
- other supported SQL engines through adapters.

Database access must use:
- read-only credentials by default;
- explicit write capability;
- query allowlists/policies where appropriate;
- connection isolation;
- timeouts;
- result limits.

### Enterprise protocols

- SOAP;
- SFTP;
- IMAP;
- SMTP;
- message queues;
- Kafka;
- RabbitMQ;
- MQTT;
- enterprise integration standards where justified.

### Files

- CSV;
- XLSX;
- JSON;
- XML;
- PDF;
- secure document endpoints.

### Browser/legacy

For systems without usable APIs:
- browser automation;
- controlled desktop automation;
- legacy application adapters.

These require stronger security controls and must not bypass authentication or authorization.

### Private/on-premise systems

EIP Cloud must not assume it can directly reach a private LAN.

Provide an **EIP Connector Agent** capable of:
- secure outbound connection;
- private ERP access;
- local database access;
- LAN-only application access;
- encrypted communication;
- command allowlisting;
- health reporting;
- credential isolation;
- offline queueing where explicitly supported.

---

## 10. Connector Lifecycle

Every connector should support:

1. Install.
2. Authenticate.
3. Validate.
4. Discover.
5. Test.
6. Describe capabilities.
7. Map entities.
8. Map fields.
9. Set permissions.
10. Set sync/live policies.
11. Monitor health.
12. Rotate credentials.
13. Reauthorize.
14. Pause.
15. Disable.
16. Revoke.
17. Remove.

EIP should show connection health and last successful access without exposing secrets.

---

## 11. Capability Discovery

After connection, EIP should discover what the system can actually provide.

Example:

```
ERP
├── Sales
├── Purchases
├── Inventory
├── Customers
├── Suppliers
├── Payments
│   ├── Supplier Payments
│   ├── Customer Payments
│   └── Cheques
├── Employees
└── Reports
```

Capabilities must include:
- read;
- create;
- update;
- delete;
- approve;
- export;
- execute;
- subscribe/webhook;
- report;
- search.

Capability discovery must not grant permissions. It only describes technical availability.

---

## 12. Universal Enterprise Model (UEM)

Different systems use different names and structures.

EIP requires a common semantic model.

Examples:

- Customer;
- Supplier;
- Employee;
- Product;
- Inventory Item;
- Sale;
- Purchase;
- Invoice;
- Payment;
- Cheque;
- Expense;
- Account;
- Branch;
- Warehouse;
- Approval;
- Document;
- Report;
- Alert.

Each normalized object should retain:
- source system;
- source entity;
- source record ID;
- business ID;
- timestamps;
- normalization metadata;
- confidence/quality metadata where relevant.

EIP must never silently invent missing fields.

---

## 13. Universal Query Engine

Natural language is the primary interaction model, but deterministic structured queries remain available.

Pipeline:

```
User
 ↓
Intent Detection
 ↓
Business/Scope Resolution
 ↓
Permission Check
 ↓
Capability Resolution
 ↓
Query Planning
 ↓
Source Selection
 ↓
Live Retrieval
 ↓
Normalization
 ↓
Validation
 ↓
Analysis
 ↓
Answer
```

The query planner should minimize unnecessary source access.

For example:

> "How much did Kamau Business sell today?"

should not query HR or inventory unless required.

---

## 14. Cross-System Intelligence

EIP must be able to combine authorized data from multiple systems.

Example:

```
POS sales
+
ERP inventory
+
ERP purchases
+
Finance payments
=
business insight
```

Example question:

> "Why are sales good but profit down?"

EIP may inspect:
- sales;
- discounts;
- purchases;
- expenses;
- inventory cost;
- payment/finance information.

It should explain which evidence supports its conclusion.

---

## 15. Executive Intelligence

EIP should convert raw enterprise data into useful summaries.

For example, instead of displaying 4,000 transactions, show:

- total sales;
- transaction count;
- major changes;
- top products;
- unusual activity;
- refunds;
- payment mix;
- branch differences;
- supporting evidence.

### Recommendation format

```
Observation
Evidence
Possible interpretation
Recommended action
Confidence/limitations
```

Recommendations must not be presented as facts.

---

## 16. Multi-Business Intelligence

The owner should be able to ask:

- "How are all my businesses doing?"
- "Which businesses changed the most?"
- "Show Business A."
- "Compare A, B and C."
- "Which business needs attention?"
- "Give me a group report."
- "What happened across my businesses today?"

EIP must aggregate only businesses the user is authorized to access.

Comparison should support:
- revenue;
- expenses;
- profit;
- growth;
- receivables;
- payables;
- inventory;
- sales volume;
- payment activity;
- operational alerts;
- custom KPIs.

---

## 17. Reporting Engine

Reports must support:

- on-demand generation;
- scheduled generation;
- daily;
- weekly;
- monthly;
- quarterly;
- annual;
- custom schedules;
- business-specific reports;
- portfolio reports;
- comparison reports;
- custom reports;
- PDF;
- XLSX;
- CSV;
- JSON where useful.

A report must record:
- requested by;
- scope;
- source systems;
- generation time;
- data timestamp;
- filters;
- report definition;
- retention policy.

Reports must clearly distinguish:
- live report;
- generated snapshot;
- historical report.

---

## 18. Alerts and Monitoring

EIP should monitor authorized business signals.

Alert categories:
- finance;
- sales;
- inventory;
- payments;
- HR;
- system health;
- connector health;
- security;
- workflow;
- compliance;
- custom thresholds.

Alerts should support:
- severity;
- acknowledgement;
- assignment;
- escalation;
- resolution;
- comments;
- evidence;
- timestamps.

---

## 19. Approvals

EIP should provide a unified approval layer where connected systems expose approval workflows.

Examples:
- supplier payment approval;
- purchase approval;
- refund approval;
- expense approval;
- HR approval.

Approvals must preserve the source-system authority.

If approval is executed through EIP, the action must be authorized and auditable.

---

## 20. Universal Action Engine

Eventually EIP must support authorized actions, not only reading.

Possible actions:
- create;
- update;
- cancel;
- approve;
- reject;
- send;
- export;
- notify;
- schedule;
- trigger workflow;
- generate document.

Every action requires:

1. identity;
2. permission;
3. target business;
4. target system;
5. capability;
6. validation;
7. confirmation where required;
8. execution;
9. source-system result;
10. audit record.

High-risk actions may require explicit confirmation and/or multi-person approval.

---

## 21. Workflow and Automation Engine

Support multi-step processes.

Example:

```
Payment becomes overdue
 ↓
EIP detects condition
 ↓
Create alert
 ↓
Notify finance manager
 ↓
Create approval task
 ↓
Wait for decision
 ↓
Execute authorized action
 ↓
Record result
```

Automation must have:
- owner;
- scope;
- trigger;
- conditions;
- actions;
- failure handling;
- retry policy;
- timeout;
- audit;
- enable/disable control.

---

## 22. Notifications

Channels may include:
- in-app;
- email;
- SMS;
- WhatsApp where legally and technically supported;
- push notifications;
- webhook.

Users must control notification preferences.

---

## 23. Identity and Security

Required foundation:

- authentication;
- MFA;
- session management;
- device/session visibility;
- RBAC;
- granular permissions;
- business scoping;
- resource scoping;
- API credentials;
- secret management;
- credential rotation;
- encryption in transit;
- encryption at rest;
- audit logging;
- rate limiting;
- abuse protection;
- CSRF/XSS protections;
- SSRF protection;
- connector isolation;
- secure headers;
- input validation.

### Permission model

Use:

`Module → Resource → Action → Scope`

Example:

`Finance → Cheques → View → Business A`

Possible actions:
- view;
- create;
- edit;
- approve;
- cancel;
- export;
- execute.

---

## 24. Platform SuperAdmin / GodMode

SuperAdmin is a platform authority, separate from business-owner permissions.

SuperAdmin may manage:
- organizations;
- platform users;
- businesses;
- connectors;
- platform configuration;
- subscriptions/licensing;
- platform health;
- security events;
- global audit;
- connector health;
- feature flags;
- system limits;
- platform diagnostics.

SuperAdmin must not be implemented as an unrestricted shortcut around audit/security controls.

Privileged actions must remain auditable.

---

## 25. Business Owner Administration

Business owners should be able to:
- add businesses;
- configure business details;
- connect systems;
- invite users;
- create roles;
- grant granular permissions;
- assign users to businesses;
- configure report schedules;
- manage alerts;
- configure dashboards;
- manage notification preferences;
- view business audit information within their scope.

---

## 26. Data Governance

Every data access should have:
- organization;
- business;
- user/service identity;
- source system;
- purpose/context;
- timestamp;
- permission decision.

Policies should support:
- retention;
- deletion;
- export;
- data minimization;
- regional requirements;
- tenant isolation.

EIP should avoid retaining sensitive operational data unnecessarily.

---

## 27. Audit and Traceability

Audit events should cover:

- login;
- logout;
- failed authentication;
- permission changes;
- connector creation;
- connector changes;
- data access;
- report generation;
- exports;
- actions;
- approvals;
- workflow execution;
- configuration changes;
- security events.

For important operations, provide an end-to-end trace:

`User → EIP Request → Permission → Connector → Source System → Result → Action/Report`

---

## 28. Performance and Live Experience

The UI should feel continuously ready.

Requirements:
- fast dashboard initialization;
- parallel connector queries where safe;
- request-specific retrieval;
- bounded timeouts;
- cancellation;
- streaming/progressive results where useful;
- short-lived caching;
- stale-data indicators;
- source timestamps;
- graceful partial results.

If one business system is offline, EIP should not make all other businesses appear offline.

Example:

```
8 businesses
7 live
1 connector unavailable

Dashboard:
7 businesses live
1 business: connection issue
```

Never silently present stale data as live.

---

## 29. Resilience

Required:
- connector isolation;
- retries with backoff;
- circuit breakers;
- timeouts;
- partial-failure handling;
- idempotency;
- duplicate-action protection;
- dead-letter/error queues where appropriate;
- recovery procedures;
- health checks.

---

## 30. Observability

Monitor:
- API latency;
- connector latency;
- connector failures;
- source-system availability;
- query success;
- query timeout;
- report generation;
- workflow failures;
- action failures;
- cache performance;
- security events;
- resource usage.

Provide:
- logs;
- metrics;
- traces;
- health dashboards;
- alerts;
- correlation IDs.

---

## 31. Files and Documents

EIP should support controlled document access and generation.

Features:
- invoices;
- receipts;
- payment documents;
- cheques where represented digitally;
- contracts;
- reports;
- CSV/XLSX/PDF;
- document extraction;
- document classification;
- secure previews;
- source references.

Documents should not be permanently retained unless required by the requested workflow or retention policy.

---

## 32. Search

Provide:
- global business search;
- entity search;
- transaction search;
- document search;
- report search;
- natural-language search;
- filters;
- date ranges;
- source-system filters;
- business filters.

Search should query live sources when current information is required.

---

## 33. AI Assistant

The assistant should be able to:

- understand business language;
- identify business scope;
- resolve ambiguity;
- inspect capabilities;
- plan queries;
- retrieve live information;
- summarize;
- compare;
- explain;
- generate reports;
- suggest improvements;
- ask clarifying questions when necessary;
- execute authorized actions.

AI must not:
- invent source data;
- claim an action succeeded without source confirmation;
- expose unauthorized data;
- treat guesses as facts.

---

## 34. AI Evidence Model

Every important AI answer should be traceable to evidence.

Possible answer structure:

```
Answer
Evidence
Sources
Data timestamp
Interpretation
Recommendation
Limitations
```

For sensitive or high-impact decisions, require stronger evidence and explicit source references.

---

## 35. Connector Agent

The EIP Connector Agent is a secure bridge for systems that cannot be reached directly from the cloud.

Architecture:

```
Private Business Network
        │
   ERP / Database
        │
 EIP Connector Agent
        │
 encrypted outbound channel
        │
      EIP Cloud
```

The agent should:
- initiate outbound connections;
- avoid exposing inbound ports by default;
- authenticate to EIP;
- receive only permitted tasks;
- enforce local policies;
- isolate credentials;
- report health;
- support updates;
- support signed/verified releases.

---

## 36. API Platform

EIP should expose APIs for:
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

APIs must use:
- authentication;
- authorization;
- versioning;
- rate limits;
- idempotency where required;
- consistent error format;
- correlation IDs.

---

## 37. Connector SDK and Marketplace

Future connector ecosystem:

```
EIP Connector SDK
       ↓
Connector Definition
       ↓
Authentication
       ↓
Capability Discovery
       ↓
UEM Mapping
       ↓
Tests
       ↓
Certification
       ↓
Marketplace
```

Third-party connectors must be isolated and permissioned.

---

## 38. Configuration and Feature Flags

EIP should support:
- organization settings;
- business settings;
- connector settings;
- feature flags;
- module visibility;
- security policies;
- retention policies;
- report schedules;
- AI policies.

Configuration changes must be audited.

---

## 39. Multi-Tenant Architecture

Tenant boundaries must be enforced at every layer.

Required:
- organization ID;
- business ID;
- user scope;
- connector scope;
- database/query scope;
- cache scope;
- audit scope;
- report scope.

No cross-tenant leakage.

---

## 40. Security Boundaries

Never allow a user prompt to become unrestricted technical access.

The correct sequence is:

`Prompt → Intent → Permission → Capability → Policy → Query/Action → Source → Result`

AI is not an authorization mechanism.

---

## 41. Data Freshness

Every displayed source-derived value should have a freshness state:

- Live;
- Live as of timestamp;
- Cached;
- Historical;
- Snapshot;
- Source unavailable.

The UI must never make cached/historical information look live.

---

## 42. Offline and Degraded Operation

EIP itself may remain usable when a source system is unavailable.

It should:
- show last known permitted state if retained;
- label it clearly;
- show connection failure;
- continue serving unaffected businesses;
- queue supported operations only when safe;
- never pretend queued actions have completed.

---

## 43. Localization

Support:
- multiple currencies;
- time zones;
- date formats;
- number formats;
- localization;
- multilingual user interaction.

Business currency must not be assumed globally.

---

## 44. Accessibility

Support:
- keyboard navigation;
- screen readers;
- readable contrast;
- scalable text;
- clear status indicators;
- reduced-motion preference;
- accessible forms;
- accessible tables/charts.

---

## 45. Dashboard Customization

Owners should eventually be able to:
- reorder widgets;
- show/hide modules;
- pin KPIs;
- save views;
- create business-specific dashboards;
- create portfolio dashboards;
- create role-specific dashboards.

Customization must never bypass permissions.

---

## 46. Mobile and Cross-Device Experience

EIP should work on:
- desktop;
- laptop;
- tablet;
- phone.

The owner should be able to ask the same business questions from any supported device.

Sessions and security policies must remain consistent across devices.

---

## 47. Reporting Intelligence

Reports should be more than tables.

Where data supports it, include:
- trends;
- variance;
- period comparison;
- business comparison;
- anomalies;
- top/bottom contributors;
- explanations;
- recommendations;
- source references.

---

## 48. Business Health

EIP may calculate business health indicators from evidence.

A health indicator must be:
- explainable;
- based on documented metrics;
- configurable;
- scoped;
- time-aware;
- never presented as an unexplained AI judgment.

Example components:
- sales trend;
- margin trend;
- receivables;
- payment delays;
- inventory risk;
- expense variance;
- operational alerts.

---

## 49. Privacy by Design

EIP must follow data minimization:

> Retrieve what is needed, process what is needed, retain what is needed, delete what is no longer needed.

Default retention should be conservative.

Sensitive fields should be masked where the user's permission does not require full visibility.

---

## 50. Testing Strategy

Every major layer requires tests.

### Unit
- permissions;
- normalization;
- parsers;
- query planning;
- calculations;
- report generation.

### Integration
- connectors;
- authentication;
- live retrieval;
- UEM mapping;
- actions.

### Security
- tenant isolation;
- authorization;
- SSRF;
- secret handling;
- injection;
- session security;
- replay protection.

### End-to-end
- login → business → connector → live data → dashboard;
- natural-language query → source result;
- report generation;
- scheduled report;
- approval;
- authorized action.

### Failure tests
- source offline;
- timeout;
- malformed response;
- partial response;
- revoked credential;
- permission removal during request;
- duplicate action.

---

## 51. Development Phases

### Phase 1 — Foundation
- organizations;
- businesses;
- users;
- roles;
- permissions;
- sessions;
- audit;
- security policies.

### Phase 2 — SuperAdmin / GodMode
- platform control center;
- tenants;
- platform health;
- connectors;
- users;
- licensing/configuration;
- global audit.

### Phase 3 — Business Owner Experience
- business selector;
- owner dashboard;
- sidebar;
- business settings;
- users;
- roles;
- permissions.

### Phase 4 — Universal Connector Fabric
- connector registry;
- authentication;
- lifecycle;
- health;
- capability discovery;
- secure secrets.

### Phase 5 — Live Access Engine
- live queries;
- source routing;
- caching;
- timeouts;
- partial results;
- freshness.

### Phase 6 — ERP and Business Capability Integration
- ERP;
- POS;
- HR;
- CRM;
- finance;
- inventory;
- payments;
- cheque normalization;
- dynamic modules.

### Phase 7 — UEM
- common entities;
- field mapping;
- semantic normalization;
- source references.

### Phase 8 — Universal Query Engine
- natural language;
- intent;
- query planning;
- cross-system queries.

### Phase 9 — Executive Intelligence
- summaries;
- anomalies;
- evidence;
- recommendations.

### Phase 10 — Multi-Business Intelligence
- portfolio;
- comparison;
- attention view;
- group reporting.

### Phase 11 — Reporting
- on-demand;
- scheduled;
- PDF/XLSX/CSV;
- snapshots;
- report history.

### Phase 12 — Alerts and Approvals
- alerts;
- approval queues;
- escalation;
- notifications.

### Phase 13 — Action Engine
- create/update/approve/send/trigger;
- confirmations;
- idempotency;
- audit.

### Phase 14 — Connector Agent
- private networks;
- LAN systems;
- local databases;
- on-premise ERP.

### Phase 15 — Advanced Integration
- SOAP;
- messaging;
- browser/legacy;
- specialized enterprise protocols.

### Phase 16 — Ecosystem
- connector SDK;
- marketplace;
- public API platform;
- partner connectors.

### Phase 17 — Advanced Intelligence
- workflow planning;
- proactive monitoring;
- advanced forecasting;
- controlled autonomous operations.

---

## 52. Build Rules

1. Do not replace source systems unnecessarily.
2. Do not copy operational data unnecessarily.
3. Prefer live retrieval.
4. Store requested/generated artifacts.
5. Store compact analytical history when justified.
6. Never expose stale data as live.
7. Never allow AI to bypass authorization.
8. Every action must be auditable.
9. Every connector must be isolated.
10. Every business must be permission-scoped.
11. Every important answer should have evidence.
12. Every source failure must be visible.
13. Unsupported capabilities must not be displayed as available.
14. Do not build one-off integrations when a reusable connector abstraction is possible.
15. Do not hard-code assumptions about ERP vendors.
16. Do not make EIP dependent on one ERP schema.
17. Preserve source-system IDs for traceability.
18. Use feature flags for incomplete capabilities.
19. Test security and failure states before production.
20. Keep the specification ahead of implementation.

---

## 53. Definition of Done

A feature is not complete merely because the UI exists.

A production feature must have:

- architecture;
- authorization;
- data policy;
- source integration;
- error handling;
- audit;
- tests;
- observability;
- documentation;
- security review;
- migration strategy where required;
- clear live/stale state;
- tenant/business isolation.

---

## 54. Canonical User Journey

### Opening EIP

```
Owner logs in
 ↓
EIP resolves authorized businesses
 ↓
EIP loads executive dashboard
 ↓
Live business data is requested in parallel where safe
 ↓
Results are normalized
 ↓
Dashboard summarizes the portfolio
 ↓
Attention items are shown
 ↓
EIP remains ready for requests
```

### Asking a question

```
Owner:
"Check all cheques that haven't been processed."

 ↓

EIP:
Resolve business scope
 ↓
Check permission
 ↓
Resolve Payments capability
 ↓
Resolve Cheque entity/status
 ↓
Locate source system
 ↓
Query live data
 ↓
Normalize
 ↓
Summarize
 ↓
Show evidence/source/time
```

### Requesting a recurring report

```
Owner:
"Send me this report every morning."

 ↓
Create schedule
 ↓
At scheduled time
 ↓
Query authorized live sources
 ↓
Generate report
 ↓
Store report artifact
 ↓
Notify owner
```

---

## 55. Final Architectural Principle

Ellines EIP should behave like a **secure intelligent live bridge between the owner and the owner's businesses**.

The owner should not need to manage the complexity of the underlying systems.

EIP handles:

```
CONNECT
DISCOVER
UNDERSTAND
QUERY
NORMALIZE
SUMMARIZE
COMPARE
EXPLAIN
REPORT
ALERT
RECOMMEND
APPROVE
ACT
AUDIT
```

while the connected systems remain authoritative for their operational data.

### Final rule

> **EIP should know enough to help, retrieve enough to answer, store enough to remember what the owner explicitly wants remembered, and nothing more than necessary.**

This document is the canonical product and architecture specification for the next implementation cycle.
