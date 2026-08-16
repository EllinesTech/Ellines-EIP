/**
 * DataQualityService — Main orchestration service for data quality assessment.
 * 
 * Coordinates all data quality components:
 * - DataQualityAssessor: Assess data across five dimensions
 * - QualityScoreGenerator: Generate composite scores and track trends
 * - IssueDetector: Detect data quality issues
 * - AutoRemediator: Attempt automatic remediation
 * - QuarantineManager: Quarantine problematic data
 * - TrendTracker: Track quality trends over time
 */

import { Injectable } from '@nestjs/common';
import { DataQualityAssessor } from './data-quality-assessor';
import { QualityScoreGenerator } from './quality-score-generator';
import { IssueDetector, IssueDetectionResult } from './issue-detector';
import { AutoRemediator } from './auto-remediator';
import { QuarantineManager } from './quarantine-manager';
import { TrendTracker } from './trend-tracker';
import {
  DataRecord,
  DataQualityScoreResult,
  QualityIssue,
  ValidationSchema,
  QualityAssessmentConfig,
  CleansingRuleDefinition,
  RemediationResult,
  QuarantineRecord,
  QualityTrend,
} from './types';

export interface DataQualityAssessmentRequest {
  records: DataRecord[];
  config: QualityAssessmentConfig;
  schema: ValidationSchema;
  cleansingRules?: CleansingRuleDefinition[];
  attemptRemediation?: boolean;
  quarantineThreshold?: number;
}

export interface DataQualityAssessmentResponse {
  scoreResult: DataQualityScoreResult;
  issues: IssueDetectionResult;
  remediationResults?: RemediationResult[];
  quarantinedRecords?: QuarantineRecord[];
  trend?: QualityTrend;
  timestamp: Date;
}

@Injectable()
export class DataQualityService {
  private assessor: DataQualityAssessor;
  private scoreGenerator: QualityScoreGenerator;
  private issueDetector: IssueDetector;
  private remediator: AutoRemediator;
  private quarantineManager: QuarantineManager;
  private trendTracker: TrendTracker;

  constructor() {
    this.assessor = new DataQualityAssessor();
    this.scoreGenerator = new QualityScoreGenerator();
    this.issueDetector = new IssueDetector();
    this.remediator = new AutoRemediator();
    this.quarantineManager = new QuarantineManager();
    this.trendTracker = new TrendTracker();
  }

  /**
   * Perform comprehensive data quality assessment.
   */
  async assessDataQuality(request: DataQualityAssessmentRequest): Promise<DataQualityAssessmentResponse> {
    const { records, config, schema, cleansingRules = [], attemptRemediation = true, quarantineThreshold = 3 } = request;

    // Step 1: Assess data across five dimensions
    const scoreResult = this.assessor.assessData(records, schema, config);

    // Step 2: Detect issues
    const issues = this.issueDetector.detectIssues(
      records,
      schema,
      config.sourceSystemId,
      config.entityType,
      config.duplicateConfig,
      config.freshnessDays,
    );

    // Step 3: Attempt remediation if requested
    let remediationResults: RemediationResult[] = [];
    if (attemptRemediation && cleansingRules.length > 0) {
      remediationResults = this.attemptRemediateRecords(records, issues.issues, cleansingRules);
    }

    // Step 4: Quarantine problematic records
    let quarantinedRecords: QuarantineRecord[] = [];
    records.forEach((record, idx) => {
      const recordIssues = issues.issues.filter((i) => i.recordId === `record-${idx}`);

      if (this.quarantineManager.shouldQuarantine(recordIssues, quarantineThreshold)) {
        const reason = this.quarantineManager.determineQuarantineReason(recordIssues);
        const quarantine = this.quarantineManager.quarantineRecord({
          recordId: `record-${idx}`,
          sourceSystemId: config.sourceSystemId,
          entityType: config.entityType,
          recordSnapshot: record,
          reason,
          issues: recordIssues,
        });
        quarantinedRecords.push(quarantine);
      }
    });

    // Step 5: Track trend
    this.trendTracker.recordScore(config.sourceSystemId, config.entityType, scoreResult);
    const trendData = this.trendTracker.getTrend(config.sourceSystemId, config.entityType, 7);
    const trend = trendData || undefined;

    return {
      scoreResult,
      issues,
      remediationResults: remediationResults.length > 0 ? remediationResults : undefined,
      quarantinedRecords: quarantinedRecords.length > 0 ? quarantinedRecords : undefined,
      trend,
      timestamp: new Date(),
    };
  }

