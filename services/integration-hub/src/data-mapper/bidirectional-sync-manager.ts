/**
 * BidirectionalSyncManager
 * Requirement 22.5: Bidirectional sync support with write authorization
 *
 * Tracks per-connector sync direction and enforces authorization
 * before any write/bidirectional operation is attempted.
 */

import { Injectable, Logger, ForbiddenException } from '@nestjs/common';

export type SyncDirection = 'read_only' | 'write_authorized' | 'bidirectional';

export interface ConnectorSyncConfig {
  connectorId: string;
  connectorName: string;
  direction: SyncDirection;
  authorizedBy?: string;
  authorizedAt?: string;
}

export interface SyncOperation {
  connectorId: string;
  operationType: 'read' | 'write';
  payload?: unknown;
}

export interface SyncAuthorizationResult {
  allowed: boolean;
  connectorId: string;
  direction: SyncDirection;
  reason?: string;
}

@Injectable()
export class BidirectionalSyncManager {
  private readonly logger = new Logger(BidirectionalSyncManager.name);

  /** In-memory registry; a real implementation would persist to DB */
  private readonly registry = new Map<string, ConnectorSyncConfig>();

  /**
   * Register or update a connector's sync configuration.
   */
  registerConnector(config: ConnectorSyncConfig): void {
    this.registry.set(config.connectorId, { ...config });
    this.logger.log(
      `Connector ${config.connectorId} registered with direction="${config.direction}"`,
    );
  }

  /**
   * Return the current sync config for a connector (undefined if not registered).
   */
  getConfig(connectorId: string): ConnectorSyncConfig | undefined {
    return this.registry.get(connectorId);
  }

  /**
   * List all registered connectors.
   */
  listConnectors(): ConnectorSyncConfig[] {
    return Array.from(this.registry.values());
  }

  /**
   * Check whether the requested operation is allowed.
   * Requirement 22.5 — enforce write authorization before writes.
   *
   * @throws ForbiddenException if a write is attempted on a read-only connector.
   */
  checkAuthorization(operation: SyncOperation): SyncAuthorizationResult {
    const config = this.registry.get(operation.connectorId);

    if (!config) {
      // Unknown connectors default to read-only for safety
      if (operation.operationType === 'write') {
        this.logger.warn(
          `Write blocked: connector ${operation.connectorId} not registered`,
        );
        throw new ForbiddenException(
          `Connector "${operation.connectorId}" is not registered. Write operations require explicit authorization.`,
        );
      }
      return { allowed: true, connectorId: operation.connectorId, direction: 'read_only' };
    }

    if (
      operation.operationType === 'write' &&
      config.direction === 'read_only'
    ) {
      this.logger.warn(
        `Write blocked: connector ${operation.connectorId} is read_only`,
      );
      throw new ForbiddenException(
        `Connector "${operation.connectorId}" is configured as read_only. Upgrade to write_authorized or bidirectional to enable writes.`,
      );
    }

    this.logger.debug(
      `Operation ${operation.operationType} authorized on connector ${operation.connectorId} (${config.direction})`,
    );

    return {
      allowed: true,
      connectorId: operation.connectorId,
      direction: config.direction,
    };
  }

  /**
   * Upgrade a connector to write-authorized.
   */
  authorizeWrites(connectorId: string, authorizedBy: string): ConnectorSyncConfig {
    const existing = this.registry.get(connectorId);
    const updated: ConnectorSyncConfig = {
      connectorId,
      connectorName: existing?.connectorName ?? connectorId,
      direction: 'write_authorized',
      authorizedBy,
      authorizedAt: new Date().toISOString(),
    };
    this.registry.set(connectorId, updated);
    this.logger.log(`Connector ${connectorId} authorized for writes by ${authorizedBy}`);
    return updated;
  }

  /**
   * Enable full bidirectional sync for a connector.
   */
  enableBidirectional(connectorId: string, authorizedBy: string): ConnectorSyncConfig {
    const existing = this.registry.get(connectorId);
    const updated: ConnectorSyncConfig = {
      connectorId,
      connectorName: existing?.connectorName ?? connectorId,
      direction: 'bidirectional',
      authorizedBy,
      authorizedAt: new Date().toISOString(),
    };
    this.registry.set(connectorId, updated);
    this.logger.log(`Connector ${connectorId} enabled for bidirectional sync by ${authorizedBy}`);
    return updated;
  }
}
