/**
 * IssueDetector — Detects data quality issues in records.
 * 
 * Issue Types:
 * - missing_value: Required fields are null/undefined/empty
 * - duplicate: Records with same key fields appear multiple times
 * - format_error: Values don't match expected format (email, phone, date, etc.)
 * - referential_integrity: Foreign key reference doesn't exist in related data
 * - stale_data: Data hasn't been updated within expected timeframe
 * - outlier: Values are statistical outliers (e.g., unusual prices, ages)
 */

import {
  DataRecord,
  QualityIssue,
  ValidationSchema,
  DuplicateDetectionConfig,
} from './types';

export interface IssueDetectionResult {
  issues: QualityIssue[];
  hasIssues: boolean;
  issueCount: number;
  issuesByType: Record<string, number>;
  issuesBySeverity: Record<string, number>;
}

export class IssueDetector {
  /**
   * Detect all issues in a batch of records.
   */
  detectIssues(
    records: DataRecord[],
    schema: ValidationSchema,
    sourceSystemId: string,
    entityType: string,
    duplicateConfig?: DuplicateDetectionConfig,
    freshnessThresholdDays?: number,
  ): IssueDetectionResult {
    const issues: QualityIssue[] = [];

    // Check for missing values
    records.forEach((record, idx) => {
      issues.push(...this.detectMissingValues(record, schema, sourceSystemId, entityType, `record-${idx}`));
    });

    // Check for format errors
    records.forEach((record, idx) => {
      issues.push(...this.detectFormatErrors(record, schema, sourceSystemId, entityType, `record-${idx}`));
    });

    // Check for stale data
    if (freshnessThresholdDays) {
      records.forEach((record, idx) => {
        issues.push(
          ...this.detectStaleData(record, freshnessThresholdDays, sourceSystemId, entityType, `record-${idx}`),
        );
      });
    }

    // Check for duplicates
    if (duplicateConfig) {
      issues.push(...this.detectDuplicates(records, duplicateConfig, sourceSystemId, entityType));
    }

    // Check for outliers (basic statistical)
    issues.push(...this.detectOutliers(records, schema, sourceSystemId, entityType));

    // Count by type and severity
    const issuesByType: Record<string, number> = {};
    const issuesBySeverity: Record<string, number> = {};

    issues.forEach((issue) => {
      issuesByType[issue.issueType] = (issuesByType[issue.issueType] || 0) + 1;
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
    });

    return {
      issues,
      hasIssues: issues.length > 0,
      issueCount: issues.length,
      issuesByType,
      issuesBySeverity,
    };
  }

