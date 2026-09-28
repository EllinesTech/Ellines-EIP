/**
 * RegisterModelDto — payload to register a new AI model in the platform registry.
 * Requirement 1.1: integrate at least five specialised AI models for different capabilities.
 */
export class RegisterModelDto {
  /** Internal identifier used for routing (e.g. 'gpt-4', 'claude-3-opus'). */
  modelId!: string;
  displayName!: string;
  /** 'openai' | 'anthropic' | 'azure' | 'local' | 'custom' */
  provider!: string;
  /** 'language' | 'time_series' | 'anomaly' | 'vision' | 'reasoning' */
  modelType!: string;
  /** e.g. ['text', 'code', 'reasoning', 'vision'] */
  capabilities!: string[];
  contextWindow?: number;
  costPerMToken?: number;
  avgLatencyMs?: number;
  accuracyScore?: number;
  throughputQps?: number;
  priority?: number;
  /** Any model-specific configuration (API keys resolved from env, not stored here). */
  configuration?: Record<string, unknown>;
  fallbackModelId?: string;
}
