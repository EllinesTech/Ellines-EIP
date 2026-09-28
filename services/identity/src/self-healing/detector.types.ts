/**
 * Shared types for the Self-Healing Detector subsystem.
 * Requirements: 4.1 – 4.8
 */

export type ErrorLogEntry = {
  errorCode: string;
  endpoint?: string;
  timestamp: Date;
  message?: string;
};

export type ErrorCluster = {
  clusterId: string;
  errorCode: string;
  errorCount: number;
  windowStartMs: number;
  windowEndMs: number;
  affectedEndpoints: string[];
  firstOccurrence: Date;
  lastOccurrence: Date;
};

export type ErrorClassification = {
  severity: 'critical' | 'high' | 'medium' | 'low';
  isRootCause: boolean;
  relatedErrors: string[];
  suggestedAction: string;
};
