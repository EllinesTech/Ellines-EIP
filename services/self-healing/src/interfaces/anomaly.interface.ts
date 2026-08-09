/**
 * Anomaly detection interfaces for security and performance
 */

export type AnomalyType = 
  | 'unusual_access'
  | 'failed_authentication'
  | 'suspicious_api_usage'
  | 'data_exfiltration'
  | 'privilege_escalation'
  | 'performance_degradation'
  | 'latency_spike'
  | 'throughput_drop'
  | 'resource_exhaustion';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  timestamp: Date;
  affectedEntity: string;
  baselineValue?: number;
  currentValue?: number;
  deviation?: number; // percentage
  metadata?: Record<string, any>;
}

export interface SecurityAnomaly extends Anomaly {
  type: 'unusual_access' | 'failed_authentication' | 'suspicious_api_usage' | 'data_exfiltration' | 'privilege_escalation';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
}

export interface PerformanceAnomaly extends Anomaly {
  type: 'performance_degradation' | 'latency_spike' | 'throughput_drop' | 'resource_exhaustion';
  component: string;
  metric: string;
  threshold?: number;
}

export interface UserBehaviorProfile {
  userId: string;
  role: string;
  department?: string;
  normalAccessPatterns: AccessPattern[];
  normalActivityHours: TimeWindow[];
  typicalLocations: string[];
  averageApiCallsPerHour: number;
  lastUpdated: Date;
}

export interface AccessPattern {
  resource: string;
  frequency: number; // calls per day
  typicalTime: TimeWindow;
}

export interface TimeWindow {
  startHour: number; // 0-23
  endHour: number; // 0-23
  daysOfWeek: number[]; // 0-6 (Sunday-Saturday)
}
