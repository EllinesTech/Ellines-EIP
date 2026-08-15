/**
 * Document Generation Service — Orchestrator
 * Requirements: 27.1–27.8
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExcelGeneratorService } from '../generators/excel.generator';
import { PdfGeneratorService } from '../generators/pdf.generator';
import { WordGeneratorService } from '../generators/word.generator';
import { PowerPointGeneratorService } from '../generators/powerpoint.generator';
import { ExportFormatterService } from '../generators/export.formatter';
import { BrandingService } from '../branding/branding.service';
import { DeliveryService } from '../delivery/delivery.service';
import {
  ExcelConfig,
  PDFConfig,
  WordConfig,
  PowerPointConfig,
  BrandingConfig,
  BrandingContext,
  DeliveryConfig,
  DeliveryResult,
} from '../interfaces/document-generation.interfaces';

@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);

  constructor(
    private readonly excelGenerator: ExcelGeneratorService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly wordGenerator: WordGeneratorService,
    private readonly pptGenerator: PowerPointGeneratorService,
    private readonly exportFormatter: ExportFormatterService,
    private readonly brandingService: BrandingService,
    private readonly deliveryService: DeliveryService,
  ) {}

  // ── Requirement 27.1: Excel ────────────────────────────────────────────

  async generateExcel(config: ExcelConfig): Promise<Buffer> {
    this.logger.log('Generating Excel workbook');
    if (config.branding) {
      config.branding = this.brandingService.mergeBranding(config.branding);
    }
    return this.excelGenerator.generate(config);
  }

  // ── Requirement 27.2: PDF ─────────────────────────────────────────────

  async generatePDF(config: PDFConfig): Promise<Buffer> {
    this.logger.log('Generating PDF document');
    if (config.branding) {
      config.branding = this.brandingService.mergeBranding(config.branding);
    }
    return this.pdfGenerator.generate(config);
  }

  // ── Requirement 27.3: Word ────────────────────────────────────────────

  async generateWord(config: WordConfig): Promise<Buffer> {
    this.logger.log('Generating Word document');
    if (config.branding) {
      config.branding = this.brandingService.mergeBranding(config.branding);
    }
    return this.wordGenerator.generate(config);
  }

  // ── Requirement 27.4: PowerPoint ─────────────────────────────────────

  async generatePowerPoint(config: PowerPointConfig): Promise<Buffer> {
    this.logger.log('Generating PowerPoint presentation');
    if (config.branding) {
      config.branding = this.brandingService.mergeBranding(config.branding);
    }
    return this.pptGenerator.generate(config);
  }

  // ── Requirement 27.5: CSV / JSON / XML ────────────────────────────────

  exportCSV(data: Record<string, unknown>[], headers?: string[]): string {
    return this.exportFormatter.exportCSV(data, headers);
  }

  exportJSON(data: unknown): string {
    return this.exportFormatter.exportJSON(data);
  }

  exportXML(data: Record<string, unknown>[], rootElement?: string): string {
    return this.exportFormatter.exportXML(data, rootElement);
  }

  // ── Requirement 27.6: Branding ────────────────────────────────────────

  applyBranding(config: BrandingConfig): BrandingContext {
    return this.brandingService.applyBranding(config);
  }

  // ── Requirements 27.7 & 27.8: Delivery ───────────────────────────────

  async deliverDocument(
    buffer: Buffer,
    format: string,
    delivery: DeliveryConfig,
  ): Promise<DeliveryResult> {
    return this.deliveryService.deliverDocument(buffer, format, delivery);
  }

  /**
   * Retrieve a pending download by token
   */
  retrieveDownload(token: string): { buffer: Buffer; filename: string } | null {
    return this.deliveryService.retrieveDownload(token);
  }
}
