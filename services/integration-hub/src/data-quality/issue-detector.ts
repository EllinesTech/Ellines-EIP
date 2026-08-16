/**
 * IssueDetector — Detects individual data quality issues.
 * 
 * Detects:
 * - Missing values
 * - Duplicates
 * - Format errors
 * - Referential integrity violations
 * - Stale data (timeliness issues)
 * - Outliers and anomalies
 */

import {
  DataRecord,
  QualityIssue,
  ValidationSchema,
  DuplicateDetectionConfig,
} from './types';

export class IssueDetector {
  /**
   * Detect all data quality issues in records
   */
  detectIssues(
    records: DataRecord[],
    schema: ValidationSchema,
    sourceSystemId: string,
    entityType: string,
    duplicateConfig?: DuplicateDetectionConfig,
    freshnessDays?: number,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const issueIdSet = new Set<string>();

    // Detect missing values
    records.forEach((record, index) => {
      const missingIssues = this.detectMissingValues(
        record,
        schema,
        index,
        sourceSystemId,
        entityType,
      );
      missingIssues.forEach((issue) => {
        issues.push(issue);
      });
    });

    // Detect format errors and validity issues
    records.forEach((record, index) => {
      const formatIssues = this.detectFormatErrors(
        record,
        schema,
        index,
        sourceSystemId,
        entityType,
      );
      formatIssues.forEach((issue) => {
        issues.push(issue);
      });
    });

    // Detect duplicates
    if (duplicateConfig) {
      const duplicateIssues = this.detectDuplicates(
        records,
        duplicateConfig,
        sourceSystemId,
        entityType,
      );
      duplicateIssues.forEach((issue) => {
        issues.push(issue);
      });
    }

    // Detect stale data
    if (freshnessDays) {
      records.forEach((record, index) => {
        const staleIssues = this.detectStaleData(
          record,
          index,
          freshnessDays,
          sourceSystemId,
          entityType,
        );
        staleIssues.forEach((issue) => {
          issues.push(issue);
        });
      });
    }

    // Detect outliers
    const outlierIssues = this.detectOutliers(
      records,
      schema,
      sourceSystemId,
      entityType,
    );
    outlierIssues.forEach((issue) => {
      issues.push(issue);
    });

    return issues;
  }

