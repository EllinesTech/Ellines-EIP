import { Injectable, Logger } from '@nestjs/common';
import { interval, Observable, Subject } from 'rxjs';
import {
  ConnectionHealth,
  ConnectionHealthStatus,
  ResilientConnection,
} from './types';

/**
 * ConnectionHealthMonitor Service
 * Monitors connection health and triggers failover when needed
 */
@Injectable()
export class ConnectionHealthMonitorService {
  private readonly logger = new Logger(ConnectionHealthMonitorService.name);
  private readonly healthCheckInterval = 10000; // 10 seconds
  private activeConnections = new Map<string, ResilientConnection>();
  private healthUpdates$ = new Subject<{ connectionId: string; health: ConnectionHealth }>();

  constructor() {
    this.startHealthCheckScheduler();
  }

  /**
   * Start monitoring a connection
   */
  monitorConnection(connection: ResilientConnection): Observable<ConnectionHealth> {
    this.activeConnections.set(connection.id, connection);
    this.logger.log(`Started monitoring connection: ${connection.id}`);

    // Return observable that emits health updates
    return new Observable((observer) => {
      const subscription = this.healthUpdates$.subscribe((update) => {
        if (update.connectionId === connection.id) {
          observer.next(update.health);
        }
      });

      return () => subscription.unsubscribe();
    });
  }

  /**
   * Stop monitoring a connection
   */
  stopMonitoring(connectionId: string): void {
    this.activeConnections.delete(connectionId);
    this.logger.log(`Stopped monitoring connection: ${connectionId}`);
  }

  /**
   * Get current health status
   */
  async getHealthStatus(connection: ResilientConnection): Promise<ConnectionHealth> {
    try {
      const startTime = Date.now();
      const latency = await this.checkConnectionLatency(connection);
      const errorRate = await this.getErrorRate(connection);

      const status = this.determineHealthStatus(latency, errorRate);
      const health: ConnectionHealth = {
        status,
        lastCheck: new Date(),
        latency,
        errorRate,
        message: this.getStatusMessage(status, latency, errorRate),
      };

      return health;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to check health for connection ${connection.id}: ${errorMessage}`,
      );
      return {
        status: ConnectionHealthStatus.DISCONNECTED,
        lastCheck: new Date(),
        latency: Infinity,
        errorRate: 1.0,
        message: `Health check failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Check connection latency
   */
  private async checkConnectionLatency(connection: ResilientConnection): Promise<number> {
    const startTime = Date.now();

    try {
      // Simulate latency check based on connection method
      await this.simulateConnectionCheck(connection);
      const latency = Date.now() - startTime;

      // Update method stats
      connection.currentMethod.lastAttempt = new Date();
      if (latency < 1000) {
        connection.currentMethod.lastSuccess = new Date();
        connection.currentMethod.avgLatency =
          (connection.currentMethod.avgLatency + latency) / 2;
      }

      return latency;
    } catch (error) {
      return Infinity;
    }
  }

  /**
   * Get error rate for connection
   */
  private async getErrorRate(connection: ResilientConnection): Promise<number> {
    // In production, would calculate from actual error logs
    // Simulated for now
    const recentErrors = Math.floor(Math.random() * 5);
    const totalAttempts = 100;
    return recentErrors / totalAttempts;
  }

  /**
   * Determine health status based on metrics
   */
  private determineHealthStatus(
    latency: number,
    errorRate: number,
  ): ConnectionHealthStatus {
    if (errorRate > 0.5 || latency > 30000) {
      return ConnectionHealthStatus.DISCONNECTED;
    }

    if (errorRate > 0.3 || latency > 15000) {
      return ConnectionHealthStatus.FAILING;
    }

    if (errorRate > 0.1 || latency > 5000) {
      return ConnectionHealthStatus.DEGRADED;
    }

    return ConnectionHealthStatus.HEALTHY;
  }

  /**
   * Get status message
   */
  private getStatusMessage(
    status: ConnectionHealthStatus,
    latency: number,
    errorRate: number,
  ): string {
    switch (status) {
      case ConnectionHealthStatus.HEALTHY:
        return `Healthy (latency: ${Math.round(latency)}ms, error rate: ${(errorRate * 100).toFixed(1)}%)`;
      case ConnectionHealthStatus.DEGRADED:
        return `Degraded (latency: ${Math.round(latency)}ms, error rate: ${(errorRate * 100).toFixed(1)}%)`;
      case ConnectionHealthStatus.FAILING:
        return `Failing (latency: ${Math.round(latency)}ms, error rate: ${(errorRate * 100).toFixed(1)}%)`;
      case ConnectionHealthStatus.DISCONNECTED:
        return `Disconnected (latency: ${Math.round(latency)}ms, error rate: ${(errorRate * 100).toFixed(1)}%)`;
      default:
        return 'Unknown status';
    }
  }

  /**
   * Start periodic health check scheduler
   */
  private startHealthCheckScheduler(): void {
    interval(this.healthCheckInterval).subscribe(async () => {
      for (const [connectionId, connection] of this.activeConnections.entries()) {
        try {
          const health = await this.getHealthStatus(connection);
          connection.healthStatus = health;

          // Emit health update
          this.healthUpdates$.next({ connectionId, health });

          // Log significant status changes
          if (
            health.status === ConnectionHealthStatus.FAILING ||
            health.status === ConnectionHealthStatus.DISCONNECTED
          ) {
            this.logger.warn(
              `Connection ${connectionId} health degraded: ${health.message}`,
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Error during health check for ${connectionId}: ${errorMessage}`,
          );
        }
      }
    });
  }

  /**
   * Simulate connection check
   */
  private simulateConnectionCheck(connection: ResilientConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection check timeout'));
      }, 5000);

      // Simulate network latency
      const latency = Math.random() * 1000;
      setTimeout(() => {
        clearTimeout(timeout);

        // Simulate occasional failures (5% chance)
        if (Math.random() < 0.05) {
          reject(new Error('Connection check failed'));
        } else {
          resolve();
        }
      }, latency);
    });
  }

  /**
   * Get health stats for a connection
   */
  getHealthStats(connection: ResilientConnection): {
    uptime: number;
    lastFailure?: Date;
    consecutiveSuccesses: number;
  } {
    const uptime = connection.lastSuccessfulConnection
      ? Date.now() - connection.lastSuccessfulConnection.getTime()
      : 0;

    return {
      uptime,
      lastFailure: undefined,
      consecutiveSuccesses: connection.currentMethod.successRate > 0.8 ? 100 : 0,
    };
  }

  /**
   * Force health check on a connection
   */
  async forceHealthCheck(connection: ResilientConnection): Promise<ConnectionHealth> {
    this.logger.debug(`Force health check on connection ${connection.id}`);
    return this.getHealthStatus(connection);
  }
}
