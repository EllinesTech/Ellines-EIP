/**
 * IntelligentDataMapperService Integration Tests
 * Requirements 22.4 – 22.6: Complete data mapping, field suggestion, bidirectional sync, conflict resolution
 */

import { IntelligentDataMapperService } from './intelligent-data-mapper.service';
import { SchemaDetector } from './schema-detector';
import { FieldSuggestionEngine } from './field-suggestion-engine';
import { BidirectionalSyncManager } from './bidirectional-sync-manager';
import { ConflictResolver } from './conflict-resolver';

describe('IntelligentDataMapperService', () => {
  let service: IntelligentDataMapperService;
  let schemaDetector: SchemaDetector;
  let fieldSuggestionEngine: FieldSuggestionEngine;
  let bidirectionalSyncManager: BidirectionalSyncManager;
  let conflictResolver: ConflictResolver;

  beforeEach(() => {
    schemaDetector = new SchemaDetector();
    fieldSuggestionEngine = new FieldSuggestionEngine();
    bidirectionalSyncManager = new BidirectionalSyncManager();
    conflictResolver = new ConflictResolver();

    service = new IntelligentDataMapperService(
      schemaDetector,
      fieldSuggestionEngine,
      bidirectionalSyncManager,
      conflictResolver,
    );
  });

  describe('complete mapping workflow', () => {
    it('should detect schema from source records', () => {
      const sourceRecords = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ];

      const schema = service.detectSchema(sourceRecords);
      expect(schema.recordCount).toBe(2);
      expect(schema.fields.length).toBe(4);
      expect(schema.fields.map((f) => f.name)).toContain('id');
      expect(schema.fields.map((f) => f.name)).toContain('firstName');
    });

    it('should suggest field mappings between source and target schemas', () => {
      const sourceRecords = [
        { user_id: 1, user_name: 'John', email_address: 'john@example.com' },
        { user_id: 2, user_name: 'Jane', email_address: 'jane@example.com' },
      ];

      const targetRecords = [
        { userId: 100, firstName: 'Alice', email: 'alice@example.com' },
        { userId: 101, firstName: 'Bob', email: 'bob@example.com' },
      ];

      const result = service.suggestMappings(sourceRecords, targetRecords);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].confidence).toBeGreaterThanOrEqual(0);
      expect(result.suggestions[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should suggest mapping with context hints', () => {
      const sourceRecords = [{ empId: 1, empName: 'John' }];
      const targetRecords = [{ employee_id: 100, name: 'Alice' }];

      const result = service.suggestMappings(sourceRecords, targetRecords, [
        { sourceField: 'empId', targetField: 'employee_id', bonus: 0.3 },
        { sourceField: 'empName', targetField: 'name', bonus: 0.2 },
      ]);

      expect(result.suggestions.length).toBe(4); // All combinations
      const mappedSuggestions = result.suggestions.filter((s) => s.confidence > 0.3);
      expect(mappedSuggestions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('bidirectional sync management', () => {
    it('should register connectors with different sync directions', () => {
      service.registerConnector({
        connectorId: 'source-crm',
        connectorName: 'Salesforce',
        direction: 'read_only',
      });

      service.registerConnector({
        connectorId: 'target-db',
        connectorName: 'PostgreSQL',
        direction: 'write_authorized',
      });

      const connectors = service.listConnectors();
      expect(connectors.length).toBe(2);
      expect(connectors.some((c) => c.connectorId === 'source-crm')).toBe(true);
      expect(connectors.some((c) => c.connectorId === 'target-db')).toBe(true);
    });

    it('should enforce write authorization on read_only connectors', () => {
      service.registerConnector({
        connectorId: 'readonly-source',
        connectorName: 'Read-Only Source',
        direction: 'read_only',
      });

      expect(() => {
        service.checkSyncAuthorization({
          connectorId: 'readonly-source',
          operationType: 'write',
          payload: { data: 'test' },
        });
      }).toThrow();
    });

    it('should allow write operations on write_authorized connectors', () => {
      service.registerConnector({
        connectorId: 'write-target',
        connectorName: 'Write Target',
        direction: 'write_authorized',
      });

      const result = service.checkSyncAuthorization({
        connectorId: 'write-target',
        operationType: 'write',
        payload: { data: 'test' },
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow reads on all registered connectors', () => {
      service.registerConnector({
        connectorId: 'any-connector',
        connectorName: 'Any',
        direction: 'read_only',
      });

      const result = service.checkSyncAuthorization({
        connectorId: 'any-connector',
        operationType: 'read',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('conflict resolution', () => {
    it('should resolve conflict using last_write_wins strategy', () => {
      const local = {
        id: '1',
        source: 'crm',
        data: { name: 'John' },
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const remote = {
        id: '1',
        source: 'database',
        data: { name: 'Jane' },
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = service.resolveConflict(local, remote, 'last_write_wins');
      expect(result.outcome).toBe('resolved');
      expect(result.winner?.data.name).toBe('John');
    });

    it('should resolve conflict using version_based strategy', () => {
      const local = {
        id: '1',
        source: 'crm',
        data: { name: 'John' },
        version: 2,
      };

      const remote = {
        id: '1',
        source: 'database',
        data: { name: 'Jane' },
        version: 3,
      };

      const result = service.resolveConflict(local, remote, 'version_based');
      expect(result.outcome).toBe('resolved');
      expect(result.winner?.data.name).toBe('Jane');
    });

    it('should queue conflict for manual review when versions equal', () => {
      const local = {
        id: '1',
        source: 'crm',
        data: { name: 'John' },
        version: 2,
      };

      const remote = {
        id: '1',
        source: 'database',
        data: { name: 'Jane' },
        version: 2,
      };

      const result = service.resolveConflict(local, remote, 'version_based');
      expect(result.outcome).toBe('conflict');
      expect(result.conflictId).toBeDefined();
    });

    it('should queue conflict for manual strategy', () => {
      const local = {
        id: '1',
        source: 'crm',
        data: { name: 'John' },
      };

      const remote = {
        id: '1',
        source: 'database',
        data: { name: 'Jane' },
      };

      const result = service.resolveConflict(local, remote, 'manual');
      expect(result.outcome).toBe('conflict');
    });

    it('should list pending conflicts', () => {
      service.resolveConflict(
        { id: '1', source: 'a', data: { x: 1 } },
        { id: '1', source: 'b', data: { x: 2 } },
        'manual',
      );

      const conflicts = service.listConflicts('pending');
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].status).toBe('pending');
    });

    it('should manually resolve queued conflicts', () => {
      const result = service.resolveConflict(
        { id: '1', source: 'a', data: { x: 1 } },
        { id: '1', source: 'b', data: { x: 2 } },
        'manual',
      );

      const resolved = service.manualResolveConflict(
        result.conflictId!,
        'local',
        'admin@company.com',
      );

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedBy).toBe('admin@company.com');
    });
  });

  describe('end-to-end mapping and sync workflow', () => {
    it('should execute complete sync workflow with mapping and authorization', () => {
      // 1. Register source and target connectors
      service.registerConnector({
        connectorId: 'sales-crm',
        connectorName: 'Salesforce',
        direction: 'read_only',
      });

      service.registerConnector({
        connectorId: 'data-warehouse',
        connectorName: 'Data Warehouse',
        direction: 'write_authorized',
      });

      // 2. Detect schemas from both sources
      const crmRecords = [
        { Id: '001', Name: 'Acme Corp', Industry: 'Technology' },
        { Id: '002', Name: 'Global Inc', Industry: 'Finance' },
      ];

      const dwRecords = [
        { account_id: 'ACC001', account_name: 'Acme', sector: 'Tech' },
        { account_id: 'ACC002', account_name: 'Global', sector: 'Finance' },
      ];

      const crmSchema = service.detectSchema(crmRecords);
      const dwSchema = service.detectSchema(dwRecords);

      expect(crmSchema.fields.length).toBeGreaterThan(0);
      expect(dwSchema.fields.length).toBeGreaterThan(0);

      // 3. Suggest field mappings
      const mappingSuggestions = service.suggestMappings(crmRecords, dwRecords, [
        { sourceField: 'Id', targetField: 'account_id', bonus: 0.4 },
        { sourceField: 'Name', targetField: 'account_name', bonus: 0.3 },
      ]);

      expect(mappingSuggestions.suggestions.length).toBeGreaterThan(0);

      // 4. Verify read authorization on source
      const sourceReadAuth = service.checkSyncAuthorization({
        connectorId: 'sales-crm',
        operationType: 'read',
      });
      expect(sourceReadAuth.allowed).toBe(true);

      // 5. Verify write authorization on target
      const targetWriteAuth = service.checkSyncAuthorization({
        connectorId: 'data-warehouse',
        operationType: 'write',
        payload: crmRecords,
      });
      expect(targetWriteAuth.allowed).toBe(true);

      // 6. Simulate data conflict (if updates come from multiple sources)
      const conflict = service.resolveConflict(
        { id: 'acc-001', source: 'crm', data: crmRecords[0], version: 1 },
        {
          id: 'acc-001',
          source: 'external-sync',
          data: { ...crmRecords[0], Name: 'Acme Corporation' },
          version: 1,
        },
        'manual',
      );

      expect(conflict.outcome).toBe('conflict');
      expect(conflict.conflictId).toBeDefined();
    });

    it('should handle multi-step sync with conflict resolution', () => {
      const steps: string[] = [];

      // Step 1: Register connectors
      service.registerConnector({
        connectorId: 'source-1',
        connectorName: 'Source System 1',
        direction: 'read_only',
      });
      steps.push('registered-source');

      service.registerConnector({
        connectorId: 'target',
        connectorName: 'Target System',
        direction: 'write_authorized',
      });
      steps.push('registered-target');

      // Step 2: Detect schema
      const records = [
        { id: 1, name: 'Record 1' },
        { id: 2, name: 'Record 2' },
      ];
      service.detectSchema(records);
      steps.push('detected-schema');

      // Step 3: Authorize read on source
      const readAuth = service.checkSyncAuthorization({
        connectorId: 'source-1',
        operationType: 'read',
      });
      expect(readAuth.allowed).toBe(true);
      steps.push('authorized-read');

      // Step 4: Authorize write on target
      const writeAuth = service.checkSyncAuthorization({
        connectorId: 'target',
        operationType: 'write',
        payload: records,
      });
      expect(writeAuth.allowed).toBe(true);
      steps.push('authorized-write');

      // Step 5: Detect and resolve conflicts
      const conflict = service.resolveConflict(
        { id: 'rec-1', source: 'source-1', data: { value: 100 }, version: 1 },
        { id: 'rec-1', source: 'other', data: { value: 200 }, version: 1 },
        'version_based',
      );
      steps.push('detected-conflict');

      const resolved = service.manualResolveConflict(conflict.conflictId!, 'local', 'admin');
      expect(resolved.status).toBe('resolved');
      steps.push('resolved-conflict');

      expect(steps.length).toBe(7);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle empty records in schema detection', () => {
      const schema = service.detectSchema([]);
      expect(schema.recordCount).toBe(0);
      expect(schema.fields).toEqual([]);
    });

    it('should handle mapping with empty target records', () => {
      const source = [{ id: 1, name: 'Test' }];
      const result = service.suggestMappings(source, []);
      expect(result.suggestions).toEqual([]);
      expect(result.unmappedSource).toContain('id');
      expect(result.unmappedSource).toContain('name');
    });

    it('should reject write to unregistered connector', () => {
      expect(() => {
        service.checkSyncAuthorization({
          connectorId: 'unknown-connector',
          operationType: 'write',
        });
      }).toThrow();
    });

    it('should allow read on unregistered connector', () => {
      const result = service.checkSyncAuthorization({
        connectorId: 'unknown-connector',
        operationType: 'read',
      });
      expect(result.allowed).toBe(true);
    });

    it('should handle null/undefined in conflict resolution', () => {
      const result = service.resolveConflict(
        { id: 'test', source: 'a', data: {} },
        { id: 'test', source: 'b', data: {} },
        'last_write_wins',
      );
      expect(result.outcome).toBe('resolved');
    });
  });

  describe('service composition and integration', () => {
    it('should use all injected services correctly', () => {
      // Verify all services are used in typical workflow
      const sourceRecords = [{ id: 1, name: 'Test' }];
      const targetRecords = [{ id: 100, title: 'Test' }];

      // Uses SchemaDetector
      const schema = service.detectSchema(sourceRecords);
      expect(schema).toBeDefined();

      // Uses FieldSuggestionEngine
      const mappings = service.suggestMappings(sourceRecords, targetRecords);
      expect(mappings).toBeDefined();

      // Uses BidirectionalSyncManager
      service.registerConnector({
        connectorId: 'test',
        connectorName: 'Test',
        direction: 'read_only',
      });
      const connectors = service.listConnectors();
      expect(connectors.length).toBeGreaterThan(0);

      // Uses ConflictResolver
      const conflict = service.resolveConflict(
        { id: '1', source: 'a', data: {} },
        { id: '1', source: 'b', data: {} },
        'manual',
      );
      expect(conflict).toBeDefined();
    });

    it('should maintain state consistency across multiple operations', () => {
      // Register connector
      service.registerConnector({
        connectorId: 'test-connector',
        connectorName: 'Test',
        direction: 'bidirectional',
      });

      // Verify it's registered
      let connectors = service.listConnectors();
      expect(connectors.length).toBe(1);

      // Create conflict
      const conflict = service.resolveConflict(
        { id: 'rec1', source: 'a', data: { x: 1 } },
        { id: 'rec1', source: 'b', data: { x: 2 } },
        'manual',
      );

      // Verify conflict exists
      let conflicts = service.listConflicts('pending');
      expect(conflicts.length).toBe(1);

      // Resolve conflict
      service.manualResolveConflict(conflict.conflictId!, 'local', 'admin');

      // Verify conflict resolved
      conflicts = service.listConflicts('pending');
      expect(conflicts.length).toBe(0);

      // Connector should still be registered
      connectors = service.listConnectors();
      expect(connectors.length).toBe(1);
    });
  });

  describe('performance and scale', () => {
    it('should handle large dataset schema detection', () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        value: Math.random() * 1000,
        active: i % 2 === 0,
      }));

      const schema = service.detectSchema(records);
      expect(schema.recordCount).toBe(1000);
      expect(schema.fields.length).toBe(4);
    });

    it('should generate mappings for large schemas', () => {
      const sourceRecords = Array.from({ length: 100 }, (_, i) => ({
        [`field_${i}_a`]: i,
        [`field_${i}_b`]: `value_${i}`,
      })).reduce((acc, rec) => ({ ...acc, ...rec }), {});

      const targetRecords = Array.from({ length: 100 }, (_, i) => ({
        [`column_${i}_x`]: i * 2,
        [`column_${i}_y`]: `data_${i}`,
      })).reduce((acc, rec) => ({ ...acc, ...rec }), {});

      const result = service.suggestMappings([sourceRecords], [targetRecords]);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle many registered connectors', () => {
      for (let i = 0; i < 50; i++) {
        service.registerConnector({
          connectorId: `connector-${i}`,
          connectorName: `Connector ${i}`,
          direction: i % 3 === 0 ? 'read_only' : i % 3 === 1 ? 'write_authorized' : 'bidirectional',
        });
      }

      const connectors = service.listConnectors();
      expect(connectors.length).toBe(50);
    });

    it('should handle many queued conflicts', () => {
      for (let i = 0; i < 100; i++) {
        service.resolveConflict(
          { id: `rec-${i}`, source: 'a', data: { x: i } },
          { id: `rec-${i}`, source: 'b', data: { x: i * 2 } },
          'manual',
        );
      }

      const conflicts = service.listConflicts('pending');
      expect(conflicts.length).toBe(100);
    });
  });
});
