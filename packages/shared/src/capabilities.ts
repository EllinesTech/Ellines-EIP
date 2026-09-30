/**
 * Connector capability authorization (EIP spec §Capability Authorization).
 *
 * A connector may only ever *narrow* what a user can already do. The effective
 * authorization for an operation is the INTERSECTION of four independent gates:
 *
 *     effective = connectorCapability
 *              ∩ userPermission
 *              ∩ businessPolicy
 *              ∩ packageEntitlement
 *
 * The central safety property is that a connector can never be an escalation
 * vector: no combination of connector config may grant a capability the user
 * lacks through permissions, policy, or entitlement. Because the result is an
 * intersection, adding capabilities to a connector can only ever shrink the
 * effective set.
 *
 * Every function here fails CLOSED — unknown capabilities, malformed input, or
 * a missing gate deny rather than allow.
 */

/** The capability vocabulary. Mirrors the connector engine spec. */
export const CONNECTOR_CAPABILITIES = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'EXPORT',
  'SEARCH',
  'WEBHOOK',
  'REPORT',
  'SYNC',
  'EXECUTE',
] as const;

export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(CONNECTOR_CAPABILITIES);

/**
 * Destructive capabilities must never be replayed blindly: re-running them can
 * duplicate or destroy data in the source system.
 */
export const DESTRUCTIVE_CAPABILITIES: ReadonlySet<ConnectorCapability> = new Set<ConnectorCapability>([
  'CREATE',
  'UPDATE',
  'DELETE',
]);

/** True when `value` is a recognised capability. Case-insensitive. */
export function isConnectorCapability(value: unknown): value is ConnectorCapability {
  return typeof value === 'string' && CAPABILITY_SET.has(value.trim().toUpperCase());
}

/**
 * Coerce arbitrary input to a de-duplicated, canonically-cased capability list.
 * Unrecognised entries are DROPPED (fail closed) rather than passed through, so
 * a typo or a hostile config value cannot widen access.
 */
export function normalizeCapabilities(input: unknown): ConnectorCapability[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,\s]+/) : [];
  const out: ConnectorCapability[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const upper = entry.trim().toUpperCase();
    if (!CAPABILITY_SET.has(upper)) continue;
    if (!out.includes(upper as ConnectorCapability)) out.push(upper as ConnectorCapability);
  }
  return out;
}

/** True for capabilities that mutate the source system. */
export function isDestructiveCapability(value: unknown): boolean {
  if (!isConnectorCapability(value)) return false;
  return DESTRUCTIVE_CAPABILITIES.has((value as string).trim().toUpperCase() as ConnectorCapability);
}

export interface CapabilityDecision {
  allowed: boolean;
  /** The intersection actually granted — only meaningful when `allowed`. */
  effective: ConnectorCapability[];
  /** The specific gate that denied access, or null when allowed. */
  deniedBy: 'connector' | 'permission' | 'policy' | 'entitlement' | null;
  reason?: string;
}

export interface CapabilityGateInput {
  /** Capabilities the connector itself is configured to allow. */
  connectorCapabilities: unknown;
  /** Capabilities the user's granted permissions permit. */
  userPermissions: unknown;
  /** Capabilities the business/org policy permits. Absent = no restriction. */
  businessPolicy?: unknown;
  /** Capabilities the org's package entitlement permits. Absent = no restriction. */
  packageEntitlement?: unknown;
}

const DENY_REASONS: Record<NonNullable<CapabilityDecision['deniedBy']>, string> = {
  connector: 'Connector is not configured for this capability',
  permission: 'Your role does not grant this capability',
  policy: 'Business policy does not permit this capability',
  entitlement: 'Your package does not include this capability',
};

/**
 * Compute the effective capability set as an intersection of all four gates.
 *
 * An absent optional gate (`businessPolicy` / `packageEntitlement`) means
 * "no additional restriction" and does not narrow the result. The two mandatory
 * gates (connector config, user permissions) always apply.
 */
