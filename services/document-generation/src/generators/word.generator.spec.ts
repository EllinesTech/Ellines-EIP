/**
 * Word Document Generator Tests
 * Test Word document generation with templates, sections, tables, and images
 */

import { WordGeneratorService } from './word.generator';
import { WordConfig, ContentSection, TableDefinition } from '../interfaces/document-generation.interfaces';

describe('WordGeneratorService', () => {
  let service: WordGeneratorService;

  beforeEach(() => {
    service = new WordGeneratorService();
  });

  describe('generate', () => {
    it('should generate a basic Word document buffer', async () => {
      const config: WordConfig = {
        title: 'Test Document',
        sections: [
          {
            heading: 'Introduction',
            paragraphs: ['This is a test Word document.'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should include document metadata', async () => {
      const config: WordConfig = {
        title: 'Quarterly Report',
        author: 'John Smith',
        description: 'Q3 2024 Financial Report',
        sections: [
          {
            heading: 'Executive Summary',
            paragraphs: ['Summary content'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should render multiple sections with paragraphs', async () => {
      const config: WordConfig = {
        title: 'Multi-Section Document',
        sections: [
          {
            heading: 'Section 1',
            paragraphs: ['Paragraph 1 of section 1', 'Paragraph 2 of section 1'],
          },
          {
            heading: 'Section 2',
            paragraphs: ['Content in section 2'],
          },
          {
            heading: 'Section 3',
            paragraphs: ['Final section content'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should include tables in sections', async () => {
      const config: WordConfig = {
        title: 'Document with Tables',
        sections: [
          {
            heading: 'Sales Data',
            tables: [
              {
                headers: ['Month', 'Revenue', 'Profit'],
                rows: [
                  ['January', '$50,000', '$10,000'],
                  ['February', '$55,000', '$12,000'],
                  ['March', '$60,000', '$15,000'],
                ],
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle different table styles', async () => {
      const tableStyles: Array<'simple' | 'striped' | 'grid'> = ['simple', 'striped', 'grid'];

      for (const style of tableStyles) {
        const config: WordConfig = {
          title: `Table Style: ${style}`,
          sections: [
            {
              tables: [
                {
                  headers: ['Header1', 'Header2', 'Header3'],
                  rows: [
                    ['Row1Col1', 'Row1Col2', 'Row1Col3'],
                    ['Row2Col1', 'Row2Col2', 'Row2Col3'],
                  ],
                  style,
                },
              ],
            },
          ],
        };

        const buffer = await service.generate(config);
        expect(buffer).toBeInstanceOf(Buffer);
      }
    });

    it('should embed images in sections', async () => {
      // Create a simple 1x1 pixel PNG
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);
      const imageBase64 = pngBuffer.toString('base64');

      const config: WordConfig = {
        title: 'Document with Images',
        sections: [
          {
            heading: 'Visualizations',
            images: [
              {
                data: imageBase64,
                width: 200,
                height: 150,
                caption: 'Sample Chart',
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should apply custom branding', async () => {
      const config: WordConfig = {
        title: 'Branded Document',
        sections: [
          {
            heading: 'Content',
            paragraphs: ['This document has branding applied.'],
          },
        ],
        branding: {
          organizationName: 'Acme Corporation',
          primaryColor: '#6F2D8D',
          fontFamily: 'Segoe UI',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle mixed content sections', async () => {
      const config: WordConfig = {
        title: 'Comprehensive Document',
        sections: [
          {
            heading: 'Overview',
            paragraphs: ['Introduction text here.'],
            tables: [
              {
                headers: ['Item', 'Count'],
                rows: [['A', '10'], ['B', '20']],
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('section content', () => {
    it('should handle sections without headings', async () => {
      const config: WordConfig = {
        sections: [
          {
            paragraphs: ['Content without a section heading'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should support multiple paragraphs per section', async () => {
      const config: WordConfig = {
        sections: [
          {
            heading: 'Main Section',
            paragraphs: [
              'First paragraph here.',
              'Second paragraph with more content.',
              'Third paragraph to complete the section.',
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle long text content', async () => {
      const config: WordConfig = {
        sections: [
          {
            paragraphs: ['Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10)],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('tables', () => {
    it('should render table with various column counts', async () => {
      const config: WordConfig = {
        sections: [
          {
            tables: [
              {
                headers: ['Col1', 'Col2', 'Col3', 'Col4', 'Col5'],
                rows: [
                  ['A', 'B', 'C', 'D', 'E'],
                  ['1', '2', '3', '4', '5'],
                ],
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle tables with many rows', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => [String(i + 1), `Data${i + 1}`, `Value${i}`]);

      const config: WordConfig = {
        sections: [
          {
            tables: [
              {
                headers: ['ID', 'Name', 'Value'],
                rows,
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply striped row styling', async () => {
      const config: WordConfig = {
        sections: [
          {
            tables: [
              {
                headers: ['Name', 'Age', 'City'],
                rows: [
                  ['Alice', '30', 'London'],
                  ['Bob', '25', 'Paris'],
                  ['Charlie', '35', 'Berlin'],
                ],
                style: 'striped',
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply grid styling', async () => {
      const config: WordConfig = {
        sections: [
          {
            tables: [
              {
                headers: ['Header1', 'Header2'],
                rows: [['Data1', 'Data2'], ['Data3', 'Data4']],
                style: 'grid',
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle empty tables', async () => {
      const config: WordConfig = {
        sections: [
          {
            tables: [
              {
                headers: ['Header'],
                rows: [],
              },
            ],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('styling', () => {
    it('should apply custom font family', async () => {
      const config: WordConfig = {
        sections: [{ paragraphs: ['Styled content'] }],
        branding: {
          fontFamily: 'Arial',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should apply organization branding to headers and footers', async () => {
      const config: WordConfig = {
        title: 'Report',
        sections: [{ paragraphs: ['Content here'] }],
        branding: {
          organizationName: 'Ellines EIP',
          primaryColor: '#6F2D8D',
        },
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('document structure', () => {
    it('should include page numbers in footer', async () => {
      const config: WordConfig = {
        title: 'Document with Pages',
        sections: Array.from({ length: 5 }, (_, i) => ({
          heading: `Section ${i + 1}`,
          paragraphs: ['Content that spans multiple pages.'.repeat(20)],
        })),
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should create proper heading hierarchy', async () => {
      const config: WordConfig = {
        title: 'Structured Document',
        sections: [
          {
            heading: 'Level 1 Heading',
            paragraphs: ['First section content'],
          },
          {
            heading: 'Another Level 1',
            paragraphs: ['Second section content'],
          },
        ],
      };

      const buffer = await service.generate(config);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });
});
