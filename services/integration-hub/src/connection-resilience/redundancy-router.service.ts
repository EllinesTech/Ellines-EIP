import { Injectable, Logger } from '@nestjs/common';
import { ConnectionMethod, ResilientConnection } from './types';

/**
 * RedundancyRouter Service
 * Routes connections based on priority and performance metrics
 */
@Injectable()
export class RedundancyRouterService {
  private readonly logger = new Logger(RedundancyRouterService.name);
  private connectionStats = new Map<string, ConnectionStats>();

  /**
   * Route connection based on priority and performance
   */
  routeConnection(connection: ResilientConnection): ConnectionMethod {
    this.logger.debug(`Routing connection: ${connection.id}`);

    // Get or initialize stats
    let stats = this.connectionStats.get(connection.id);
    if (!stats) {
      stats = this.initializeStats(connection);
      this.connectionStats.set(connection.id, stats);
    }

    // Try to use primary method first if healthy
    if (this.isMethodHealthy(connection.primaryMethod)) {
      return connection.primaryMethod;
    }

    // Find best performing backup method
    const bestMethod = this.selectBestMethod([
      connection.primaryMethod,
      ...connection.backupMethods,
    ]);

    if (bestMethod && this.isMethodHealthy(bestMethod)) {
      return bestMethod;
    }

    // Fall back to primary as last resort
    return connection.primaryMethod;
  }

  /**
   * Select best method based on metrics
   */
  private selectBestMethod(methods: ConnectionMethod[]): ConnectionMethod | null {
    if (methods.length === 0) {
      return null;
    }

    // Score each method
    const scored = methods.map((m) => ({
      method: m,
      score: this.scoreMethod(m),
    }));

    // Sort by score (higher is better)
    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.method || null;
  }

  /**
   * Score a connection method
   */
  private scoreMethod(method: ConnectionMethod): number {
    // Score based on:
    // - Success rate (weighted 50%)
    // - Priority (weighted 30%)
    // - Latency (weighted 20%, lower is better)

    const successRateScore = method.successRate * 50;
    const priorityScore = (method.priority / 100) * 30;
    const latencyScore = Math.max(0, (1 - method.avgLatency / 10000) * 20);

    return successRateScore + priorityScore + latencyScore;
  }

  /**
   * Check if method is considered healthy
   */
  private isMethodHealthy(method: ConnectionMethod): boolean {
    // Healthy if success rate > 80% and latency < 5s
    return method.successRate > 0.8 && method.avgLatency < 5000;
  }

  /**
   * Route with load balancing across healthy methods
   */
  routeWithLoadBalancing(connection: ResilientConnection): ConnectionMethod {
    const healthyMethods = [connection.primaryMethod, ...connection.backupMethods].filter((m) =>
      this.isMethodHealthy(m),
    );

    if (healthyMethods.length === 0) {
      return connection.primaryMethod;
    }

    // Round-robin selection among healthy methods
    let stats = this.connectionStats.get(connection.id);
    if (!stats) {
      stats = this.initializeStats(connection);
      this.connectionStats.set(connection.id, stats);
    }

    const selectedMethod = healthyMethods[stats.loadBalanceIndex % healthyMethods.length];
    stats.loadBalanceIndex++;

    return selectedMethod;
  }

  /**
   * Route based on latency optimization
   */
  routeForLowestLatency(methods: ConnectionMethod[]): ConnectionMethod {
    if (methods.length === 0) {
      throw new Error('No methods available');
    }

    return methods.reduce((best, current) =>
      current.avgLatency < best.avgLatency ? current : best,
    );
  }

  /**
   * Route based on reliability (highest success rate)
   */
  routeForHighestReliability(methods: ConnectionMethod[]): ConnectionMethod {
    if (methods.length === 0) {
      throw new Error('No methods available');
    }

    return methods.reduce((best, current) =>
      current.successRate > best.successRate ? current : best,
    );
  }

