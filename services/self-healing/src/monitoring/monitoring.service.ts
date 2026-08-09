import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, interval } from 'rxjs';
import { HealthStatus, ComponentIdentifier, HealthMetrics, ComponentStatus } from '../interfaces/health-status.interface';

/**
 * Monitoring Service
 * 
 * Monitors all platform components for errors, anomalies, and performance degradation.
 * Validates Requirements 4.1, 4.2
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly healthStatusSubject = new Subject<HealthStatus>();
  private readonly monitoredComponents = new Map<string, ComponentIdentifier>();

  constructor() {
    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Monitor a component for health status
   * Requirement 4.1: Monitor all platform components
   */
  monitorComponent(component: ComponentIdentifier): Observable<HealthStatus> {
    const key = this.getComponentKey(component);
    this.monitoredComponents.set(key, component);
    this.logger.log(`Started monitoring component: ${key}`);
    return this.healthStatusSubject.asObservable();
  }

  /**
   * Report health status for a component
   */
  reportHealth(status: HealthStatus): void {
    this.healthStatusSubject.next(status);
    
    if (status.status === 'failing' || status.status === 'down') {
      this.logger.warn(`Component ${status.component} is ${status.status}`, {
        metrics: status.metrics,
        message: status.message,
      });
    }
  }

  /**
   * Get current health status for all monitored components
   */
  async getComponentsHealth(): Promise<HealthStatus[]> {
    const healthStatuses: HealthStatus[] = [];
    
    for (const [key, component] of this.monitoredComponents.entries()) {
      const status = await this.checkComponentHealth(component);
      healthStatuses.push(status);
    }
    
    return healthStatuses;
  }

  /**
   * Check health of a specific component
   */
  private async checkComponentHealth(component: ComponentIdentifier): Promise<HealthStatus> {
    try {
      // In a real implementation, this would make actual health check calls
      // For now, we simulate health metrics collection
      const metrics: HealthMetrics = {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        responseTime: Math.random() * 1000,
        errorRate: Math.random() * 5,
      };

      const status: ComponentStatus = this.determineStatus(metrics);

      return {
        component: this.getComponentKey(component),
        status,
        metrics,
        timestamp: new Date(),
        message: status === 'healthy' ? undefined : `Component health check: ${status}`,
      };
    } catch (error) {
      this.logger.error(`Health check failed for ${component.service}:`, error);
      return {
        component: this.getComponentKey(component),
        status: 'down',
        metrics: {},
        timestamp: new Date(),
        message: error.message,
      };
    }
  }

  /**
   * Determine component status based on metrics
   */
  private determineStatus(metrics: HealthMetrics): ComponentStatus {
    if (metrics.errorRate && metrics.errorRate > 10) return 'failing';
    if (metrics.cpuUsage && metrics.cpuUsage > 90) return 'degraded';
    if (metrics.memoryUsage && metrics.memoryUsage > 90) return 'degraded';
    if (metrics.responseTime && metrics.responseTime > 5000) return 'degraded';
    return 'healthy';
  }

  /**
   * Start periodic health checks for all monitored components
   */
  private startHealthChecks(): void {
    interval(30000).subscribe(async () => {
      const healthStatuses = await this.getComponentsHealth();
      healthStatuses.forEach(status => this.reportHealth(status));
    });
  }

  private getComponentKey(component: ComponentIdentifier): string {
    return component.organization
      ? `${component.service}:${component.instance || 'default'}:${component.organization}`
      : `${component.service}:${component.instance || 'default'}`;
  }
}
