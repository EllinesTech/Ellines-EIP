/**
 * Document Generation Service Tests
 * Test the main orchestrator service
 */

import { DocumentGenerationService } from './document-generation.service';
import { ExcelGeneratorService } from '../generators/excel.generator';
import { PdfGeneratorService } from '../generators/pdf.generator';
import { WordGeneratorService } from '../generators/word.generator';
import { PowerPointGeneratorService } from '../generators/powerpoint.generator';
import { ExportFormatterService } from '../generators/export.formatter';
import { BrandingService } from '../branding/branding.service';
import { DeliveryService } from '../delivery/delivery.service';
import { ExcelConfig, PDFConfig, WordConfig, PowerPointConfig, DeliveryConfig } from '../interfaces/document-generation.interfaces';

describe('DocumentGenerationService', () => {
  let service: DocumentGenerationService;
  let excelGenerator: ExcelGeneratorService;
  let pdfGenerator: PdfGeneratorService;
  let wordGenerator: WordGeneratorService;
  let pptGenerator: PowerPointGeneratorService;
  let exportFormatter: ExportFormatterService;
  let brandingService: BrandingService;
  let deliveryService: DeliveryService;

  beforeEach(() => {
    excelGenerator = new ExcelGeneratorService();
    pdfGenerator = new PdfGeneratorService();
    wordGenerator = new WordGeneratorService();
    pptGenerator = new PowerPointGeneratorService();
    exportFormatter = new ExportFormatterService();
    brandingService = new BrandingService();
    deliveryService = new DeliveryService();

    service = new DocumentGenerationService(
      excelGenerator,
      pdfGenerator,
      wordGenerator,
      pptGenerator,
      exportFormatter,
      brandingService,
      deliveryService,
    );
  });

  describe('generateExcel', () => {
    it('should generate Excel workbook', async () => {
      const config: ExcelConfig = {
        title: 'Sales Report',
        sheets: [
          {
            name: 'Data',
            headers: ['Month', 'Revenue'],
            data: [['Jan', 50000], ['Feb', 55000]],
          },
        ],
      };

      const buffer = await service.generateExcel(config);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply branding to Excel', async () => {
      const config: ExcelConfig = {
        title: 'Branded Excel',
        sheets: [
          {
            name: 'Sheet1',
            headers: ['A', 'B'],
            data: [['1', '2']],
          },
        ],
        branding: {
          organizationName: 'Test Company',
          primaryColor: '#FF0000',
        },
      };

      const buffer = await service.generateExcel(config);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generatePDF', () => {
    it('should generate PDF document', async () => {
      const config: PDFConfig = {
        title: 'Financial Report',
        sections: [
          {
            title: 'Summary',
            content: 'Report summary text.',
          },
        ],
      };

      const buffer = await service.generatePDF(config);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply branding to PDF', async () => {
      const config: PDFConfig = {
        title: 'Branded PDF',
        sections: [{ content: 'Test content' }],
        branding: {
          organizationName: 'Branded Corp',
          primaryColor: '#0000FF',
        },
      };

      const buffer = await service.generatePDF(config);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generateWord', () => {
    it('should generate Word document', async () => {
      const config: WordConfig = {
        title: 'Project Proposal',
        sections: [
          {
            heading: 'Introduction',
            paragraphs: ['Project details here.'],
          },
        ],
      };

      const buffer = await service.generateWord(config);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply branding to Word document', async () => {
      const config: WordConfig = {
        title: 'Branded Word',
        sections: [{ paragraphs: ['Content'] }],
        branding: {
          organizationName: 'Word Brand',
          primaryColor: '#00FF00',
        },
      };

      const buffer = await service.generateWord(config);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generatePowerPoint', () => {
    it('should generate PowerPoint presentation', async () => {
      const config: PowerPointConfig = {
        title: 'Q3 Review',
        slides: [
          {
            title: 'Overview',
            content: ['Key metrics', 'Performance data'],
          },
        ],
      };

      const buffer = await service.generatePowerPoint(config);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply branding to PowerPoint', async () => {
      const config: PowerPointConfig = {
        title: 'Branded PPT',
        slides: [{ title: 'Slide 1', content: ['Content'] }],
        branding: {
          organizationName: 'PPT Brand',
          primaryColor: '#FFFF00',
        },
      };

      const buffer = await service.generatePowerPoint(config);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('exportCSV', () => {
    it('should export data to CSV', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const csv = service.exportCSV(data);

      expect(csv).toContain('name,age');
      expect(csv).toContain('Alice,30');
      expect(csv).toContain('Bob,25');
    });

    it('should export with custom headers', () => {
      const data = [{ a: 1, b: 2 }];

      const csv = service.exportCSV(data, ['a', 'b']);

      expect(csv).toContain('a,b');
    });
  });

  describe('exportJSON', () => {
    it('should export data to JSON', () => {
      const data = { name: 'Test', value: 42 };

      const json = service.exportJSON(data);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(data);
    });

    it('should format JSON with indentation', () => {
      const data = { key: 'value' };

      const json = service.exportJSON(data);

      expect(json).toContain('  "key"');
    });
  });

  describe('exportXML', () => {
    it('should export data to XML', () => {
      const data = [{ id: 1, name: 'Item' }];

      const xml = service.exportXML(data);

      expect(xml).toContain('<?xml');
      expect(xml).toContain('<records>');
      expect(xml).toContain('<id>1</id>');
      expect(xml).toContain('<name>Item</name>');
    });

    it('should use custom root element', () => {
      const data = [{ title: 'Test' }];

      const xml = service.exportXML(data, 'items');

      expect(xml).toContain('<items>');
    });
  });

  describe('applyBranding', () => {
    it('should apply branding configuration', () => {
      const brandingConfig = {
        organizationName: 'Acme',
        primaryColor: '#FF0000',
        fontFamily: 'Arial',
      };

      const result = service.applyBranding(brandingConfig);

      expect(result.config.organizationName).toBe('Acme');
      expect(result.appliedAt).toBeInstanceOf(Date);
      expect(result.elements).toContain('organization_name');
    });
  });

  describe('deliverDocument', () => {
    it('should deliver via download', async () => {
      const buffer = Buffer.from('Document content');
      const delivery: DeliveryConfig = {
        method: 'download',
        filename: 'test.pdf',
      };

      const result = await service.deliverDocument(buffer, 'pdf', delivery);

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
    });

    it('should handle DMS delivery', async () => {
      const buffer = Buffer.from('Document');
      const delivery: DeliveryConfig = {
        method: 'dms_integration',
        dmsPath: './dms-output',
      };

      const result = await service.deliverDocument(buffer, 'xlsx', delivery);

      expect(result.method).toBe('dms_integration');
    });
  });

  describe('retrieveDownload', () => {
    it('should retrieve downloaded document by token', async () => {
      const originalBuffer = Buffer.from('Test content');
      const delivery: DeliveryConfig = {
        method: 'download',
        filename: 'download-test.pdf',
      };

      const deliveryResult = await service.deliverDocument(originalBuffer, 'pdf', delivery);
      const token = deliveryResult.downloadUrl!.split('/').pop();

      const retrieved = service.retrieveDownload(token!);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.buffer).toEqual(originalBuffer);
      expect(retrieved!.filename).toBe('download-test.pdf');
    });

    it('should return null for invalid token', () => {
      const result = service.retrieveDownload('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should generate and deliver Excel report', async () => {
      const excelConfig: ExcelConfig = {
        title: 'Monthly Report',
        sheets: [
          {
            name: 'Sales',
            headers: ['Product', 'Units', 'Revenue'],
            data: [
              ['Widget', 100, 10000],
              ['Gadget', 50, 15000],
            ],
          },
        ],
        branding: {
          organizationName: 'Sales Org',
        },
      };

      const buffer = await service.generateExcel(excelConfig);
      expect(buffer).toBeInstanceOf(Buffer);

      const delivery: DeliveryConfig = {
        method: 'download',
      };

      const result = await service.deliverDocument(buffer, 'xlsx', delivery);

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBeDefined();
    });

    it('should generate and export data in multiple formats', async () => {
      const data = [
        { id: 1, name: 'Item 1', price: 100 },
        { id: 2, name: 'Item 2', price: 200 },
      ];

      const csv = service.exportCSV(data);
      expect(csv).toContain('id,name,price');

      const json = service.exportJSON(data);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);

      const xml = service.exportXML(data);
      expect(xml).toContain('<id>1</id>');
    });

    it('should create branded document with all features', async () => {
      const brandingConfig = {
        organizationName: 'Premium Corp',
        primaryColor: '#6F2D8D',
        fontFamily: 'Calibri',
        tagline: 'Excellence in Reports',
      };

      service.applyBranding(brandingConfig);

      const pdfConfig: PDFConfig = {
        title: 'Executive Summary',
        sections: [
          {
            title: 'Overview',
            content: 'Key metrics and analysis.',
            data: [
              { metric: 'Revenue', value: '$1M' },
              { metric: 'Growth', value: '25%' },
            ],
          },
        ],
        header: { showDate: true },
        footer: { text: 'Confidential' },
        branding: brandingConfig,
      };

      const buffer = await service.generatePDF(pdfConfig);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid Excel config gracefully', async () => {
      const invalidConfig: ExcelConfig = {
        sheets: [],
      };

      const buffer = await service.generateExcel(invalidConfig);

      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle missing branding fields', async () => {
      const partialBranding = {
        organizationName: 'Partial Company',
      };

      const result = service.applyBranding(partialBranding as any);

      expect(result.config).toBeDefined();
      expect(result.config.organizationName).toBe('Partial Company');
      expect(result.config.primaryColor).toBeDefined(); // Filled with default
    });
  });
});
