/**
 * Phase 3: Safeguard Engine — Operation Class Registry & Safeguard Definitions
 *
 * Per spec §9.1/9.3: operation-class registry as shared metadata.
 * Every privileged operation MUST declare its operation class and inherit that class's safeguards.
 */

export type OperationClass =
  | 'C-0'  // Cross-tenant read (audit export, platform metrics)
  | 'C-1'  // Platform configuration (flags, settings, CORS)
  | 'C-2'  // Package/commercial lifecycle (create/update/delete packages, assign)
  | 'C-3'  // Tenant lifecycle (suspend/resume, onboarding, deletion)
  | 'C-4'  // Connector lifecycle (pack create/update/publish/deprecate/delete)
  | 'C-5'; // System infrastructure (health probes, encryption migration, DB secrets)

export type SafeguardTier =
  | 'C-0' // Read-only cross-tenant access (audit on export only)
  | 'C-1' // Config change (reason required, audit always)
  | 'C-2' // Commercial lifecycle (reason required, confirm, dual approval for delete)
  | 'C-3' // Tenant state change (reason required, confirm, dual approval for suspend/delete)
  | 'C-4' // Connector pack lifecycle (reason required, confirm for publish/deprecate/delete)
  | 'C-5'; // System infra (reason required, confirm, dry-run where feasible)

export type SafeguardType =
  | 'reason_required'       // Operation MUST include a non-empty reason string
  | 'confirmation_required' // UI must capture explicit confirmation
  | 'dual_approval'         // Requires elevated approval path (Phase 10)
  | 'dry_run_supported'     // Operation supports dry-run mode
  | 'audit_always'          // Always writes audit row (already enforced)
  | 'result_enforced';      // Result/failure audit fields MUST be written

export interface OperationSafeguards {
  tier: SafeguardTier;
  safeguards: SafeguardType[];
  /** Human-readable description for UI confirmation dialogs. */
  description: string;
  /** Operation class this safeguard applies to. */
  operationClass: OperationClass;
}

/**
 * Operation registry — maps operation IDs to their class and safeguards.
 * This is the single source of truth for the safeguard engine.
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

export interface OperationRegistryEntry {
  id: string;
  label: string;
  operationClass: OperationClass;
  endpoint: string;
  method: HttpMethod;
  safeguards: OperationSafeguards;
  /** Whether the operation supports a dry-run mode. */
  dryRun?: boolean;
  /** Optional: custom reason placeholder for UI. */
  reasonPlaceholder?: string;
}

