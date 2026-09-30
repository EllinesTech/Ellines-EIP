/**
 * Capability authorization invariants.
 *
 * These assert the SECURITY properties, not just that the function runs:
 *  1. Effective authorization is the intersection of all four gates.
 *  2. A connector is never an escalation vector — it cannot grant a capability
 *     the user lacks through permissions, policy, or entitlement.
 *  3. Every gate fails closed on malformed/unknown input.
 *  4. Replay is refused for destructive operations without guaranteed idempotency.
 */
import {
  CONNECTOR_CAPABILITIES,
  assertCapability,
  evaluateCapabilities,
  evaluateReplaySafety,
  isDestructiveCapability,
  normalizeCapabilities,
  type ConnectorCapability,
} from '../capabilities';

const ALL: ConnectorCapability[] = [...CONNECTOR_CAPABILITIES];

describe('normalizeCapabilities', () => {
  it('accepts the full documented vocabulary', () => {
    for (const cap of ALL) {
      expect(normalizeCapabilities([cap])).toEqual([cap]);
    }
  });

  it('upper-cases and de-duplicates', () => {
    expect(normalizeCapabilities(['read', 'READ', ' Read '])).toEqual(['READ']);
  });

  it('DROPS unknown capabilities rather than passing them through', () => {
    // A hostile or typo'd config value must never widen access.
    expect(normalizeCapabilities(['READ', 'DROP_DATABASE', '*', ''])).toEqual(['READ']);
  });

  it('returns an empty list for non-array garbage', () => {
    expect(normalizeCapabilities(null)).toEqual([]);
    expect(normalizeCapabilities(undefined)).toEqual([]);
    expect(normalizeCapabilities(42)).toEqual([]);
    expect(normalizeCapabilities({})).toEqual([]);
  });
});

describe('evaluateCapabilities — intersection of all four gates', () => {
  it('grants the intersection of connector and user capabilities', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['READ', 'SYNC'],
      userPermissions: ['READ', 'EXPORT'],
    });
    expect(d.allowed).toBe(true);
    expect(d.effective).toEqual(['READ']);
  });

  it('a connector cannot grant a capability the user lacks (no escalation)', () => {
    // Connector offers everything; the user is read-only.
    const d = evaluateCapabilities({
      connectorCapabilities: ALL,
      userPermissions: ['READ'],
    });
    expect(d.effective).toEqual(['READ']);
    expect(d.effective).not.toContain('DELETE');
    expect(d.effective).not.toContain('CREATE');
  });

  it('narrowing by business policy', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['READ', 'EXPORT', 'SYNC'],
      userPermissions: ['READ', 'EXPORT', 'SYNC'],
      businessPolicy: ['READ', 'SYNC'],
    });
    expect(d.effective).toEqual(['READ', 'SYNC']);
  });

  it('narrowing by package entitlement', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['READ', 'EXPORT'],
      userPermissions: ['READ', 'EXPORT'],
      packageEntitlement: ['READ'],
    });
    expect(d.effective).toEqual(['READ']);
  });

  it('denies with deniedBy=connector when the connector exposes nothing', () => {
    const d = evaluateCapabilities({ connectorCapabilities: [], userPermissions: ALL });
    expect(d.allowed).toBe(false);
    expect(d.deniedBy).toBe('connector');
  });

  it('denies with deniedBy=permission when there is no overlap', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['DELETE'],
      userPermissions: ['READ'],
    });
    expect(d.allowed).toBe(false);
    expect(d.deniedBy).toBe('permission');
  });

  it('denies with deniedBy=policy when policy excludes everything granted', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['READ'],
      userPermissions: ['READ'],
      businessPolicy: ['EXPORT'],
    });
    expect(d.allowed).toBe(false);
    expect(d.deniedBy).toBe('policy');
  });

  it('denies with deniedBy=entitlement when the package excludes everything', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['READ'],
      userPermissions: ['READ'],
      packageEntitlement: ['EXPORT'],
    });
    expect(d.allowed).toBe(false);
    expect(d.deniedBy).toBe('entitlement');
  });

  it('treats an ABSENT policy/entitlement as "no restriction" but still applies permissions', () => {
    const d = evaluateCapabilities({
      connectorCapabilities: ['READ', 'SYNC'],
      userPermissions: ['READ', 'SYNC'],
    });
    expect(d.allowed).toBe(true);
    expect(d.effective).toEqual(['READ', 'SYNC']);
  });

  it('MONOTONICITY: adding capabilities to a connector can only grow, never shrink, the result', () => {
    const userPermissions = ['READ', 'SYNC'];
    const before = evaluateCapabilities({ connectorCapabilities: ['READ'], userPermissions });
    const after = evaluateCapabilities({ connectorCapabilities: ['READ', 'DELETE'], userPermissions });
    expect(before.effective.every((c) => after.effective.includes(c))).toBe(true);
    // Crucially, DELETE is NOT granted — the user never had it.
    expect(after.effective).not.toContain('DELETE');
  });
});

