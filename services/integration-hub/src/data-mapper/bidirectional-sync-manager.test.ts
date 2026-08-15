/**
 * BidirectionalSyncManager Unit Tests
 * Requirement 22.5: Bidirectional sync with write authorization
 */

import { ForbiddenException } from '@nestjs/common';
import { BidirectionalSyncManager, SyncDirection } from './bidirectional-sync-manager';

describe('BidirectionalSyncManager', () => {
  let manager: BidirectionalSyncManager;

  beforeEach(() => {
    manager = new BidirectionalSyncManager();
  });

  describe('registerConnector', () => {
    it('should register a connector with read_only direction', () => {
      manager.registerConnector({
        connectorId: 'crm-1',
        connectorName: 'Salesforce CRM',
        direction: 'read_only',
      });

      const config = manager.getConfig('crm-1');
      expect(config?.direction).toBe('read_only');
    });

    it('should register a connector with write_authorized direction', () => {
      manager.registerConnector({
        connectorId: 'erp-1',
        connectorName: 'SAP ERP',
        direction: 'write_authorized',
        authorizedBy: 'admin@company.com',
        authorizedAt: new Date().toISOString(),
      });

      const config = manager.getConfig('erp-1');
      expect(config?.direction).toBe('write_authorized');
      expect(config?.authorizedBy).toBe('admin@company.com');
    });

    it('should register a connector with bidirectional direction', () => {
      manager.registerConnector({
        connectorId: 'db-1',
        connectorName: 'PostgreSQL',
        direction: 'bidirectional',
      });

      const config = manager.getConfig('db-1');
      expect(config?.direction).toBe('bidirectional');
    });

    it('should update existing connector registration', () => {
      manager.registerConnector({
        connectorId: 'api-1',
        connectorName: 'API v1',
        direction: 'read_only',
      });

      manager.registerConnector({
        connectorId: 'api-1',
        connectorName: 'API v1',
        direction: 'write_authorized',
        authorizedBy: 'admin@company.com',
      });

      const config = manager.getConfig('api-1');
      expect(config?.direction).toBe('write_authorized');
    });
  });

  describe('checkAuthorization', () => {
    beforeEach(() => {
      manager.registerConnector({
        connectorId: 'readonly-connector',
        connectorName: 'Read-Only Source',
        direction: 'read_only',
      });
      manager.registerConnector({
        connectorId: 'write-connector',
        connectorName: 'Writable Target',
        direction: 'write_authorized',
      });
      manager.registerConnector({
        connectorId: 'bidir-connector',
        connectorName: 'Bidirectional',
        direction: 'bidirectional',
      });
    });

    it('should allow read operations on read_only connectors', () => {
      const result = manager.checkAuthorization({
        connectorId: 'readonly-connector',
        operationType: 'read',
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny write operations on read_only connectors', () => {
      expect(() => {
        manager.checkAuthorization({
          connectorId: 'readonly-connector',
          operationType: 'write',
          payload: { data: 'test' },
        });
      }).toThrow(ForbiddenException);
    });

    it('should allow both read and write on write_authorized connectors', () => {
      const readResult = manager.checkAuthorization({
        connectorId: 'write-connector',
        operationType: 'read',
      });
      expect(readResult.allowed).toBe(true);

      const writeResult = manager.checkAuthorization({
        connectorId: 'write-connector',
        operationType: 'write',
        payload: { data: 'test' },
      });
      expect(writeResult.allowed).toBe(true);
    });

    it('should allow both read and write on bidirectional connectors', () => {
      const readResult = manager.checkAuthorization({
        connectorId: 'bidir-connector',
        operationType: 'read',
      });
      expect(readResult.allowed).toBe(true);

      const writeResult = manager.checkAuthorization({
        connectorId: 'bidir-connector',
        operationType: 'write',
        payload: { data: 'test' },
      });
      expect(writeResult.allowed).toBe(true);
    });

    it('should deny write on unregistered connectors', () => {
      expect(() => {
        manager.checkAuthorization({
          connectorId: 'unknown-connector',
          operationType: 'write',
        });
      }).toThrow(ForbiddenException);
    });

    it('should allow read on unregistered connectors', () => {
      const result = manager.checkAuthorization({
        connectorId: 'unknown-connector',
        operationType: 'read',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('listConnectors', () => {
    it('should return empty list when no connectors registered', () => {
      const connectors = manager.listConnectors();
      expect(connectors).toEqual([]);
    });

    it('should return all registered connectors', () => {
      manager.registerConnector({
        connectorId: 'conn-1',
        connectorName: 'Connector 1',
        direction: 'read_only',
      });
      manager.registerConnector({
        connectorId: 'conn-2',
        connectorName: 'Connector 2',
        direction: 'write_authorized',
      });

      const connectors = manager.listConnectors();
      expect(connectors.length).toBe(2);
      expect(connectors.some((c) => c.connectorId === 'conn-1')).toBe(true);
      expect(connectors.some((c) => c.connectorId === 'conn-2')).toBe(true);
    });
  });

  describe('authorizeWrites', () => {
    it('should upgrade connector to write_authorized', () => {
      manager.registerConnector({
        connectorId: 'api-1',
        connectorName: 'API',
        direction: 'read_only',
      });

      const result = manager.authorizeWrites('api-1', 'admin@company.com');
      expect(result.direction).toBe('write_authorized');
      expect(result.authorizedBy).toBe('admin@company.com');
    });

    it('should set authorization timestamp', () => {
      manager.registerConnector({
        connectorId: 'api-2',
        connectorName: 'API 2',
        direction: 'read_only',
      });

      const result = manager.authorizeWrites('api-2', 'admin@company.com');
      expect(result.authorizedAt).toBeDefined();
    });
  });

  describe('enableBidirectional', () => {
    it('should enable bidirectional sync', () => {
      manager.registerConnector({
        connectorId: 'db-1',
        connectorName: 'Database',
        direction: 'read_only',
      });

      const result = manager.enableBidirectional('db-1', 'admin@company.com');
      expect(result.direction).toBe('bidirectional');
      expect(result.authorizedBy).toBe('admin@company.com');
    });
  });
});
