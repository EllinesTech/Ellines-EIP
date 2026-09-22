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

