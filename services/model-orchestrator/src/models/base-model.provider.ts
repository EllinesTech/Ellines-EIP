/**
 * Base Model Provider Interface
 * 
 * All specialized AI models implement this interface for pluggable architecture.
 * Requirement 1.6: Pluggable model architecture allowing runtime model addition
 */

export interface ModelCapability {
  type: 'text' | 'time-series' | 'anomaly' | 'vision' | 'reasoning' | 'code';
  description: string;
}

export interface ModelInvocationRequest {
  query: string;
  context?: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface ModelInvocationResponse {
  result: any;
  confidence: number;
  latencyMs: number;
  modelId: string;
  metadata?: Record<string, any>;
}

export interface ModelMetadata {
  modelId: string;
  displayName: string;
  provider: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  costPerMToken?: number;
  isAvailable: boolean;
}

export abstract class BaseModelProvider {
  protected abstract modelId: string;
  protected abstract displayName: string;
  protected abstract provider: string;

  /**
   * Invoke the model with a request
   */
  abstract invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse>;

  /**
   * Check if the model is available
   */
  abstract checkHealth(): Promise<boolean>;

  /**
   * Get model metadata
   */
  abstract getMetadata(): ModelMetadata;

  /**
   * Get supported capabilities
   */
  abstract getCapabilities(): ModelCapability[];
}
