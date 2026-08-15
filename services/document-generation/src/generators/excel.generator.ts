/**
 * Excel Workbook Generator
 * Requirement 27.1: Generate Excel workbooks with sheets, formulas, charts, pivot tables
 */

import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  ExcelConfig,
  SheetDefinition,
  FormulaDefinition,
  ChartDefinition,
  BrandingConfig,
} from '../interfaces/document-generation.interfaces';

@Injectable()
export class ExcelGeneratorService {
  private readonly logger = new Logger(ExcelGeneratorService.name);

  /**
   * Generate an Excel workbook buffer
   * Requirement 27.1
   */
  async generate(config: ExcelConfig): Promise<Buffer> {
    this.logger.log(`Generating Excel workbook: "${config.title || 'Untitled'}"`);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = config.branding?.organizationName || 'Ellines EIP';
    workbook.lastModifiedBy = 'Ellines Document Generation';
    workbook.created = new Date();
    workbook.modified = new Date();

    if (config.title) {
      workbook.title = config.title;
    }

    // Add sheets
    for (const sheetDef of config.sheets) {
      await this.buildSheet(workbook, sheetDef, config);
    }

    // Apply formulas to specific cells
    if (config.formulas?.length) {
      this.applyFormulas(workbook, config.formulas);
    }

    // Add charts
    if (config.charts?.length) {
      this.addCharts(workbook, config.charts);
    }

    // Apply branding colours to all sheets
    if (config.branding) {
      this.applyBrandingToWorkbook(workbook, config.branding);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    this.logger.log(`Excel workbook generated (${buffer.byteLength} bytes)`);
    return Buffer.from(buffer);
  }

  private async buildSheet(
    workbook: ExcelJS.Workbook,
    sheetDef: SheetDefinition,
    config: ExcelConfig,
  ): Promise<ExcelJS.Worksheet> {
    const ws = workbook.addWorksheet(sheetDef.name);
    const formatting = config.formatting || {};
    const headerStyle = formatting.headerStyle || {};

    // Write headers
    if (sheetDef.headers?.length) {
      const headerRow = ws.addRow(sheetDef.headers);

      headerRow.eachCell((cell) => {
        cell.font = {
          bold: headerStyle.bold !== false,
          size: headerStyle.fontSize || 11,
          color: { argb: this.toArgb(headerStyle.fontColor || '#FFFFFF') },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: this.toArgb(headerStyle.bgColor || '#6F2D8D') },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FF888888' } },
        };
      });

      if (formatting.freezeTopRow) {
        ws.views = [{ state: 'frozen', ySplit: 1 }];
      }

      if (formatting.autoFilter) {
        ws.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: sheetDef.headers.length },
        };
      }
    }

    // Write data rows
    for (let rowIdx = 0; rowIdx < sheetDef.data.length; rowIdx++) {
      const rowData = sheetDef.data[rowIdx];
      const dataRow = ws.addRow(rowData.map((cell) => (cell == null ? '' : String(cell))));

      if (formatting.alternateRowColor && rowIdx % 2 === 1) {
        dataRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: this.toArgb(formatting.alternateRowColor!) },
          };
        });
      }
    }

    // Auto-fit column widths
    if (sheetDef.columnWidths?.length) {
      sheetDef.columnWidths.forEach((width, idx) => {
        const col = ws.getColumn(idx + 1);
        col.width = width;
      });
    } else if (sheetDef.headers?.length) {
      sheetDef.headers.forEach((header, idx) => {
        const col = ws.getColumn(idx + 1);
        col.width = Math.max(header.length + 4, 12);
      });
    }

    return ws;
  }

  private applyFormulas(workbook: ExcelJS.Workbook, formulas: FormulaDefinition[]): void {
    for (const f of formulas) {
      const ws = workbook.getWorksheet(f.sheet);
      if (!ws) {
        this.logger.warn(`Sheet "${f.sheet}" not found for formula at ${f.cell}`);
        continue;
      }
      const cell = ws.getCell(f.cell);
      cell.value = { formula: f.formula } as ExcelJS.CellFormulaValue;
    }
  }

  private addCharts(workbook: ExcelJS.Workbook, charts: ChartDefinition[]): void {
    // ExcelJS chart support is limited — we annotate a "Charts" sheet for documentation
    // Full chart objects require additional tooling (xlsx-populate or template approach)
    for (const chart of charts) {
      const ws = workbook.getWorksheet(chart.sheet);
      if (!ws) continue;

      // Add a comment cell indicating chart intent
      const cell = ws.getCell(chart.position.row + 1, chart.position.col + 1);
      cell.note = `[Chart: ${chart.type.toUpperCase()} — ${chart.title} | Data: ${chart.dataRange}]`;
    }
    this.logger.log(`${charts.length} chart placeholder(s) added`);
  }

  private applyBrandingToWorkbook(workbook: ExcelJS.Workbook, branding: BrandingConfig): void {
    workbook.worksheets.forEach((ws) => {
      if (branding.organizationName) {
        ws.headerFooter.oddHeader = `&C&B${branding.organizationName}`;
        ws.headerFooter.oddFooter = `&L${branding.organizationName}&R&P of &N`;
      }
    });
  }

  /** Convert hex colour (#RRGGBB) to ARGB (FFRRGGBB) for ExcelJS */
  private toArgb(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length === 6) return `FF${clean.toUpperCase()}`;
    if (clean.length === 8) return clean.toUpperCase();
    return `FF${clean.toUpperCase().padEnd(6, '0')}`;
  }
}
