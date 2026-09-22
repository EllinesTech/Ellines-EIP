# EIP Repository Audit — Foundation Pass

**Branch:** `eip/repository-audit-foundation`  
**Base:** `main` at `bb1f289`  
**Date:** 2026-09-21  
**Purpose:** First implementation audit against `docs/00_EIP_MASTER_SPEC.md`.

## Audit rule

Code that visually reports live, predictive, self-healing, federated, or operational telemetry must use an authoritative source. Synthetic/random values are not acceptable as production telemetry.

## Completed in this pass

### Platform Command Center
- Removed the synthetic `generateMockMetrics()` implementation.
- Organization dashboard metrics now query the existing platform organization-stats API.
- Connector sync health is calculated only from reported connector counts.
- Active-user counts come from the organization-stats API.
- API latency is measured from the actual request.
- Self-healing, federated-learning, and predictive widgets now show **unavailable** when no live dashboard telemetry endpoint exists.
- Ellinea's platform fallback responses no longer invent remediation, model, or forecast numbers.
- Dashboard copy no longer claims that unavailable datasets are real-time.

## Verified blockers found

### P0 — Security
1. `apps/web/functions/shared/encryption.ts`
   - Encryption key is derived only from the organization ID.
   - Encryption failure falls back to Base64.
   - Base64 is not encryption.
   - The master specification requires secret isolation and production-safe credential handling.
   - Required fix: environment/secret-store backed master key, versioned key derivation, fail-closed behavior, and migration of legacy values.

2. `services/identity/src/encryption/encryption.service.ts`
   - Uses organization ID as the scrypt secret.
   - Encryption failure falls back to Base64.
   - Required fix: same versioned master-key architecture as the Pages Functions encryption layer.

### P0 — Reliability / truthfulness
3. `services/self-healing/src/monitoring/monitoring.service.ts`
   - Health metrics are generated with `Math.random()`.
   - Comments explicitly describe the implementation as simulated.
   - Required fix: collect actual component health signals with explicit adapters/timeouts and report unavailable/degraded state when a probe cannot run.

4. `services/integration-hub/src/connection-resilience/failover-manager.service.ts`
   - API/database/file/message/webhook connection tests are simulated with random success and random delays.
   - Required fix: invoke the real connector health/test capability for each connection type. Never claim a failover succeeded because a random simulator returned success.

5. `services/ellinea-ai/src/nlp/nlu-service.ts`
   - Query execution path contains generated mock records and random execution/latency metadata.
   - Required fix: separate test fixtures from production execution and require an actual connector/query-plan result in production.

### P1 — Documentation / completion control
6. Repository contains older status documents claiming completion independently of the canonical master specification.
7. `TRACK_D4_PERMISSION_GUARDS.md` still contains TODO rows for routes that appear to have implementation elsewhere.
8. The repository therefore needs a single acceptance matrix tied to executable verification, not historical status prose.

## Next implementation order

1. Build/type-check the current `main` baseline locally.
2. Fix credential encryption and remove Base64 fallback.
3. Replace simulated self-healing health probes with real adapters.
4. Replace simulated connector failover tests with real connector capability checks.
5. Remove production mock query data from Ellinea NLU.
6. Audit database/schema and migrations.
7. Audit identity/RBAC/ABAC and tenant isolation.
8. Audit Connector Fabric and capability enforcement.
9. Audit UEM/query engine/provenance/freshness.
10. Audit AI/RAG/tool authorization and autonomous actions.
11. Run the full acceptance matrix and only then promote the branch to `main`.

## Promotion rule

This branch is **not** a release branch. No merge/push to `main` is performed by the assistant. Promotion happens only after the work block is locally tested and accepted.


## Second implementation block — SuperAdmin + encryption

The SuperAdmin control plane was redefined so the dashboard represents **EIP platform operations**, not a customer business dashboard.

Implemented:

- platform-focused Command Center;
- business onboarding/registration;
- business lifecycle controls;
- tenant access control;
- service packages backed by the existing rate-limit tier model;
- package assignment to businesses;
- global feature controls;
- security/audit center;
- Ellinea platform operator surface;
- tenant date/time configuration;
- Business Integration Catalog separated from EIP core health;
- reversible disconnect/reconnect controls.

Security work implemented:

- `EIP_ENCRYPTION_MASTER_KEY` is now required for Pages credential encryption;
- Web Crypto encryption moved to version 2 with AES-256-GCM + master-key-backed derivation;
- Node/Nest encryption moved to version 2 with master-key-backed derivation;
- encryption no longer falls back to Base64;
- decryption no longer returns empty strings on authentication failure;
- explicit migration support for legacy v1/Base64 credential values;
- privileged platform encryption migration endpoint with dry-run support;
- encryption migration is audited;
- production secret requirements documented in `docs/49_Security_Encryption_Migration.md`.

Remaining before this security block is accepted:

1. local build/type-check;
2. encryption test execution;
3. dry-run migration against a real non-production dataset;
4. verification that all credential write paths use the v2 service;
5. removal of remaining unsafe/default credential fallbacks found by the security scan.