/** Registry of all privileged operations. Single source of truth. */
export const OPERATION_REGISTRY: OperationRegistryEntry[] = [
  // C-0: Cross-tenant read (audit export only)
  {
    id: 'platform.audit.export',
    label: 'Export cross-tenant audit logs',
    operationClass: 'C-0',
    endpoint: '/api/v1/platform/audit-logs',
    method: 'GET',
    safeguards: {
      tier: 'C-0',
      safeguards: ['audit_always', 'result_enforced'],
      description: 'Exporting cross-tenant audit logs is a controlled read. An audit row is always written for the export itself.',
      operationClass: 'C-0',
    },
    dryRun: false,
    reasonPlaceholder: 'Investigation ID or compliance reference',
  },

  // C-1: Platform configuration
  {
    id: 'platform.feature_flag.update',
    label: 'Toggle platform feature flag',
    operationClass: 'C-1',
    endpoint: '/api/v1/platform/flags',
    method: 'PATCH',
    safeguards: {
      tier: 'C-1',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Changing a platform feature flag affects all tenants. A reason is required.',
      operationClass: 'C-1',
    },
    reasonPlaceholder: 'Why change this flag? (e.g., rollout, incident response)',
  },
  {
    id: 'platform.cors.update',
    label: 'Update CORS allowlist',
    operationClass: 'C-1',
    endpoint: '/api/v1/platform/cors',
    method: 'PATCH',
    safeguards: {
      tier: 'C-1',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Modifying CORS allowlist affects cross-origin security posture.',
      operationClass: 'C-1',
    },
    reasonPlaceholder: 'Reason for CORS change (new admin origin, security review)',
  },

  // C-2: Package/commercial lifecycle
  {
    id: 'platform.package.create',
    label: 'Create service package',
    operationClass: 'C-2',
    endpoint: '/api/v1/platform/packages',
    method: 'POST',
    safeguards: {
      tier: 'C-2',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Creating a new commercial package defines a new capability envelope.',
      operationClass: 'C-2',
    },
    reasonPlaceholder: 'Package purpose and target tier (starter/professional/enterprise)',
  },
  {
    id: 'platform.package.update',
    label: 'Update service package',
    operationClass: 'C-2',
    endpoint: '/api/v1/platform/packages/{id}',
    method: 'PATCH',
    safeguards: {
      tier: 'C-2',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Updating a package affects all assigned tenants. A reason is required.',
      operationClass: 'C-2',
    },
    reasonPlaceholder: 'Describe the change and affected tenants',
  },
  {
    id: 'platform.package.delete',
    label: 'Delete service package',
    operationClass: 'C-2',
    endpoint: '/api/v1/platform/packages/{id}',
    method: 'DELETE',
    safeguards: {
      tier: 'C-2',
      safeguards: ['reason_required', 'confirmation_required', 'dual_approval', 'audit_always', 'result_enforced'],
      description: 'Deleting a package is irreversible and fails if assigned to any tenant. Requires confirmation and dual approval.',
      operationClass: 'C-2',
    },
    // dryRun is intentionally NOT advertised: the PATCH/DELETE endpoint executes the
    // deletion unconditionally, so a dry-run control would be misleading.
    reasonPlaceholder: 'Confirm package has no assigned tenants; reason for removal',
  },
  {
    id: 'platform.package.assign',
    label: 'Assign package to tenant',
    operationClass: 'C-2',
    endpoint: '/api/v1/platform/orgs/{orgId}/package',
    method: 'PUT',
    safeguards: {
      tier: 'C-2',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Assigning a package changes tenant entitlements. A reason is required.',
      operationClass: 'C-2',
    },
    reasonPlaceholder: 'Reason for package assignment (upgrade, downgrade, trial)',
  },

  // C-3: Tenant lifecycle
  {
    id: 'platform.org.suspend',
    label: 'Suspend tenant',
    operationClass: 'C-3',
    endpoint: '/api/v1/platform/orgs/{id}/status',
    method: 'PATCH',
    safeguards: {
      tier: 'C-3',
      safeguards: ['reason_required', 'confirmation_required', 'dual_approval', 'audit_always', 'result_enforced'],
      description: 'Suspending a tenant blocks all access. Requires reason, confirmation, and dual approval.',
      operationClass: 'C-3',
    },
    dryRun: true,
    reasonPlaceholder: 'Reason for suspension (non-payment, security, compliance)',
  },
  {
    id: 'platform.org.resume',
    label: 'Resume tenant',
    operationClass: 'C-3',
    endpoint: '/api/v1/platform/orgs/{id}/status',
    method: 'PATCH',
    safeguards: {
      tier: 'C-3',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Resuming a tenant restores access. A reason is required.',
      operationClass: 'C-3',
    },
    reasonPlaceholder: 'Reason for resumption (payment received, issue resolved)',
  },

  // C-4: Connector pack lifecycle
  {
    id: 'platform.connector_pack.create',
    label: 'Create connector pack',
    operationClass: 'C-4',
    endpoint: '/api/v1/platform/connector-packs',
    method: 'POST',
    safeguards: {
      tier: 'C-4',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Creating a connector pack defines a new installable integration template.',
      operationClass: 'C-4',
    },
    reasonPlaceholder: 'Pack purpose, catalog source, target tenant types',
  },
  {
    id: 'platform.connector_pack.update',
    label: 'Update connector pack',
    operationClass: 'C-4',
    endpoint: '/api/v1/platform/connector-packs/{id}',
    method: 'PATCH',
    safeguards: {
      tier: 'C-4',
      safeguards: ['reason_required', 'audit_always', 'result_enforced'],
      description: 'Updating a pack affects all installations. A reason is required.',
      operationClass: 'C-4',
    },
    reasonPlaceholder: 'Describe the change and affected installations',
  },
  {
    id: 'platform.connector_pack.publish',
    label: 'Publish connector pack',
    operationClass: 'C-4',
    endpoint: '/api/v1/platform/connector-packs/{id}/publish',
    method: 'PATCH',
    safeguards: {
      tier: 'C-4',
      safeguards: ['reason_required', 'confirmation_required', 'audit_always', 'result_enforced'],
      description: 'Publishing makes the pack available for tenant installation. Requires reason and confirmation.',
      operationClass: 'C-4',
    },
    reasonPlaceholder: 'Reason for publishing (tested, approved for tenant use)',
  },
  {
    id: 'platform.connector_pack.deprecate',
    label: 'Deprecate connector pack',
    operationClass: 'C-4',
    endpoint: '/api/v1/platform/connector-packs/{id}/deprecate',
    method: 'PATCH',
    safeguards: {
      tier: 'C-4',
      safeguards: ['reason_required', 'confirmation_required', 'audit_always', 'result_enforced'],
      description: 'Deprecating hides the pack from new installations but preserves existing ones.',
      operationClass: 'C-4',
    },
    reasonPlaceholder: 'Reason for deprecation (superseded, security, vendor EOL)',
  },
  {
    id: 'platform.connector_pack.delete',
    label: 'Delete connector pack',
    operationClass: 'C-4',
    endpoint: '/api/v1/platform/connector-packs/{id}',
    method: 'DELETE',
    safeguards: {
      tier: 'C-4',
      safeguards: ['reason_required', 'confirmation_required', 'dual_approval', 'audit_always', 'result_enforced'],
      description: 'Deleting a pack is irreversible and fails if any installations exist. Requires dual approval.',
      operationClass: 'C-4',
    },
    // dryRun is intentionally NOT advertised: DELETE executes unconditionally today.
    reasonPlaceholder: 'Confirm no active installations; reason for deletion',
  },

  // C-5: System infrastructure
  {
    id: 'platform.encryption.migrate',
    label: 'Run encryption migration',
    operationClass: 'C-5',
    endpoint: '/api/v1/platform/encryption/migrate',
    method: 'POST',
    safeguards: {
      tier: 'C-5',
      safeguards: ['reason_required', 'confirmation_required', 'dry_run_supported', 'audit_always', 'result_enforced'],
      description: 'Database credential re-encryption is a system-wide operation. Supports dry-run; requires reason and confirmation.',
      operationClass: 'C-5',
    },
    dryRun: true,
    reasonPlaceholder: 'Migration scope (all orgs, specific org, dry-run)',
  },
  {
    id: 'platform.health.probe',
    label: 'Trigger platform health probe',
    operationClass: 'C-5',
    endpoint: '/api/v1/platform/health/summary',
    method: 'GET',
    safeguards: {
      tier: 'C-5',
      safeguards: ['audit_always', 'result_enforced'],
      description: 'Health probe is read-only but logged for audit trail.',
      operationClass: 'C-5',
    },
  },
];

