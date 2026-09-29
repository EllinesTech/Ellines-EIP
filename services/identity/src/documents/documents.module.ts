import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentGenerationService } from './document-generation.service';
import { DocumentsController } from './documents.controller';

/**
 * DocumentsModule — EIP 2.0 Task 13.3
 *
 * Provides document generation and delivery for Excel, PDF, Word, and
 * PowerPoint formats with optional org branding.
 *
 * Imports:
 *   PrismaModule — required by DocumentGenerationService (Document model writes)
 *                  and DocumentsController (Document model reads).
 *
 * Requirements: 26.1–26.3, 27.1–27.8
 */
@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [DocumentGenerationService],
  exports: [DocumentGenerationService],
})
export class DocumentsModule {}
