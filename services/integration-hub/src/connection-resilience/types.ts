/**
 * Connection Resilience Types
 * Core interfaces for the Resilient Connection Manager
 */

export enum ConnectionMethodType {
  API = 'api',
  DATABASE = 'database',
  FILE_SYNC = 'file_sync',
  SCREEN_SCRAPE = 'screen_scrape',
  MESSAGE_QUEUE = 'message_queue',
  WEBHOOK = 'webhook',
}

export enum ConnectionHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  FAILING = 'failing',
  DISCONNECTED = 'disconnected',
}

export interface ConnectionConfig {
  [key: string]: any;
}

export interface ConnectionMethod {
  id: string;
  type: ConnectionMethodType;
  config: ConnectionConfig;
  priority: number;
  successRate: number;
  avgLatency: number;
  lastAttempt?: Date;
  lastSuccess?: Date;
}

export interface ConnectionHealth {
  status: ConnectionHealthStatus;
  lastCheck: Date;
  latency: number;
  errorRate: number;
  message?: string;
}

export interface ResilientConnection {
  id: string;
  systemId: string;
  systemName: string;
  primaryMethod: ConnectionMethod;
  backupMethods: ConnectionMethod[];
  currentMethod: ConnectionMethod;
  healthStatus: ConnectionHealth;
  lastSuccessfulConnection: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneratedConnectorCode {
  systemId: string;
  systemName: string;
  sourceCode: string;
  language: 'typescript' | 'python' | 'java';
  dependencies: string[];
  testCases: string[];
  generatedAt: Date;
  requiresApproval: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
}

export interface ConnectionResult {
  success: boolean;
  method: ConnectionMethod;
  latency: number;
  dataQuality: number;
  recordsProcessed: number;
  errorMessage?: string;
  timestamp: Date;
}

export interface FailoverResult {
  success: boolean;
  previousMethod: ConnectionMethod;
  newMethod: ConnectionMethod;
  latency: number;
  message: string;
  timestamp: Date;
}

export interface SystemIdentifier {
  id: string;
  name: string;
  type: string;
}

export interface DiscoveredConnectionMethods {
  systemId: string;
  availableMethods: ConnectionMethod[];
  recommendedMethod: ConnectionMethod;
  fallbackMethods: ConnectionMethod[];
}

export interface ApprovalWorkflowStatus {
  requestId: string;
  connectorId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
}
