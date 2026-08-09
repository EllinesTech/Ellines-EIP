import { ModelCapability } from './query.interface';

/**
 * Input payload for a model invocation
 */
export interface ModelInvocationInput {
  queryId: string;
  content: string;
  context?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

/**
 * Raw output from a model provider before ensemble combining
 */
export interface ModelProviderOutput {
  modelId: string;
  result: unknown;
  confidence: number;
  latencyMs: number;
  tokensUsed?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Pluggable model provider interface.
 * Every specialized AI adapter must implement this contract.
 * Adding a new provider at runtime does not require a service restart (Req 1.6).
 */
export interface IModelProvider {
  /** Unique identifier, e.g. 'llm-language', 'ts-forecaster' */
  readonly modelId: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Capabilities this provider handles */
  readonly capabilities: ModelCapability[];

  /** Whether the provider is currently accepting calls */
  isAvailable(): boolean;

  /**
   * Invoke the model and return a raw output.
   * Implementations must populate latencyMs measured end-to-end.
   */
  invoke(input: ModelInvocationInput): Promise<ModelProviderOutput>;

  /**
   * Health-check the provider (e.g., ping the upstream API).
   * Returns true when the model endpoint is reachable.
   */
  healthCheck(): Promise<boolean>;
}
