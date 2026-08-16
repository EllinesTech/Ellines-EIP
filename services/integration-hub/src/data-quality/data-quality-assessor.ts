/**
 * DataQualityAssessor — Assesses data quality across five dimensions.
 * 
 * Dimensions:
 * 1. Completeness — % of required fields populated
 * 2. Accuracy — % of values matching validation rules
 * 3. Consistency — % data consistent across sources
 * 4. Timeliness — % recent data (not stale)
 * 5. Validity — % passing format/type checks
 */

import {
  DataRecord,
  QualityDimensions,
  DataQualityScoreResult,
  ValidationSchema,
  QualityAssessmentConfig,
} from './types';

export class DataQualityAssessor {
  assessData(
    records: DataRecord[],
    schema: ValidationSchema,
    config: QualityAssessmentConfig,
  ): DataQualityScoreResult {
    if (records.length === 0) {
      return {
        overallScore: 0,
        qualityRating: 'poor',
        dimensions: {
          completeness: 0,
          accuracy: 0,
          consistency: 0,
          timeliness: 0,
          validity: 0,
        },
        recordsAssessed: 0,
        recordsWithIssues: 0,
      };
    }

    const sampleRecords = this.sampleRecords(records, config.samplingRate || 1.0);

    const dimensions: QualityDimensions = {
      completeness: this.assessCompleteness(sampleRecords, schema),
      accuracy: this.assessAccuracy(sampleRecords, schema),
      consistency: this.assessConsistency(sampleRecords, schema),
      timeliness: this.assessTimeliness(sampleRecords, config.freshnessDays || 30),
      validity: this.assessValidity(sampleRecords, schema),
    };

    const overallScore =
      (dimensions.completeness +
        dimensions.accuracy +
        dimensions.consistency +
        dimensions.timeliness +
        dimensions.validity) /
      5;

    const qualityRating = this.getQualityRating(overallScore);

    const recordsWithIssues = sampleRecords.filter(
      (record) =>
        this.hasCompletenessIssue(record, schema) ||
        this.hasValidityIssue(record, schema) ||
        this.hasAccuracyIssue(record, schema),
    ).length;

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      qualityRating,
      dimensions: {
        completeness: Math.round(dimensions.completeness * 100) / 100,
        accuracy: Math.round(dimensions.accuracy * 100) / 100,
        consistency: Math.round(dimensions.consistency * 100) / 100,
        timeliness: Math.round(dimensions.timeliness * 100) / 100,
        validity: Math.round(dimensions.validity * 100) / 100,
      },
      recordsAssessed: sampleRecords.length,
      recordsWithIssues,
    };
  }

  private assessCompleteness(records: DataRecord[], schema: ValidationSchema): number {
    if (records.length === 0) return 0;

    let totalFieldsExpected = 0;
    let totalFieldsPopulated = 0;

    records.forEach((record) => {
      Object.entries(schema).forEach(([fieldName, fieldDef]) => {
        if (fieldDef.required) {
          totalFieldsExpected++;
          if (
            record[fieldName] !== undefined &&
            record[fieldName] !== null &&
            record[fieldName] !== ''
          ) {
            totalFieldsPopulated++;
          }
        }
      });
    });

    return totalFieldsExpected === 0 ? 100 : (totalFieldsPopulated / totalFieldsExpected) * 100;
  }

  private assessAccuracy(records: DataRecord[], schema: ValidationSchema): number {
    if (records.length === 0) return 0;

    let totalValues = 0;
    let accurateValues = 0;

    records.forEach((record) => {
      Object.entries(schema).forEach(([fieldName, fieldDef]) => {
        const value = record[fieldName];
        if (value !== undefined && value !== null) {
          totalValues++;
          if (this.isValueAccurate(value, fieldDef)) {
            accurateValues++;
          }
        }
      });
    });

    return totalValues === 0 ? 100 : (accurateValues / totalValues) * 100;
  }

  private assessConsistency(records: DataRecord[], schema: ValidationSchema): number {
    // For now, consistency is assessed by checking if all records have the same structure
    if (records.length <= 1) return 100;

    let consistentRecords = 0;
    const firstRecord = records[0];
    const expectedFields = Object.keys(schema);

    records.forEach((record) => {
      const recordFields = Object.keys(record).sort();
      const hasAllFields = expectedFields.every((field) => field in record);
      if (hasAllFields) {
        consistentRecords++;
      }
    });

    return (consistentRecords / records.length) * 100;
  }

  private assessTimeliness(records: DataRecord[], freshnessDays: number): number {
    if (records.length === 0) return 0;

    const now = new Date();
    const staleDateThreshold = new Date(now.getTime() - freshnessDays * 24 * 60 * 60 * 1000);

    let recentRecords = 0;

    records.forEach((record) => {
      // Look for common timestamp fields
      const timestampFields = ['updatedAt', 'updated_at', 'lastModified', 'createdAt', 'created_at'];
      let recordIsRecent = false;

      for (const field of timestampFields) {
        if (record[field]) {
          const timestamp = new Date(record[field] as string);
          if (timestamp >= staleDateThreshold) {
            recordIsRecent = true;
            break;
          }
        }
      }

      if (recordIsRecent) {
        recentRecords++;
      }
    });

    return (recentRecords / records.length) * 100;
  }

  private assessValidity(records: DataRecord[], schema: ValidationSchema): number {
    if (records.length === 0) return 0;

    let totalValues = 0;
    let validValues = 0;

    records.forEach((record) => {
      Object.entries(schema).forEach(([fieldName, fieldDef]) => {
        const value = record[fieldName];
        if (value !== undefined && value !== null) {
          totalValues++;
          if (this.isValueValid(value, fieldDef)) {
            validValues++;
          }
        }
      });
    });

    return totalValues === 0 ? 100 : (validValues / totalValues) * 100;
  }

  private isValueAccurate(value: unknown, fieldDef: any): boolean {
    // Accuracy checks: does value match the definition's constraints
    if (fieldDef.enum && !fieldDef.enum.includes(value)) {
      return false;
    }
    if (fieldDef.pattern && typeof value === 'string') {
      const regex = new RegExp(fieldDef.pattern);
      if (!regex.test(value)) {
        return false;
      }
    }
    return true;
  }

  private isValueValid(value: unknown, fieldDef: any): boolean {
    // Type checking
    if (fieldDef.type === 'string' && typeof value !== 'string') {
      return false;
    }
    if (fieldDef.type === 'number' && typeof value !== 'number') {
      return false;
    }
    if (fieldDef.type === 'boolean' && typeof value !== 'boolean') {
      return false;
    }

    // Format checking
    if (fieldDef.format === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(value))) {
        return false;
      }
    }

    if (fieldDef.format === 'date') {
      const date = new Date(String(value));
      if (isNaN(date.getTime())) {
        return false;
      }
    }

    // Length checking
    if (fieldDef.minLength && String(value).length < fieldDef.minLength) {
      return false;
    }
    if (fieldDef.maxLength && String(value).length > fieldDef.maxLength) {
      return false;
    }

    return true;
  }

  private hasCompletenessIssue(record: DataRecord, schema: ValidationSchema): boolean {
    return Object.entries(schema).some(
      ([fieldName, fieldDef]) =>
        fieldDef.required &&
        (record[fieldName] === undefined || record[fieldName] === null || record[fieldName] === ''),
    );
  }

  private hasValidityIssue(record: DataRecord, schema: ValidationSchema): boolean {
    return Object.entries(schema).some(
      ([fieldName, fieldDef]) =>
        record[fieldName] !== undefined &&
        record[fieldName] !== null &&
        !this.isValueValid(record[fieldName], fieldDef),
    );
  }

  private hasAccuracyIssue(record: DataRecord, schema: ValidationSchema): boolean {
    return Object.entries(schema).some(
      ([fieldName, fieldDef]) =>
        record[fieldName] !== undefined &&
        record[fieldName] !== null &&
        !this.isValueAccurate(record[fieldName], fieldDef),
    );
  }

  private getQualityRating(overallScore: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (overallScore >= 90) return 'excellent';
    if (overallScore >= 75) return 'good';
    if (overallScore >= 60) return 'fair';
    return 'poor';
  }

  private sampleRecords(records: DataRecord[], samplingRate: number): DataRecord[] {
    if (samplingRate >= 1.0) return records;
    const sampleSize = Math.max(1, Math.ceil(records.length * samplingRate));
    const sampled: DataRecord[] = [];
    const step = Math.floor(records.length / sampleSize);

    for (let i = 0; i < records.length; i += step) {
      if (sampled.length < sampleSize) {
        sampled.push(records[i]);
      }
    }

    return sampled;
  }
}
