# Workflow Service

Business process automation — workflows, approvals, and business rules.

## Responsibilities

- Workflow definition and execution
- Multi-step approval chains
- Business rules engine (if/then on enterprise events)
- Scheduled report generation
- Event Bus (internal pub/sub)

## Port

`3004` (default)

## Core Entities

- `Workflow` — defined business process
- `WorkflowInstance` — running workflow execution
- `ApprovalStep` — individual approval in a chain
- `BusinessRule` — if/then condition on events
- `EnterpriseEvent` — standardized event on the Event Bus

## v1.0 Scope

- Basic approval workflows (leave, procurement)
- Business rules on enterprise events
- Scheduled daily/weekly reports
- Internal Event Bus (Redis Streams)

## Status

🔲 Not yet implemented — Phase 5
