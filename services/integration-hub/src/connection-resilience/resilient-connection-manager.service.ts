import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ConnectionHealth,
  ConnectionMethod,
  ConnectionResult,
  DiscoveredConnectionMethods,
  FailoverResult,
  GeneratedConnectorCode,
  ResilientConnection,
  SystemIdentifier,
  ApprovalWorkflowStatus,
  ConnectionHealthStatus,
} from './types';
import { ConnectionMethodDiscoveryService } from './connection-method-discovery.service';
import { CodeGeneratorService } from './code-generator.service';
import { ConnectionHealthMonitorService } from './connection-health-monitor.service';
import { FailoverManagerService } from './failover-manager.service';
import { RedundancyRouterService } from './redundancy-router.service';
import { ApprovalWorkflowService } from './approval-workflow.service';

/**
 * ResilientConnectionManager — Main orchestrator for resilient connections
 * Coordinates all connection resilience services for unified connection management
 */
@Injectable()
export class ResilientConnectionManagerService {
  private readonly logger = new Logger(ResilientConnectionManagerService.name);
  private connections = new Map<string, ResilientConnection>();
  private connectionId = 0;

  constructor(
    private readonly discoveryService: ConnectionMethodDiscoveryService,
    private readonly codeGeneratorService: CodeGeneratorService,
    private readonly healthMonitorService: ConnectionHealthMonitorService,
    private readonly failoverManagerService: FailoverManagerService,
    private readonly routerService: RedundancyRouterService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
  ) {
    this.logger.log('ResilientConnectionManager initialized');
  }

