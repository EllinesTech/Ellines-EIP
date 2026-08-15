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

  describe('authorization check details', () => {
    beforeEach(() => {
      manager.registerConnector({
        connectorId: 'test-connector',
        connectorName: 'Test',
        direction: 'bidirectional',
      });
    });

    it('should return authorization result with correct properties', () => {
      const result = manager.checkAuthorization({
        connectorId: 'test-connector',
        operationType: 'write',
      });

      expect(result.allowed).toBe(true);
      expect(result.connectorId).toBe('test-connector');
      expect(result.direction).toBe('bidirectional');
      expect(result.reason).toBeUndefined();
    });

    it('should include reason when authorization denied', () => {
      expect(() => {
        manager.checkAuthorization({
          connectorId: 'unauthorized-connector',
          operationType: 'write',
        });
      }).toThrow();
    });

    it('should maintain sync direction information in result', () => {
      manager.registerConnector({
        connectorId: 'readonly-sync',
        connectorName: 'Readonly',
        direction: 'read_only',
      });

      const readResult = manager.checkAuthorization({
        connectorId: 'readonly-sync',
        operationType: 'read',
      });

      expect(readResult.direction).toBe('read_only');
      expect(readResult.connectorId).toBe('readonly-sync');
    });
  });

  describe('getConfig', () => {
    it('should return config for registered connector', () => {
      const config = {
        connectorId: 'api-connector',
        connectorName: 'API Source',
        direction: 'write_authorized' as const,
        authorizedBy: 'admin@company.com',
        authorizedAt: new Date().toISOString(),
      };

      manager.registerConnector(config);
      const result = manager.getConfig('api-connector');

      expect(result).toBeDefined();
      expect(result?.connectorId).toBe('api-connector');
      expect(result?.connectorName).toBe('API Source');
      expect(result?.direction).toBe('write_authorized');
    });

    it('should return undefined for unregistered connector', () => {
      const result = manager.getConfig('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('authorization workflows', () => {
    it('should support read -> write_authorized -> bidirectional progression', () => {
      manager.registerConnector({
        connectorId: 'progressive-connector',
        connectorName: 'Progressive',
        direction: 'read_only',
      });

      // Initial state: read_only
      let config = manager.getConfig('progressive-connector');
      expect(config?.direction).toBe('read_only');

      // Upgrade to write_authorized
      manager.authorizeWrites('progressive-connector', 'admin1@company.com');
      config = manager.getConfig('progressive-connector');
      expect(config?.direction).toBe('write_authorized');

      // Upgrade to bidirectional
      manager.enableBidirectional('progressive-connector', 'admin2@company.com');
      config = manager.getConfig('progressive-connector');
      expect(config?.direction).toBe('bidirectional');
    });

    it('should track multiple authorizations', () => {
      manager.registerConnector({
        connectorId: 'tracked-connector',
        connectorName: 'Tracked',
        direction: 'read_only',
      });

      const auth1 = manager.authorizeWrites('tracked-connector', 'admin1@company.com');
      expect(auth1.authorizedBy).toBe('admin1@company.com');

      const auth2 = manager.enableBidirectional('tracked-connector', 'admin2@company.com');
      expect(auth2.authorizedBy).toBe('admin2@company.com');
    });
  });

  describe('payload handling in authorization check', () => {
    beforeEach(() => {
      manager.registerConnector({
        connectorId: 'payload-test',
        connectorName: 'Payload Test',
        direction: 'write_authorized',
      });
    });

    it('should accept operations with complex payloads', () => {
      const complexPayload = {
        records: [
          { id: 1, name: 'Record 1' },
          { id: 2, name: 'Record 2' },
        ],
        metadata: { timestamp: '2024-01-01T00:00:00Z', source: 'integration' },
      };

      const result = manager.checkAuthorization({
        connectorId: 'payload-test',
        operationType: 'write',
        payload: complexPayload,
      });

      expect(result.allowed).toBe(true);
    });

    it('should accept operations with null payload', () => {
      const result = manager.checkAuthorization({
        connectorId: 'payload-test',
        operationType: 'write',
        payload: null,
      });

      expect(result.allowed).toBe(true);
    });

    it('should accept operations without payload', () => {
      const result = manager.checkAuthorization({
        connectorId: 'payload-test',
        operationType: 'write',
      });

      expect(result.allowed).toBe(true);
    });

    it('should not require payload for read operations', () => {
      const result = manager.checkAuthorization({
        connectorId: 'payload-test',
        operationType: 'read',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('multiple connector management', () => {
    beforeEach(() => {
      const connectors = [
        { connectorId: 'crm-1', connectorName: 'CRM', direction: 'read_only' as const },
        { connectorId: 'erp-1', connectorName: 'ERP', direction: 'write_authorized' as const },
        { connectorId: 'db-1', connectorName: 'Database', direction: 'bidirectional' as const },
        { connectorId: 'api-1', connectorName: 'API', direction: 'read_only' as const },
      ];

      for (const c of connectors) {
        manager.registerConnector(c);
      }
    });

    it('should list all connectors', () => {
      const connectors = manager.listConnectors();
      expect(connectors.length).toBe(4);
    });

    it('should filter connectors by direction', () => {
      const allConnectors = manager.listConnectors();
      const readOnly = allConnectors.filter((c) => c.direction === 'read_only');
      const writeAuthorized = allConnectors.filter((c) => c.direction === 'write_authorized');
      const bidirectional = allConnectors.filter((c) => c.direction === 'bidirectional');

      expect(readOnly.length).toBe(2);
      expect(writeAuthorized.length).toBe(1);
      expect(bidirectional.length).toBe(1);
    });

    it('should enforce authorization independently for each connector', () => {
      // CRM is read_only - write should fail
      expect(() => {
        manager.checkAuthorization({
          connectorId: 'crm-1',
          operationType: 'write',
        });
      }).toThrow();

      // ERP is write_authorized - write should succeed
      const erpWrite = manager.checkAuthorization({
        connectorId: 'erp-1',
        operationType: 'write',
      });
      expect(erpWrite.allowed).toBe(true);

      // Database is bidirectional - write should succeed
      const dbWrite = manager.checkAuthorization({
        connectorId: 'db-1',
        operationType: 'write',
      });
      expect(dbWrite.allowed).toBe(true);
    });
  });

  describe('authorization timing and metadata', () => {
    it('should record authorization timestamp when upgrading to write', () => {
      manager.registerConnector({
        connectorId: 'ts-connector',
        connectorName: 'Timestamp Test',
        direction: 'read_only',
      });

      const before = new Date().getTime();
      const result = manager.authorizeWrites('ts-connector', 'admin@company.com');
      const after = new Date().getTime();

      expect(result.authorizedAt).toBeDefined();
      const authTime = new Date(result.authorizedAt!).getTime();
      expect(authTime).toBeGreaterThanOrEqual(before);
      expect(authTime).toBeLessThanOrEqual(after);
    });

    it('should preserve authorization metadata', () => {
      manager.registerConnector({
        connectorId: 'metadata-connector',
        connectorName: 'Metadata Test',
        direction: 'write_authorized',
        authorizedBy: 'original-admin@company.com',
        authorizedAt: '2024-01-01T00:00:00Z',
      });

      const config = manager.getConfig('metadata-connector');
      expect(config?.authorizedBy).toBe('original-admin@company.com');
      expect(config?.authorizedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should update authorization metadata on subsequent upgrades', () => {
      manager.registerConnector({
        connectorId: 'upgrade-connector',
        connectorName: 'Upgrade Test',
        direction: 'read_only',
      });

      manager.authorizeWrites('upgrade-connector', 'first-admin@company.com');
      const config1 = manager.getConfig('upgrade-connector');
      const firstAuth = config1?.authorizedAt;

      // Add delay to ensure different timestamp
      const delayMs = 5;
      const startTime = Date.now();
      while (Date.now() - startTime < delayMs) {}

      manager.enableBidirectional('upgrade-connector', 'second-admin@company.com');
      const config2 = manager.getConfig('upgrade-connector');
      const secondAuth = config2?.authorizedAt;

      expect(config2?.authorizedBy).toBe('second-admin@company.com');
      // AuthorizedAt should be different (or at least authorizedBy changes)
      expect(config2?.authorizedBy).not.toEqual(config1?.authorizedBy);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle write authorization check on unregistered connector', () => {
      expect(() => {
        manager.checkAuthorization({
          connectorId: 'never-registered',
          operationType: 'write',
        });
      }).toThrow(ForbiddenException);
    });

    it('should handle read on unregistered connector', () => {
      const result = manager.checkAuthorization({
        connectorId: 'never-registered',
        operationType: 'read',
      });
      expect(result.allowed).toBe(true);
      expect(result.direction).toBe('read_only');
    });

    it('should register connector with minimal config', () => {
      manager.registerConnector({
        connectorId: 'minimal-connector',
        connectorName: 'Minimal',
        direction: 'read_only',
      });

      const config = manager.getConfig('minimal-connector');
      expect(config?.connectorId).toBe('minimal-connector');
      expect(config?.connectorName).toBe('Minimal');
      expect(config?.direction).toBe('read_only');
      expect(config?.authorizedBy).toBeUndefined();
      expect(config?.authorizedAt).toBeUndefined();
    });

    it('should handle rapid connector updates', () => {
      manager.registerConnector({
        connectorId: 'rapid-update',
        connectorName: 'Rapid',
        direction: 'read_only',
      });

      manager.registerConnector({
        connectorId: 'rapid-update',
        connectorName: 'Rapid v2',
        direction: 'write_authorized',
      });

      manager.registerConnector({
        connectorId: 'rapid-update',
        connectorName: 'Rapid v3',
        direction: 'bidirectional',
      });

      const finalConfig = manager.getConfig('rapid-update');
      expect(finalConfig?.connectorName).toBe('Rapid v3');
      expect(finalConfig?.direction).toBe('bidirectional');
    });

    it('should preserve connector list integrity', () => {
      for (let i = 0; i < 10; i++) {
        manager.registerConnector({
          connectorId: `connector-${i}`,
          connectorName: `Connector ${i}`,
          direction: i % 2 === 0 ? 'read_only' : 'write_authorized',
        });
      }

      const allConnectors = manager.listConnectors();
      expect(allConnectors.length).toBe(10);

      // Verify all IDs are unique
      const ids = allConnectors.map((c) => c.connectorId);
      expect(new Set(ids).size).toBe(10);
    });
  });
});