export function evaluateCapabilities(input: CapabilityGateInput): CapabilityDecision {
  const connector = normalizeCapabilities(input.connectorCapabilities);
  const permissions = normalizeCapabilities(input.userPermissions);
  const policy = normalizeCapabilities(input.businessPolicy);
  const entitlement = normalizeCapabilities(input.packageEntitlement);

  // A connector with no recognised capabilities can do nothing.
  if (connector.length === 0) {
    return { allowed: false, effective: [], deniedBy: 'connector', reason: DENY_REASONS.connector };
  }

  // A user with no recognised capabilities can do nothing.
  if (permissions.length === 0) {
    return { allowed: false, effective: [], deniedBy: 'permission', reason: DENY_REASONS.permission };
  }

  const effective = connector.filter((cap) => permissions.includes(cap));

  if (effective.length === 0) {
    return { allowed: false, effective: [], deniedBy: 'permission', reason: DENY_REASONS.permission };
  }

  if (policy.length > 0) {
    const narrowed = effective.filter((cap) => policy.includes(cap));
    if (narrowed.length === 0) {
      return { allowed: false, effective: [], deniedBy: 'policy', reason: DENY_REASONS.policy };
    }
    return { allowed: true, effective: narrowed, deniedBy: null };
  }

  if (entitlement.length > 0) {
    const narrowed = effective.filter((cap) => entitlement.includes(cap));
    if (narrowed.length === 0) {
      return { allowed: false, effective: [], deniedBy: 'entitlement', reason: DENY_REASONS.entitlement };
    }
    return { allowed: true, effective: narrowed, deniedBy: null };
  }

  return { allowed: true, effective, deniedBy: null };
}

/** Convenience wrapper: may this user perform `capability` through this connector? */
export function assertCapability(
  capability: unknown,
  input: CapabilityGateInput,
): CapabilityDecision {
  if (!isConnectorCapability(capability)) {
    return { allowed: false, effective: [], deniedBy: 'connector', reason: 'Unknown capability' };
  }
  const canonical = capability.trim().toUpperCase() as ConnectorCapability;
  const decision = evaluateCapabilities(input);
  if (!decision.allowed) return decision;
  if (!decision.effective.includes(canonical)) {
    return {
      allowed: false,
      effective: [],
      deniedBy: 'permission',
      reason: `Capability ${canonical} is not permitted for this operation`,
    };
  }
  return decision;
}

export interface ReplaySafetyInput {
  capability: unknown;
  /** True when the upstream system supports an idempotency key for this call. */
  supportsIdempotencyKey?: boolean;
  /** True when the caller supplied a stable key for this specific attempt. */
  idempotencyKey?: string | null;
  /** True when the operation is a read-only replay. */
  readOnly?: boolean;
}

export interface ReplayDecision {
  safe: boolean;
  reason?: string;
}

/**
 * Decide whether a failed operation may be replayed automatically.
 *
 * Non-destructive operations (READ, EXPORT, REPORT, SEARCH, …) are always safe
 * to retry. Destructive operations (CREATE / UPDATE / DELETE) are only replayed
 * when idempotency is guaranteed — either it is a read, or the upstream honours
 * an idempotency key AND the caller actually supplied one. This is the guard
 * that stops a retry loop from creating duplicate records or re-deleting data.
 */
export function evaluateReplaySafety(input: ReplaySafetyInput): ReplayDecision {
  if (input.readOnly === true) {
    return { safe: true };
  }

  if (!isConnectorCapability(input.capability)) {
    return { safe: false, reason: 'Unknown capability — refusing to replay' };
  }

  if (!isDestructiveCapability(input.capability)) {
    return { safe: true };
  }

  const canonical = input.capability.trim().toUpperCase() as ConnectorCapability;

  if (
    input.supportsIdempotencyKey === true &&
    typeof input.idempotencyKey === 'string' &&
    input.idempotencyKey.trim()
  ) {
    return { safe: true };
  }

  return {
    safe: false,
    reason: `${canonical} is destructive and idempotency is not guaranteed — manual confirmation required`,
  };
}
