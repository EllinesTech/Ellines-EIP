/**
 * ConflictResolver Unit Tests
 * Requirement 22.6: Conflict resolution strategies (last-write-wins, version-based, manual)
 */

import { ConflictResolver, DataRecord } from './conflict-resolver';

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  describe('resolve - last_write_wins strategy', () => {
    it('should prefer the record with more recent timestamp', () => {
      const older: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Old Value' },
        updatedAt: '2024-01-01T10:00:00Z',
      };

      const newer: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'New Value' },
        updatedAt: '2024-01-01T15:00:00Z',
      };

      const result = resolver.resolve(older, newer, 'last_write_wins');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(newer);
    });

    it('should handle records without timestamps', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Value A' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Value B' },
        updatedAt: '2024-01-01T15:00:00Z',
      };

      const result = resolver.resolve(local, remote, 'last_write_wins');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(remote);
    });

    it('should prefer local when timestamps are equal', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const result = resolver.resolve(local, remote, 'last_write_wins');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(local);
    });
  });

  describe('resolve - version_based strategy', () => {
    it('should prefer record with higher version', () => {
      const v1: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Version 1' },
        version: 1,
      };

      const v3: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Version 3' },
        version: 3,
      };

      const result = resolver.resolve(v1, v3, 'version_based');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(v3);
    });

    it('should flag conflict when both records have same version', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local Change' },
        version: 2,
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote Change' },
        version: 2,
      };

      const result = resolver.resolve(local, remote, 'version_based');
      expect(result.outcome).toBe('conflict');
      expect(result.conflictId).toBeDefined();
    });

    it('should use version 0 when version is missing', () => {
      const noVer: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'No Version' },
      };

      const v1: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Version 1' },
        version: 1,
      };

      const result = resolver.resolve(noVer, v1, 'version_based');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(v1);
    });
  });

  describe('resolve - manual strategy', () => {
    it('should always flag for manual review', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
      };

      const result = resolver.resolve(local, remote, 'manual');
      expect(result.outcome).toBe('conflict');
      expect(result.conflictId).toBeDefined();
      expect(result.strategy).toBe('manual');
    });
  });

  describe('listConflicts', () => {
    it('should return empty list when no conflicts', () => {
      const conflicts = resolver.listConflicts();
      expect(conflicts).toEqual([]);
    });

    it('should list all pending conflicts', () => {
      const local1: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local 1' },
      };

      const remote1: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote 1' },
      };

      // Create first conflict
      resolver.resolve(local1, remote1, 'manual');

      // Create second conflict
      const local2: DataRecord = {
        id: 'record-2',
        source: 'system-a',
        data: { name: 'Local 2' },
      };

      const remote2: DataRecord = {
        id: 'record-2',
        source: 'system-b',
        data: { name: 'Remote 2' },
      };

      resolver.resolve(local2, remote2, 'manual');

      const conflicts = resolver.listConflicts('pending');
      expect(conflicts.length).toBe(2);
    });

    it('should filter conflicts by status', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
      };

      const result = resolver.resolve(local, remote, 'manual');
      const conflictId = result.conflictId!;

      // Mark as resolved
      resolver.manualResolve(conflictId, 'local', 'admin@company.com');

      const pendingConflicts = resolver.listConflicts('pending');
      const resolvedConflicts = resolver.listConflicts('resolved');

      expect(pendingConflicts.length).toBe(0);
      expect(resolvedConflicts.length).toBe(1);
    });
  });

  describe('manualResolve', () => {
    it('should resolve a queued conflict', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
      };

      const result = resolver.resolve(local, remote, 'manual');
      const conflictId = result.conflictId!;

      const resolved = resolver.manualResolve(conflictId, 'local', 'admin@company.com');

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedBy).toBe('admin@company.com');
      expect(resolved.resolvedAt).toBeDefined();
    });

    it('should throw error for non-existent conflict', () => {
      expect(() => {
        resolver.manualResolve('nonexistent-conflict', 'local', 'admin@company.com');
      }).toThrow('Conflict "nonexistent-conflict" not found');
    });

    it('should throw error when conflict already resolved', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
      };

      const result = resolver.resolve(local, remote, 'manual');
      const conflictId = result.conflictId!;

      resolver.manualResolve(conflictId, 'local', 'admin@company.com');

      expect(() => {
        resolver.manualResolve(conflictId, 'remote', 'other@company.com');
      }).toThrow('Conflict "' + conflictId + '" is already resolved');
    });
  });

  describe('conflict record integrity', () => {
    it('should preserve local and remote records in queued conflict', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local Data', value: 100 },
        version: 2,
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote Data', value: 200 },
        version: 2,
      };

      const result = resolver.resolve(local, remote, 'manual');
      const conflictId = result.conflictId!;

      const conflicts = resolver.listConflicts('pending');
      const queued = conflicts.find((c) => c.conflictId === conflictId);

      expect(queued?.localRecord).toEqual(local);
      expect(queued?.remoteRecord).toEqual(remote);
      expect(queued?.recordId).toBe('record-1');
    });

    it('should not mutate original records during resolution', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local Data' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote Data' },
      };

      const localCopy = JSON.parse(JSON.stringify(local));
      const remoteCopy = JSON.parse(JSON.stringify(remote));

      resolver.resolve(local, remote, 'manual');

      expect(local).toEqual(localCopy);
      expect(remote).toEqual(remoteCopy);
    });

    it('should track conflict detection time', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
      };

      const before = new Date().getTime();
      const result = resolver.resolve(local, remote, 'manual');
      const after = new Date().getTime();

      const conflicts = resolver.listConflicts();
      const conflict = conflicts.find((c) => c.conflictId === result.conflictId);

      const detectedTime = new Date(conflict!.detectedAt).getTime();
      expect(detectedTime).toBeGreaterThanOrEqual(before);
      expect(detectedTime).toBeLessThanOrEqual(after);
    });

    it('should generate unique conflict IDs', () => {
      const record1 = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Data 1' },
      };
      const record2 = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Data 2' },
      };
      const record3 = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Data 3' },
      };
      const record4 = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Data 4' },
      };

      const result1 = resolver.resolve(record1, record2, 'manual');
      const result2 = resolver.resolve(record3, record4, 'manual');

      expect(result1.conflictId).not.toEqual(result2.conflictId);
    });

    it('should handle complex data payloads in conflicts', () => {
      const local: DataRecord = {
        id: 'complex-record',
        source: 'system-a',
        data: {
          name: 'Complex',
          nested: {
            deep: {
              value: [1, 2, 3],
              metadata: { tags: ['tag1', 'tag2'] },
            },
          },
        },
        version: 1,
      };

      const remote: DataRecord = {
        id: 'complex-record',
        source: 'system-b',
        data: {
          name: 'Complex',
          nested: {
            deep: {
              value: [4, 5, 6],
              metadata: { tags: ['tag3'] },
            },
          },
        },
        version: 1,
      };

      const result = resolver.resolve(local, remote, 'version_based');
      expect(result.outcome).toBe('conflict');

      const conflicts = resolver.listConflicts('pending');
      const conflict = conflicts.find((c) => c.conflictId === result.conflictId);

      expect(conflict?.localRecord.data).toEqual(local.data);
      expect(conflict?.remoteRecord.data).toEqual(remote.data);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle large version numbers', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
        version: 9999999,
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
        version: 10000000,
      };

      const result = resolver.resolve(local, remote, 'version_based');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(remote);
    });

    it('should handle ISO-8601 timestamps with milliseconds', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
        updatedAt: '2024-01-01T12:00:00.000Z',
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
        updatedAt: '2024-01-01T12:00:00.001Z',
      };

      const result = resolver.resolve(local, remote, 'last_write_wins');
      expect(result.outcome).toBe('resolved');
      expect(result.winner).toEqual(remote);
    });

    it('should handle timezone-aware timestamps', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
        updatedAt: '2024-01-01T12:00:00+02:00',
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
        updatedAt: '2024-01-01T12:00:00+03:00',
      };

      const result = resolver.resolve(local, remote, 'last_write_wins');
      expect(result.outcome).toBe('resolved');
    });

    it('should handle empty data payloads', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: {},
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: {},
      };

      const result = resolver.resolve(local, remote, 'manual');
      expect(result.outcome).toBe('conflict');
      expect(result.conflictId).toBeDefined();
    });

    it('should handle null data payloads gracefully', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: null as any,
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: null as any,
      };

      const result = resolver.resolve(local, remote, 'manual');
      expect(result.outcome).toBe('conflict');
    });

    it('should handle multiple sequential conflicts', () => {
      const conflicts: Array<{ id: string; conflictId: string }> = [];

      for (let i = 0; i < 5; i++) {
        const local: DataRecord = {
          id: `record-${i}`,
          source: 'system-a',
          data: { value: i },
        };

        const remote: DataRecord = {
          id: `record-${i}`,
          source: 'system-b',
          data: { value: i * 10 },
        };

        const result = resolver.resolve(local, remote, 'manual');
        conflicts.push({ id: `record-${i}`, conflictId: result.conflictId! });
      }

      const allConflicts = resolver.listConflicts('pending');
      expect(allConflicts.length).toBe(5);

      // Verify all conflict IDs are unique
      const ids = conflicts.map((c) => c.conflictId);
      expect(new Set(ids).size).toBe(5);
    });

    it('should handle mixed resolution strategies in sequence', () => {
      const records1 = {
        local: { id: '1', source: 'a', data: { x: 1 }, updatedAt: '2024-01-01T00:00:00Z' },
        remote: { id: '1', source: 'b', data: { x: 2 }, updatedAt: '2024-01-02T00:00:00Z' },
      };

      const records2 = {
        local: { id: '2', source: 'a', data: { y: 1 }, version: 1 },
        remote: { id: '2', source: 'b', data: { y: 2 }, version: 2 },
      };

      const records3 = {
        local: { id: '3', source: 'a', data: { z: 1 } },
        remote: { id: '3', source: 'b', data: { z: 2 } },
      };

      const result1 = resolver.resolve(records1.local, records1.remote, 'last_write_wins');
      const result2 = resolver.resolve(records2.local, records2.remote, 'version_based');
      const result3 = resolver.resolve(records3.local, records3.remote, 'manual');

      expect(result1.outcome).toBe('resolved');
      expect(result2.outcome).toBe('resolved');
      expect(result3.outcome).toBe('conflict');

      const allConflicts = resolver.listConflicts();
      expect(allConflicts.length).toBe(1);
      expect(allConflicts[0].conflictId).toBe(result3.conflictId);
    });
  });

  describe('strategies provide reason explanations', () => {
    it('should provide reason for last_write_wins resolution', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = resolver.resolve(local, remote, 'last_write_wins');
      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.reason.toLowerCase()).toContain('newer');
    });

    it('should provide reason for version_based resolution', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
        version: 3,
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
        version: 2,
      };

      const result = resolver.resolve(local, remote, 'version_based');
      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.reason.toLowerCase()).toContain('version');
    });

    it('should provide reason for manual resolution', () => {
      const local: DataRecord = {
        id: 'record-1',
        source: 'system-a',
        data: { name: 'Local' },
      };

      const remote: DataRecord = {
        id: 'record-1',
        source: 'system-b',
        data: { name: 'Remote' },
      };

      const result = resolver.resolve(local, remote, 'manual');
      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.reason.toLowerCase()).toContain('manual');
    });
  });
});
