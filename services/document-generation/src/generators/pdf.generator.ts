/**
 * PDF Generator
 * Requirement 27.2: Generate PDFs with custom layouts, branding, headers/footers, visualizations
 */

import { Injectable, Logger } from '@nestjs/common';
import * as PDFKit from 'pdfkit';
import {
  PDFConfig,
  BrandingConfig,
  PDFSection,
} from '../interfaces/document-generation.interfaces';

// Ellines brand colours
const BRAND_PRIMARY = '#6F2D8D';
const BRAND_DARK = '#0F172A';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  /**
   * Generate a PDF document buffer
   * Requirement 27.2
   */
  async generate(config: PDFConfig): Promise<Buffer> {
    this.logger.log(`Generating PDF: "${config.title || 'Untitled'}"`);

    return new Promise<Buffer>((resolve, reject) => {
      const layout = config.layout || {};
      const doc = new (PDFKit as any)({
        size: layout.size || 'A4',
        layout: layout.orientation === 'landscape' ? 'landscape' : 'portrait',
        margins: layout.margins || { top: 60, bottom: 60, left: 50, right: 50 },
        info: {
          Title: config.title || 'Ellines EIP Report',
          Author: config.branding?.organizationName || 'Ellines EIP',
          Creator: 'Ellines Document Generation Service',
          CreationDate: new Date(),
        },
        autoFirstPage: false,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const result = Buffer.concat(chunks);
        this.logger.log(`PDF generated (${result.length} bytes)`);
        resolve(result);
      });
      doc.on('error', reject);

      // Add first page
      doc.addPage();

      const branding = config.branding;
      const primaryColor = branding?.primaryColor || BRAND_PRIMARY;

      // ── Cover / Title ─────────────────────────────────────────────────
      if (config.title) {
        this.drawHeader(doc, config, primaryColor);
        doc.moveDown(2);
        doc
          .fontSize(24)
          .fillColor(BRAND_DARK)
          .font('Helvetica-Bold')
          .text(config.title, { align: 'center' });
        doc.moveDown(0.5);
      }

      if (branding?.tagline) {
        doc.fontSize(12).fillColor('#555555').font('Helvetica').text(branding.tagline, { align: 'center' });
        doc.moveDown(1);
      }

      // ── Sections ──────────────────────────────────────────────────────
      for (const section of config.sections) {
        this.renderSection(doc, section, config, primaryColor);
      }

      // ── Footer on last page ───────────────────────────────────────────
      this.drawFooter(doc, config, primaryColor);

      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, config: PDFConfig, primaryColor: string): void {
    const header = config.header || {};
    const orgName = config.branding?.organizationName || '';

    // Coloured header bar
    doc
      .rect(doc.page.margins.left - 10, 15, doc.page.width - doc.page.margins.left - doc.page.margins.right + 20, 35)
      .fill(primaryColor);

    if (orgName || header.text) {
      doc
        .fillColor('#FFFFFF')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(header.text || orgName, doc.page.margins.left, 25, { align: 'left' });
    }

    if (header.showDate) {
      doc
        .fillColor('#FFFFFF')
        .fontSize(9)
        .text(new Date().toLocaleDateString(), { align: 'right' });
    }

    doc.fillColor(BRAND_DARK).moveDown(2);
  }

  private drawFooter(doc: PDFKit.PDFDocument, config: PDFConfig, primaryColor: string): void {
    const footer = config.footer || {};
    const orgName = config.branding?.organizationName || 'Ellines EIP';
    const y = doc.page.height - doc.page.margins.bottom - 20;

    doc
      .rect(doc.page.margins.left - 10, y, doc.page.width - doc.page.margins.left - doc.page.margins.right + 20, 18)
      .fill(primaryColor);

    doc
      .fillColor('#FFFFFF')
      .fontSize(8)
      .font('Helvetica')
      .text(footer.text || orgName, doc.page.margins.left, y + 4, { align: 'left' });

    if (footer.showDate) {
      doc.text(new Date().toLocaleDateString(), { align: 'right' });
    }
  }

  private renderSection(
    doc: PDFKit.PDFDocument,
    section: PDFSection,
    config: PDFConfig,
    primaryColor: string,
  ): void {
    // Section heading
    if (section.title) {
      doc
        .fontSize(14)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(section.title, { underline: false });
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke(primaryColor);
      doc.moveDown(0.5);
    }

    // Body content
    if (section.content) {
      doc
        .fontSize(11)
        .fillColor(BRAND_DARK)
        .font('Helvetica')
        .text(section.content, { align: 'justify' });
      doc.moveDown(0.5);
    }

    // Data table
    if (section.data?.length) {
      this.renderTable(doc, section.data, primaryColor);
      doc.moveDown(0.5);
    }

    // Embedded visualizations / images
    if (section.visualizations?.length) {
      for (const viz of section.visualizations) {
        if (viz.type === 'image' && viz.imageData) {
          try {
            const imgBuffer = Buffer.from(viz.imageData, 'base64');
            doc.image(imgBuffer, {
              fit: [viz.width || 400, viz.height || 200],
              align: 'center',
            });
            if (viz.caption) {
              doc.fontSize(9).fillColor('#888888').text(viz.caption, { align: 'center' });
            }
          } catch {
            doc.text(`[Visualization: ${viz.caption || viz.type}]`);
          }
          doc.moveDown(0.5);
        } else if (viz.type === 'table' && viz.data) {
          this.renderTable(doc, viz.data, primaryColor);
          doc.moveDown(0.5);
        }
      }
    }

    doc.moveDown(1);
  }

  private renderTable(doc: PDFKit.PDFDocument, data: Record<string, unknown>[], primaryColor: string): void {
    if (!data.length) return;

    const headers = Object.keys(data[0]);
    const colCount = headers.length;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = tableWidth / colCount;
    const rowHeight = 18;

    // Header row
    let x = doc.page.margins.left;
    const startY = doc.y;

    doc
      .rect(x, startY, tableWidth, rowHeight)
      .fill(primaryColor);

    headers.forEach((h, i) => {
      doc
        .fillColor('#FFFFFF')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(h, x + i * colWidth + 2, startY + 5, { width: colWidth - 4, lineBreak: false });
    });

    doc.moveDown();

    // Data rows
    data.slice(0, 50).forEach((row, rowIdx) => {
      const rowY = startY + (rowIdx + 1) * rowHeight;

      // Alternate row shading
      if (rowIdx % 2 === 0) {
        doc.rect(doc.page.margins.left, rowY, tableWidth, rowHeight).fill('#F5F0FA');
      } else {
        doc.rect(doc.page.margins.left, rowY, tableWidth, rowHeight).fill('#FFFFFF');
      }

      headers.forEach((h, i) => {
        const val = row[h] == null ? '' : String(row[h]);
        doc
          .fillColor(BRAND_DARK)
          .fontSize(9)
          .font('Helvetica')
          .text(val.substring(0, 30), doc.page.margins.left + i * colWidth + 2, rowY + 5, {
            width: colWidth - 4,
            lineBreak: false,
          });
      });
    });

    // Move past table
    doc.y = startY + (Math.min(data.length, 50) + 1) * rowHeight + 5;
  }
}
