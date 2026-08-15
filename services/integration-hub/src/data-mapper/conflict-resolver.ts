/**
 * ConflictResolver
 * Requirement 22.6: Conflict resolution strategies for bidirectional sync
 *
 * Three strategies:
 *  1. last_write_wins   — most recent updatedAt / timestamp wins
 *  2. version_based     — higher version number wins; equal versions = conflict
 *  3. manual            — flag for human review and queue in the conflict registry
 */

import { Injectable, Logger } from '@nestjs/common';

export type ConflictStrategy = 'last_write_wins' | 'version_based' | 'manual';

export interface DataRecord {
  /** Unique record identifier */
  id: string;
  /** Source system identifier */
  source: string;
  /** Record payload */
  data: Record<string, unknown>;
  /** ISO-8601 timestamp of last update */
  updatedAt?: string;
  /** Monotonic version counter */
  version?: number;
}

export type ResolutionOutcome = 'resolved' | 'conflict';

export interface ConflictResolutionResult {
  outcome: ResolutionOutcome;
  winner?: DataRecord;
  /** Populated when outcome is 'conflict' (manual strategy) */
  conflictId?: string;
  strategy: ConflictStrategy;
  reason: string;
}

export interface QueuedConflict {
  conflictId: string;
  recordId: string;
  localRecord: DataRecord;
  remoteRecord: DataRecord;
  detectedAt: string;
  status: 'pending' | 'resolved';
  resolvedBy?: string;
  resolvedAt?: string;
}

@Injectable()
export class ConflictResolver {
  private readonly logger = new Logger(ConflictResolver.name);

  /** In-memory conflict registry; production would persist to DB */
  private readonly conflictRegistry = new Map<string, QueuedConflict>();
  private conflictCounter = 0;

  // -----------------------------------------------------------------------
  // Core resolution entry point
  // -----------------------------------------------------------------------

  /**
   * Resolve a conflict between local and remote versions of the same record.
   * Requirement 22.6.
   */
  resolve(
    local: DataRecord,
    remote: DataRecord,
    strategy: ConflictStrategy,
  ): ConflictResolutionResult {
    this.logger.debug(
      `Resolving conflict for record "${local.id}" using strategy="${strategy}"`,
    );

    switch (strategy) {
      case 'last_write_wins':
        return this.resolveLastWriteWins(local, remote);
      case 'version_based':
        return this.resolveVersionBased(local, remote);
      case 'manual':
        return this.resolveManual(local, remote);
      default: {
        // TypeScript exhaustive check — should never reach here
        const _exhaustive: never = strategy;
        throw new Error(`Unknown conflict strategy: ${String(_exhaustive)}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Strategy implementations
  // -----------------------------------------------------------------------

  /**
   * Strategy 1: last_write_wins — most recent timestamp wins.
   */
  private resolveLastWriteWins(local: DataRecord, remote: DataRecord): ConflictResolutionResult {
    const localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0;
    const remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;

    if (localTime >= remoteTime) {
      return {
        outcome: 'resolved',
        winner: local,
        strategy: 'last_write_wins',
        reason: `Local record is newer (${local.updatedAt ?? 'no timestamp'} >= ${remote.updatedAt ?? 'no timestamp'})`,
      };
    }

    return {
      outcome: 'resolved',
      winner: remote,
      strategy: 'last_write_wins',
      reason: `Remote record is newer (${remote.updatedAt ?? 'no timestamp'} > ${local.updatedAt ?? 'no timestamp'})`,
    };
  }

  /**
   * Strategy 2: version_based — higher version wins; equal versions → conflict.
   */
  private resolveVersionBased(local: DataRecord, remote: DataRecord): ConflictResolutionResult {
    const localVer = local.version ?? 0;
    const remoteVer = remote.version ?? 0;

    if (localVer === remoteVer) {
      // True conflict — both sides at same version but diverged; queue for manual
      const queued = this.queueConflict(local, remote);
      return {
        outcome: 'conflict',
        conflictId: queued.conflictId,
        strategy: 'version_based',
        reason: `Both records at version ${localVer} — conflict queued for manual review (id: ${queued.conflictId})`,
      };
    }

    const winner = localVer > remoteVer ? local : remote;
    return {
      outcome: 'resolved',
      winner,
      strategy: 'version_based',
      reason: `Version ${winner.version} > ${localVer < remoteVer ? localVer : remoteVer}`,
    };
  }

  /**
   * Strategy 3: manual — always flag for human review.
   */
  private resolveManual(local: DataRecord, remote: DataRecord): ConflictResolutionResult {
    const queued = this.queueConflict(local, remote);
    return {
      outcome: 'conflict',
      conflictId: queued.conflictId,
      strategy: 'manual',
      reason: `Conflict queued for manual review (id: ${queued.conflictId})`,
    };
  }

  // -----------------------------------------------------------------------
  // Conflict registry
  // -----------------------------------------------------------------------

  private queueConflict(local: DataRecord, remote: DataRecord): QueuedConflict {
    this.conflictCounter += 1;
    const conflictId = `conflict-${Date.now()}-${this.conflictCounter}`;
    const queued: QueuedConflict = {
      conflictId,
      recordId: local.id,
      localRecord: local,
      remoteRecord: remote,
      detectedAt: new Date().toISOString(),
      status: 'pending',
    };
    this.conflictRegistry.set(conflictId, queued);
    this.logger.warn(`Conflict queued: ${conflictId} for record "${local.id}"`);
    return queued;
  }

  /**
   * List all pending conflicts.
   */
  listConflicts(status?: 'pending' | 'resolved'): QueuedConflict[] {
    const all = Array.from(this.conflictRegistry.values());
    return status ? all.filter((c) => c.status === status) : all;
  }

  /**
   * Manually resolve a queued conflict by choosing winner ('local' | 'remote').
   */
  manualResolve(
    conflictId: string,
    winner: 'local' | 'remote',
    resolvedBy: string,
  ): QueuedConflict {
    const conflict = this.conflictRegistry.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict "${conflictId}" not found`);
    }
    if (conflict.status === 'resolved') {
      throw new Error(`Conflict "${conflictId}" is already resolved`);
    }

    conflict.status = 'resolved';
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = new Date().toISOString();
    this.conflictRegistry.set(conflictId, conflict);

    this.logger.log(`Conflict ${conflictId} resolved by ${resolvedBy}, winner=${winner}`);
    return conflict;
  }
}