  /**
   * Route based on priority
   */
  routeByPriority(methods: ConnectionMethod[]): ConnectionMethod {
    if (methods.length === 0) {
      throw new Error('No methods available');
    }

    return methods.reduce((best, current) =>
      current.priority > best.priority ? current : best,
    );
  }

  /**
   * Update method performance
   */
  updateMethodPerformance(
    connectionId: string,
    method: ConnectionMethod,
    latency: number,
    success: boolean,
  ): void {
    // Update rolling average latency
    method.avgLatency = (method.avgLatency * 0.7 + latency * 0.3);

    // Update success rate
    const weight = 0.1;
    const successValue = success ? 1 : 0;
    method.successRate = method.successRate * (1 - weight) + successValue * weight;

    // Update last attempt
    method.lastAttempt = new Date();
    if (success) {
      method.lastSuccess = new Date();
    }

    this.logger.debug(
      `Updated ${method.type} performance: latency=${Math.round(method.avgLatency)}ms, success_rate=${(method.successRate * 100).toFixed(1)}%`,
    );
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(connectionId: string): RoutingStats {
    const stats = this.connectionStats.get(connectionId);

    if (!stats) {
      return {
        connectionId,
        totalRequests: 0,
        loadBalanceIndex: 0,
        lastRoute: undefined,
        methodStats: [],
      };
    }

    return {
      connectionId,
      totalRequests: stats.totalRequests,
      loadBalanceIndex: stats.loadBalanceIndex,
      lastRoute: stats.lastRoute,
      methodStats: stats.methodStats,
    };
  }

  /**
   * Initialize connection statistics
   */
  private initializeStats(connection: ResilientConnection): ConnectionStats {
    return {
      totalRequests: 0,
      loadBalanceIndex: 0,
      lastRoute: undefined,
      methodStats: [
        {
          methodId: connection.primaryMethod.id,
          type: connection.primaryMethod.type,
          requests: 0,
          successes: 0,
          failures: 0,
        },
        ...connection.backupMethods.map((m) => ({
          methodId: m.id,
          type: m.type,
          requests: 0,
          successes: 0,
          failures: 0,
        })),
      ],
    };
  }

  /**
   * Record route selection
   */
  recordRoute(connectionId: string, method: ConnectionMethod): void {
    let stats = this.connectionStats.get(connectionId);
    if (!stats) {
      return;
    }

    stats.totalRequests++;
    stats.lastRoute = {
      methodId: method.id,
      type: method.type,
      timestamp: new Date(),
    };

    // Update method stats
    const methodStat = stats.methodStats.find((m) => m.methodId === method.id);
    if (methodStat) {
      methodStat.requests++;
    }
  }

  /**
   * Record success
   */
  recordSuccess(connectionId: string, method: ConnectionMethod): void {
    let stats = this.connectionStats.get(connectionId);
    if (!stats) {
      return;
    }

    const methodStat = stats.methodStats.find((m) => m.methodId === method.id);
    if (methodStat) {
      methodStat.successes++;
    }
  }

  /**
   * Record failure
   */
  recordFailure(connectionId: string, method: ConnectionMethod): void {
    let stats = this.connectionStats.get(connectionId);
    if (!stats) {
      return;
    }

    const methodStat = stats.methodStats.find((m) => m.methodId === method.id);
    if (methodStat) {
      methodStat.failures++;
    }
  }

  /**
   * Clear statistics for a connection
   */
  clearStats(connectionId: string): void {
    this.connectionStats.delete(connectionId);
  }
}

interface ConnectionStats {
  totalRequests: number;
  loadBalanceIndex: number;
  lastRoute?: {
    methodId: string;
    type: string;
    timestamp: Date;
  };
  methodStats: MethodStatistic[];
}

interface MethodStatistic {
  methodId: string;
  type: string;
  requests: number;
  successes: number;
  failures: number;
}

interface RoutingStats {
  connectionId: string;
  totalRequests: number;
  loadBalanceIndex: number;
  lastRoute?: {
    methodId: string;
    type: string;
    timestamp: Date;
  };
  methodStats: MethodStatistic[];
}
