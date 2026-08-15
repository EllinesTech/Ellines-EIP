/**
 * Word Document Generator
 * Requirement 27.3: Generate Word documents with templates, sections, tables, images
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  ShadingType,
} from 'docx';
import {
  WordConfig,
  ContentSection,
  TableDefinition,
  BrandingConfig,
} from '../interfaces/document-generation.interfaces';

// Ellines brand colours (RRGGBB for docx)
const BRAND_PRIMARY_HEX = '6F2D8D';
const BRAND_DARK_HEX = '0F172A';
const BRAND_LIGHT_HEX = 'F5F0FA';

@Injectable()
export class WordGeneratorService {
  private readonly logger = new Logger(WordGeneratorService.name);

  /**
   * Generate a Word document buffer
   * Requirement 27.3
   */
  async generate(config: WordConfig): Promise<Buffer> {
    this.logger.log(`Generating Word document: "${config.title || 'Untitled'}"`);

    const sections: any[] = [];

    // Title paragraph
    if (config.title) {
      sections.push(
        new Paragraph({
          text: config.title,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
      );
    }

    if (config.author) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Author: ${config.author}`,
              italics: true,
              color: '888888',
              size: 20,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      );
    }

    // Content sections
    for (const section of config.sections) {
      const sectionParagraphs = this.buildSection(section, config.branding);
      sections.push(...sectionParagraphs);
    }

    const branding = config.branding;
    const orgName = branding?.organizationName || 'Ellines EIP';

    const doc = new Document({
      creator: orgName,
      description: config.description || config.title || 'Ellines EIP Document',
      title: config.title || 'Document',
      styles: {
        default: {
          document: {
            run: {
              font: branding?.fontFamily || 'Calibri',
              size: 22, // 11pt
              color: BRAND_DARK_HEX,
            },
          },
          heading1: {
            run: {
              bold: true,
              color: BRAND_PRIMARY_HEX,
              size: 32,
            },
            paragraph: {
              spacing: { before: 400, after: 200 },
            },
          },
          heading2: {
            run: {
              bold: true,
              color: BRAND_PRIMARY_HEX,
              size: 26,
            },
            paragraph: {
              spacing: { before: 300, after: 150 },
            },
          },
        },
      },
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: orgName,
                      bold: true,
                      color: BRAND_PRIMARY_HEX,
                      size: 18,
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${orgName} | `,
                      color: '888888',
                      size: 16,
                    }),
                    new TextRun({
                      children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                      color: '888888',
                      size: 16,
                    }),
                  ],
                }),
              ],
            }),
          },
          properties: {},
          children: sections,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    this.logger.log(`Word document generated (${buffer.length} bytes)`);
    return buffer;
  }

  private buildSection(section: ContentSection, branding?: BrandingConfig): any[] {
    const elements: any[] = [];

    // Section heading
    if (section.heading) {
      elements.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_1,
        }),
      );
    }

    // Paragraphs
    if (section.paragraphs?.length) {
      for (const para of section.paragraphs) {
        elements.push(
          new Paragraph({
            children: [new TextRun({ text: para })],
            spacing: { after: 160 },
          }),
        );
      }
    }

    // Tables
    if (section.tables?.length) {
      for (const tableDef of section.tables) {
        elements.push(this.buildTable(tableDef));
        elements.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }
    }

    // Images
    if (section.images?.length) {
      for (const img of section.images) {
        try {
          const imgBuffer = Buffer.from(img.data, 'base64');
          elements.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: img.width || 400,
                    height: img.height || 200,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 160 },
            }),
          );
          if (img.caption) {
            elements.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: img.caption,
                    italics: true,
                    color: '888888',
                    size: 18,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              }),
            );
          }
        } catch (e) {
          this.logger.warn(`Could not embed image: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return elements;
  }

  private buildTable(tableDef: TableDefinition): Table {
    const { headers, rows, style } = tableDef;
    const colCount = headers.length;

    // Header row
    const headerCells = headers.map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20 })],
            }),
          ],
          shading: {
            type: ShadingType.SOLID,
            color: BRAND_PRIMARY_HEX,
            fill: BRAND_PRIMARY_HEX,
          },
        }),
    );

    const tableRows: TableRow[] = [new TableRow({ children: headerCells, tableHeader: true })];

    // Data rows
    rows.forEach((row, rowIdx) => {
      const cells = row.map(
        (cellVal, colIdx) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: colIdx < headers.length ? String(cellVal || '') : '',
                    size: 20,
                  }),
                ],
              }),
            ],
            shading:
              style === 'striped' && rowIdx % 2 === 0
                ? { type: ShadingType.SOLID, color: BRAND_LIGHT_HEX, fill: BRAND_LIGHT_HEX }
                : undefined,
          }),
      );
      tableRows.push(new TableRow({ children: cells }));
    });

    return new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders:
        style === 'simple'
          ? undefined
          : {
              top: { style: BorderStyle.SINGLE, size: 1, color: BRAND_PRIMARY_HEX },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: BRAND_PRIMARY_HEX },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
    });
  }
}
