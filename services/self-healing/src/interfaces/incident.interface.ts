/**
 * Incident management interfaces
 */

import { ErrorCluster, ErrorClassification } from './error.interface';

export interface DiagnosticData {
  logs: LogEntry[];
  metrics: MetricSnapshot[];
  healthChecks: HealthCheckResult[];
  systemState: Record<string, any>;
  timestamp: Date;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  component: string;
  metadata?: Record<string, any>;
}

export interface MetricSnapshot {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface HealthCheckResult {
  component: string;
  status: 'pass' | 'fail' | 'warn';
  timestamp: Date;
  details?: Record<string, any>;
}

export interface RemediationAction {
  type: 'restart' | 'cache_clear' | 'pool_reset' | 'rate_limit' | 'rollback' | 'scale_up' | 'custom';
  target: string;
  parameters: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
}

export interface Incident {
  id: string;
  errorCluster: ErrorCluster;
  diagnostics: DiagnosticData;
  recommendedActions: RemediationAction[];
  confidence: number; // 0-100
  status: 'detected' | 'analyzing' | 'remediating' | 'resolved' | 'escalated';
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  escalatedTo?: string;
}