/**
 * Lookup operation by ID.
 */
export function getOperation(id: string): OperationRegistryEntry | undefined {
  if (typeof id !== 'string') return undefined;
  return OPERATION_REGISTRY.find((op) => op.id === id);
}

/**
 * Check if a string is a known operation ID.
 */
export function isValidOperationId(id: string): boolean {
  if (typeof id !== 'string') return false;
  return OPERATION_REGISTRY.some((op) => op.id === id);
}

/**
 * Get all operations for a given class.
 */
export function getOperationsByClass(cls: OperationClass): OperationRegistryEntry[] {
  return OPERATION_REGISTRY.filter((op) => op.operationClass === cls);
}

/**
 * Get safeguards for an operation.
 */
export function getOperationSafeguards(id: string): OperationSafeguards | undefined {
  return getOperation(id)?.safeguards;
}

/**
 * Check if an operation requires a reason.
 */
export function operationRequiresReason(id: string): boolean {
  return getOperationSafeguards(id)?.safeguards.includes('reason_required') ?? false;
}

/**
 * Check if an operation requires confirmation.
 */
export function operationRequiresConfirmation(id: string): boolean {
  return getOperationSafeguards(id)?.safeguards.includes('confirmation_required') ?? false;
}

/**
 * Check if an operation supports dry-run.
 */
export function operationSupportsDryRun(id: string): boolean {
  return getOperation(id)?.dryRun === true;
}