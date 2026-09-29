import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// ─── Public types ──────────────────────────────────────────────────────────────

export type DocumentFormat = 'excel' | 'pdf' | 'word' | 'pptx';

export interface DocumentConfig {
  title: string;
  format: DocumentFormat;
  data?: Record<string, unknown>[];
  columns?: string[];
}

export interface DeliveryResult {
  downloadUrl?: string;
  delivered: boolean;
}

// ─── MIME map ──────────────────────────────────────────────────────────────────

const MIME_MAP: Record<DocumentFormat, string> = {
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * DocumentGenerationService — EIP 2.0 Task 13.1 & 13.2
 *
 * Generates enterprise documents (Excel, PDF, Word, PowerPoint) with optional
 * org branding applied from Organization.settings.branding JSON.
 *
 * Delivery:
 *   'download' — persists to `documents` table, returns a download URL.
 *   'webhook'  — POSTs a signed JSON payload to the caller-supplied callbackUrl.
 *
 * Security:
 *   - Webhook signature uses HMAC-SHA256 (X-EIP-Signature header).
 *   - Every DB write includes organizationId (tenant isolation rule §6).
 *
 * Requirements: 26.1–26.3, 27.1–27.8
 */
@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Branding ────────────────────────────────────────────────────────────────

  /**
   * applyBranding — merges org branding from Organization.settings.branding
   * into a copy of the config (does not mutate the original).
   *
   * Requirement 26.3
   */
  async applyBranding(config: DocumentConfig, orgId: string): Promise<DocumentConfig> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });

      const settings =
        org?.settings && typeof org.settings === 'object' && !Array.isArray(org.settings)
          ? (org.settings as Record<string, unknown>)
          : {};

      const branding =
        settings.branding && typeof settings.branding === 'object'
          ? (settings.branding as Record<string, unknown>)
          : {};

      // Merge branding fields into config — callers can inspect e.g. config.brand*.
      return { ...config, ...branding };
    } catch (err) {
      this.logger.warn(`applyBranding: could not load org ${orgId} settings — using defaults`, err);
      return { ...config };
    }
  }

  // ── Excel ───────────────────────────────────────────────────────────────────

  /**
   * generateExcel — builds an XLSX workbook from config.data / config.columns.
   * Falls back to a placeholder buffer if ExcelJS is unavailable.
   *
   * Requirement 26.1
   */
  async generateExcel(config: DocumentConfig, orgId: string): Promise<Buffer> {
    try {
      // Dynamic import so a missing package only breaks this format.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ExcelJS = require('exceljs') as typeof import('exceljs');
      const branded = await this.applyBranding(config, orgId);
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Ellines EIP';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(branded.title || 'Sheet1');

      const columns = branded.columns ?? (branded.data?.[0] ? Object.keys(branded.data[0]) : []);
      if (columns.length > 0) {
        sheet.columns = columns.map((col) => ({
          header: String(col),
          key: String(col),
          width: Math.max(15, String(col).length + 2),
        }));

        // Style header row.
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, size: 11 };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF6F2D8D' }, // EIP brand purple
        };
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.commit();
      }

      for (const row of branded.data ?? []) {
        sheet.addRow(row);
      }

      const arrayBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      this.logger.error('generateExcel failed — returning placeholder', err);
      return Buffer.from('placeholder-excel');
    }
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────

  /**
   * generatePDF — builds a PDF document from config.data.
   * Falls back to a placeholder buffer if PDFKit is unavailable.
   *
   * Requirement 26.1
   */
  async generatePDF(config: DocumentConfig, orgId: string): Promise<Buffer> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const PDFDocument = require('pdfkit') as typeof import('pdfkit');
      const branded = await this.applyBranding(config, orgId);

      return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Title
        doc
          .fillColor('#6F2D8D')
          .fontSize(20)
          .text(branded.title, { align: 'center' });
        doc.moveDown();

        // Brand sub-header
        doc
          .fillColor('#0F172A')
          .fontSize(10)
          .text(`Ellines EIP — Enterprise Intelligence Platform`, { align: 'center' });
        doc.moveDown(2);

        const columns =
          branded.columns ?? (branded.data?.[0] ? Object.keys(branded.data[0]) : []);

        if (columns.length > 0) {
          // Column headers
          doc.fillColor('#6F2D8D').fontSize(11).text(columns.join('  |  '), { underline: true });
          doc.moveDown();

          // Rows
          doc.fillColor('#0F172A').fontSize(10);
          for (const row of branded.data ?? []) {
            const line = columns.map((c) => String(row[c] ?? '')).join('  |  ');
            doc.text(line);
          }
        } else if ((branded.data ?? []).length > 0) {
          doc.fillColor('#0F172A').fontSize(10).text(JSON.stringify(branded.data, null, 2));
        } else {
          doc.fillColor('#64748B').fontSize(10).text('No data provided.');
        }

        doc.end();
      });
    } catch (err) {
      this.logger.error('generatePDF failed — returning placeholder', err);
      return Buffer.from('placeholder-pdf');
    }
  }

  // ── Word ────────────────────────────────────────────────────────────────────

  /**
   * generateWord — builds a DOCX document from config.data.
   * Falls back to a placeholder buffer if docx is unavailable.
   *
   * Requirement 26.1
   */
  async generateWord(config: DocumentConfig, orgId: string): Promise<Buffer> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } =
        require('docx') as typeof import('docx');

      const branded = await this.applyBranding(config, orgId);
      const columns =
        branded.columns ?? (branded.data?.[0] ? Object.keys(branded.data[0]) : []);
      const rows = branded.data ?? [];

      const titleParagraph = new Paragraph({
        children: [
          new TextRun({ text: branded.title, bold: true, size: 32, color: '6F2D8D' }),
        ],
        spacing: { after: 200 },
      });

      const subtitleParagraph = new Paragraph({
        children: [
          new TextRun({
            text: 'Ellines EIP — Enterprise Intelligence Platform',
            size: 18,
            color: '64748B',
          }),
        ],
        spacing: { after: 400 },
      });

      const children: (typeof titleParagraph | InstanceType<typeof Table>)[] = [
        titleParagraph,
        subtitleParagraph,
      ];

      if (columns.length > 0) {
        const tableRows: InstanceType<typeof TableRow>[] = [];

        // Header row
        tableRows.push(
          new TableRow({
            children: columns.map(
              (col) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: String(col), bold: true, color: 'FFFFFF' })],
                    }),
                  ],
                  shading: { fill: '6F2D8D' },
                }),
            ),
          }),
        );

        // Data rows
        for (const row of rows) {
          tableRows.push(
            new TableRow({
              children: columns.map(
                (col) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: String(row[col] ?? '') })],
                      }),
                    ],
                  }),
              ),
            }),
          );
        }

        children.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        );
      } else if (rows.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: JSON.stringify(rows, null, 2) })],
          }),
        );
      }

      const doc = new Document({
        sections: [{ children }],
      });

      const buffer = await Packer.toBuffer(doc);
      return Buffer.from(buffer);
    } catch (err) {
      this.logger.error('generateWord failed — returning placeholder', err);
      return Buffer.from('placeholder-word');
    }
  }

  // ── PowerPoint ──────────────────────────────────────────────────────────────

  /**
   * generatePowerPoint — builds a PPTX presentation from config.data.
   * Falls back to a placeholder buffer if PptxGenJS is unavailable.
   *
   * Requirement 26.1
   */
  async generatePowerPoint(config: DocumentConfig, orgId: string): Promise<Buffer> {
    try {
      // Use dynamic require + any cast to avoid PptxGenJS constructor type issues
      // across ESM/CJS interop. The actual runtime behaviour is correct.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const pptxModule: any = require('pptxgenjs');
      // pptxgenjs exports the class as default in ESM and directly in CJS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PptxCtor: new () => any = pptxModule.default ?? pptxModule;
      const branded = await this.applyBranding(config, orgId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const pptx = new PptxCtor();

      pptx.author = 'Ellines EIP';
      pptx.company = 'Ellines Tech';
      pptx.subject = branded.title;
      pptx.title = branded.title;

      // Title slide
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: '0F172A' };
      titleSlide.addText(branded.title, {
        x: 0.5,
        y: 2,
        w: 9,
        h: 1.5,
        fontSize: 32,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
      });
      titleSlide.addText('Ellines EIP — Enterprise Intelligence Platform', {
        x: 0.5,
        y: 3.8,
        w: 9,
        h: 0.5,
        fontSize: 14,
        color: '6F2D8D',
        align: 'center',
      });

      const columns =
        branded.columns ?? (branded.data?.[0] ? Object.keys(branded.data[0]) : []);
      const rows = branded.data ?? [];

      if (columns.length > 0 && rows.length > 0) {
        const dataSlide = pptx.addSlide();
        dataSlide.background = { color: 'FFFFFF' };
        dataSlide.addText('Data', {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.5,
          fontSize: 18,
          bold: true,
          color: '6F2D8D',
        });

        const tableData = [
          // Header row
          columns.map((col) => ({
            text: String(col),
            options: { bold: true, color: 'FFFFFF', fill: { color: '6F2D8D' } },
          })),
          // Data rows (cap at 20 for readability)
          ...rows.slice(0, 20).map((row) =>
            columns.map((col) => ({ text: String(row[col] ?? '') })),
          ),
        ];

        dataSlide.addTable(tableData, {
          x: 0.5,
          y: 1.0,
          w: 9,
          fontSize: 10,
          border: { pt: 1, color: 'CCCCCC' },
        });
      }

      // pptxgenjs write() returns a Buffer-compatible object when target is 'nodebuffer'
      const result = await (pptx.write as (target: string) => Promise<Buffer>)('nodebuffer');
      return Buffer.from(result);
    } catch (err) {
      this.logger.error('generatePowerPoint failed — returning placeholder', err);
      return Buffer.from('placeholder-pptx');
    }
  }

  // ── Delivery (Task 13.2) ─────────────────────────────────────────────────────

  /**
   * deliverDocument — persists or webhooks the generated document.
   *
   * 'download': stores metadata in the `documents` table, returns a download URL.
   * 'webhook':  POSTs a signed JSON payload to callbackUrl, returns delivered flag.
   *
   * Security:
   *   - Webhook signed with HMAC-SHA256 (X-EIP-Signature).
   *   - SSRF note: callbackUrl validation (no private IPs) should be enforced by
   *     the shared egress policy before calling this. The service trusts that the
   *     controller has validated the URL.
   *   - No credential values appear in webhook payloads or DB content fields.
   *
   * Requirement 27.1–27.8
   */
  async deliverDocument(
    buffer: Buffer,
    config: DocumentConfig,
    orgId: string,
    delivery: 'download' | 'webhook',
    callbackUrl?: string,
  ): Promise<DeliveryResult> {
    if (delivery === 'webhook') {
      return this.deliverViaWebhook(buffer, config, orgId, callbackUrl);
    }
    return this.deliverAsDownload(buffer, config, orgId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async deliverAsDownload(
    buffer: Buffer,
    config: DocumentConfig,
    orgId: string,
  ): Promise<DeliveryResult> {
    const mimeType = MIME_MAP[config.format] ?? 'application/octet-stream';
    const ext = config.format === 'excel' ? 'xlsx' : config.format;
    const fileName = `${config.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Date.now()}.${ext}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // +1 hour

    const doc = await this.prisma.document.create({
      data: {
        organizationId: orgId,
        name: fileName,
        mimeType,
        sizeBytes: buffer.length,
        // Store format + expiry in `summary`; `content` holds the base64 payload
        // for lightweight downloads (the task spec uses `storageUrl=pending` as
        // the placeholder pattern; we encode the buffer inline for now).
        summary: JSON.stringify({
          format: config.format,
          title: config.title,
          expiresAt: expiresAt.toISOString(),
          storageUrl: 'pending',
        }),
        content: buffer.toString('base64'),
        uploadedBy: 'system',
      },
      select: { id: true },
    });

    return {
      downloadUrl: `/api/v1/orgs/${orgId}/documents/${doc.id}/download`,
      delivered: true,
    };
  }

  private async deliverViaWebhook(
    buffer: Buffer,
    config: DocumentConfig,
    orgId: string,
    callbackUrl?: string,
  ): Promise<DeliveryResult> {
    if (!callbackUrl) {
      this.logger.warn('deliverViaWebhook: no callbackUrl provided');
      return { delivered: false };
    }

    const payload = JSON.stringify({
      format: config.format,
      title: config.title,
      orgId,
      sizeBytes: buffer.length,
      generatedAt: new Date().toISOString(),
    });

    // HMAC-SHA256 signature over the JSON payload.
    const secret = process.env.EIP_WEBHOOK_SECRET ?? 'eip-default-webhook-secret';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-eip-signature': `sha256=${signature}`,
        },
        body: payload,
      });

      if (!res.ok) {
        this.logger.warn(`deliverViaWebhook: callback returned ${res.status}`);
        return { delivered: false };
      }

      return { delivered: true };
    } catch (err) {
      this.logger.error('deliverViaWebhook: fetch error', err);
      return { delivered: false };
    }
  }
}
