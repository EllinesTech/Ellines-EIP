/**
 * Excel Generator Tests
 * Test Excel workbook generation with sheets, formulas, charts, and branding
 */

import { ExcelGeneratorService } from './excel.generator';
import { ExcelConfig, SheetDefinition, FormulaDefinition, ChartDefinition } from '../interfaces/document-generation.interfaces';

describe('ExcelGeneratorService', () => {
  let service: ExcelGeneratorService;

  beforeEach(() => {
    service = new ExcelGeneratorService();
  });

  describe('generate', () => {
    it('should generate a basic Excel workbook buffer', async () => {
      const config: ExcelConfig = {
        title: 'Test Workbook',
        sheets: [
          {
            name: 'Sheet1',
            headers: ['Name', 'Age', 'City'],
            data: [
              ['Alice', 30, 'London'],
              ['Bob', 25, 'Paris'],
            ] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle multiple sheets', async () => {
      const config: ExcelConfig = {
        title: 'Multi-Sheet',
        sheets: [
          {
            name: 'Users',
            headers: ['ID', 'Name'],
            data: [[1, 'Alice'], [2, 'Bob']] as any,
          },
          {
            name: 'Products',
            headers: ['ProductID', 'Title'],
            data: [[101, 'Widget'], [102, 'Gadget']] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should include formulas in specified cells', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Calculations',
            headers: ['Value1', 'Value2', 'Sum'],
            data: [[10, 20, null], [15, 25, null]] as any,
          },
        ],
        formulas: [
          { sheet: 'Calculations', cell: 'C2', formula: '=A2+B2' },
          { sheet: 'Calculations', cell: 'C3', formula: '=A3+B3' },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle charts', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Data',
            headers: ['Month', 'Sales'],
            data: [['Jan', 100], ['Feb', 150], ['Mar', 120]] as any,
          },
        ],
        charts: [
          {
            sheet: 'Data',
            type: 'bar',
            title: 'Sales by Month',
            dataRange: 'A1:B4',
            position: { row: 5, col: 1 },
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply formatting options', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Formatted',
            headers: ['Name', 'Score'],
            columnWidths: [20, 15],
            data: [['Alice', 95], ['Bob', 87]] as any,
          },
        ],
        formatting: {
          headerStyle: {
            bold: true,
            bgColor: '#6F2D8D',
            fontColor: '#FFFFFF',
            fontSize: 12,
          },
          alternateRowColor: '#F5F0FA',
          freezeTopRow: true,
          autoFilter: true,
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply branding to workbook', async () => {
      const config: ExcelConfig = {
        title: 'Branded Report',
        sheets: [
          {
            name: 'Report',
            headers: ['Metric', 'Value'],
            data: [['Revenue', 50000], ['Profit', 10000]] as any,
          },
        ],
        branding: {
          organizationName: 'Acme Corp',
          primaryColor: '#2563EB',
          fontFamily: 'Segoe UI',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle empty sheets', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Empty',
            headers: [],
            data: [] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle null and undefined values in data', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'NullValues',
            headers: ['A', 'B', 'C'],
            data: [[1, null, 'text'], [undefined, 2, 'more']] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle large datasets', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => [i + 1, `Item ${i + 1}`, Math.random() * 100]);
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'LargeData',
            headers: ['ID', 'Name', 'Value'],
            data: rows as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(10000);
    });

    it('should set workbook metadata', async () => {
      const config: ExcelConfig = {
        title: 'Metadata Test',
        sheets: [
          {
            name: 'Data',
            headers: ['Col1'],
            data: [['Value1']] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('column width handling', () => {
    it('should apply custom column widths', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'ColumnWidth',
            headers: ['Narrow', 'Wide', 'Medium'],
            columnWidths: [10, 30, 20],
            data: [['A', 'B', 'C']] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should auto-fit column widths from headers', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'AutoFit',
            headers: ['Short', 'VeryLongHeaderName', 'X'],
            data: [['a', 'b', 'c']] as any,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('chart types', () => {
    it('should support different chart types', async () => {
      const chartTypes: Array<'bar' | 'line' | 'pie' | 'doughnut' | 'area'> = ['bar', 'line', 'pie', 'doughnut', 'area'];
      
      for (const chartType of chartTypes) {
        const config: ExcelConfig = {
          sheets: [
            {
              name: 'Data',
              headers: ['X', 'Y'],
              data: [['A', 10], ['B', 20]] as any,
            },
          ],
          charts: [
            {
              sheet: 'Data',
              type: chartType,
              title: `${chartType} Chart`,
              dataRange: 'A1:B3',
              position: { row: 5, col: 1 },
            },
          ],
        };

        const buffer = await service.generate(config);
        expect(buffer).toBeInstanceOf(Buffer);
      }
    });
  });

  describe('formatting styles', () => {
    it('should apply header styling with custom colors', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Styled',
            headers: ['Header1', 'Header2'],
            data: [['Data1', 'Data2']] as any,
          },
        ],
        formatting: {
          headerStyle: {
            bold: true,
            bgColor: '#FF5733',
            fontColor: '#FFFFFF',
            fontSize: 14,
          },
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply alternate row coloring', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Striped',
            headers: ['Col1', 'Col2'],
            data: Array.from({ length: 10 }, (_, i) => [`Row${i + 1}`, i]) as any,
          },
        ],
        formatting: {
          alternateRowColor: '#E8E8E8',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should freeze top row when requested', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Frozen',
            headers: ['Frozen', 'Header'],
            data: Array.from({ length: 100 }, (_, i) => [`Row${i}`, i]) as any,
          },
        ],
        formatting: {
          freezeTopRow: true,
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply autofilter to header row', async () => {
      const config: ExcelConfig = {
        sheets: [
          {
            name: 'Filtered',
            headers: ['Name', 'Age', 'City'],
            data: [['Alice', 30, 'London'], ['Bob', 25, 'Paris']] as any,
          },
        ],
        formatting: {
          autoFilter: true,
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });
});
