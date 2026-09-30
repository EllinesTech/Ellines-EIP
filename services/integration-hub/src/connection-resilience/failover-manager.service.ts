import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectionHealthStatus,
  ConnectionMethod,
  FailoverResult,
  ResilientConnection,
} from './types';

/**
 * FailoverManager Service
 * Manages automatic failover between connection methods
 */
@Injectable()
export class FailoverManagerService {
  private readonly logger = new Logger(FailoverManagerService.name);
  private failoverAttempts = new Map<string, number>();
  private readonly maxFailoverAttempts = 3;
  private readonly failoverResetTimeout = 60000; // 1 minute

  /**
   * Attempt failover to backup connection method
   */
  async attemptFailover(connection: ResilientConnection): Promise<FailoverResult> {
    this.logger.log(`Attempting failover for connection: ${connection.id}`);

    const failoverAttempt = this.failoverAttempts.get(connection.id) || 0;

    if (failoverAttempt >= this.maxFailoverAttempts) {
      this.logger.error(
        `Max failover attempts (${this.maxFailoverAttempts}) exceeded for ${connection.id}`,
      );
      throw new Error(`Max failover attempts exceeded for connection ${connection.id}`);
    }

    const currentMethodIndex = connection.backupMethods.indexOf(connection.currentMethod);
    const nextMethodIndex = currentMethodIndex + 1;

    if (nextMethodIndex >= connection.backupMethods.length) {
      this.logger.error(`No more backup methods available for ${connection.id}`);
      throw new Error(`No more backup methods available for connection ${connection.id}`);
    }

    const previousMethod = connection.currentMethod;
    const newMethod = connection.backupMethods[nextMethodIndex];

    try {
      const startTime = Date.now();
      await this.testConnectionMethod(connection, newMethod);
      const latency = Date.now() - startTime;

      // Update connection to use new method
      connection.currentMethod = newMethod;
      connection.lastSuccessfulConnection = new Date();

      // Update failover stats
      this.failoverAttempts.set(connection.id, failoverAttempt + 1);

      this.logger.log(
        `Failover successful for ${connection.id}: ${previousMethod.type} -> ${newMethod.type}`,
      );

      return {
        success: true,
        previousMethod,
        newMethod,
        latency,
        message: `Failover successful from ${previousMethod.type} to ${newMethod.type}`,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failover attempt failed for ${connection.id}: ${errorMessage}`,
      );

      // Increment failover attempts
      this.failoverAttempts.set(connection.id, failoverAttempt + 1);

      // Try next method recursively
      if (nextMethodIndex + 1 < connection.backupMethods.length) {
        return this.attemptFailover(connection);
      } else {
        throw new Error(`All failover methods exhausted for connection ${connection.id}`);
      }
    }
  }

  /**
   * Test a connection method
   */
  private async testConnectionMethod(
    connection: ResilientConnection,
    method: ConnectionMethod,
  ): Promise<void> {
    this.logger.debug(`Testing connection method: ${method.type}`);

    try {
      // Simulate connection test based on method type
      switch (method.type) {
        case 'api':
          await this.testApiConnection(method);
          break;
        case 'database':
          await this.testDatabaseConnection(method);
          break;
        case 'file_sync':
          await this.testFileSyncConnection(method);
          break;
        case 'screen_scrape':
          await this.testScreenScrapeConnection(method);
          break;
        case 'message_queue':
          await this.testMessageQueueConnection(method);
          break;
        case 'webhook':
          await this.testWebhookConnection(method);
          break;
        default:
          throw new Error(`Unknown connection method type: ${method.type}`);
      }

      this.logger.debug(`Connection test passed for method: ${method.type}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Connection test failed for method ${method.type}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Test API connection.
   *
   * Performs a REAL HTTP request against the configured endpoint. There is no
   * random outcome: the result is whatever the target system actually returned.
   * A failed probe must fail, because failover decisions drive real traffic.
   */
  private async testApiConnection(method: ConnectionMethod): Promise<void> {
    const config = (method as { config?: Record<string, unknown> }).config ?? {};
    const endpoint = String(config.endpoint ?? config.url ?? '').trim();
    if (!endpoint) {
      throw new Error('API connection test failed: no endpoint is configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(endpoint, { method: 'GET', signal: controller.signal });
      if (!res.ok) {
        throw new Error(`API connection test failed: HTTP ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('API connection timeout');
      }
      throw err instanceof Error
        ? err
        : new Error('API connection test failed');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Test database connection.
   *
   * No database driver is wired in this service, so the connection cannot be
   * verified. Failover must not act on a fabricated "pass", so this fails
   * closed and says why.
   */
  private async testDatabaseConnection(_method: ConnectionMethod): Promise<void> {
    throw new Error(
      'Database connection cannot be verified: no database client is configured in this service. Failing closed rather than assuming a healthy connection.',
    );
  }

  /** No file-transfer client is wired; fail closed instead of guessing. */
  private async testFileSyncConnection(_method: ConnectionMethod): Promise<void> {
    throw new Error(
      'File sync connection cannot be verified: no file transfer client is configured in this service.',
    );
  }

  /** No browser client is wired; fail closed instead of guessing. */
  private async testScreenScrapeConnection(_method: ConnectionMethod): Promise<void> {
    throw new Error(
      'Screen scrape connection cannot be verified: no browser session client is configured in this service.',
    );
  }

  /** No queue client is wired; fail closed instead of guessing. */
  private async testMessageQueueConnection(_method: ConnectionMethod): Promise<void> {
    throw new Error(
      'Message queue connection cannot be verified: no broker client is configured in this service.',
    );
  }

  /** No outbound registration client is wired; fail closed instead of guessing. */
  private async testWebhookConnection(_method: ConnectionMethod): Promise<void> {
    throw new Error(
      'Webhook connection cannot be verified: no outbound registration client is configured in this service.',
    );
  }

  /**
   * Reset failover attempts after timeout
   */
  resetFailoverAttempts(connectionId: string): void {
    this.logger.debug(`Resetting failover attempts for connection: ${connectionId}`);
    this.failoverAttempts.delete(connectionId);
  }

  /**
   * Get failover attempt count
   */
  getFailoverAttemptCount(connectionId: string): number {
    return this.failoverAttempts.get(connectionId) || 0;
  }

  /**
   * Automatically failover based on health status
   */
  async autoFailoverIfNeeded(connection: ResilientConnection): Promise<FailoverResult | null> {
    if (
      connection.healthStatus.status === ConnectionHealthStatus.FAILING ||
      connection.healthStatus.status === ConnectionHealthStatus.DISCONNECTED
    ) {
      try {
        return await this.attemptFailover(connection);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Auto failover failed: ${errorMessage}`);
        return null;
      }
    }

    return null;
  }

  /**
   * Get available backup methods
   */
  getAvailableBackupMethods(connection: ResilientConnection): ConnectionMethod[] {
    const currentIndex = connection.backupMethods.indexOf(connection.currentMethod);
    return connection.backupMethods.slice(currentIndex + 1);
  }

  /**
   * Get failover statistics
   */
  getFailoverStats(connection: ResilientConnection): {
    totalAttempts: number;
    maxAttempts: number;
    availableMethods: number;
  } {
    return {
      totalAttempts: this.getFailoverAttemptCount(connection.id),
      maxAttempts: this.maxFailoverAttempts,
      availableMethods: this.getAvailableBackupMethods(connection).length,
    };
  }
}
