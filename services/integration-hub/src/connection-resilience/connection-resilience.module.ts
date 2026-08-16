import { Module } from '@nestjs/common';
import { ResilientConnectionManagerService } from './resilient-connection-manager.service';
import { ConnectionMethodDiscoveryService } from './connection-method-discovery.service';
import { CodeGeneratorService } from './code-generator.service';
import { ConnectionHealthMonitorService } from './connection-health-monitor.service';
import { FailoverManagerService } from './failover-manager.service';
import { RedundancyRouterService } from './redundancy-router.service';
import { ApprovalWorkflowService } from './approval-workflow.service';

/**
 * ConnectionResilienceModule
 * Provides resilient connection management with automatic failover and health monitoring
 */
@Module({
  providers: [
    ResilientConnectionManagerService,
    ConnectionMethodDiscoveryService,
    CodeGeneratorService,
    ConnectionHealthMonitorService,
    FailoverManagerService,
    RedundancyRouterService,
    ApprovalWorkflowService,
  ],
  exports: [ResilientConnectionManagerService],
})
export class ConnectionResilienceModule {}
