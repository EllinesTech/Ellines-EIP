/**
 * Data Quality Service Type Definitions
 * Defines interfaces for data quality assessment, scoring, issues, and remediation.
 */

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

export interface DataRecord {
  [key: string]: unknown;
}

export interface QualityDimensions {
  completeness: number;    // 0-100: % of required fields populated
  accuracy: number;        // 0-100: % of values matching validation rules
  consistency: number;     // 0-100: % data consistent across sources
  timeliness: number;      // 0-100: % recent data (not stale)
  validity: number;        // 0-100: % passing format/type checks
}

export interface DataQualityScoreResult {
  overallScore: number;    // 0-100: average of five dimensions
  qualityRating: 'excellent' | 'good' | 'fair' | 'poor';
  dimensions: QualityDimensions;
  recordsAssessed: number;
  recordsWithIssues: number;
}

export interface QualityIssue {
  id?: string;
  issueType: 'missing_value' | 'duplicate' | 'format_error' | 'referential_integrity' | 'stale_data' | 'outlier';
  dimension: keyof QualityDimensions;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recordId: string;
  fieldName?: string;
  currentValue?: unknown;
  expectedValue?: unknown;
  detectionRule: string;
  autoRemediable: boolean;
  status: 'detected' | 'quarantined' | 'remediated' | 'ignored';
}

export interface RemediationAction {
  type: 'trim' | 'standardize' | 'replace' | 'normalize' | 'validate';
  config: Record<string, unknown>;
}

export interface CleansingRuleDefinition {
  name: string;
  description?: string;
  ruleType: 'trim' | 'standardize' | 'replace' | 'normalize' | 'validate';
  entityType: string;
  fieldName?: string;
  pattern?: string;
  transformation: RemediationAction;
  condition?: Record<string, unknown>;
}

export interface RemediationResult {
  success: boolean;
  recordId: string;
  originalData: Record<string, unknown>;
  remediatedData: Record<string, unknown>;
  appliedRules: string[];
  errors?: string[];
}

export interface QuarantineRecord {
  recordId: string;
  sourceSystemId: string;
  entityType: string;
  recordSnapshot: DataRecord;
  quarantineReason: 'multiple_issues' | 'critical_issue' | 'anomaly_detected' | 'manual_flag';
  suspiciousFields: string[];
  status: 'isolated' | 'approved' | 'rejected' | 'fixed';
  fixedData?: DataRecord;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export interface TrendDataPoint {
  date: Date;
  overallScore: number;
  dimensions: QualityDimensions;
}

export interface QualityTrend {
  direction: 'improving' | 'stable' | 'degrading';
  trendDays: number;
  scoreHistory: TrendDataPoint[];
  changePercentage: number;
}

export interface ValidationSchema {
  [fieldName: string]: {
    type: string;
    required: boolean;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    format?: string;
    enum?: unknown[];
    references?: {
      entityType: string;
      idField: string;
    };
  };
}

export interface DuplicateDetectionConfig {
  keyFields: string[];
  threshold: number; // 0-1: similarity threshold
}

export interface QualityAssessmentConfig {
  sourceSystemId: string;
  entityType: string;
  schema: ValidationSchema;
  duplicateConfig?: DuplicateDetectionConfig;
  freshnessDays?: number; // How recent data should be (for timeliness)
  samplingRate?: number; // 0-1: sample rate for assessment (1 = 100%)
}

export interface RecommendationCaveat {
  qualityScore: number;
  qualityRating: string;
  criticalIssues: string[];
  recommendation: string;
  confidenceImpact: number; // How much quality issues reduce AI recommendation confidence
}
