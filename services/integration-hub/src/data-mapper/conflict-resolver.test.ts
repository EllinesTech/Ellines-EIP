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
  });
});
