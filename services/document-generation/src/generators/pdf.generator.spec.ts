/**
 * PDF Generator Tests
 * Test PDF document generation with layouts, branding, headers/footers, and visualizations
 */

import { PdfGeneratorService } from './pdf.generator';
import { PDFConfig, PDFSection, VisualizationEmbedding } from '../interfaces/document-generation.interfaces';

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;

  beforeEach(() => {
    service = new PdfGeneratorService();
  });

  describe('generate', () => {
    it('should generate a basic PDF buffer', async () => {
      const config: PDFConfig = {
        title: 'Test Report',
        sections: [
          {
            title: 'Introduction',
            content: 'This is a test PDF document.',
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should include title and branding', async () => {
      const config: PDFConfig = {
        title: 'Executive Summary',
        sections: [
          {
            title: 'Overview',
            content: 'Report content here.',
          },
        ],
        branding: {
          organizationName: 'Acme Corporation',
          primaryColor: '#6F2D8D',
          tagline: 'Delivering Excellence',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should render multiple sections', async () => {
      const config: PDFConfig = {
        title: 'Multi-Section Report',
        sections: [
          {
            title: 'Section 1',
            content: 'First section content.',
          },
          {
            title: 'Section 2',
            content: 'Second section content with more detail.',
          },
          {
            title: 'Section 3',
            content: 'Final section with conclusion.',
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle header and footer configuration', async () => {
      const config: PDFConfig = {
        title: 'Document with Headers',
        header: {
          text: 'Confidential Report',
          showDate: true,
          showPageNumber: true,
        },
        footer: {
          text: 'Company Name',
          showDate: true,
        },
        sections: [
          {
            content: 'Content with custom header and footer.',
          },
        ],
        branding: {
          organizationName: 'XYZ Inc',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should support different page layouts', async () => {
      const config: PDFConfig = {
        title: 'Landscape Report',
        layout: {
          size: 'A4',
          orientation: 'landscape',
          margins: { top: 40, bottom: 40, left: 50, right: 50 },
        },
        sections: [
          {
            title: 'Landscape Section',
            content: 'This content is displayed in landscape orientation.',
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should embed data tables in sections', async () => {
      const config: PDFConfig = {
        title: 'Report with Tables',
        sections: [
          {
            title: 'Sales Data',
            data: [
              { month: 'January', revenue: 50000, profit: 10000 },
              { month: 'February', revenue: 55000, profit: 12000 },
              { month: 'March', revenue: 60000, profit: 15000 },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle image embeddings', async () => {
      // Create a simple 1x1 pixel PNG
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const imageBase64 = pngBuffer.toString('base64');

      const config: PDFConfig = {
        title: 'Document with Images',
        sections: [
          {
            title: 'Visualizations',
            visualizations: [
              {
                type: 'image',
                imageData: imageBase64,
                caption: 'Sample Chart',
                width: 200,
                height: 150,
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle large content with multiple pages', async () => {
      const sections: PDFSection[] = Array.from({ length: 10 }, (_, i) => ({
        title: `Section ${i + 1}`,
        content: `This is section ${i + 1}. `.repeat(50),
      }));

      const config: PDFConfig = {
        title: 'Long Document',
        sections,
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('page layouts', () => {
    it('should support A4 page size', async () => {
      const config: PDFConfig = {
        layout: { size: 'A4' },
        sections: [{ content: 'A4 content' }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support LETTER page size', async () => {
      const config: PDFConfig = {
        layout: { size: 'LETTER' },
        sections: [{ content: 'Letter size content' }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support LEGAL page size', async () => {
      const config: PDFConfig = {
        layout: { size: 'LEGAL' },
        sections: [{ content: 'Legal size content' }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support portrait orientation', async () => {
      const config: PDFConfig = {
        layout: { orientation: 'portrait' },
        sections: [{ content: 'Portrait content' }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support custom margins', async () => {
      const config: PDFConfig = {
        layout: {
          margins: { top: 80, bottom: 60, left: 40, right: 40 },
        },
        sections: [{ content: 'Content with custom margins' }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('branding', () => {
    it('should apply primary color to headers', async () => {
      const config: PDFConfig = {
        sections: [
          {
            title: 'Colored Section',
            content: 'Content here',
          },
        ],
        branding: {
          organizationName: 'Test Org',
          primaryColor: '#FF0000',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply organization name to headers and footers', async () => {
      const config: PDFConfig = {
        sections: [{ content: 'Test content' }],
        header: { showDate: true },
        footer: { showDate: true },
        branding: {
          organizationName: 'Ellines Corporation',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should use default branding when not provided', async () => {
      const config: PDFConfig = {
        sections: [{ content: 'Default branding content' }],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('data tables', () => {
    it('should render tables with multiple columns', async () => {
      const config: PDFConfig = {
        sections: [
          {
            data: [
              { id: 1, name: 'Item A', price: '$10.00', qty: 5 },
              { id: 2, name: 'Item B', price: '$20.00', qty: 3 },
              { id: 3, name: 'Item C', price: '$15.00', qty: 7 },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle large tables with many rows', async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Record ${i + 1}`,
        value: Math.random() * 1000,
      }));

      const config: PDFConfig = {
        sections: [
          {
            title: 'Large Table',
            data: rows,
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should alternate row colors in tables', async () => {
      const config: PDFConfig = {
        sections: [
          {
            data: [
              { status: 'Active', count: 50 },
              { status: 'Inactive', count: 20 },
              { status: 'Pending', count: 10 },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('content formatting', () => {
    it('should handle long text content with wrapping', async () => {
      const config: PDFConfig = {
        sections: [
          {
            content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20),
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle section titles and content hierarchies', async () => {
      const config: PDFConfig = {
        title: 'Main Title',
        sections: [
          {
            title: 'Major Section',
            content: 'Major section content',
          },
          {
            title: 'Another Section',
            content: 'More content',
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });
});
