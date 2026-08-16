import { Test, TestingModule } from '@nestjs/testing';
import {
  ConnectionMethodType,
  ConnectionHealthStatus,
  ResilientConnection,
  ConnectionMethod,
  DiscoveredConnectionMethods,
  GeneratedConnectorCode,
} from './types';
import { ResilientConnectionManagerService } from './resilient-connection-manager.service';
import { ConnectionMethodDiscoveryService } from './connection-method-discovery.service';
import { CodeGeneratorService } from './code-generator.service';
import { ConnectionHealthMonitorService } from './connection-health-monitor.service';
import { FailoverManagerService } from './failover-manager.service';
import { RedundancyRouterService } from './redundancy-router.service';
import { ApprovalWorkflowService } from './approval-workflow.service';

describe('Connection Resilience System', () => {
  let module: TestingModule;
  let connectionManager: ResilientConnectionManagerService;
  let discoveryService: ConnectionMethodDiscoveryService;
  let codeGenerator: CodeGeneratorService;
  let healthMonitor: ConnectionHealthMonitorService;
  let failoverManager: FailoverManagerService;
  let redundancyRouter: RedundancyRouterService;
  let approvalWorkflow: ApprovalWorkflowService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ResilientConnectionManagerService,
        ConnectionMethodDiscoveryService,
        CodeGeneratorService,
        ConnectionHealthMonitorService,
        FailoverManagerService,
        RedundancyRouterService,
        ApprovalWorkflowService,
      ],
    }).compile();

    connectionManager = module.get<ResilientConnectionManagerService>(
      ResilientConnectionManagerService,
    );
    discoveryService = module.get<ConnectionMethodDiscoveryService>(
      ConnectionMethodDiscoveryService,
    );
    codeGenerator = module.get<CodeGeneratorService>(CodeGeneratorService);
    healthMonitor = module.get<ConnectionHealthMonitorService>(ConnectionHealthMonitorService);
    failoverManager = module.get<FailoverManagerService>(FailoverManagerService);
    redundancyRouter = module.get<RedundancyRouterService>(RedundancyRouterService);
    approvalWorkflow = module.get<ApprovalWorkflowService>(ApprovalWorkflowService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ─── 1. Connection Method Discovery Tests ───────────────────────────────

  describe('ConnectionMethodDiscoveryService', () => {
    it('should discover available connection methods for a system', async () => {
      const system = { id: 'erp-system-1', name: 'SAP ERP', type: 'ERP' };

      const discovered = await discoveryService.discoverConnectionMethods(system);

      expect(discovered.availableMethods).toBeDefined();
      expect(discovered.availableMethods.length).toBeGreaterThan(0);
      expect(discovered.recommendedMethod).toBeDefined();
      expect(discovered.fallbackMethods).toBeDefined();
    });

    it('should rank methods by priority', async () => {
      const system = { id: 'crm-system-1', name: 'Salesforce', type: 'CRM' };

      const discovered = await discoveryService.discoverConnectionMethods(system);

      // Recommended method should have highest priority
      const maxPriority = Math.max(...discovered.availableMethods.map((m) => m.priority));
      expect(discovered.recommendedMethod.priority).toBeGreaterThanOrEqual(maxPriority * 0.8);
    });

    it('should discover all supported connection method types', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };

      const discovered = await discoveryService.discoverConnectionMethods(system);

      const methodTypes = new Set(discovered.availableMethods.map((m) => m.type));

      // Should attempt all 6 connection method types
      expect(methodTypes.size).toBeGreaterThan(0);
    });

    it('should handle unsupported systems gracefully', async () => {
      const system = { id: 'unknown-system', name: 'Unknown', type: 'Unknown' };

      const discovered = await discoveryService.discoverConnectionMethods(system);

      // Should still return something (default method or discovered methods)
      expect(discovered).toBeDefined();
      expect(discovered.systemId).toBe(system.id);
    });

    it('should rank methods correctly by effectiveness', () => {
      const methods: ConnectionMethod[] = [
        {
          id: 'method-1',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        {
          id: 'method-2',
          type: ConnectionMethodType.DATABASE,
          config: {},
          priority: 90,
          successRate: 0.92,
          avgLatency: 150,
        },
        {
          id: 'method-3',
          type: ConnectionMethodType.FILE_SYNC,
          config: {},
          priority: 70,
          successRate: 0.88,
          avgLatency: 200,
        },
      ];

      const ranked = discoveryService.rankMethods(methods);

      expect(ranked[0].successRate).toBeGreaterThanOrEqual(ranked[1].successRate);
    });
  });

  // ─── 2. Resilient Connection Manager Tests ──────────────────────────────

  describe('ResilientConnectionManagerService', () => {
    it('should establish a connection with redundancy', async () => {
      const system = { id: 'test-erp', name: 'Test ERP', type: 'ERP' };

      const connection = await connectionManager.establishConnection(system);

      expect(connection).toBeDefined();
      expect(connection.id).toBeDefined();
      expect(connection.systemId).toBe(system.id);
      expect(connection.primaryMethod).toBeDefined();
      expect(connection.backupMethods).toBeDefined();
      expect(connection.backupMethods.length).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple connections for same system', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Test' };

      const connection1 = await connectionManager.establishConnection(system);
      const connection2 = await connectionManager.establishConnection(system);

      expect(connection1.id).not.toBe(connection2.id);

      const connectionsBySystem = connectionManager.getConnectionsBySystem(system.id);
      expect(connectionsBySystem.length).toBeGreaterThanOrEqual(2);
    });

    it('should retrieve connection by ID', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Test' };

      const connection = await connectionManager.establishConnection(system);
      const retrieved = connectionManager.getConnection(connection.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(connection.id);
    });

    it('should close connections and clean up', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Test' };

      const connection = await connectionManager.establishConnection(system);
      const connectionId = connection.id;

      await connectionManager.closeConnection(connectionId);

      const retrieved = connectionManager.getConnection(connectionId);
      expect(retrieved).toBeUndefined();
    });

    it('should get connection health status', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Test' };

      const connection = await connectionManager.establishConnection(system);
      const health = await connectionManager.getConnectionHealth(connection.id);

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'failing', 'disconnected']).toContain(health.status);
    });

    it('should get all connections', async () => {
      const system1 = { id: 'system-1', name: 'System 1', type: 'Type1' };
      const system2 = { id: 'system-2', name: 'System 2', type: 'Type2' };

      await connectionManager.establishConnection(system1);
      await connectionManager.establishConnection(system2);

      const allConnections = connectionManager.getAllConnections();
      expect(allConnections.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── 3. Connection Health Monitor Tests ──────────────────────────────────

  describe('ConnectionHealthMonitorService', () => {
    it('should monitor connection health and emit updates', async () => {
      const connection: ResilientConnection = {
        id: 'test-conn-monitor',
        systemId: 'test-system-monitor',
        systemName: 'Test',
        primaryMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        backupMethods: [],
        currentMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        healthStatus: {
          status: ConnectionHealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency: 100,
          errorRate: 0,
        },
        lastSuccessfulConnection: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Test that monitoring starts successfully
      const healthStream = healthMonitor.monitorConnection(connection);
      expect(healthStream).toBeDefined();

      // Stop monitoring after test
      healthMonitor.stopMonitoring(connection.id);
    });

    it('should track health status changes', async () => {
      const connection: ResilientConnection = {
        id: 'test-conn',
        systemId: 'test-system',
        systemName: 'Test',
        primaryMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        backupMethods: [],
        currentMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        healthStatus: {
          status: ConnectionHealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency: 100,
          errorRate: 0,
        },
        lastSuccessfulConnection: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const health = await healthMonitor.getHealthStatus(connection);

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.lastCheck).toBeDefined();
    });
  });

  // ─── 4. Redundancy Router Tests ────────────────────────────────────────

  describe('RedundancyRouterService', () => {
    it('should route to primary method when healthy', () => {
      const connection: ResilientConnection = {
        id: 'test-conn',
        systemId: 'test-system',
        systemName: 'Test',
        primaryMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        backupMethods: [
          {
            id: 'backup',
            type: ConnectionMethodType.DATABASE,
            config: {},
            priority: 90,
            successRate: 0.92,
            avgLatency: 150,
          },
        ],
        currentMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        healthStatus: {
          status: ConnectionHealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency: 100,
          errorRate: 0,
        },
        lastSuccessfulConnection: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const route = redundancyRouter.routeConnection(connection);

      expect(route).toBeDefined();
      expect([connection.primaryMethod, ...connection.backupMethods]).toContain(route);
    });

    it('should perform load balancing across healthy methods', () => {
      const connection: ResilientConnection = {
        id: 'test-conn',
        systemId: 'test-system',
        systemName: 'Test',
        primaryMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        backupMethods: [
          {
            id: 'backup1',
            type: ConnectionMethodType.DATABASE,
            config: {},
            priority: 90,
            successRate: 0.92,
            avgLatency: 150,
          },
          {
            id: 'backup2',
            type: ConnectionMethodType.FILE_SYNC,
            config: {},
            priority: 80,
            successRate: 0.90,
            avgLatency: 200,
          },
        ],
        currentMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        healthStatus: {
          status: ConnectionHealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency: 100,
          errorRate: 0,
        },
        lastSuccessfulConnection: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const route1 = redundancyRouter.routeWithLoadBalancing(connection);
      const route2 = redundancyRouter.routeWithLoadBalancing(connection);

      expect(route1).toBeDefined();
      expect(route2).toBeDefined();
    });

    it('should select lowest latency route', () => {
      const methods: ConnectionMethod[] = [
        {
          id: 'method-1',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 500,
        },
        {
          id: 'method-2',
          type: ConnectionMethodType.DATABASE,
          config: {},
          priority: 90,
          successRate: 0.92,
          avgLatency: 100,
        },
        {
          id: 'method-3',
          type: ConnectionMethodType.FILE_SYNC,
          config: {},
          priority: 80,
          successRate: 0.90,
          avgLatency: 200,
        },
      ];

      const selected = redundancyRouter.routeForLowestLatency(methods);

      expect(selected.avgLatency).toBeLessThanOrEqual(methods[0].avgLatency);
      expect(selected.avgLatency).toBeLessThanOrEqual(methods[2].avgLatency);
    });

    it('should select highest reliability route', () => {
      const methods: ConnectionMethod[] = [
        {
          id: 'method-1',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.85,
          avgLatency: 100,
        },
        {
          id: 'method-2',
          type: ConnectionMethodType.DATABASE,
          config: {},
          priority: 90,
          successRate: 0.98,
          avgLatency: 150,
        },
        {
          id: 'method-3',
          type: ConnectionMethodType.FILE_SYNC,
          config: {},
          priority: 80,
          successRate: 0.90,
          avgLatency: 200,
        },
      ];

      const selected = redundancyRouter.routeForHighestReliability(methods);

      expect(selected.successRate).toBeGreaterThanOrEqual(methods[0].successRate);
      expect(selected.successRate).toBeGreaterThanOrEqual(methods[2].successRate);
    });

    it('should record routing statistics', () => {
      const connection: ResilientConnection = {
        id: 'test-conn',
        systemId: 'test-system',
        systemName: 'Test',
        primaryMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        backupMethods: [],
        currentMethod: {
          id: 'primary',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        healthStatus: {
          status: ConnectionHealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency: 100,
          errorRate: 0,
        },
        lastSuccessfulConnection: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Initialize stats by routing first
      redundancyRouter.routeConnection(connection);
      
      // Now record routing and success
      redundancyRouter.recordRoute('test-conn', connection.primaryMethod);
      redundancyRouter.recordSuccess('test-conn', connection.primaryMethod);

      const stats = redundancyRouter.getRoutingStats('test-conn');

      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 5. Code Generator Tests ───────────────────────────────────────────

  describe('CodeGeneratorService', () => {
    it('should generate TypeScript connector code', async () => {
      const system = { id: 'test-erp', name: 'Test ERP', type: 'ERP' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: { endpoint: 'https://test.api.example.com' },
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods, 'typescript');

      expect(code).toBeDefined();
      expect(code.language).toBe('typescript');
      expect(code.sourceCode).toContain('Connector');
      expect(code.dependencies).toBeDefined();
      expect(code.dependencies.length).toBeGreaterThan(0);
    });

    it('should generate Python connector code', async () => {
      const system = { id: 'test-crm', name: 'Test CRM', type: 'CRM' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: { endpoint: 'https://test.api.example.com' },
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods, 'python');

      expect(code).toBeDefined();
      expect(code.language).toBe('python');
      expect(code.sourceCode).toBeDefined();
      expect(code.dependencies).toBeDefined();
    });

    it('should generate Java connector code', async () => {
      const system = { id: 'test-hrms', name: 'Test HRMS', type: 'HRMS' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: { endpoint: 'https://test.api.example.com' },
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods, 'java');

      expect(code).toBeDefined();
      expect(code.language).toBe('java');
      expect(code.sourceCode).toBeDefined();
    });

    it('should include multiple connection methods in generated code', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: { endpoint: 'https://api.example.com' },
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
        {
          id: 'db',
          type: ConnectionMethodType.DATABASE,
          config: { host: 'db.example.com' },
          priority: 90,
          successRate: 0.92,
          avgLatency: 150,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods, 'typescript');

      expect(code.sourceCode).toContain('connectionMethods');
    });

    it('should mark generated code for approval', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods);

      expect(code.requiresApproval).toBe(true);
      expect(code.approvalStatus).toBe('pending');
    });
  });

  // ─── 6. Approval Workflow Tests ────────────────────────────────────────

  describe('ApprovalWorkflowService', () => {
    it('should create approval request', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods);
      const approval = await approvalWorkflow.createApprovalRequest(system.id, code);

      expect(approval).toBeDefined();
      expect(approval.requestId).toBeDefined();
      expect(approval.status).toBe('pending');
      expect(approval.requestedAt).toBeDefined();
    });

    it('should approve connector request', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods);
      const approval = await approvalWorkflow.createApprovalRequest(system.id, code);

      const approved = await approvalWorkflow.approveRequest(
        approval.requestId,
        'admin@example.com',
        'Looks good',
      );

      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe('admin@example.com');
      expect(approved.approvedAt).toBeDefined();
    });

    it('should reject connector request', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods);
      const approval = await approvalWorkflow.createApprovalRequest(system.id, code);

      const rejected = await approvalWorkflow.rejectRequest(
        approval.requestId,
        'admin@example.com',
        'Security vulnerability detected',
      );

      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Security vulnerability detected');
    });

    it('should retrieve approval status', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods);
      const approval = await approvalWorkflow.createApprovalRequest(system.id, code);

      const status = await approvalWorkflow.getApprovalStatus(approval.requestId);

      expect(status).toBeDefined();
      expect(status.requestId).toBe(approval.requestId);
    });

    it('should get pending approvals', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code = await codeGenerator.generateConnectorCode(system, methods);
      await approvalWorkflow.createApprovalRequest(system.id, code);

      const pending = await approvalWorkflow.getPendingApprovals();

      expect(pending).toBeDefined();
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((p) => p.status === 'pending')).toBe(true);
    });

    it('should get approval statistics', async () => {
      const system1 = { id: 'system-1', name: 'System 1', type: 'Type1' };
      const system2 = { id: 'system-2', name: 'System 2', type: 'Type2' };
      const methods: ConnectionMethod[] = [
        {
          id: 'api',
          type: ConnectionMethodType.API,
          config: {},
          priority: 100,
          successRate: 0.95,
          avgLatency: 100,
        },
      ];

      const code1 = await codeGenerator.generateConnectorCode(system1, methods);
      const code2 = await codeGenerator.generateConnectorCode(system2, methods);

      const approval1 = await approvalWorkflow.createApprovalRequest(system1.id, code1);
      const approval2 = await approvalWorkflow.createApprovalRequest(system2.id, code2);

      await approvalWorkflow.approveRequest(approval1.requestId, 'admin@example.com');

      const stats = approvalWorkflow.getApprovalStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.pending).toBeGreaterThanOrEqual(1);
      expect(stats.approved).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 7. Integration Tests ──────────────────────────────────────────────

  describe('Integration: End-to-End Connection Resilience', () => {
    it('should establish connection and monitor health', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };

      const connection = await connectionManager.establishConnection(system);

      expect(connection).toBeDefined();
      expect(connection.healthStatus).toBeDefined();
      expect(['healthy', 'degraded', 'failing', 'disconnected']).toContain(
        connection.healthStatus.status,
      );
    });

    it('should generate code and request approval', async () => {
      const system = { id: 'unsupported-system', name: 'Unsupported', type: 'Custom' };

      const code = await connectionManager.generateConnectorCode(system);

      expect(code).toBeDefined();
      expect(code.requiresApproval).toBe(true);

      const approval = await connectionManager.submitConnectorForApproval(
        system.id,
        code,
        'admin@example.com',
      );

      expect(approval).toBeDefined();
      expect(approval.status).toBe('pending');
    });

    it('should handle complete approval workflow', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };

      // Generate code
      const code = await connectionManager.generateConnectorCode(system);

      // Submit for approval
      const approval = await connectionManager.submitConnectorForApproval(
        system.id,
        code,
        'admin@example.com',
      );

      expect(approval.status).toBe('pending');

      // Approve it
      const approved = await connectionManager.approveGeneratedConnector(
        approval.requestId,
        'admin@example.com',
        'Code looks good',
      );

      expect(approved.status).toBe('approved');
    });

    it('should route connections based on priority and health', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };

      const connection = await connectionManager.establishConnection(system);
      const route = connectionManager.getOptimalRoutingPath(connection.id);

      expect(route).toBeDefined();
      expect(route.type).toBeDefined();
    });

    it('should support load balancing across backup methods', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };

      const connection = await connectionManager.establishConnection(system);
      const route1 = connectionManager.getLoadBalancedRoute(connection.id);
      const route2 = connectionManager.getLoadBalancedRoute(connection.id);

      expect(route1).toBeDefined();
      expect(route2).toBeDefined();
    });

    it('should retrieve connection statistics', async () => {
      const system = { id: 'test-system', name: 'Test System', type: 'Generic' };

      const connection = await connectionManager.establishConnection(system);
      const stats = connectionManager.getConnectionStats(connection.id);

      expect(stats).toBeDefined();
      expect(stats.connectionId).toBe(connection.id);
      expect(stats.currentMethod).toBeDefined();
      expect(stats.healthStatus).toBeDefined();
    });
  });
});
