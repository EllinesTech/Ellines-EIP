import { Module } from '@nestjs/common';
import { DocumentGenerationController } from './document-generation.controller';
import { DocumentGenerationService } from './document-generation.service';
import { ExcelGeneratorService } from '../generators/excel.generator';
import { PdfGeneratorService } from '../generators/pdf.generator';
import { WordGeneratorService } from '../generators/word.generator';
import { PowerPointGeneratorService } from '../generators/powerpoint.generator';
import { ExportFormatterService } from '../generators/export.formatter';
import { BrandingService } from '../branding/branding.service';
import { DeliveryService } from '../delivery/delivery.service';

@Module({
  controllers: [DocumentGenerationController],
  providers: [
    DocumentGenerationService,
    ExcelGeneratorService,
    PdfGeneratorService,
    WordGeneratorService,
    PowerPointGeneratorService,
    ExportFormatterService,
    BrandingService,
    DeliveryService,
  ],
  exports: [DocumentGenerationService],
})
export class DocumentGenerationModule {}
