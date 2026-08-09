/**
 * Health status interfaces for self-healing monitoring
 */

export type ComponentStatus = 'healthy' | 'degraded' | 'failing' | 'down';

export interface HealthMetrics {
  cpuUsage?: number; // percentage
  memoryUsage?: number; // percentage
  diskUsage?: number; // percentage
  responseTime?: number; // milliseconds
  errorRate?: number; // percentage
  throughput?: number; // requests per second
  activeConnections?: number;
  queueDepth?: number;
  customMetrics?: Record<string, number>;
}

export interface HealthStatus {
  component: string;
  status: ComponentStatus;
  metrics: HealthMetrics;
  timestamp: Date;
  message?: string;
}

export interface ComponentIdentifier {
  service: string;
  instance?: string;
  organization?: string;
}
