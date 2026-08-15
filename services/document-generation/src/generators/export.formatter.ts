/**
 * CSV, JSON, XML Export Formatters
 * Requirement 27.5: Multi-format export
 */

import { Injectable, Logger } from '@nestjs/common';
import { create } from 'xmlbuilder2';

@Injectable()
export class ExportFormatterService {
  private readonly logger = new Logger(ExportFormatterService.name);

  /**
   * Export data to CSV string
   * Requirement 27.5
   */
  exportCSV(data: Record<string, unknown>[], headers?: string[]): string {
    if (!data.length) return '';

    const cols = headers || Object.keys(data[0]);

    const escapeCell = (val: unknown): string => {
      const str = val == null ? '' : String(val);
      // Escape quotes and wrap with commas/newlines in quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines: string[] = [];
    lines.push(cols.map(escapeCell).join(','));

    for (const row of data) {
      lines.push(cols.map((col) => escapeCell(row[col])).join(','));
    }

    this.logger.log(`CSV exported: ${lines.length - 1} rows, ${cols.length} columns`);
    return lines.join('\r\n');
  }

  /**
   * Export data to formatted JSON string
   * Requirement 27.5
   */
  exportJSON(data: unknown): string {
    const json = JSON.stringify(data, null, 2);
    this.logger.log(`JSON exported: ${json.length} characters`);
    return json;
  }

  /**
   * Export data to XML string
   * Requirement 27.5
   */
  exportXML(data: Record<string, unknown>[], rootElement = 'records'): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' }).ele(rootElement);

    for (const row of data) {
      const record = root.ele('record');
      for (const [key, value] of Object.entries(row)) {
        // Sanitise key — XML element names cannot start with numbers or contain spaces
        const safeKey = this.sanitiseXmlKey(key);
        const node = record.ele(safeKey);
        if (value == null) {
          node.att('nil', 'true');
        } else if (typeof value === 'object') {
          node.txt(JSON.stringify(value));
        } else {
          node.txt(String(value));
        }
      }
    }

    const xml = root.end({ prettyPrint: true });
    this.logger.log(`XML exported: ${data.length} records`);
    return xml;
  }

  private sanitiseXmlKey(key: string): string {
    // Replace spaces and special chars with underscore; ensure doesn't start with number/dash
    const cleaned = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || 'field';
  }
}
