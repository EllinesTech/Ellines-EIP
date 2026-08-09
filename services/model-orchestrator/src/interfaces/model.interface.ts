import { ModelCapability } from './query.interface';

/**
 * Model reference
 */
export interface ModelReference {
  id: string;
  name: string;
  type: string;
  version: string;
  capabilities: ModelCapability[];
}

/**
 * Ensemble strategy
 */
export type EnsembleStrategy = 
  | 'weighted_vote' 
  | 'meta_learning' 
  | 'cascade';

/**
 * Model routing decision
 */
export interface ModelRouting {
  primaryModel: ModelReference;
  secondaryModels: ModelReference[];
  fallbackModel: ModelReference;
  ensembleStrategy: EnsembleStrategy;
}

/**
 * Model output
 */
export interface ModelOutput {
  modelId: string;
  result: any;
  confidence: number;
  latency: number;
  metadata?: Record<string, any>;
}

/**
 * Collection of model results
 */
export interface ModelResults {
  results: Map<string, ModelOutput>;
  latencies: Map<string, number>;
  confidences: Map<string, number>;
}

/**
 * Explanation for a result
 */
export interface Explanation {
  reasoning: string;
  steps: string[];
  confidence: number;
  factors: Record<string, number>;
}

/**
 * Data source reference
 */
export interface Source {
  id: string;
  type: string;
  name: string;
  url?: string;
  timestamp?: Date;
}

/**
 * Model decision for audit
 */
export interface ModelDecision {
  modelId: string;
  queryId: string;
  selected: boolean;
  reason: string;
  confidence: number;
  timestamp: Date;
}

/**
 * Unified result from orchestrator
 */
export interface UnifiedResult {
  answer: string;
  confidence: number;
  explanation: Explanation;
  sources: Source[];
  modelDecisions: ModelDecision[];
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  modelId: string;
  accuracy: number;
  averageLatency: number;
  totalCalls: number;
  successRate: number;
  costPerCall: number;
  lastUpdated: Date;
}

/**
 * Model metadata for registry
 */
export interface ModelMetadata {
  id: string;
  name: string;
  type: string;
  version: string;
  capabilities: ModelCapability[];
  status: 'available' | 'degraded' | 'unavailable';
  endpoint?: string;
  apiKey?: string;
  maxConcurrency?: number;
  rateLimit?: number;
  metrics: ModelMetrics;
  createdAt: Date;
  updatedAt: Date;
}
