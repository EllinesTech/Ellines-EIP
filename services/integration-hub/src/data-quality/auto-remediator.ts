/**
 * AutoRemediator — Applies automated data cleansing and remediation.
 * 
 * Capabilities:
 * - Apply cleansing rules (trim, normalize, standardize)
 * - Merge duplicate records
 * - Correct data formats (dates, phone numbers, etc.)
 * - Track remediation results and success rates
 */

import {
  DataRecord,
  RemediationResult,
  CleansingRuleDefinition,
  RemediationAction,
  QualityIssue,
} from './types';

export class AutoRemediator {
  /**
   * Attempt to remediate a record using available cleansing rules.
   */
  remediateRecord(
    record: DataRecord,
    issues: QualityIssue[],
    rules: CleansingRuleDefinition[],
  ): RemediationResult {
    const originalData = { ...record };
    const remediatedData = { ...record };
    const appliedRules: string[] = [];
    const errors: string[] = [];

    // Identify issues that can be auto-remediated
    const remediableIssues = issues.filter((i) => i.autoRemediable);

    // Apply rules for each remediable issue
    remediableIssues.forEach((issue) => {
      const applicableRules = this.findApplicableRules(issue, rules);

      applicableRules.forEach((rule) => {
        try {
          const success = this.applyRule(remediatedData, rule);
          if (success) {
            appliedRules.push(rule.name);
          }
        } catch (error) {
          errors.push(`Error applying rule '${rule.name}': ${String(error)}`);
        }
      });
    });

    return {
      success: errors.length === 0 && appliedRules.length > 0,
      recordId: String(record.id || 'unknown'),
      originalData,
      remediatedData,
      appliedRules,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Merge duplicate records, keeping data from the primary record
   * and filling missing values from duplicates.
   */
  mergeDuplicates(primary: DataRecord, duplicates: DataRecord[]): DataRecord {
    const merged = { ...primary };

    // Fill missing values from duplicates
    duplicates.forEach((dup) => {
      Object.entries(dup).forEach(([key, value]) => {
        if (
          merged[key] === undefined ||
          merged[key] === null ||
          merged[key] === '' ||
          (typeof merged[key] === 'object' && Object.keys(merged[key] as Record<string, unknown>).length === 0)
        ) {
          merged[key] = value;
        }
      });
    });

    return merged;
  }

  /**
   * Trim whitespace from string fields.
   */
  trim(data: DataRecord, fields?: string[]): DataRecord {
    const result = { ...data };

    const fieldsToTrim = fields || Object.keys(result).filter((key) => typeof result[key] === 'string');

    fieldsToTrim.forEach((field) => {
      if (typeof result[field] === 'string') {
        result[field] = (result[field] as string).trim();
      }
    });

    return result;
  }

  /**
   * Normalize text case (uppercase, lowercase, title case).
   */
  normalizeCaseChange(data: DataRecord, fields: string[], caseType: 'upper' | 'lower' | 'title'): DataRecord {
    const result = { ...data };

    fields.forEach((field) => {
      if (typeof result[field] === 'string') {
        const value = result[field] as string;
        switch (caseType) {
          case 'upper':
            result[field] = value.toUpperCase();
            break;
          case 'lower':
            result[field] = value.toLowerCase();
            break;
          case 'title':
            result[field] = value
              .toLowerCase()
              .split(' ')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            break;
        }
      }
    });

    return result;
  }

  /**
   * Standardize phone number format.
   */
  standardizePhoneNumber(
    data: DataRecord,
    field: string,
    format: 'international' | 'national' | 'e164' = 'national',
  ): DataRecord {
    const result = { ...data };

    if (typeof result[field] === 'string') {
      const digits = (result[field] as string).replace(/\D/g, '');

      switch (format) {
        case 'e164':
          // +1234567890
          result[field] = '+' + digits;
          break;
        case 'national':
          // (123) 456-7890
          if (digits.length === 10) {
            result[field] = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
          }
          break;
        case 'international':
          // +1 123 456 7890
          result[field] = '+' + digits.slice(-10);
          break;
      }
    }

    return result;
  }

  /**
   * Standardize date format to ISO 8601.
   */
  standardizeDateFormat(data: DataRecord, field: string): DataRecord {
    const result = { ...data };

    if (result[field]) {
      const date = new Date(result[field] as string);
      if (!isNaN(date.getTime())) {
        result[field] = date.toISOString().split('T')[0];
      }
    }

    return result;
  }

  /**
   * Replace values with mapped alternatives.
   */
  replaceValues(data: DataRecord, field: string, mapping: Record<string, unknown>): DataRecord {
    const result = { ...data };

    if (result[field] && String(result[field]) in mapping) {
      result[field] = mapping[String(result[field])];
    }

    return result;
  }

  /**
   * Handle null/empty values with default replacements.
   */
  replaceNulls(data: DataRecord, defaults: Record<string, unknown>): DataRecord {
    const result = { ...data };

    Object.entries(defaults).forEach(([field, defaultValue]) => {
      if (result[field] === null || result[field] === undefined || result[field] === '') {
        result[field] = defaultValue;
      }
    });

    return result;
  }

  /**
   * Find rules applicable to a given issue.
   */
  private findApplicableRules(issue: QualityIssue, rules: CleansingRuleDefinition[]): CleansingRuleDefinition[] {
    return rules.filter((rule) => {
      // Rule type must match issue type
      if (issue.issueType === 'missing_value' && rule.ruleType !== 'replace') {
        return false;
      }
      if (issue.issueType === 'format_error' && !['standardize', 'normalize', 'validate'].includes(rule.ruleType)) {
        return false;
      }
      if (issue.issueType === 'duplicate' && rule.ruleType !== 'validate') {
        return false;
      }

      // Field must match (if specified)
      if (rule.fieldName && rule.fieldName !== issue.fieldName) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply a single cleansing rule to data.
   */
  private applyRule(data: DataRecord, rule: CleansingRuleDefinition): boolean {
    const action = rule.transformation;

    // Check condition if specified
    if (rule.condition) {
      if (!this.evaluateCondition(data, rule.condition)) {
        return false;
      }
    }

    switch (action.type) {
      case 'trim': {
        const fields = rule.fieldName ? [rule.fieldName] : Object.keys(data).filter((k) => typeof data[k] === 'string');
        const trimmed = this.trim(data, fields);
        Object.assign(data, trimmed);
        return true;
      }
      case 'standardize': {
        if (!rule.fieldName) return false;
        const config = action.config as Record<string, unknown>;

        if (config.type === 'phone') {
          const standardized = this.standardizePhoneNumber(data, rule.fieldName, config.format as any);
          Object.assign(data, standardized);
          return true;
        }
        if (config.type === 'date') {
          const standardized = this.standardizeDateFormat(data, rule.fieldName);
          Object.assign(data, standardized);
          return true;
        }
        if (config.type === 'case') {
          const standardized = this.normalizeCaseChange(data, [rule.fieldName], config.caseType as any);
          Object.assign(data, standardized);
          return true;
        }
        return false;
      }
      case 'normalize': {
        if (!rule.fieldName) return false;
        const config = action.config as Record<string, unknown>;
        const caseType = config.caseType as 'upper' | 'lower' | 'title';
        const normalized = this.normalizeCaseChange(data, [rule.fieldName], caseType);
        Object.assign(data, normalized);
        return true;
      }
      case 'replace': {
        if (!rule.fieldName) return false;
        const config = action.config as Record<string, unknown>;

        if (config.mapping) {
          const replaced = this.replaceValues(data, rule.fieldName, config.mapping as Record<string, unknown>);
          Object.assign(data, replaced);
          return true;
        }
        if (config.default) {
          const replaced = this.replaceNulls(data, { [rule.fieldName]: config.default });
          Object.assign(data, replaced);
          return true;
        }
        return false;
      }
      case 'validate': {
        // Validation doesn't modify data, just returns true/false
        if (!rule.fieldName) return false;
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * Evaluate a condition against data.
   */
  private evaluateCondition(data: DataRecord, condition: Record<string, unknown>): boolean {
    // Simple condition evaluation: { field: value } or { field: { operator: value } }
    for (const [field, expected] of Object.entries(condition)) {
      const actual = data[field];

      if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
        const operators = expected as Record<string, unknown>;
        for (const [op, value] of Object.entries(operators)) {
          switch (op) {
            case 'eq':
              if (actual !== value) return false;
              break;
            case 'ne':
              if (actual === value) return false;
              break;
            case 'gt':
              if (typeof actual !== 'number' || typeof value !== 'number' || actual <= value) return false;
              break;
            case 'lt':
              if (typeof actual !== 'number' || typeof value !== 'number' || actual >= value) return false;
              break;
            case 'exists':
              if (value && (actual === null || actual === undefined)) return false;
              if (!value && actual !== null && actual !== undefined) return false;
              break;
          }
        }
      } else if (actual !== expected) {
        return false;
      }
    }

    return true;
  }
}
