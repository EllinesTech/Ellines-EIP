/**
 * Federated Learning Data Types and Interfaces
 * Requirement 3: Federated Learning Across Organizations
 */

export interface FederatedConfig {
  participatingOrgs: string[];
  modelType: string;
  privacyBudget: number;
  roundDuration: number;
  aggregationStrategy: 'fedavg' | 'fedprox' | 'scaffold';
  differentialPrivacyEpsilon: number;
  differentialPrivacyDelta: number;
  maxClientsPerRound: number;
  clientSamplingRate: number;
  minimumClientUpdates: number;
}

export interface TrainingRound {
  id: string;
  modelType: string;
  round: number;
  status: 'initialized' | 'collecting' | 'validating' | 'aggregating' | 'distributing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  participatingOrgs: ParticipatingOrg[];
  privacyBudgetUsed: number;
  totalDataSamples: number;
  acceptedUpdates: number;
  rejectedUpdates: number;
}

export interface ParticipatingOrg {
  orgId: string;
  status: 'invited' | 'accepted' | 'declined' | 'submitted' | 'excluded';
  optInStatus: 'opted_in' | 'opted_out';
  submittedAt?: Date;
}

export interface ModelUpdate {
  orgId: string;
  roundId: string;
  gradients: number[][];
  datasetSize: number;
  timestamp: Date;
  parameterNames: string[];
}

export interface PrivateUpdate {
  anonymizedId: string;
  roundId: string;
  noisyGradients: number[][];
  privacyGuarantee: PrivacyGuarantee;
  isClean: boolean;
  validationScore: number;
}

export interface PrivacyGuarantee {
  epsilon: number;
  delta: number;
  noiseScale: number;
  mechanism: 'gaussian' | 'laplace';
}

export interface ValidationResult {
  isValid: boolean;
  anomalousUpdates: ModelUpdate[];
  cleanUpdates: PrivateUpdate[];
  anomalyScore: Map<string, number>;
  detectionMethod: string;
  confidence: number;
}

export interface GlobalModel {
  modelId: string;
  roundId: string;
  aggregatedGradients: number[][];
  modelVersion: number;
  aggregationMethod: string;
  participantCount: number;
  weights: number[];
  timestamp: Date;
  performanceMetrics: {
    averageLoss: number;
    convergenceMeasure: number;
  };
}

export interface DistributionResult {
  modelId: string;
  roundId: string;
  distributedAt: Date;
  successfulOrgs: string[];
  failedOrgs: string[];
  distributionLatency: number;
}

export interface TransparencyReport {
  roundId: string;
  generatedAt: Date;
  participantCount: number;
  patternsLearned: string[];
  localVsFederal: ComparisonMetrics;
  privacyBudgetUsed: number;
  privacyBudgetRemaining: number;
  dataCharacteristics: {
    totalSamples: number;
    avgSamplesPerOrg: number;
    dataDistribution: string;
  };
  modelImprovements: {
    federalAccuracy: number;
    localAvgAccuracy: number;
    improvementPercent: number;
  };
  recommendations: string[];
}

export interface ComparisonMetrics {
  federalModelAccuracy: number;
  localModelAverageAccuracy: number;
  trainingTimeComparison: number;
  dataPrivacyLevel: string;
  communicationCost: number;
}

export interface AnomalyDetectionReport {
  updateId: string;
  orgId: string;
  anomalyScore: number;
  isAnomalous: boolean;
  statistics: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
  deviations: {
    meanDeviation: number;
    stdDeviation: number;
  };
  detectionMethod: string;
  confidence: number;
}

export interface OptInRequest {
  orgId: string;
  roundId: string;
  action: 'opt_in' | 'opt_out';
  timestamp: Date;
  reason?: string;
}

export interface GradientStatistics {
  mean: number;
  variance: number;
  std: number;
  min: number;
  max: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  kurtosis: number;
  skewness: number;
}

export interface PoisoningDetectionConfig {
  method: 'zscore' | 'iqr' | 'isolation_forest' | 'mahalanobis';
  threshold: number;
  multivariate: boolean;
  windowSize: number;
}

export interface OptInStatus {
  orgId: string;
  isOptedIn: boolean;
  lastUpdated: Date;
  reason?: string;
}
