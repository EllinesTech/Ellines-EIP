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
      this.logger.warn(
        `Failover attempt failed for ${connection.id}: ${error.message}`,
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
      this.logger.warn(`Connection test failed for method ${method.type}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  private async testApiConnection(method: ConnectionMethod): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('API connection timeout'));
      }, 5000);

      // Simulate API test
      setTimeout(() => {
        clearTimeout(timeout);
        if (Math.random() > 0.1) {
          resolve();
        } else {
          reject(new Error('API connection test failed'));
        }
      }, Math.random() * 2000);
    });
  }

  /**
   * Test database connection
   */
  private async testDatabaseConnection(method: ConnectionMethod): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 5000);

      // Simulate database test
      setTimeout(() => {
        clearTimeout(timeout);
        if (Math.random() > 0.1) {
          resolve();
        } else {
          reject(new Error('Database connection test failed'));
        }
      }, Math.random() * 1500);
    });
  }

  /**
   * Test file sync connection
   */
  private async testFileSyncConnection(method: ConnectionMethod): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('File sync connection timeout'));
      }, 10000);

      // Simulate file sync test
      setTimeout(() => {
        clearTimeout(timeout);
        if (Math.random() > 0.2) {
          resolve();
        } else {
          reject(new Error('File sync connection test failed'));
        }
      }, Math.random() * 3000);
    });
  }

  /**
   * Test screen scrape connection
   */
  private async testScreenScrapeConnection(method: ConnectionMethod): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Screen scrape connection timeout'));
      }, 15000);

      // Simulate screen scrape test
      setTimeout(() => {
        clearTimeout(timeout);
        if (Math.random() > 0.3) {
          resolve();
        } else {
          reject(new Error('Screen scrape connection test failed'));
        }
      }, Math.random() * 5000);
    });
  }

  /**
   * Test message queue connection
   */
  private async testMessageQueueConnection(method: ConnectionMethod): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message queue connection timeout'));
      }, 5000);

      // Simulate message queue test
      setTimeout(() => {
        clearTimeout(timeout);
        if (Math.random() > 0.1) {
          resolve();
        } else {
          reject(new Error('Message queue connection test failed'));
        }
      }, Math.random() * 2000);
    });
  }

  /**
   * Test webhook connection
   */
  private async testWebhookConnection(method: ConnectionMethod): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Webhook connection timeout'));
      }, 10000);

      // Simulate webhook test
      setTimeout(() => {
        clearTimeout(timeout);
        if (Math.random() > 0.15) {
          resolve();
        } else {
          reject(new Error('Webhook connection test failed'));
        }
      }, Math.random() * 2500);
    });
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
        this.logger.error(`Auto failover failed: ${error.message}`);
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
