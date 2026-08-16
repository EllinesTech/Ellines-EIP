/**
 * QuarantineManager — Manages quarantine of suspicious/problematic data.
 * 
 * Responsibilities:
 * - Quarantine records with critical issues
 * - Track quarantine reasons and metadata
 * - Support review workflow (isolated → reviewed → approved/rejected)
 * - Flag for manual review by IT admins
 * - Track remediation attempts
 */

import {
  DataRecord,
  QuarantineRecord,
  QualityIssue,
} from './types';

export enum QuarantineStatus {
  ISOLATED = 'isolated',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FIXED = 'fixed',
}

export enum QuarantineReason {
  MULTIPLE_ISSUES = 'multiple_issues',
  CRITICAL_ISSUE = 'critical_issue',
  ANOMALY_DETECTED = 'anomaly_detected',
  MANUAL_FLAG = 'manual_flag',
}

export interface QuarantineRequest {
  recordId: string;
  sourceSystemId: string;
  entityType: string;
  recordSnapshot: DataRecord;
  reason: QuarantineReason;
  issues: QualityIssue[];
}

export interface QuarantineReviewRequest {
  recordId: string;
  action: 'approve' | 'reject' | 'fix';
  reviewedBy: string;
  reviewNotes?: string;
  fixedData?: DataRecord;
}

export interface QuarantineStats {
  totalQuarantined: number;
  byStatus: Record<string, number>;
  byReason: Record<string, number>;
  averageDaysInQuarantine: number;
  criticalRecords: number;
}

export class QuarantineManager {
  private quarantineRecords: Map<string, QuarantineRecord> = new Map();
  private reviewHistory: Array<{
    recordId: string;
    action: string;
    timestamp: Date;
    reviewedBy: string;
  }> = [];

  /**
   * Quarantine a record with issues.
   */
  quarantineRecord(request: QuarantineRequest): QuarantineRecord {
    const criticalIssues = request.issues.filter((i) => i.severity === 'critical');

    const suspiciousFields = request.issues
      .filter((i) => i.fieldName)
      .map((i) => i.fieldName!)
      .filter((f, idx, arr) => arr.indexOf(f) === idx); // Unique

    const record: QuarantineRecord = {
      recordId: request.recordId,
      sourceSystemId: request.sourceSystemId,
      entityType: request.entityType,
      recordSnapshot: request.recordSnapshot,
      quarantineReason: request.reason,
      suspiciousFields,
      status: 'isolated',
    };

    this.quarantineRecords.set(request.recordId, record);

    return record;
  }

  /**
   * Review a quarantined record and take action.
   */
  reviewQuarantine(request: QuarantineReviewRequest): QuarantineRecord {
    const record = this.quarantineRecords.get(request.recordId);
    if (!record) {
      throw new Error(`Quarantine record not found: ${request.recordId}`);
    }

    // Update record based on action
    switch (request.action) {
      case 'approve':
        record.status = 'approved';
        break;
      case 'reject':
        record.status = 'rejected';
        break;
      case 'fix':
        record.status = 'fixed';
        if (request.fixedData) {
          record.fixedData = request.fixedData;
        }
        break;
    }

    record.reviewedBy = request.reviewedBy;
    record.reviewedAt = new Date();
    record.reviewNotes = request.reviewNotes;

    // Record in history
    this.reviewHistory.push({
      recordId: request.recordId,
      action: request.action,
      timestamp: new Date(),
      reviewedBy: request.reviewedBy,
    });

    this.quarantineRecords.set(request.recordId, record);

    return record;
  }

  /**
   * Get a quarantine record by ID.
   */
  getQuarantineRecord(recordId: string): QuarantineRecord | undefined {
    return this.quarantineRecords.get(recordId);
  }

  /**
   * Get all quarantined records (optionally filtered by status).
   */
  getQuarantinedRecords(status?: QuarantineStatus): QuarantineRecord[] {
    if (!status) {
      return Array.from(this.quarantineRecords.values());
    }

    return Array.from(this.quarantineRecords.values()).filter((r) => r.status === status);
  }

  /**
   * Get records pending review.
   */
  getPendingReviewRecords(): QuarantineRecord[] {
    return Array.from(this.quarantineRecords.values()).filter((r) => r.status === 'isolated' && !r.reviewedAt);
  }

