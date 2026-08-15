/**
 * Document Generation REST Controller
 * Exposes POST endpoints for all document formats and export utilities
 * Requirements: 27.1–27.8
 */

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { DocumentGenerationService } from './document-generation.service';
import { GenerateExcelDto } from './dto/generate-excel.dto';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
import { GenerateWordDto } from './dto/generate-word.dto';
import { GeneratePowerPointDto } from './dto/generate-powerpoint.dto';
import {
  ExportCsvDto,
  ExportJsonDto,
  ExportXmlDto,
  DeliverDocumentDto,
  ApplyBrandingDto,
} from './dto/export.dto';

const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
};

@Controller('documents')
export class DocumentGenerationController {
  private readonly logger = new Logger(DocumentGenerationController.name);

  constructor(private readonly docGenService: DocumentGenerationService) {}

  // ── Health ────────────────────────────────────────────────────────────

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'document-generation',
      timestamp: new Date().toISOString(),
    };
  }

  // ── Requirement 27.1: Excel ────────────────────────────────────────────

  @Post('excel')
  @HttpCode(HttpStatus.OK)
  async generateExcel(
    @Body() dto: GenerateExcelDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('POST /documents/excel');
    const buffer = await this.docGenService.generateExcel(dto as any);
    const filename = `${dto.title || 'workbook'}.xlsx`.replace(/\s+/g, '-');
    res
      .set('Content-Type', MIME.xlsx)
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .set('Content-Length', String(buffer.length))
      .send(buffer);
  }

  // ── Requirement 27.2: PDF ─────────────────────────────────────────────

  @Post('pdf')
  @HttpCode(HttpStatus.OK)
  async generatePdf(
    @Body() dto: GeneratePdfDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('POST /documents/pdf');
    const buffer = await this.docGenService.generatePDF(dto as any);
    const filename = `${dto.title || 'document'}.pdf`.replace(/\s+/g, '-');
    res
      .set('Content-Type', MIME.pdf)
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .set('Content-Length', String(buffer.length))
      .send(buffer);
  }

  // ── Requirement 27.3: Word ────────────────────────────────────────────

  @Post('word')
  @HttpCode(HttpStatus.OK)
  async generateWord(
    @Body() dto: GenerateWordDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('POST /documents/word');
    const buffer = await this.docGenService.generateWord(dto as any);
    const filename = `${dto.title || 'document'}.docx`.replace(/\s+/g, '-');
    res
      .set('Content-Type', MIME.docx)
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .set('Content-Length', String(buffer.length))
      .send(buffer);
  }

  // ── Requirement 27.4: PowerPoint ─────────────────────────────────────

  @Post('powerpoint')
  @HttpCode(HttpStatus.OK)
  async generatePowerPoint(
    @Body() dto: GeneratePowerPointDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('POST /documents/powerpoint');
    const buffer = await this.docGenService.generatePowerPoint(dto as any);
    const filename = `${dto.title || 'presentation'}.pptx`.replace(/\s+/g, '-');
    res
      .set('Content-Type', MIME.pptx)
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .set('Content-Length', String(buffer.length))
      .send(buffer);
  }

  // ── Requirement 27.5: CSV ─────────────────────────────────────────────

  @Post('export/csv')
  @HttpCode(HttpStatus.OK)
  exportCsv(@Body() dto: ExportCsvDto, @Res() res: Response): void {
    this.logger.log('POST /documents/export/csv');
    const csv = this.docGenService.exportCSV(dto.data, dto.headers);
    res
      .set('Content-Type', MIME.csv)
      .set('Content-Disposition', 'attachment; filename="export.csv"')
      .send(csv);
  }

  // ── Requirement 27.5: JSON ────────────────────────────────────────────

  @Post('export/json')
  @HttpCode(HttpStatus.OK)
  exportJson(@Body() dto: ExportJsonDto): string {
    this.logger.log('POST /documents/export/json');
    return this.docGenService.exportJSON(dto.data);
  }

  // ── Requirement 27.5: XML ─────────────────────────────────────────────

  @Post('export/xml')
  @HttpCode(HttpStatus.OK)
  exportXml(@Body() dto: ExportXmlDto, @Res() res: Response): void {
    this.logger.log('POST /documents/export/xml');
    const xml = this.docGenService.exportXML(dto.data, dto.rootElement);
    res.set('Content-Type', MIME.xml).send(xml);
  }

  // ── Requirement 27.6: Branding ────────────────────────────────────────

  @Post('branding')
  @HttpCode(HttpStatus.OK)
  applyBranding(@Body() dto: ApplyBrandingDto) {
    this.logger.log('POST /documents/branding');
    return this.docGenService.applyBranding(dto.branding);
  }

  // ── Requirements 27.7 & 27.8: Deliver ────────────────────────────────

  @Post('deliver')
  @HttpCode(HttpStatus.OK)
  async deliverDocument(@Body() dto: DeliverDocumentDto) {
    this.logger.log(`POST /documents/deliver [method=${dto.delivery.method}]`);
    if (!dto.data || !dto.format) {
      throw new BadRequestException('data (base64) and format are required');
    }
    const buffer = Buffer.from(dto.data, 'base64');
    return this.docGenService.deliverDocument(buffer, dto.format, dto.delivery);
  }

  /** Serve pending download by token */
  @Get('download/:token')
  serveDownload(@Param('token') token: string, @Res() res: Response): void {
    const result = this.docGenService.retrieveDownload(token);
    if (!result) {
      throw new NotFoundException('Download link not found or has expired');
    }
    const ext = result.filename.split('.').pop() || 'bin';
    const mime = MIME[ext] || 'application/octet-stream';
    res
      .set('Content-Type', mime)
      .set('Content-Disposition', `attachment; filename="${result.filename}"`)
      .set('Content-Length', String(result.buffer.length))
      .send(result.buffer);
  }
}
