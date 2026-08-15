/**
 * Property-Based Tests for Self-Healing Remediation Service
 *
 * Property 5: Remediation idempotency
 *   Applying the same remediation action twice to a system in different states
 *   has the same effect as applying it once. The final state is identical
 *   regardless of how many times the remediation is applied.
 *   Validates: Requirements 5.3
 *
 * Property 6: Confidence threshold enforcement
 *   Remediation only executes when confidence >= 85%. Calls with confidence < 85%
 *   are rejected without attempting any actions. This threshold must be consistently
 *   enforced across all remediation scenarios.
 *   Validates: Requirements 5.2
 */

import * as fc from 'fast-check';
import { RemediationService, RemediationAction, RemediationStage, RemediationStrategy, Incident, RemediationResult } from './remediation.service';
import { RemediationPolicyService } from './remediation-policy.service';

// ─── Test Helpers ──────────────────────────────────────────────────────────

/** Build a minimal remediation action. */
function buildAction(
  type: RemediationAction['type'] = 'cache_clear',
  target: string = 'test-service',
  riskLevel: RemediationAction['riskLevel'] = 'low',
): RemediationAction {
  return { type, target, riskLevel, parameters: {} };
}

/** Build a remediation stage. */
function buildStage(stageNumber: number = 1, actions: RemediationAction[] = []): RemediationStage {
  return {
    stageNumber,
    actions: actions.length > 0 ? actions : [buildAction()],
    timeout: 30_000, // 30s timeout
  };
}

/** Build a remediation strategy. */
function buildStrategy(
  errorPattern: string = 'test-pattern',
  confidenceThreshold: number = 0.85,
  stages: RemediationStage[] = [],
): RemediationStrategy {
  return {
    errorPattern,
    stages: stages.length > 0 ? stages : [buildStage()],
    confidenceThreshold,
    maxAttempts: 3,
    verificationPeriod: 300, // 5 minutes
  };
}

/** Build an incident. */
function buildIncident(
  confidence: number = 0.90,
  organizationId: string = 'test-org',
  errorPattern: string = 'test-pattern',
): Incident {
  return {
    id: `incident-${Date.now()}`,
    organizationId,
    errorPattern,
    severity: 'high',
    affectedComponents: ['service-a', 'service-b'],
    confidence,
    diagnostics: { error: 'Test error' },
  };
}

// ─── Arbitraries ───────────────────────────────────────────────────────────

/**
 * Generate action types: restart, cache_clear, pool_reset, rate_limit, rollback, scale_up
 */
const arbitraryActionType = fc.constantFrom<RemediationAction['type']>(
  'restart',
  'cache_clear',
  'pool_reset',
  'rate_limit',
  'rollback',
  'scale_up',
);

/**
 * Generate risk levels: low, medium, high
 */
const arbitraryRiskLevel = fc.constantFrom<RemediationAction['riskLevel']>(
  'low',
  'medium',
  'high',
);

/**
 * Generate RemediationAction objects.
 */
const arbitraryAction = fc.record({
  type: arbitraryActionType,
  target: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  riskLevel: arbitraryRiskLevel,
  parameters: fc.constant({} as Record<string, any>),
});

/**
 * Generate confidence scores: 0–100% as a number in [0, 1]
 * Weighted to include boundary values (0.00, 0.85, 1.00) more often.
 * Note: fast-check requires 32-bit floats for boundaries, so we use Math.fround
 */
const arbitraryConfidence = fc.oneof(
  fc.constant(0.0),         // Always below threshold
  fc.constant(0.84),        // Just below threshold
  fc.constant(0.85),        // Exactly at threshold
  fc.constant(0.90),        // Above threshold
  fc.constant(1.0),         // Maximum confidence
  fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }).map((c) => parseFloat(c.toFixed(2))), // Random 0–1
);

/**
 * Generate error patterns for incident classification.
 */
const arbitraryErrorPattern = fc.oneof(
  fc.constant('database_connection_error'),
  fc.constant('cache_miss_spike'),
  fc.constant('memory_exhaustion'),
  fc.constant('connection_pool_leak'),
  fc.constant('rate_limit_breach'),
);

/**
 * Generate organization IDs.
 */
