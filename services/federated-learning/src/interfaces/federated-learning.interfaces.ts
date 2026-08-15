/**
 * Federated Learning Coordinator Interfaces
 * Req 3.1–3.8: Privacy-preserving federated learning across organizations
 */

/** Req 3.1: Training round configuration */
export interface FederatedConfig {
  participatingOrgs: string[];
  modelType: string;
  privacyBudget: number;
  roundDuration: number;
  aggregationStrategy: 'fedavg' | 'fedprox' | 'scaffold';
}

/** Req 3.1: Training round state and tracking */
export interface TrainingRound {
  id: string;
  config: FederatedConfig;
  status: 'pending' | 'active' | 'aggregating' | 'distributing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  expectedEndTime: Date;
  participantsJoined: string[];
  participantUpdates: Map<string, ModelUpdate>;
}

/** Req 3.2: Model update from organization */
export interface ModelUpdate {
  orgId: string;
  gradients: number[][];
  datasetSize: number;
  timestamp: Date;
}

/** Req 3.3: Privacy-guaranteed update after differential privacy */
export interface PrivateUpdate {
  anonymizedId: string;
  noisyGradients: number[][];
  privacyGuarantee: PrivacyGuarantee;
}

/** Req 3.3: Privacy guarantee parameters (epsilon, delta) */
export interface PrivacyGuarantee {
  epsilon: number;
  delta: number;
  mechanism: 'gaussian' | 'laplace';
  noiseScale: number;
}

/** Req 3.4: Poisoning detection validation result */
export interface ValidationResult {
  cleanUpdates: PrivateUpdate[];
  poisonedUpdates: PrivateUpdate[];
  anomalyScores: Map<string, number>;
  threshold: number;
}

/** Req 3.5: Aggregated global model */
export interface GlobalModel {
  id: string;
  roundId: string;
  version: number;
  aggregatedGradients: number[][];
  weightedParameters: number[][];
  participantCount: number;
  aggregatedAt: Date;
}

/** Req 3.6: Model distribution result */
export interface DistributionResult {
  modelId: string;
  distributedTo: string[];
  failedOrgs: string[];
  distributedAt: Date;
}

/** Req 3.7: Transparency report with patterns and privacy tracking */
export interface TransparencyReport {
  roundId: string;
  participantCount: number;
  patternsLearned: string[];
  localVsFederal: ComparisonMetrics;
  privacyBudgetUsed: number;
  privacyBudgetRemaining: number;
  totalEpsilonConsumed: number;
}

/** Comparison metrics between local and federated models */
export interface ComparisonMetrics {
  accuracyDifference: number;
  performanceGain: number;
  convergedToGlobal: boolean;
  localDataCoverage: number;
}

/** Req 3.8: Organization opt-in/opt-out status */
export interface OrganizationParticipation {
  orgId: string;
  optedIn: boolean;
  joinedAt?: Date;
  optOutReason?: string;
  lastParticipationRound?: string;
}

/** Req 3.4: Anomaly detection metadata for poisoning detection */
export interface AnomalyMetadata {
  updateId: string;
  zScore: number;
  isolationScore: number;
  isOutlier: boolean;
  reasons: string[];
}

/** Privacy budget tracking */
export interface PrivacyBudget {
  totalBudget: number;
  consumedBudget: number;
  remainingBudget: number;
  roundsCompleted: number;
  lastUpdated: Date;
}
