import { Injectable, Logger } from '@nestjs/common';
import {
  InFlightActionRegistry,
  ResourceReference,
  ConflictDetectionResult,
  AgentActionType,
} from '../types';
import { v4 as uuid } from 'uuid';

/**
 * Agent Coordinator
 * Prevents conflicting actions between concurrent agents on the same resources
 */
@Injectable()
export class AgentCoordinator {
  private readonly logger = new Logger(AgentCoordinator.name);
  private inFlightRegistry: Map<string, InFlightActionRegistry> = new Map();
  private readonly DEFAULT_LOCK_TIMEOUT_MS = 300000; // 5 minutes

  /**
   * Register an action about to execute
   */
  registerInFlightAction(
    agentId: string,
    actionId: string,
    targetResource: ResourceReference,
    lockTimeoutMs: number = this.DEFAULT_LOCK_TIMEOUT_MS,
  ): InFlightActionRegistry {
    const registryEntry: InFlightActionRegistry = {
      agentId,
      actionId,
      targetResource,
      startTime: new Date(),
      lockTimeout: lockTimeoutMs,
      executingAgent: agentId,
    };

    const registryKey = this.getRegistryKey(targetResource);
    const existingEntry = this.inFlightRegistry.get(registryKey);

    if (existingEntry && !this.isLockExpired(existingEntry)) {
      throw new Error(
        `Resource locked by agent ${existingEntry.agentId}: ${registryKey}`,
      );
    }

    this.inFlightRegistry.set(registryKey, registryEntry);
    this.logger.debug(
      `Registered action ${actionId} for agent ${agentId} on ${registryKey}`,
    );

    return registryEntry;
  }

  /**
   * Unregister completed action
   */
  unregisterInFlightAction(
    actionId: string,
    targetResource: ResourceReference,
  ): void {
    const registryKey = this.getRegistryKey(targetResource);
    const entry = this.inFlightRegistry.get(registryKey);

    if (entry && entry.actionId === actionId) {
      this.inFlightRegistry.delete(registryKey);
      this.logger.debug(`Unregistered action ${actionId} on ${registryKey}`);
    }
  }

  /**
   * Detect conflicts for proposed action
   */
  async detectConflicts(
    actionId: string,
    targetResource: ResourceReference,
    agentId: string,
    action Type: AgentActionType,
  ): Promise<ConflictDetectionResult> {
    const registryKey = this.getRegistryKey(targetResource);
    const inFlightAction = this.inFlightRegistry.get(registryKey);

    // Clean up expired locks
    if (inFlightAction && this.isLockExpired(inFlightAction)) {
      this.inFlightRegistry.delete(registryKey);
      return {
        hasConflict: false,
        conflictingActions: [],
        severity: 'low',
        recommendedAction: 'parallel',
      };
    }

    if (!inFlightAction) {
      return {
        hasConflict: false,
        conflictingActions: [],
        severity: 'low',
        recommendedAction: 'parallel',
      };
    }

    // Conflict exists
    if (inFlightAction.agentId === agentId) {
      // Same agent - allow parallel execution
      return {
        hasConflict: false,
        conflictingActions: [],
        severity: 'low',
        recommendedAction: 'parallel',
      };
    }

    // Different agents on same resource
    const isWriteConflict = this.isWriteOperation(actionType);
    const isExistingWrite = inFlightAction.targetResource.operationType === 'write';

    if (isWriteConflict || isExistingWrite) {
      // Write-write or read-write conflict
      return {
        hasConflict: true,
        conflictingActions: [inFlightAction],
        severity: 'high',
        recommendedAction: 'defer',
      };
    }

    // Read-read is allowed
    return {
      hasConflict: false,
      conflictingActions: [],
      severity: 'low',
      recommendedAction: 'parallel',
    };
  }

  /**
   * Check if action type is write operation
   */
  private isWriteOperation(actionType: AgentActionType): boolean {
    const writeOps: AgentActionType[] = [
      'create_record',
      'update_record',
      'delete_record',
      'approve_request',
    ];
    return writeOps.includes(actionType);
  }

  /**
   * Get registry key for resource
   */
  private getRegistryKey(resource: ResourceReference): string {
    return `${resource.systemId}:${resource.entityType}:${resource.entityId}`;
  }

  /**
   * Check if lock is expired
   */
  private isLockExpired(entry: InFlightActionRegistry): boolean {
    const ageMs = new Date().getTime() - entry.startTime.getTime();
    return ageMs > entry.lockTimeout;
  }

  /**
   * Force release lock (admin only)
   */
  forceReleaseLock(targetResource: ResourceReference): void {
    const registryKey = this.getRegistryKey(targetResource);
    this.inFlightRegistry.delete(registryKey);
    this.logger.warn(
      `Force released lock on ${registryKey}`,
    );
  }

  /**
   * Get all in-flight actions
   */
  getInFlightActions(): InFlightActionRegistry[] {
    // Clean expired entries first
    const now = new Date();
    const expired: string[] = [];

    for (const [key, entry] of this.inFlightRegistry.entries()) {
      if (this.isLockExpired(entry)) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.inFlightRegistry.delete(key);
    }

    return Array.from(this.inFlightRegistry.values());
  }

  /**
   * Get in-flight actions for specific agent
   */
  getAgentInFlightActions(agentId: string): InFlightActionRegistry[] {
    return Array.from(this.inFlightRegistry.values()).filter(
      (a) => a.agentId === agentId,
    );
  }

  /**
   * Get conflicts for resource
   */
  getResourceConflicts(targetResource: ResourceReference): InFlightActionRegistry[] {
    const registryKey = this.getRegistryKey(targetResource);
    const entry = this.inFlightRegistry.get(registryKey);
    return entry && !this.isLockExpired(entry) ? [entry] : [];
  }
}
