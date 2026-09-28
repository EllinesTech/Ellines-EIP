/**
 * RecordDecisionDto — payload for persisting a model routing decision.
 * Requirement 1.8: log model selection decisions and reasoning for audit and explainability.
 */
export class RecordDecisionDto {
  /** Caller-generated correlation ID that ties this decision to a specific query. */
  queryId!: string;
  /** 'text' | 'forecast' | 'anomaly' | 'vision' | 'reasoning' */
  queryType!: string;
  /** modelId of the primary model selected. */
  selectedModelId!: string;
  /** modelIds of additional models used in ensemble (may be empty). */
  secondaryModels?: string[];
  /** Human-readable justification for why this model was chosen. */
  routingReason!: string;
  /** 'weighted_vote' | 'meta_learning' | 'cascade' | null */
  ensembleStrategy?: string;
  confidence?: number;
  latencyMs?: number;
  success?: boolean;
  errorMessage?: string;
  /** Optional: associate decision with an organisation for audit. */
  organizationId?: string;
}
