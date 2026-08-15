/**
 * Self-Healing Learner Interfaces
 *
 * Domain interfaces for the LearnerService.
 * Req: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { RemediationAction } from '../remediation/remediation.service';

// ── Core DTOs ────────────────────────────────────────────────────────────────

export interface TimeRange {
  from: Date;
  to: Date;
}

/** Req 6.1 – Outcome of a remediation attempt */
export type RemediationOutcome = 'success' | 'partial_success' | 'failure' | 'escalated';

/** Req 6.2 – Pattern extracted from successful remediations */
export interface StrategyPattern {
  errorPattern: string;
  occurrenceCount: number;
  successRate: number;
  commonActions: RemediationAction[];
  avgTimeTaken: number;
}

/** Individual action taken by an admin during a manual fix */
export interface ManualAction {
  description: string;
  target: string;
  type: string;
  parameters?: Record<string, any>;
}

/** Req 6.3 – Manual fix submitted by an IT Admin */
export interface ManualFix {
  incidentId: string;
  adminId: string;
  actions: ManualAction[];
  resolution: string;
  timeTaken: number;
}

/** Req 6.2 / 6.3 – Newly derived strategy (pending approval) */
export interface NewStrategy {
  errorPattern: string;
  learnedActions: RemediationAction[];
  confidence: number;
  requiresApproval: boolean;
  candidateId?: string;
}

/** Req 6.4 – Threshold update result after EMA adjustment */
export interface UpdatedStrategy {
  errorPattern: string;
  oldThreshold: number;
  newThreshold: number;
  successRate: number;
  executionCount: number;
}

/** Estimated impact of an architecture recommendation */
export interface ImpactEstimate {
  affectedIncidentsPerMonth: number;
  estimatedMttrReductionMinutes: number;
  confidenceLevel: 'low' | 'medium' | 'high';
}

/** Req 6.6 – Architecture improvement recommendation */
export interface Recommendation {
  type: 'architecture' | 'configuration' | 'monitoring';
  description: string;
  rationale: string;
  preventedErrorTypes: string[];
  estimatedImpact: ImpactEstimate;
  id?: string;
}

/** Req 6.5 – Recurring issue flagged for permanent fix */
export interface RecurringIssue {
  id: string;
  errorPattern: string;
  organizationId: string;
  occurrenceCount: number;
  remediationCount: number;
  permanentFixNeeded: boolean;
  status: 'active' | 'resolved';
  lastSeenAt: Date;
}

/** Anonymized strategy for federated sharing (Req 6.7) */
export interface AnonymizedStrategy {
  errorPatternHash: string;
  actionTypes: string[];
  successRate: number;
  executionCount: number;
}

/** Req 6.7 – Contribution to the federated learning coordinator */
export interface FederatedContribution {
  contributedPatterns: number;
  anonymizedStrategies: AnonymizedStrategy[];
  organizationId: string;
  timestamp: Date;
}