  private detectMissingValues(
    record: DataRecord,
    schema: ValidationSchema,
    recordIndex: number,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    Object.entries(schema).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.required) {
        const value = record[fieldName];
        if (value === undefined || value === null || value === '') {
          issues.push({
            issueType: 'missing_value',
            dimension: 'completeness',
            severity: 'high',
            recordId: String(record.id || recordIndex),
            fieldName,
            currentValue: value,
            expectedValue: `<${fieldName}>`,
            detectionRule: `Required field "${fieldName}" is missing`,
            autoRemediable: false,
            status: 'detected',
          });
        }
      }
    });

    return issues;
  }

  private detectFormatErrors(
    record: DataRecord,
    schema: ValidationSchema,
    recordIndex: number,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    Object.entries(schema).forEach(([fieldName, fieldDef]) => {
      const value = record[fieldName];
      if (value !== undefined && value !== null && value !== '') {
        // Type checking
        if (fieldDef.type === 'string' && typeof value !== 'string') {
          issues.push({
            issueType: 'format_error',
            dimension: 'validity',
            severity: 'high',
            recordId: String(record.id || recordIndex),
            fieldName,
            currentValue: value,
            expectedValue: `string (got ${typeof value})`,
            detectionRule: `Field "${fieldName}" should be string but is ${typeof value}`,
            autoRemediable: true,
            status: 'detected',
          });
        }

        if (fieldDef.type === 'number' && typeof value !== 'number') {
          issues.push({
            issueType: 'format_error',
            dimension: 'validity',
            severity: 'high',
            recordId: String(record.id || recordIndex),
            fieldName,
            currentValue: value,
            expectedValue: 'number',
            detectionRule: `Field "${fieldName}" should be number`,
            autoRemediable: true,
            status: 'detected',
          });
        }

        // Format validation
        if (fieldDef.format === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(value))) {
            issues.push({
              issueType: 'format_error',
              dimension: 'validity',
              severity: 'medium',
              recordId: String(record.id || recordIndex),
              fieldName,
              currentValue: value,
              expectedValue: 'valid email format',
              detectionRule: `Field "${fieldName}" does not match email format`,
              autoRemediable: false,
              status: 'detected',
            });
          }
        }

        if (fieldDef.format === 'date') {
          const date = new Date(String(value));
          if (isNaN(date.getTime())) {
            issues.push({
              issueType: 'format_error',
              dimension: 'validity',
              severity: 'medium',
              recordId: String(record.id || recordIndex),
              fieldName,
              currentValue: value,
              expectedValue: 'valid date',
              detectionRule: `Field "${fieldName}" is not a valid date`,
              autoRemediable: false,
              status: 'detected',
            });
          }
        }

        // Pattern matching
        if (fieldDef.pattern) {
          const regex = new RegExp(fieldDef.pattern);
          if (!regex.test(String(value))) {
            issues.push({
              issueType: 'format_error',
              dimension: 'validity',
              severity: 'medium',
              recordId: String(record.id || recordIndex),
              fieldName,
              currentValue: value,
              expectedValue: `matches pattern ${fieldDef.pattern}`,
              detectionRule: `Field "${fieldName}" does not match pattern ${fieldDef.pattern}`,
              autoRemediable: false,
              status: 'detected',
            });
          }
        }

        // Length validation
        if (fieldDef.minLength && String(value).length < fieldDef.minLength) {
          issues.push({
            issueType: 'format_error',
            dimension: 'validity',
            severity: 'low',
            recordId: String(record.id || recordIndex),
            fieldName,
            currentValue: value,
            expectedValue: `minimum ${fieldDef.minLength} characters`,
            detectionRule: `Field "${fieldName}" is shorter than minimum ${fieldDef.minLength}`,
            autoRemediable: false,
            status: 'detected',
          });
        }

        if (fieldDef.maxLength && String(value).length > fieldDef.maxLength) {
          issues.push({
            issueType: 'format_error',
            dimension: 'validity',
            severity: 'low',
            recordId: String(record.id || recordIndex),
            fieldName,
            currentValue: value,
            expectedValue: `maximum ${fieldDef.maxLength} characters`,
            detectionRule: `Field "${fieldName}" is longer than maximum ${fieldDef.maxLength}`,
            autoRemediable: true,
            status: 'detected',
          });
        }

        // Enum validation
        if (fieldDef.enum && !fieldDef.enum.includes(value)) {
          issues.push({
            issueType: 'format_error',
            dimension: 'accuracy',
            severity: 'medium',
            recordId: String(record.id || recordIndex),
            fieldName,
            currentValue: value,
            expectedValue: `one of [${fieldDef.enum.join(', ')}]`,
            detectionRule: `Field "${fieldName}" has invalid enum value`,
            autoRemediable: false,
            status: 'detected',
          });
        }
      }
    });

    return issues;
  }

  private detectDuplicates(
    records: DataRecord[],
    config: DuplicateDetectionConfig,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const seen = new Map<string, number>();

    records.forEach((record, index) => {
      const key = config.keyFields.map((field) => record[field]).join('|');
      if (seen.has(key)) {
        issues.push({
          issueType: 'duplicate',
          dimension: 'consistency',
          severity: 'high',
          recordId: String(record.id || index),
          detectionRule: `Duplicate detected by key fields: ${config.keyFields.join(', ')}`,
          autoRemediable: false,
          status: 'detected',
          currentValue: key,
          expectedValue: 'unique',
        });
      } else {
        seen.set(key, index);
      }
    });

    return issues;
  }

  private detectStaleData(
    record: DataRecord,
    recordIndex: number,
    freshnessDays: number,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const timestampFields = ['updatedAt', 'updated_at', 'lastModified', 'createdAt', 'created_at'];
    const now = new Date();
    const staleDateThreshold = new Date(now.getTime() - freshnessDays * 24 * 60 * 60 * 1000);

    for (const field of timestampFields) {
      if (record[field]) {
        const timestamp = new Date(record[field] as string);
        if (timestamp < staleDateThreshold) {
          issues.push({
            issueType: 'stale_data',
            dimension: 'timeliness',
            severity: 'medium',
            recordId: String(record.id || recordIndex),
            fieldName: field,
            currentValue: record[field],
            expectedValue: `updated within ${freshnessDays} days`,
            detectionRule: `Record not updated in ${freshnessDays} days`,
            autoRemediable: false,
            status: 'detected',
          });
          break;
        }
      }
    }

    return issues;
  }

  private detectOutliers(
    records: DataRecord[],
    schema: ValidationSchema,
    sourceSystemId: string,
    entityType: string,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Simple outlier detection for numeric fields
    Object.entries(schema).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.type === 'number') {
        const numbers: { value: number; index: number }[] = [];

        records.forEach((record, index) => {
          const value = record[fieldName];
          if (typeof value === 'number') {
            numbers.push({ value, index });
          }
        });

        if (numbers.length > 3) {
          // Calculate mean and standard deviation
          const mean = numbers.reduce((sum, item) => sum + item.value, 0) / numbers.length;
          const variance =
            numbers.reduce((sum, item) => sum + Math.pow(item.value - mean, 2), 0) /
            numbers.length;
          const stdDev = Math.sqrt(variance);

          // Flag values > 3 standard deviations from mean as outliers
          numbers.forEach(({ value, index }) => {
            if (Math.abs(value - mean) > 3 * stdDev) {
              issues.push({
                issueType: 'outlier',
                dimension: 'accuracy',
                severity: 'low',
                recordId: String(records[index].id || index),
                fieldName,
                currentValue: value,
                expectedValue: `within ${3 * stdDev} of mean ${mean}`,
                detectionRule: `Field "${fieldName}" is a statistical outlier`,
                autoRemediable: false,
                status: 'detected',
              });
            }
          });
        }
      }
    });

    return issues;
  }
}
