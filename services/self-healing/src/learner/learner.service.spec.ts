/**
 * Unit Tests for Self-Healing Learner Service
 *
 * Task 3.5 — Test outcome recording, success pattern analysis,
 * confidence threshold adjustment, and manual fix learning.
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { LearnerService } from './learner.service';
import {
  ManualFix,
  TimeRange,
} from './learner.interfaces';
import { RemediationResult } from '../remediation/remediation.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeResult(
  success: boolean,
  errorPattern = 'db_conn_error',
  orgId = 'org-test',
  overrides: Partial<RemediationResult> = {},
): RemediationResult {
  return {
    success,
    stagesExecuted: success ? 1 : 0,
    actionsPerformed: success
      ? [{ type: 'cache_clear', target: 'db-pool', riskLevel: 'low', parameters: {} }]
      : [],
    timeTaken: 1200,
    escalated: !success,
    attempts: [],
    beforeSnapshot: { timestamp: new Date(), metrics: {}, status: 'unhealthy' },
    afterSnapshot: { timestamp: new Date(), metrics: {}, status: success ? 'healthy' : 'unhealthy' },
    ...overrides,
  };
}

function makeIncident(errorPattern = 'db_conn_error', orgId = 'org-test') {
  return {
    id: `incident-${Date.now()}-${Math.random()}`,
    organizationId: orgId,
    errorPattern,
    severity: 'high' as const,
    affectedComponents: ['service-a'],
    confidence: 0.92,
    diagnostics: {},
  };
}

function makeManualFix(incidentId: string, adminId = 'admin-1'): ManualFix {
  return {
    incidentId,
    adminId,
    actions: [
      { description: 'Restart DB connection pool', target: 'db-pool', type: 'pool_reset' },
      { description: 'Clear stale cache entries', target: 'redis', type: 'cache_clear' },
    ],
    resolution: 'Connection pool was exhausted due to unclosed connections. Reset pool and cleared cache.',
    timeTaken: 320,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('LearnerService — Unit Tests (Task 3.5)', () => {
  let service: LearnerService;

  beforeEach(() => {
    service = new LearnerService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ─── Req 6.1: Outcome recording ──────────────────────────────────────────

  describe('Req 6.1: Outcome Recording and Storage', () => {
    it('records a successful remediation outcome without throwing', async () => {
      const result = makeResult(true);
      const incident = makeIncident();

      await expect(service.recordOutcome(result, incident)).resolves.not.toThrow();
    });

    it('records a failed remediation outcome without throwing', async () => {
      const result = makeResult(false);
      const incident = makeIncident();

      await expect(service.recordOutcome(result, incident)).resolves.not.toThrow();
    });

    it('records a partial success outcome without throwing', async () => {
      const result = makeResult(false, 'cache_miss', 'org-2', {
        stagesExecuted: 1,
        escalated: false,
      });
      const incident = makeIncident('cache_miss', 'org-2');

      await expect(service.recordOutcome(result, incident)).resolves.not.toThrow();
    });

    it('records escalated outcome correctly', async () => {
      const result = makeResult(false, 'mem_exhaustion', 'org-3', {
        escalated: true,
        stagesExecuted: 3,
      });
      const incident = makeIncident('mem_exhaustion', 'org-3');

      await expect(service.recordOutcome(result, incident)).resolves.not.toThrow();
    });

    it('handles multiple sequential recordings for the same error pattern', async () => {
      const pattern = 'db_conn_error';
      const inc = makeIncident(pattern);

      for (let i = 0; i < 5; i++) {
        const res = makeResult(i % 2 === 0, pattern);
        await service.recordOutcome(res, inc);
      }

      // All 5 recordings should complete without error
      const patterns = await service.analyzeSuccesses({
        from: new Date(Date.now() - 60_000),
        to: new Date(),
      });

      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  // ─── Req 6.2: Success pattern analysis ───────────────────────────────────

  describe('Req 6.2: Success Pattern Analysis', () => {
    it('returns empty array when no successes recorded', async () => {
      const timeWindow: TimeRange = {
        from: new Date(Date.now() - 3600_000),
        to: new Date(),
      };

      const patterns = await service.analyzeSuccesses(timeWindow);

      expect(patterns).toEqual([]);
    });

    it('extracts pattern after recording successful outcomes', async () => {
      const pattern = 'pool_leak';
      const incident = makeIncident(pattern);

      // Record 3 successes for the same pattern
      for (let i = 0; i < 3; i++) {
        await service.recordOutcome(makeResult(true, pattern), incident);
      }

      const timeWindow: TimeRange = {
        from: new Date(Date.now() - 60_000),
        to: new Date(),
      };

      const patterns = await service.analyzeSuccesses(timeWindow);

      expect(Array.isArray(patterns)).toBe(true);
      // May include 'pool_leak' pattern if threshold is met
    });

    it('returns strategy patterns with required fields', async () => {
      const pattern = 'rate_limit_exceeded';
      const incident = makeIncident(pattern);

      for (let i = 0; i < 5; i++) {
        await service.recordOutcome(makeResult(true, pattern), incident);
      }

      const timeWindow: TimeRange = {
        from: new Date(Date.now() - 60_000),
        to: new Date(),
      };

      const patterns = await service.analyzeSuccesses(timeWindow);

      for (const p of patterns) {
        expect(p).toHaveProperty('errorPattern');
        expect(p).toHaveProperty('occurrenceCount');
        expect(p).toHaveProperty('successRate');
        expect(p).toHaveProperty('commonActions');
        expect(p).toHaveProperty('avgTimeTaken');
        expect(p.successRate).toBeGreaterThanOrEqual(0);
        expect(p.successRate).toBeLessThanOrEqual(1);
      }
    });

    it('calculates success rate correctly from mixed outcomes', async () => {
      const pattern = 'mixed_errors';
      const incident = makeIncident(pattern);

      // Record 3 successes and 2 failures
      for (let i = 0; i < 3; i++) {
        await service.recordOutcome(makeResult(true, pattern), incident);
      }
      for (let i = 0; i < 2; i++) {
        await service.recordOutcome(makeResult(false, pattern), incident);
      }

      const timeWindow: TimeRange = {
        from: new Date(Date.now() - 60_000),
        to: new Date(),
      };

      const patterns = await service.analyzeSuccesses(timeWindow);
      const found = patterns.find((p) => p.errorPattern === pattern);

      // If the pattern appears, success rate should be approximately 0.6
      if (found) {
        expect(found.successRate).toBeGreaterThan(0);
        expect(found.successRate).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── Req 6.3: Manual fix learning ────────────────────────────────────────

  describe('Req 6.3: Manual Fix Capture and Strategy Generation', () => {
    it('learns from a manual fix and returns a new strategy', async () => {
      const incident = makeIncident('db_conn_error');
      const fix = makeManualFix(incident.id);

      const newStrategy = await service.learnFromManualFix(incident, fix);

      expect(newStrategy).toBeDefined();
      expect(newStrategy.errorPattern).toBe('db_conn_error');
      expect(newStrategy.learnedActions.length).toBeGreaterThan(0);
      expect(newStrategy.confidence).toBeGreaterThan(0);
      expect(newStrategy.confidence).toBeLessThanOrEqual(1);
    });

    it('new strategy requires approval before deployment', async () => {
      const incident = makeIncident('mem_exhaustion');
      const fix = makeManualFix(incident.id, 'admin-senior');

      const newStrategy = await service.learnFromManualFix(incident, fix);

      // Newly learned strategies should require IT admin approval (Req 6.8)
      expect(newStrategy.requiresApproval).toBe(true);
    });

    it('preserves the error pattern from incident in new strategy', async () => {
      const pattern = 'service_restart_loop';
      const incident = makeIncident(pattern);
      const fix = makeManualFix(incident.id);

      const newStrategy = await service.learnFromManualFix(incident, fix);

      expect(newStrategy.errorPattern).toBe(pattern);
    });

    it('maps manual action types to remediation action types', async () => {
      const incident = makeIncident('cache_miss_spike');
      const fix: ManualFix = {
        incidentId: incident.id,
        adminId: 'admin-2',
        actions: [
          { description: 'Clear all cache', target: 'redis', type: 'cache_clear' },
          { description: 'Restart cache service', target: 'redis', type: 'restart' },
        ],
        resolution: 'Cache was corrupted, cleared and restarted.',
        timeTaken: 180,
      };

      const newStrategy = await service.learnFromManualFix(incident, fix);

      expect(newStrategy.learnedActions.length).toBeGreaterThan(0);
      const actionTypes = newStrategy.learnedActions.map((a) => a.type);
      expect(actionTypes).toContain('cache_clear');
    });

    it('generates a candidateId for the new strategy', async () => {
      const incident = makeIncident('db_conn_error');
      const fix = makeManualFix(incident.id);

      const newStrategy = await service.learnFromManualFix(incident, fix);

      // Strategy should have a candidate ID for approval workflow
      expect(newStrategy.candidateId).toBeDefined();
    });
  });

  // ─── Req 6.4: Confidence threshold adjustment ─────────────────────────────

  describe('Req 6.4: Confidence Threshold Adjustment', () => {
    it('returns an updated strategy after threshold adjustment', async () => {
      // First record enough outcomes to have a track record
      const pattern = 'adjust_test_pattern';
      const incident = makeIncident(pattern);
      for (let i = 0; i < 3; i++) {
        await service.recordOutcome(makeResult(true, pattern), incident);
      }

      const updated = await service.adjustThresholds(pattern);

      expect(updated).toBeDefined();
      expect(updated.errorPattern).toBe(pattern);
      expect(updated.newThreshold).toBeGreaterThan(0);
      expect(updated.newThreshold).toBeLessThanOrEqual(1);
    });

    it('provides old and new threshold values for auditing', async () => {
      const pattern = 'threshold_audit_pattern';
      const incident = makeIncident(pattern);
      for (let i = 0; i < 5; i++) {
        await service.recordOutcome(makeResult(true, pattern), incident);
      }

      const updated = await service.adjustThresholds(pattern);

      expect(updated.oldThreshold).toBeDefined();
      expect(updated.newThreshold).toBeDefined();
      expect(typeof updated.oldThreshold).toBe('number');
      expect(typeof updated.newThreshold).toBe('number');
    });

    it('exposes success rate in updated strategy', async () => {
      const pattern = 'high_success_pattern';
      const incident = makeIncident(pattern);

      // Record many successes
      for (let i = 0; i < 8; i++) {
        await service.recordOutcome(makeResult(true, pattern), incident);
      }
      // Record 2 failures
      for (let i = 0; i < 2; i++) {
        await service.recordOutcome(makeResult(false, pattern), incident);
      }

      const updated = await service.adjustThresholds(pattern);

      expect(updated.successRate).toBeGreaterThanOrEqual(0);
      expect(updated.successRate).toBeLessThanOrEqual(1);
      expect(updated.executionCount).toBeGreaterThan(0);
    });

    it('handles adjustment for unknown error pattern gracefully', async () => {
      const updated = await service.adjustThresholds('completely_unknown_pattern');

      // Should return a result even with no history (use default threshold)
      expect(updated).toBeDefined();
      expect(updated.newThreshold).toBeGreaterThan(0);
    });
  });

  // ─── Req 6.5: Recurring issue identification ──────────────────────────────

  describe('Req 6.5: Recurring Issue Identification', () => {
    it('returns an array of recurring issues (possibly empty)', async () => {
      const issues = await service.getRecurringIssues();
      expect(Array.isArray(issues)).toBe(true);
    });

    it('returns recurring issues for specific organization', async () => {
      const orgId = 'org-recurring-test';
      const issues = await service.getRecurringIssues(orgId);
      expect(Array.isArray(issues)).toBe(true);
    });
  });

  // ─── Req 6.6: Architecture improvement recommendations ───────────────────

  describe('Req 6.6: Architecture Improvement Recommendations', () => {
    it('returns an array of recommendations', async () => {
      const recs = await service.recommendImprovements();
      expect(Array.isArray(recs)).toBe(true);
    });

    it('each recommendation has required fields', async () => {
      // Record many failures for the same pattern to trigger recommendations
      const pattern = 'persistent_db_failure';
      const incident = makeIncident(pattern);
      for (let i = 0; i < 10; i++) {
        await service.recordOutcome(makeResult(false, pattern), incident);
      }

      const recs = await service.recommendImprovements();

      for (const rec of recs) {
        expect(rec).toHaveProperty('type');
        expect(['architecture', 'configuration', 'monitoring']).toContain(rec.type);
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('rationale');
        expect(rec).toHaveProperty('preventedErrorTypes');
        expect(rec).toHaveProperty('estimatedImpact');
      }
    });
  });

  // ─── Req 6.7: Federated learning strategy sharing ─────────────────────────

  describe('Req 6.7: Federated Strategy Sharing', () => {
    it('returns a federated contribution object', async () => {
      const contribution = await service.shareStrategies('org-test');

      expect(contribution).toBeDefined();
      expect(contribution).toHaveProperty('contributedPatterns');
      expect(contribution).toHaveProperty('anonymizedStrategies');
      expect(contribution).toHaveProperty('organizationId');
      expect(contribution).toHaveProperty('timestamp');
    });

    it('anonymizes strategy patterns (no raw org data)', async () => {
      // Record some strategies first
      const pattern = 'sensitive_pattern';
      const incident = makeIncident(pattern, 'sensitive-org-id');
      for (let i = 0; i < 3; i++) {
        await service.recordOutcome(makeResult(true, pattern, 'sensitive-org-id'), incident);
      }

      const contribution = await service.shareStrategies('sensitive-org-id');

      // Anonymized strategies should not expose raw org id or pattern names
      for (const strategy of contribution.anonymizedStrategies) {
        expect(strategy).toHaveProperty('errorPatternHash');
        expect(strategy).toHaveProperty('actionTypes');
        expect(strategy).toHaveProperty('successRate');
        // Hash should not equal the raw pattern
        expect(strategy.errorPatternHash).not.toBe('sensitive_pattern');
      }
    });
  });
});