describe('assertCapability', () => {
  const gates = {
    connectorCapabilities: ['READ', 'SYNC'],
    userPermissions: ['READ', 'DELETE'],
  };

  it('allows a capability present in the intersection', () => {
    expect(assertCapability('READ', gates).allowed).toBe(true);
  });

  it('denies a capability the user has but the connector does not expose', () => {
    expect(assertCapability('DELETE', gates).allowed).toBe(false);
  });

  it('denies an unknown capability outright (fail closed)', () => {
    expect(assertCapability('LAUNCH_ROCKET', gates).allowed).toBe(false);
    expect(assertCapability(undefined, gates).allowed).toBe(false);
    expect(assertCapability(42, gates).allowed).toBe(false);
  });
});

describe('evaluateReplaySafety', () => {
  it('allows replay of non-destructive capabilities', () => {
    const safe = ['READ', 'EXPORT', 'REPORT', 'SEARCH', 'SYNC', 'APPROVE', 'WEBHOOK', 'EXECUTE'] as const;
    for (const cap of safe) {
      expect(evaluateReplaySafety({ capability: cap }).safe).toBe(true);
    }
  });

  it('REFUSES blind replay of destructive capabilities', () => {
    for (const cap of ['CREATE', 'UPDATE', 'DELETE'] as const) {
      const d = evaluateReplaySafety({ capability: cap });
      expect(d.safe).toBe(false);
      expect(d.reason).toMatch(/destructive/i);
    }
  });

  it('allows destructive replay only when an idempotency key is actually supplied', () => {
    expect(
      evaluateReplaySafety({ capability: 'CREATE', supportsIdempotencyKey: true, idempotencyKey: 'abc-123' }).safe,
    ).toBe(true);
  });

  it('still refuses when upstream supports keys but none was provided', () => {
    expect(evaluateReplaySafety({ capability: 'CREATE', supportsIdempotencyKey: true }).safe).toBe(false);
    expect(
      evaluateReplaySafety({ capability: 'DELETE', supportsIdempotencyKey: true, idempotencyKey: '   ' }).safe,
    ).toBe(false);
  });

  it('still refuses when a key is provided but upstream does not support them', () => {
    expect(evaluateReplaySafety({ capability: 'UPDATE', idempotencyKey: 'abc' }).safe).toBe(false);
  });

  it('an explicit readOnly flag permits replay regardless of capability', () => {
    expect(evaluateReplaySafety({ capability: 'DELETE', readOnly: true }).safe).toBe(true);
  });

  it('refuses unknown capabilities', () => {
    expect(evaluateReplaySafety({ capability: 'NONSENSE' }).safe).toBe(false);
  });
});

describe('isDestructiveCapability', () => {
  it('classifies exactly CREATE/UPDATE/DELETE as destructive', () => {
    expect(isDestructiveCapability('CREATE')).toBe(true);
    expect(isDestructiveCapability('update')).toBe(true);
    expect(isDestructiveCapability('DELETE')).toBe(true);
    expect(isDestructiveCapability('READ')).toBe(false);
    expect(isDestructiveCapability('EXPORT')).toBe(false);
    expect(isDestructiveCapability('BOGUS')).toBe(false);
  });
});