  /**
   * Establish resilient connection to a system
   * Discovers connection methods, creates redundant pathways, and starts monitoring
   */
  async establishConnection(system: SystemIdentifier): Promise<ResilientConnection> {
    this.logger.log(`Establishing resilient connection to system: ${system.id}`);

    try {
      // Step 1: Discover available connection methods
      const discovered = await this.discoveryService.discoverConnectionMethods(system);

      if (discovered.availableMethods.length === 0) {
        throw new Error(
          `No connection methods discovered for system ${system.id}. Consider code generation.`,
        );
      }

      // Step 2: Create resilient connection with redundancy
      const connection: ResilientConnection = {
        id: this.generateConnectionId(),
        systemId: system.id,
        systemName: system.name,
        primaryMethod: discovered.recommendedMethod,
        backupMethods: discovered.fallbackMethods,
        currentMethod: discovered.recommendedMethod,
        healthStatus: {
          status: ConnectionHealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency: 0,
          errorRate: 0,
          message: 'Initial connection',
        },
        lastSuccessfulConnection: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Step 3: Start health monitoring
      this.healthMonitorService.monitorConnection(connection);

      // Step 4: Store connection
      this.connections.set(connection.id, connection);

      this.logger.log(
        `Successfully established resilient connection ${connection.id} with ${connection.backupMethods.length} backup methods`,
      );

      return connection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to establish connection to ${system.id}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Attempt alternative connection path establishment
   * Used when primary connection fails or degradation occurs
   */
  async attemptAlternativeConnection(connection: ResilientConnection): Promise<ConnectionResult> {
    this.logger.log(`Attempting alternative connection for ${connection.id}`);

    try {
      // Get current health status
      const health = await this.healthMonitorService.getHealthStatus(connection);

      // If healthy enough, return success
      if (health.status === ConnectionHealthStatus.HEALTHY) {
        return {
          success: true,
          method: connection.currentMethod,
          latency: health.latency,
          dataQuality: 1.0 - health.errorRate,
          timestamp: new Date(),
          recordsProcessed: 0,
        };
      }

      // Try failover to backup method
      const failoverResult = await this.failoverManagerService.attemptFailover(connection);

      return {
        success: true,
        method: failoverResult.newMethod,
        latency: failoverResult.latency,
        dataQuality: 0.9, // After failover, assume slightly reduced quality
        timestamp: new Date(),
        recordsProcessed: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Alternative connection attempt failed for ${connection.id}: ${errorMessage}`,
      );
      return {
        success: false,
        method: connection.currentMethod,
        latency: Infinity,
        dataQuality: 0,
        errorMessage: errorMessage,
        timestamp: new Date(),
        recordsProcessed: 0,
      };
    }
  }

  /**
   * Monitor connection health and emit status updates
   */
  monitorConnectionHealth(connectionId: string): Observable<ConnectionHealth> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    return this.healthMonitorService.monitorConnection(connection);
  }

  /**
   * Perform automatic failover when connection degrades
   */
  async failoverConnection(connectionId: string): Promise<FailoverResult> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    this.logger.log(`Initiating failover for connection ${connectionId}`);

    const result = await this.failoverManagerService.attemptFailover(connection);

    // Update connection object
    connection.currentMethod = result.newMethod;
    connection.updatedAt = new Date();

    this.logger.log(`Failover completed for connection ${connectionId}`);

    return result;
  }

  /**
   * Get optimal routing path for a connection
   * Uses priority-based routing with load balancing
   */
  getOptimalRoutingPath(connectionId: string): ConnectionMethod {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Route based on priority and performance
    return this.routerService.routeConnection(connection);
  }

  /**
   * Get load-balanced routing
   */
  getLoadBalancedRoute(connectionId: string): ConnectionMethod {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    return this.routerService.routeWithLoadBalancing(connection);
  }

  /**
   * Generate automatic connector code for unsupported systems
   */
  async generateConnectorCode(
    system: SystemIdentifier,
    methods?: ConnectionMethod[],
    language: 'typescript' | 'python' | 'java' = 'typescript',
  ): Promise<GeneratedConnectorCode> {
    this.logger.log(`Generating ${language} connector code for ${system.id}`);

    try {
      // If methods not provided, discover them
      if (!methods) {
        const discovered = await this.discoveryService.discoverConnectionMethods(system);
        methods = discovered.availableMethods;
      }

      if (methods.length === 0) {
        throw new Error(`No connection methods available for code generation for ${system.id}`);
      }

      const code = await this.codeGeneratorService.generateConnectorCode(system, methods, language);

      // Create approval request for generated connector
      const approvalRequest = await this.approvalWorkflowService.createApprovalRequest(
        system.id,
        code,
      );

      this.logger.log(
        `Generated connector code for ${system.id} - Approval request: ${approvalRequest.requestId}`,
      );

      return code;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate connector code for ${system.id}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Submit generated connector for IT admin approval
   */
  async submitConnectorForApproval(
    systemId: string,
    connectorCode: GeneratedConnectorCode,
    approverEmail: string,
  ): Promise<ApprovalWorkflowStatus> {
    this.logger.log(
      `Submitting generated connector ${systemId} for approval by ${approverEmail}`,
    );

    return this.approvalWorkflowService.submitForApproval(systemId, connectorCode, approverEmail);
  }

  /**
   * Approve generated connector by IT admin
   */
  async approveGeneratedConnector(
    approvalRequestId: string,
    approverEmail: string,
    notes?: string,
  ): Promise<ApprovalWorkflowStatus> {
    this.logger.log(
      `Approving generated connector request ${approvalRequestId} by ${approverEmail}`,
    );

    return this.approvalWorkflowService.approveRequest(approvalRequestId, approverEmail, notes);
  }

  /**
   * Reject generated connector
   */
  async rejectGeneratedConnector(
    approvalRequestId: string,
    approverEmail: string,
    rejectionReason: string,
  ): Promise<ApprovalWorkflowStatus> {
    this.logger.log(`Rejecting generated connector request ${approvalRequestId}`);

    return this.approvalWorkflowService.rejectRequest(
      approvalRequestId,
      approverEmail,
      rejectionReason,
    );
  }

  /**
   * Get all connections
   */
  getAllConnections(): ResilientConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): ResilientConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get connections by system
   */
  getConnectionsBySystem(systemId: string): ResilientConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.systemId === systemId);
  }

  /**
   * Close a connection and stop monitoring
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    this.logger.log(`Closing connection ${connectionId}`);

    // Stop monitoring
    this.healthMonitorService.stopMonitoring(connectionId);

    // Remove from registry
    this.connections.delete(connectionId);

    this.logger.log(`Connection ${connectionId} closed`);
  }

  /**
   * Get connection health status
   */
  async getConnectionHealth(connectionId: string): Promise<ConnectionHealth> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    return this.healthMonitorService.getHealthStatus(connection);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(connectionId: string): any {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    return {
      connectionId,
      systemId: connection.systemId,
      currentMethod: connection.currentMethod.type,
      healthStatus: connection.healthStatus.status,
      lastSuccessfulConnection: connection.lastSuccessfulConnection,
      backupMethodsAvailable: connection.backupMethods.length,
      failoverStats: this.failoverManagerService.getFailoverStats(connection),
      routingStats: this.routerService.getRoutingStats(connectionId),
    };
  }

  /**
   * Get approval workflow status
   */
  async getApprovalStatus(approvalRequestId: string): Promise<ApprovalWorkflowStatus> {
    return this.approvalWorkflowService.getApprovalStatus(approvalRequestId);
  }

  /**
   * Get pending approvals for IT admin
   */
  async getPendingApprovals(approverEmail?: string): Promise<ApprovalWorkflowStatus[]> {
    return this.approvalWorkflowService.getPendingApprovals(approverEmail);
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn-${this.connectionId++}-${Date.now()}`;
  }
}