  /**
   * Attempt remediation on records with issues.
   */
  private attemptRemediateRecords(
    records: DataRecord[],
    issues: QualityIssue[],
    rules: CleansingRuleDefinition[],
  ): RemediationResult[] {
    const results: RemediationResult[] = [];

    records.forEach((record, idx) => {
      const recordIssues = issues.filter((i) => i.recordId === `record-${idx}`);

      if (recordIssues.length > 0) {
        const result = this.remediator.remediateRecord(record, recordIssues, rules);
        results.push(result);
      }
    });

    return results;
  }

  /**
   * Get trend data for a source system and entity type.
   */
  getTrend(sourceSystemId: string, entityType: string, days?: number): QualityTrend | null {
    return this.trendTracker.getTrend(sourceSystemId, entityType, days);
  }

  /**
   * Get all recorded trends.
   */
  getAllTrends(days?: number): QualityTrend[] {
    return this.trendTracker.getAllTrends(days);
  }

  /**
   * Get sources with degrading quality.
   */
  getDegradingSources(days?: number): Array<{ sourceSystemId: string; entityType: string; trend: QualityTrend }> {
    return this.trendTracker.getDegradingSources(days);
  }

  /**
   * Get sources with persistent issues.
   */
  getPersistentIssueSources(scoreThreshold?: number, days?: number): Array<{
    sourceSystemId: string;
    entityType: string;
    averageScore: number;
  }> {
    return this.trendTracker.getPersistentIssueSources(scoreThreshold, days);
  }

  /**
   * Get quarantine statistics.
   */
  getQuarantineStats() {
    return this.quarantineManager.getQuarantineStats();
  }

  /**
   * Get pending quarantine reviews.
   */
  getPendingQuarantineReviews(): QuarantineRecord[] {
    return this.quarantineManager.getPendingReviewRecords();
  }

  /**
   * Review a quarantined record.
   */
  reviewQuarantine(recordId: string, action: 'approve' | 'reject' | 'fix', reviewedBy: string, reviewNotes?: string, fixedData?: DataRecord): QuarantineRecord {
    if (action === 'fix' && !fixedData) {
      throw new Error('fixedData is required for fix action');
    }

    return this.quarantineManager.reviewQuarantine({
      recordId,
      action,
      reviewedBy,
      reviewNotes,
      fixedData,
    });
  }

  /**
   * Generate a quality report for a source system.
   */
  generateQualityReport(sourceSystemId: string, entityType: string) {
    const latestScore = this.assessor.assessData([], {}, {
      sourceSystemId,
      entityType,
      schema: {},
    });

    const trendData = this.trendTracker.getTrend(sourceSystemId, entityType, 30);
    const trend = trendData || undefined;

    return this.scoreGenerator.generateQualityReport(sourceSystemId, entityType, latestScore, trend);
  }

  /**
   * Generate notification for IT admin about pending issues.
   */
  generateAdminNotification() {
    const pendingQuarantines = this.quarantineManager.generateAdminNotification();
    const degradingSources = this.trendTracker.getDegradingSources(7);
    const persistentIssues = this.trendTracker.getPersistentIssueSources(60, 30);

    return {
      timestamp: new Date(),
      pendingQuarantines,
      degradingSources,
      persistentIssues,
      summary: `${pendingQuarantines.pendingReviewCount} quarantine reviews pending; ${degradingSources.length} sources degrading; ${persistentIssues.length} sources with persistent issues`,
    };
  }

  /**
   * Reset service (for testing).
   */
  reset(): void {
    this.quarantineManager.clear();
    this.trendTracker.clear();
  }
}