const arbitraryOrgId = fc.string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)
  .map((s) => `org-${s.toLowerCase().replace(/[^a-z0-9]/g, '')}`);

/**
 * Generate incident objects for testing.
 */
const arbitraryIncident = fc.record({
  confidence: arbitraryConfidence,
  organizationId: arbitraryOrgId,
  errorPattern: arbitraryErrorPattern,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Self-Healing Remediation Service — Property-Based Tests', () => {
  let remediationService: RemediationService;
  let policyService: RemediationPolicyService;

  beforeEach(() => {
    policyService = new RemediationPolicyService();
    remediationService = new RemediationService(policyService);

    // Mock the lookupStrategy method to return a valid strategy
    jest.spyOn(remediationService, 'lookupStrategy').mockImplementation(async (pattern: string) => {
      return buildStrategy(pattern);
    });

    // Mock executeAction to simulate a successful action execution
    jest.spyOn(remediationService, 'executeAction').mockImplementation(async (action: RemediationAction) => {
      return {
        success: true,
        durationMs: Math.floor(Math.random() * 1000),
        message: `Action ${action.type} executed successfully`,
      };
    });

    // Mock verifySuccess to return success (issue resolved)
    jest.spyOn(remediationService, 'verifySuccess').mockImplementation(async () => {
      return {
        success: true,
        durationMonitored: 300,
        observations: ['Poll 1/10: stable', 'Poll 2/10: stable'],
        recurred: false,
      };
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await remediationService.onModuleDestroy();
  });

  // ─── Property 5: Remediation Idempotency ──────────────────────────────────
  /**
   * **Validates: Requirements 5.3**
   *
   * WHEN an incident with confidence >= threshold is remediated,
   * THEN applying the remediation action twice produces the same final system state
   * as applying it once.
   *
   * This property ensures that re-running a remediation action (e.g., during
   * recovery from a network blip) does not cause unintended side effects or
   * corrupt the system state.
   */
  describe('Property 5: Remediation idempotency', () => {
    it('applying the same remediation action twice has the same effect as once', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryIncident,
          async ({ confidence, organizationId, errorPattern }) => {
            // Only test with confidence >= threshold (below threshold cases are skipped)
            if (confidence < 0.85) return;

            const incident = buildIncident(confidence, organizationId, errorPattern);

            // First application
            const result1 = await remediationService.remediate(incident);

            // Second application (same incident state)
            const result2 = await remediationService.remediate(incident);

            // Both applications should produce success (same outcome)
            expect(result1.success).toBe(result2.success);

            // Number of stages executed should be identical
            expect(result1.stagesExecuted).toBe(result2.stagesExecuted);

            // Number of actions performed should be identical
            expect(result1.actionsPerformed.length).toBe(result2.actionsPerformed.length);

            // Escalation status should be identical
            expect(result1.escalated).toBe(result2.escalated);

            // Before/after metrics should be logically consistent
            // (both should capture state, though actual values may differ due to time)
            expect(result1.beforeSnapshot).toBeDefined();
            expect(result2.beforeSnapshot).toBeDefined();
            expect(result1.afterSnapshot).toBeDefined();
            expect(result2.afterSnapshot).toBeDefined();
          },
        ),
        { numRuns: 10, seed: 42 },
      );
    }, 30000);

    it('idempotent execution does not escalate if confidence is sufficient', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0.85), max: Math.fround(1.0), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (confidence) => {
            const incident = buildIncident(confidence, 'test-org', 'test-pattern');

            const result1 = await remediationService.remediate(incident);
            const result2 = await remediationService.remediate(incident);

            // With sufficient confidence and successful mock actions, escalation should not occur
            expect(result1.escalated).toBe(false);
            expect(result2.escalated).toBe(false);
          },
        ),
        { numRuns: 5, seed: 7 },
      );
    }, 20000);

    it('repeated remediation maintains consistent action history', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0.85), max: Math.fround(1.0), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (confidence) => {
            const incident = buildIncident(confidence, 'test-org', 'test-pattern');

            const result1 = await remediationService.remediate(incident);
            const result2 = await remediationService.remediate(incident);

            // Actions performed should be the same between runs
            expect(result1.actionsPerformed.length).toBe(result2.actionsPerformed.length);

            // All actions should have identical properties
            for (let i = 0; i < result1.actionsPerformed.length; i++) {
              const action1 = result1.actionsPerformed[i];
              const action2 = result2.actionsPerformed[i];

              expect(action1.type).toBe(action2.type);
              expect(action1.target).toBe(action2.target);
              expect(action1.riskLevel).toBe(action2.riskLevel);
            }
          },
        ),
        { numRuns: 5, seed: 7 },
      );
    }, 20000);

    it('does not escalate identical low-confidence incidents twice', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0.0), max: Math.fround(0.84), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (confidence) => {
            const incident = buildIncident(confidence, 'test-org', 'test-pattern');

            const result1 = await remediationService.remediate(incident);
            const result2 = await remediationService.remediate(incident);

            // Both should skip remediation (confidence < threshold)
            // and neither should escalate (since we don't execute any actions)
            expect(result1.success).toBe(false);
            expect(result2.success).toBe(false);
            expect(result1.stagesExecuted).toBe(0);
            expect(result2.stagesExecuted).toBe(0);
          },
        ),
        { numRuns: 5, seed: 99 },
      );
    }, 10000);
  });

  // ─── Property 6: Confidence Threshold Enforcement ────────────────────────
  /**
   * **Validates: Requirements 5.2**
   *
   * WHEN an incident is passed to remediate(),
   * THEN if incident.confidence < 85%, the service MUST skip execution
   * without attempting any actions. If confidence >= 85%, the service
   * MUST proceed with remediation.
   *
   * This property ensures that the confidence threshold gate is consistently
   * enforced and cannot be bypassed regardless of other incident parameters.
   */
  describe('Property 6: Confidence threshold enforcement', () => {
    it('rejects remediation when confidence < 85%', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0.0), max: Math.fround(0.84), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (lowConfidence) => {
            const incident = buildIncident(lowConfidence, 'test-org', 'test-pattern');

            const result = await remediationService.remediate(incident);

            // Must reject (no stages executed, not successful)
            expect(result.success).toBe(false);
            expect(result.stagesExecuted).toBe(0);
            expect(result.actionsPerformed.length).toBe(0);
            expect(result.timeTaken).toBeDefined();

            // executeAction should not have been called (mocked spy)
            // We can verify by checking that no actions were performed
            expect(remediationService.executeAction).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 10, seed: 42 },
      );
    }, 10000);

    it('accepts remediation when confidence >= 85%', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0.85), max: Math.fround(1.0), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (highConfidence) => {
            const incident = buildIncident(highConfidence, 'test-org', 'test-pattern');

            const result = await remediationService.remediate(incident);

            // Should accept and attempt remediation
            expect(result.stagesExecuted).toBeGreaterThan(0);

            // At least one action should be attempted (from our mock)
            expect(remediationService.executeAction).toHaveBeenCalled();
          },
        ),
        { numRuns: 5, seed: 42 },
      );
    }, 15000);

    it('threshold boundary (confidence = 0.85) accepts remediation', async () => {
      const incident = buildIncident(0.85, 'test-org', 'test-pattern');

      const result = await remediationService.remediate(incident);

      // Exactly at threshold should be accepted
      expect(result.stagesExecuted).toBeGreaterThan(0);
      expect(remediationService.executeAction).toHaveBeenCalled();
    });

    it('threshold boundary (confidence = 0.84) rejects remediation', async () => {
      const incident = buildIncident(0.84, 'test-org', 'test-pattern');

      const result = await remediationService.remediate(incident);

      // Just below threshold should be rejected
      expect(result.success).toBe(false);
      expect(result.stagesExecuted).toBe(0);
      expect(remediationService.executeAction).not.toHaveBeenCalled();
    });

    it('never executes any actions when confidence is below threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(0.0), max: Math.fround(0.84), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (lowConfidence) => {
            const incident = buildIncident(lowConfidence, 'test-org', 'test-pattern');

            await remediationService.remediate(incident);

            // Verify executeAction was not called (no actions executed)
            expect(remediationService.executeAction).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 10, seed: 99 },
      );
    }, 10000);

    it('enforces threshold consistently across different error patterns', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryErrorPattern,
          fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (errorPattern, confidence) => {
            const incident = buildIncident(confidence, 'test-org', errorPattern);

            const result = await remediationService.remediate(incident);

            // Check threshold enforcement independent of error pattern
            if (confidence < 0.85) {
              expect(result.success).toBe(false);
              expect(result.stagesExecuted).toBe(0);
            } else {
              // With our mock, all high-confidence incidents should be attempted
              expect(result.stagesExecuted).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 10, seed: 123 },
      );
    }, 20000);

    it('enforces threshold consistently across different organizations', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryOrgId,
          fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }).map((c) => parseFloat(c.toFixed(2))),
          async (organizationId, confidence) => {
            const incident = buildIncident(confidence, organizationId, 'test-pattern');

            const result = await remediationService.remediate(incident);

            // Threshold must be enforced regardless of org
            if (confidence < 0.85) {
              expect(result.success).toBe(false);
              expect(result.stagesExecuted).toBe(0);
            } else {
              expect(result.stagesExecuted).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 10, seed: 456 },
      );
    }, 20000);

    it('threshold is exactly 0.85 (not 0.84 or 0.86)', async () => {
      // Test that we're not off by one in the threshold
      const exactlyBelow = 0.8499999;
      const exactlyAt = 0.85;
      const exactlyAbove = 0.8500001;

      const incidentBelow = buildIncident(exactlyBelow, 'test-org', 'test-pattern');
      const incidentAt = buildIncident(exactlyAt, 'test-org', 'test-pattern');
      const incidentAbove = buildIncident(exactlyAbove, 'test-org', 'test-pattern');

      const resultBelow = await remediationService.remediate(incidentBelow);
      const resultAt = await remediationService.remediate(incidentAt);
      const resultAbove = await remediationService.remediate(incidentAbove);

      expect(resultBelow.success).toBe(false);
      expect(resultAt.stagesExecuted).toBeGreaterThan(0);
      expect(resultAbove.stagesExecuted).toBeGreaterThan(0);
    });
  });

  // ─── Edge Cases and State Transitions ────────────────────────────────────
  /**
   * Additional tests to ensure robustness and consistent behavior
   * across state transitions and edge cases.
   */
  describe('Property 5 & 6: Combined edge cases', () => {
    it('multiple low-confidence incidents do not accumulate state', async () => {
      const incidents = [
        buildIncident(0.50, 'org-1', 'pattern-1'),
        buildIncident(0.60, 'org-2', 'pattern-2'),
        buildIncident(0.70, 'org-3', 'pattern-3'),
      ];

      for (const incident of incidents) {
        const result = await remediationService.remediate(incident);
        expect(result.success).toBe(false);
        expect(result.stagesExecuted).toBe(0);
      }

      // All should have failed without state leakage
      expect(remediationService.executeAction).not.toHaveBeenCalled();
    });

    it('switching from low to high confidence incidents works correctly', async () => {
      const lowConfIncident = buildIncident(0.50, 'test-org', 'pattern-1');
      const highConfIncident = buildIncident(0.95, 'test-org', 'pattern-1');

      const resultLow = await remediationService.remediate(lowConfIncident);
      expect(resultLow.success).toBe(false);

      const resultHigh = await remediationService.remediate(highConfIncident);
      expect(resultHigh.stagesExecuted).toBeGreaterThan(0);
    });

    it('time taken is always non-negative', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryIncident, async ({ confidence, organizationId, errorPattern }) => {
          const incident = buildIncident(confidence, organizationId, errorPattern);
          const result = await remediationService.remediate(incident);

          expect(result.timeTaken).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 5, seed: 42 },
      );
    }, 15000);

    it('result always has before/after snapshots', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryIncident, async ({ confidence, organizationId, errorPattern }) => {
          const incident = buildIncident(confidence, organizationId, errorPattern);
          const result = await remediationService.remediate(incident);

          expect(result.beforeSnapshot).toBeDefined();
          expect(result.afterSnapshot).toBeDefined();
          expect(result.beforeSnapshot.timestamp).toBeDefined();
          expect(result.afterSnapshot.timestamp).toBeDefined();
        }),
        { numRuns: 5, seed: 42 },
      );
    }, 15000);
  });
});