  /**
   * Get quarantine statistics.
   */
  getQuarantineStats(): QuarantineStats {
    const records = Array.from(this.quarantineRecords.values());

    const byStatus: Record<string, number> = {
      isolated: 0,
      approved: 0,
      rejected: 0,
      fixed: 0,
    };

    const byReason: Record<string, number> = {
      multiple_issues: 0,
      critical_issue: 0,
      anomaly_detected: 0,
      manual_flag: 0,
    };

    records.forEach((r) => {
      byStatus[r.status]++;
      byReason[r.quarantineReason]++;
    });

    // Calculate average days in quarantine
    const resolvedRecords = records.filter((r) => r.reviewedAt);
    let averageDaysInQuarantine = 0;

    if (resolvedRecords.length > 0) {
      const totalDays = resolvedRecords.reduce((sum, r) => {
        if (!r.reviewedAt) return sum;
        const quarantineDate = new Date();
        const reviewDate = r.reviewedAt;
        const days = (reviewDate.getTime() - quarantineDate.getTime()) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);

      averageDaysInQuarantine = Math.round((totalDays / resolvedRecords.length) * 100) / 100;
    }

    const criticalRecords = records.filter((r) => r.quarantineReason === 'critical_issue').length;

    return {
      totalQuarantined: records.length,
      byStatus,
      byReason,
      averageDaysInQuarantine,
      criticalRecords,
    };
  }

  /**
   * Determine if a record should be quarantined based on issues.
   */
  shouldQuarantine(issues: QualityIssue[], issueThreshold: number = 3): boolean {
    // Quarantine if:
    // 1. Any critical issues exist
    // 2. Multiple high severity issues
    // 3. Total issues exceed threshold

    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      return true;
    }

    const highSeverityIssues = issues.filter((i) => i.severity === 'high');
    if (highSeverityIssues.length >= 2) {
      return true;
    }

    if (issues.length >= issueThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Determine quarantine reason based on issues.
   */
  determineQuarantineReason(issues: QualityIssue[]): QuarantineReason {
    const criticalIssues = issues.filter((i) => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      return QuarantineReason.CRITICAL_ISSUE;
    }

    const outliers = issues.filter((i) => i.issueType === 'outlier');
    if (outliers.length > 0 && outliers.length === issues.length) {
      return QuarantineReason.ANOMALY_DETECTED;
    }

    return QuarantineReason.MULTIPLE_ISSUES;
  }

  /**
   * Release a quarantined record (approve for processing).
   */
  releaseRecord(recordId: string, reviewedBy: string): QuarantineRecord {
    return this.reviewQuarantine({
      recordId,
      action: 'approve',
      reviewedBy,
      reviewNotes: 'Released for processing',
    });
  }

  /**
   * Reject a quarantined record (do not process).
   */
  rejectRecord(recordId: string, reviewedBy: string, reason: string): QuarantineRecord {
    return this.reviewQuarantine({
      recordId,
      action: 'reject',
      reviewedBy,
      reviewNotes: reason,
    });
  }

  /**
   * Mark a quarantined record as fixed.
   */
  markAsFixed(recordId: string, reviewedBy: string, fixedData: DataRecord): QuarantineRecord {
    return this.reviewQuarantine({
      recordId,
      action: 'fix',
      reviewedBy,
      reviewNotes: 'Fixed automatically or manually',
      fixedData,
    });
  }

  /**
   * Generate a notification for IT admin about pending quarantine reviews.
   */
  generateAdminNotification(): {
    pendingReviewCount: number;
    criticalCount: number;
    oldestQuarantineDate: Date | null;
    summary: string;
  } {
    const pending = this.getPendingReviewRecords();
    const criticalRecords = pending.filter((r) => r.quarantineReason === 'critical_issue');

    const pendingDates = pending
      .map(() => new Date())
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      pendingReviewCount: pending.length,
      criticalCount: criticalRecords.length,
      oldestQuarantineDate: pendingDates.length > 0 ? pendingDates[0] : null,
      summary: `${pending.length} records pending review (${criticalRecords.length} critical)`,
    };
  }

  /**
   * Clear quarantine history (for testing or cleanup).
   */
  clear(): void {
    this.quarantineRecords.clear();
    this.reviewHistory = [];
  }
}
