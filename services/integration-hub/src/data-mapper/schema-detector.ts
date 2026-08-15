/**
 * SchemaDetector
 * Requirement 22.4: Intelligent data mapping with automatic schema detection
 *
 * Inspects a set of data source records and infers field names, types,
 * nullability, and example values.
 */

import { Injectable, Logger } from '@nestjs/common';

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'unknown';

export interface FieldSchema {
  /** Field name as found in the source records */
  name: string;
  /** Inferred TypeScript-like type */
  type: FieldType;
  /** True when at least one record has null/undefined for this field */
  nullable: boolean;
  /** Up to 5 distinct non-null sample values */
  examples: unknown[];
  /** How many records contained this field */
  occurrences: number;
  /** Total records inspected */
  totalRecords: number;
}

export interface DetectedSchema {
  /** Number of records inspected */
  recordCount: number;
  /** Detected field schemas, one per unique key */
  fields: FieldSchema[];
  /** ISO timestamp of detection */
  detectedAt: string;
}

@Injectable()
export class SchemaDetector {
  private readonly logger = new Logger(SchemaDetector.name);

  /**
   * Detect schema from an array of plain objects.
   * Requirement 22.4 — auto schema detection from data source records.
   */
  detectSchema(records: Record<string, unknown>[]): DetectedSchema {
    if (!Array.isArray(records) || records.length === 0) {
      return { recordCount: 0, fields: [], detectedAt: new Date().toISOString() };
    }

    // Gather stats per field across all records
    const fieldMap = new Map<
      string,
      { types: Set<FieldType>; nullCount: number; examples: Set<unknown>; occurrences: number }
    >();

    for (const record of records) {
      if (record === null || typeof record !== 'object') continue;

      for (const [key, value] of Object.entries(record)) {
        if (!fieldMap.has(key)) {
          fieldMap.set(key, { types: new Set(), nullCount: 0, examples: new Set(), occurrences: 0 });
        }
        const stat = fieldMap.get(key)!;
        stat.occurrences += 1;

        if (value === null || value === undefined) {
          stat.nullCount += 1;
          stat.types.add('null');
        } else {
          stat.types.add(this.inferType(value));
          if (stat.examples.size < 5) {
            stat.examples.add(value);
          }
        }
      }
    }

    const fields: FieldSchema[] = [];
    for (const [name, stat] of fieldMap.entries()) {
      // Pick dominant type (exclude 'null' when other types exist)
      const nonNullTypes = Array.from(stat.types).filter((t) => t !== 'null');
      const dominantType: FieldType =
        nonNullTypes.length > 0 ? (nonNullTypes[0] as FieldType) : 'null';

      fields.push({
        name,
        type: dominantType,
        nullable: stat.nullCount > 0,
        examples: Array.from(stat.examples).slice(0, 5),
        occurrences: stat.occurrences,
        totalRecords: records.length,
      });
    }

    this.logger.debug(`Schema detected: ${fields.length} fields from ${records.length} records`);
    return { recordCount: records.length, fields, detectedAt: new Date().toISOString() };
  }

  private inferType(value: unknown): FieldType {
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    const t = typeof value;
    switch (t) {
      case 'string':
        // Try to detect date strings
        if (this.looksLikeDate(value as string)) return 'date';
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      default:
        return 'unknown';
    }
  }

  private looksLikeDate(value: string): boolean {
    // ISO 8601, common date formats
    return /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/.test(value);
  }
}
