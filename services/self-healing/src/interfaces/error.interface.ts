/**
 * Error detection and classification interfaces
 */

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ErrorCategory = 
  | 'application_error'
  | 'infrastructure_error'
  | 'database_error'
  | 'network_error'
  | 'security_error'
  | 'performance_degradation'
  | 'resource_exhaustion'
  | 'configuration_error'
  | 'data_quality_error';

export interface ImpactScope {
  affectedUsers?: number;
  affectedOrganizations?: string[];
  affectedServices: string[];
  businessImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorClassification {
  severity: ErrorSeverity;
  impact: ImpactScope;
  category: ErrorCategory;
  isRootCause: boolean;
  confidence: number; // 0-100
}

export interface ErrorPattern {
  id: string;
  pattern: string;
  regex?: string;
  frequency: number;
  firstSeen: Date;
  lastSeen: Date;
  classification: ErrorClassification;
  examples: string[];
}

export interface Error {
  id: string;
  message: string;
  stackTrace?: string;
  component: string;
  timestamp: Date;
  source: 'log' | 'metric' | 'health_check' | 'api_response' | 'user_report';
  metadata?: Record<string, any>;
  classification?: ErrorClassification;
}

export interface ErrorCluster {
  id: string;
  rootCause: Error | null;
  symptoms: Error[];
  affectedComponents: string[];
  firstOccurrence: Date;
  lastOccurrence: Date;
  frequency: number;
  correlationStrength: number; // 0-1
}