  /**
   * Detect missing values in required fields.
   */
  private detectMissingValues(
    record: DataRecord,
    schema: ValidationSchema,
    sourceSystemId: string,
    entityType: string,
    recordId: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    Object.entries(schema).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.required && (record[fieldName] === undefined || record[fieldName] === null || record[fieldName] === '')) {
        issues.push({
          issueType: 'missing_value',
          dimension: 'completeness',
          severity: 'high',
          recordId,
          fieldName,
          currentValue: record[fieldName],
          expectedValue: `<${fieldDef.type}>`,
          detectionRule: `Required field '${fieldName}' is missing or empty`,
          autoRemediable: false,
          status: 'detected',
        });
      }
    });

    return issues;
  }

  /**
   * Detect format errors (invalid emails, dates, phone numbers, etc.).
   */
  private detectFormatErrors(
    record: DataRecord,
    schema: ValidationSchema,
    sourceSystemId: string,
    entityType: string,
    recordId: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    Object.entries(schema).forEach(([fieldName, fieldDef]) => {
      const value = record[fieldName];

      // Skip null/undefined values - those are covered by missing value detection
      if (value === undefined || value === null || value === '') {
        return;
      }

      // Type checking
      if (fieldDef.type === 'string' && typeof value !== 'string') {
        issues.push(this.createFormatIssue(recordId, fieldName, value, fieldDef, 'Type mismatch: expected string'));
      } else if (fieldDef.type === 'number' && typeof value !== 'number') {
        issues.push(this.createFormatIssue(recordId, fieldName, value, fieldDef, 'Type mismatch: expected number'));
      } else if (fieldDef.type === 'boolean' && typeof value !== 'boolean') {
        issues.push(this.createFormatIssue(recordId, fieldName, value, fieldDef, 'Type mismatch: expected boolean'));
      }

      // Format-specific validation
      if (fieldDef.format === 'email' && !this.isValidEmail(String(value))) {
        issues.push(
          this.createFormatIssue(recordId, fieldName, value, fieldDef, `Invalid email format: ${value}`),
        );
      }

      if (fieldDef.format === 'phone' && !this.isValidPhone(String(value))) {
        issues.push(
          this.createFormatIssue(recordId, fieldName, value, fieldDef, `Invalid phone format: ${value}`),
        );
      }

      if (fieldDef.format === 'date' && !this.isValidDate(String(value))) {
        issues.push(
          this.createFormatIssue(recordId, fieldName, value, fieldDef, `Invalid date format: ${value}`),
        );
      }

      // Regex pattern validation
      if (fieldDef.pattern && typeof value === 'string') {
        const regex = new RegExp(fieldDef.pattern);
        if (!regex.test(value)) {
          issues.push(
            this.createFormatIssue(
              recordId,
              fieldName,
              value,
              fieldDef,
              `Does not match pattern: ${fieldDef.pattern}`,
            ),
          );
        }
      }

      // Length validation
      if (fieldDef.minLength && String(value).length < fieldDef.minLength) {
        issues.push(
          this.createFormatIssue(
            recordId,
            fieldName,
            value,
            fieldDef,
            `Too short (min: ${fieldDef.minLength}, got: ${String(value).length})`,
          ),
        );
      }

      if (fieldDef.maxLength && String(value).length > fieldDef.maxLength) {
        issues.push(
          this.createFormatIssue(
            recordId,
            fieldName,
            value,
            fieldDef,
            `Too long (max: ${fieldDef.maxLength}, got: ${String(value).length})`,
          ),
        );
      }

      // Enum validation
      if (fieldDef.enum && !fieldDef.enum.includes(value)) {
        issues.push(
          this.createFormatIssue(
            recordId,
            fieldName,
            value,
            fieldDef,
            `Value not in allowed enum: ${fieldDef.enum.join(', ')}`,
          ),
        );
      }
    });

    return issues;
  }

  /**
   * Detect stale data (not updated within threshold).
   */
  private detectStaleData(
    record: DataRecord,
    freshnessThresholdDays: number,
    sourceSystemId: string,
    entityType: string,
    recordId: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const now = new Date();
    const staleDateThreshold = new Date(now.getTime() - freshnessThresholdDays * 24 * 60 * 60 * 1000);

    const timestampFields = ['updatedAt', 'updated_at', 'lastModified', 'modifiedDate', 'createdAt', 'created_at'];

    for (const field of timestampFields) {
      if (record[field]) {
        const timestamp = new Date(record[field] as string);
        if (!isNaN(timestamp.getTime()) && timestamp < staleDateThreshold) {
          issues.push({
            issueType: 'stale_data',
            dimension: 'timeliness',
            severity: 'medium',
            recordId,
            fieldName: field,
            currentValue: record[field],
            expectedValue: `Within last ${freshnessThresholdDays} days`,
            detectionRule: `Data not updated within ${freshnessThresholdDays} days`,
            autoRemediable: false,
            status: 'detected',
          });
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Detect duplicate records using key field matching.
   */
  private detectDuplicates(
    records: DataRecord[],
    config: DuplicateDetectionConfig,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const keyMap = new Map<string, number[]>();

    // Build a map of key combinations to record indices
    records.forEach((record, idx) => {
      const keyValues = config.keyFields.map((field) => String(record[field] || '')).join('|');
      if (!keyMap.has(keyValues)) {
        keyMap.set(keyValues, []);
      }
      keyMap.get(keyValues)!.push(idx);
    });

    // Find duplicates
    keyMap.forEach((indices) => {
      if (indices.length > 1) {
        // All but the first are duplicates
        for (let i = 1; i < indices.length; i++) {
          issues.push({
            issueType: 'duplicate',
            dimension: 'consistency',
            severity: 'high',
            recordId: `record-${indices[i]}`,
            currentValue: JSON.stringify(config.keyFields.map((f) => records[indices[i]][f])),
            expectedValue: `Unique (matches record-${indices[0]})`,
            detectionRule: `Duplicate key fields: ${config.keyFields.join(', ')}`,
            autoRemediable: true,
            status: 'detected',
          });
        }
      }
    });

    return issues;
  }

  /**
   * Detect statistical outliers in numeric fields.
   */
  private detectOutliers(
    records: DataRecord[],
    schema: ValidationSchema,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Find numeric fields
    Object.entries(schema).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.type !== 'number') return;

      const values = records
        .map((r) => {
          const v = r[fieldName];
          return typeof v === 'number' ? v : null;
        })
        .filter((v) => v !== null) as number[];

      if (values.length < 3) return; // Need at least 3 values for outlier detection

      // Calculate mean and standard deviation
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      // Find outliers (> 3 standard deviations)
      records.forEach((record, idx) => {
        const value = record[fieldName];
        if (typeof value === 'number') {
          const zScore = Math.abs((value - mean) / stdDev);
          if (zScore > 3) {
            issues.push({
              issueType: 'outlier',
              dimension: 'accuracy',
              severity: 'low',
              recordId: `record-${idx}`,
              fieldName,
              currentValue: value,
              expectedValue: `Between ${mean - 3 * stdDev} and ${mean + 3 * stdDev}`,
              detectionRule: `Statistical outlier (${zScore.toFixed(2)} standard deviations from mean)`,
              autoRemediable: false,
              status: 'detected',
            });
          }
        }
      });
    });

    return issues;
  }

  private createFormatIssue(
    recordId: string,
    fieldName: string,
    value: unknown,
    fieldDef: any,
    rule: string,
  ): QualityIssue {
    return {
      issueType: 'format_error',
      dimension: 'validity',
      severity: 'medium',
      recordId,
      fieldName,
      currentValue: value,
      expectedValue: `Valid ${fieldDef.type}${fieldDef.format ? ` (${fieldDef.format})` : ''}`,
      detectionRule: rule,
      autoRemediable: false,
      status: 'detected',
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // Allow various phone formats
    const phoneRegex = /^[\d\-\+\s\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  private isValidDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }
}
