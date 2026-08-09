/**
 * Query types for model routing
 */
export type QueryType = 
  | 'text' 
  | 'time-series' 
  | 'anomaly' 
  | 'vision' 
  | 'reasoning'
  | 'hybrid';

/**
 * Model capabilities
 */
export type ModelCapability = 
  | 'language_understanding'
  | 'time_series_forecasting'
  | 'anomaly_detection'
  | 'computer_vision'
  | 'knowledge_reasoning'
  | 'causal_analysis'
  | 'pattern_detection';

/**
 * Query context information
 */
export interface QueryContext {
  userId?: string;
  orgId?: string;
  role?: string;
  timestamp: Date;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Incoming query
 */
export interface Query {
  id: string;
  content: string;
  type?: QueryType;
  context: QueryContext;
  requiredCapabilities: ModelCapability[];
}
